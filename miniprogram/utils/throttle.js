/**
 * 前缘节流（leading-edge throttle）
 *
 * 第一次调用立即执行，之后在 delay 毫秒内的重复调用全部被忽略。
 * 适用于提交按钮防重复点击场景。
 *
 * 为什么不用防抖（debounce）？
 *   防抖在最后一次调用后才执行，提交按钮会延迟才反应，体验差。
 *   节流第一次立即执行，用户感知零延迟。
 *
 * 用法：
 *   const throttledSubmit = throttle(function() { ... }, 2000)
 *   throttledSubmit()  // 立即执行
 *   throttledSubmit()  // 2秒内忽略
 */
function throttle(fn, delay = 2000) {
  let lastTime = 0
  return function (...args) {
    const now = Date.now()
    if (now - lastTime >= delay) {
      lastTime = now
      return fn.apply(this, args)
    }
    // 在间隔期内，静默丢弃
  }
}

module.exports = throttle
