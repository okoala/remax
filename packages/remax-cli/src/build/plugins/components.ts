import * as t from '@babel/types';
import * as PATH from 'path';
import winPath from '../../winPath';
import fs from 'fs';
import { NodePath } from '@babel/traverse';
import { kebabCase, union } from 'lodash';
import { Adapter } from '../adapters';
import { getDeleteComponentPaths } from './nativeComponents/util';

export interface Component {
  id: string;
  props: string[];
  importer: string[];
}

interface ComponentCollection {
  [id: string]: Component;
}

let components: ComponentCollection = {};
let importedComponents: ComponentCollection = {};

export function clear(id?: string) {
  if (id === undefined) {
    components = {};
    importedComponents = {};
    return;
  }

  const componentPaths = getDeleteComponentPaths(id, components);

  const importedComponentPaths = getDeleteComponentPaths(
    id,
    importedComponents
  );

  if (!componentPaths.length && !importedComponentPaths.length) {
    return;
  }

  for (const path of componentPaths) {
    delete components[path];
  }

  for (const path of importedComponentPaths) {
    delete importedComponents[path];
  }
}

function addToComponentCollection(
  component: Component,
  componentCollection: ComponentCollection
) {
  if (!componentCollection[component.id]) {
    componentCollection[component.id] = component;
    return;
  }

  componentCollection[component.id].props = union(
    componentCollection[component.id].props,
    component.props
  );
  componentCollection[component.id].importer = union(
    componentCollection[component.id].importer,
    component.importer
  );
}

function shouldRegisterAllProps(node?: t.JSXElement) {
  if (!node) {
    return false;
  }

  if (
    node.openingElement.attributes.find(a => a.type === 'JSXSpreadAttribute')
  ) {
    return true;
  }

  return false;
}

function registerComponent({
  componentName,
  componentCollection,
  adapter,
  node,
  importer = [],
}: {
  componentName: string;
  componentCollection: ComponentCollection;
  adapter: Adapter;
  node?: t.JSXElement;
  importer?: string[];
}) {
  if (componentName === 'swiper-item') {
    return;
  }

  if (adapter.name === 'alipay' && componentName === 'picker-view-column') {
    return;
  }

  /* istanbul ignore next */
  try {
    if (!adapter.hostComponents(componentName)) {
      return;
    }
  } catch (error) {
    return;
  }

  let usedProps = adapter.hostComponents(componentName).props.slice();
  if (adapter.name !== 'alipay' && !shouldRegisterAllProps(node)) {
    usedProps = [];
  }

  if (node) {
    node.openingElement.attributes.forEach(attr => {
      if (t.isJSXSpreadAttribute(attr)) {
        return;
      }

      const propName = attr.name.name as string;

      if (!usedProps.find(prop => prop === propName)) {
        usedProps.push(propName);
      }
    });
  }

  const props = usedProps
    .filter(Boolean)
    .map(prop => adapter.getNativePropName(prop, false, true));

  const component = {
    id: componentName,
    props,
    importer,
  };

  addToComponentCollection(component, componentCollection);
}

export default (adapter: Adapter) => {
  clear();

  return () => ({
    visitor: {
      ImportDeclaration(path: NodePath, state: any) {
        const node = path.node as t.ImportDeclaration;

        if (!node.source.value.startsWith('remax/')) {
          return;
        }

        node.specifiers.forEach(specifier => {
          if (t.isImportSpecifier(specifier)) {
            const componentName = specifier.imported.name;
            const id = kebabCase(componentName);
            registerComponent({
              componentName: id,
              componentCollection: importedComponents,
              adapter,
              importer: [state.file.opts.filename],
            });
          }
        });
      },
      JSXElement(path: NodePath, state: any) {
        const node = path.node as t.JSXElement;
        if (t.isJSXIdentifier(node.openingElement.name)) {
          const tagName = node.openingElement.name.name;
          const binding = path.scope.getBinding(tagName);

          /* istanbul ignore next */
          if (!binding) {
            return;
          }

          const componentPath = binding.path as NodePath;

          if (
            !componentPath ||
            !t.isImportSpecifier(componentPath.node) ||
            !t.isImportDeclaration(componentPath.parent) ||
            !componentPath.parent.source.value.startsWith('remax/')
          ) {
            return;
          }

          const componentName = componentPath.node.imported.name;
          const id = kebabCase(componentName);

          registerComponent({
            componentName: id,
            componentCollection: components,
            adapter,
            node,
            importer: [state.file.opts.filename],
          });
        }
      },
    },
  });
};

function getAlipayComponents(adapter: Adapter) {
  const DIR_PATH = winPath(
    PATH.resolve(__dirname, '../adapters/alipay/hostComponents')
  );
  const files = fs.readdirSync(DIR_PATH);
  files.forEach(file => {
    const name = PATH.basename(file).replace(PATH.extname(file), '');
    registerComponent({
      componentName: name,
      componentCollection: components,
      adapter,
    });
  });

  return Object.values(components);
}

export function getComponents(adapter: Adapter) {
  if (adapter.name === 'alipay') {
    return getAlipayComponents(adapter);
  }

  const data = Object.values(components);

  Object.values(importedComponents).forEach(c => {
    if (!components[c.id]) {
      data.push(c);
    }
  });

  return data;
}
