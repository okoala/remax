let propagationStopped = false;
let timeStamp: number;

/**
 * 通过原生事件生成合成事件
 * @param nativeEvent 原生事件
 */
function createBaseSyntheticEvent(nativeEvent: any) {
  // 添加阻止冒泡方法
  nativeEvent.stopPropagation = () => {
    propagationStopped = true;
  };

  return nativeEvent;
}

export function createCallbackProxy(callback: (...params: any) => any) {
  return function(nativeEvent: any, ...restParams: any) {
    const syntheticEvent = createBaseSyntheticEvent(nativeEvent);

    // 利用 timeStamp 判断是不是新的事件流
    if (timeStamp !== nativeEvent.timeStamp) {
      timeStamp = nativeEvent.timeStamp;
      propagationStopped = false;
    }

    if (propagationStopped) {
      return;
    }

    return callback(syntheticEvent, ...restParams);
  };
}
