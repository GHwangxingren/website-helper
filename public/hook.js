// hook.js — 注入页面主世界（MAIN world）
// 职责（PRD 17.5 捕获来源分级）：
//   只监听 localStorage / sessionStorage 的 setItem / removeItem / clear，
//   通过 postMessage 通知 bridge（ISOLATED）→ background 主动按确认路径读取。
//   —— 不上报明文、不周期全量快照（收敛 demo 风险行为）
// 说明：由 background 动态注册（world: MAIN，document_start），与站点无关。
// 注意：localStorage 与 sessionStorage 共享 Storage.prototype，只包装一次。

;(function () {
  'use strict'

  if (window.__wah_hook_installed) return
  window.__wah_hook_installed = true

  function notify(area, key) {
    try {
      window.postMessage({ __wah_hook: true, area, key }, location.origin)
    } catch (e) { /* ignore */ }
  }

  // 通过 key 归属判断 area（localStorage 和 sessionStorage 是不同实例，但共享 prototype）
  function areaOf(store) {
    try {
      if (store === window.localStorage) return 'localStorage'
      if (store === window.sessionStorage) return 'sessionStorage'
    } catch (e) { /* ignore */ }
    return null
  }

  const origSet = Storage.prototype.setItem
  Storage.prototype.setItem = function (k, v) {
    origSet.apply(this, arguments)
    const area = areaOf(this)
    if (area) notify(area, String(k))
  }
  const origRemove = Storage.prototype.removeItem
  Storage.prototype.removeItem = function (k) {
    origRemove.apply(this, arguments)
    const area = areaOf(this)
    if (area) notify(area, String(k))
  }
  const origClear = Storage.prototype.clear
  Storage.prototype.clear = function () {
    origClear.apply(this, arguments)
    const area = areaOf(this)
    if (area) notify(area, '*')
  }
})()
