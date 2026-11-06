// bridge.js — 隔离世界（ISOLATED）content script
// 职责（PRD 4.2）：
//   1. 转发 hook.js（MAIN world）postMessage 的 Storage 变化通知给 background
//      —— 只发"字段变化"事件，不传 Token 明文
//   2. 页面就绪时通知 background 检查当前凭证
// 说明：本脚本由 background 动态注册（registerContentScripts，id = site-{siteId}），
//       matches 为各站点 Origin，此文件本身与站点无关。

// 页面就绪通知（去抖，避免 SPA 多次触发）
let readyNotified = false
setTimeout(() => {
  readyNotified = true
  chrome.runtime.sendMessage({
    __wah_from_ext: true,
    type: 'CHECK_PAGE_READY',
    origin: location.origin,
  }).catch(() => {})
}, 600)

// 转发 MAIN world 的 Storage 变化通知
window.addEventListener('message', (ev) => {
  if (ev.source !== window) return
  const msg = ev.data
  if (!msg || !msg.__wah_hook) return
  // 只转发事件元数据，不转发值
  chrome.runtime.sendMessage({
    __wah_from_page: true,
    type: 'storage_changed',
    origin: location.origin,
    pageUrl: location.href,
    area: msg.area,
    key: msg.key,
  }).catch(() => {})
})
