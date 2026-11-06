// background — MV3 Service Worker（module，经 Vite 打包）
// 职责（PRD 4.2）：
//   1. 读取配置，按站点路由消息
//   2. chrome.scripting.executeScript 在目标页面执行扫描/读取（MAIN world）
//   3. 去抖动、去重、同步调度
//   4. 接收 hook.js 经 bridge.js 转发的 Storage 变化通知
// 说明：注入页面的扫描/读取函数内联在本文件（executeScript func 序列化要求，不跨模块）

import { getConfig, updateSite, setSiteCapture, getCaptures } from '../core/storage.js'
import { syncSite } from '../core/sync.js'

// ---------- 注入页面的扫描函数（序列化安全，自包含无外部引用） ----------

function scanStoragePage() {
  const NAME_HINTS = ['token', 'auth', 'jwt', 'session', 'access', 'refresh', 'ticket']
  const JWT_RE = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*$/
  function looksLikeToken(v) {
    if (typeof v !== 'string' || v.length < 16) return false
    if (JWT_RE.test(v)) return true
    if (v.length >= 32 && !/\s/.test(v)) return true
    return false
  }
  function nameLikeToken(k) {
    const lk = String(k).toLowerCase()
    return NAME_HINTS.some((w) => lk.includes(w))
  }
  function mask(v) {
    if (!v) return ''
    if (v.length <= 20) return v.slice(0, 4) + '…'
    return v.slice(0, 8) + '…' + v.slice(-4)
  }
  function walk(obj, area, key, path, out, depth) {
    if (!obj || typeof obj !== 'object' || depth > 4) return
    for (const k of Object.keys(obj)) {
      const v = obj[k]
      if (typeof v === 'string' && v && (looksLikeToken(v) || nameLikeToken(k))) {
        const p = [...path, String(k)]
        out.push({
          area, key, path: p,
          label: `${area}.${key}` + (p.length ? '.' + p.join('.') : ''),
          masked: mask(v),
          how: looksLikeToken(v) ? (JWT_RE.test(v) ? 'JWT 格式' : '长随机串') : '字段名匹配',
        })
      } else if (typeof v === 'object') {
        walk(v, area, key, [...path, String(k)], out, depth + 1)
      }
    }
  }
  const out = []
  const grab = (store, area) => {
    let len = 0
    try { len = store.length } catch (e) { return }
    for (let i = 0; i < len; i++) {
      const k = store.key(i)
      let v = null
      try { v = store.getItem(k) } catch (e) { continue }
      if (typeof v !== 'string' || !v) continue
      if (looksLikeToken(v) || nameLikeToken(k)) {
        out.push({
          area, key, path: [], label: `${area}.${k}`, masked: mask(v),
          how: looksLikeToken(v) ? (JWT_RE.test(v) ? 'JWT 格式' : '长随机串') : '字段名匹配',
        })
      }
      if (v.trim().startsWith('{') || v.trim().startsWith('[')) {
        try {
          const parsed = JSON.parse(v)
          if (parsed && typeof parsed === 'object') walk(parsed, area, k, [], out, 1)
        } catch (e) { /* ignore */ }
      }
    }
  }
  try { grab(localStorage, 'localStorage') } catch (e) { /* ignore */ }
  try { grab(sessionStorage, 'sessionStorage') } catch (e) { /* ignore */ }
  return out
}

function readTokensByPaths(paths) {
  function readPath(store, p) {
    let v
    try { v = store.getItem(p.key) } catch (e) { return undefined }
    if (typeof v !== 'string' || !v) return undefined
    if (!p.path || !p.path.length) return v
    let cur
    try { cur = JSON.parse(v) } catch (e) { return undefined }
    for (const seg of p.path) {
      if (cur == null || typeof cur !== 'object') return undefined
      cur = cur[seg]
    }
    return typeof cur === 'string' ? cur : cur == null ? undefined : JSON.stringify(cur)
  }
  const out = {}
  for (const p of paths) {
    const store = p.area === 'localStorage' ? localStorage : sessionStorage
    const v = readPath(store, p)
    const base = `${p.area}.${p.key}`
    const label = p.path && p.path.length ? `${base}.${p.path.join('.')}` : base
    if (v !== undefined) out[label] = v
  }
  return out
}

// ---------- 站点辅助 ----------

async function findSiteByOrigin(origin) {
  const cfg = await getConfig()
  return cfg.sites.find((s) => s.origin === (origin || '').replace(/\/+$/, '')) || null
}

async function findSiteById(siteId) {
  const cfg = await getConfig()
  return cfg.sites.find((s) => s.id === siteId) || null
}

/** 找到目标站点已打开的标签页 */
async function findSiteTab(site) {
  const tabs = await chrome.tabs.query({ url: site.origin + '/*' })
  return tabs[0] || null
}

// ---------- 同步调度（去抖动 + 按站点） ----------

const pendingSync = new Map() // siteId -> timer

function scheduleSync(siteId, delay = 1000) {
  if (pendingSync.has(siteId)) clearTimeout(pendingSync.get(siteId))
  pendingSync.set(siteId, setTimeout(async () => {
    pendingSync.delete(siteId)
    await doSync(siteId)
  }, delay))
}

/** 读取站点已确认 token 并同步 + 写展示数据 */
async function doSync(siteId) {
  const site = await findSiteById(siteId)
  if (!site || !site.enabled || !site.tokenPaths.length) return
  const tab = await findSiteTab(site)
  if (!tab) return // 站点未打开，页面就绪回调再触发

  let tokens = {}
  try {
    const [res] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: 'MAIN',
      func: readTokensByPaths,
      args: [site.tokenPaths],
    })
    tokens = res.result || {}
  } catch (e) {
    return // 页面导航中 / 无权限，忽略本次
  }

  // 写展示用捕获数据（Popup 展示抓到的数据）
  await setSiteCapture(siteId, {
    tokens,
    capturedAt: new Date().toISOString(),
    source: 'storage_paths',
  })

  if (!site.autoSync) return
  await syncSite(siteId, tokens)
}

// ---------- 消息路由（Popup / Options / bridge） ----------

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  ;(async () => {
    try {
      // ---- 来自页面 hook（经 bridge 转发）：Storage 变化 ----
      if (msg && msg.__wah_from_page) {
        const site = await findSiteByOrigin(sender.origin || (msg.pageUrl ? new URL(msg.pageUrl).origin : ''))
        if (site && site.enabled && site.tokenPaths.length && site.autoSync) {
          // Storage 变化通知（不含明文），去抖动后由 background 主动按路径读取
          scheduleSync(site.id)
        }
        sendResponse({ ok: true })
        return
      }

      // ---- Popup / Options 请求 ----
      switch (msg.type) {
        case 'GET_STATE': {
          const cfg = await getConfig()
          const captures = await getCaptures()
          sendResponse({ ok: true, config: cfg, captures })
          return
        }
        case 'SCAN_TOKENS': {
          const site = await findSiteById(msg.siteId)
          if (!site) return sendResponse({ ok: false, error: '站点不存在' })
          const tab = await findSiteTab(site)
          if (!tab) return sendResponse({ ok: false, error: '请先在浏览器中打开该网站' })
          const [res] = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            world: 'MAIN',
            func: scanStoragePage,
          })
          sendResponse({ ok: true, candidates: res.result || [] })
          return
        }
        case 'SYNC_NOW': {
          const site = await findSiteById(msg.siteId)
          if (!site) return sendResponse({ ok: false, error: '站点不存在' })
          if (!site.tokenPaths.length) return sendResponse({ ok: false, error: '请先确认 Token 字段' })
          if (pendingSync.has(site.id)) {
            clearTimeout(pendingSync.get(site.id))
            pendingSync.delete(site.id)
          }
          await doSync(site.id)
          const fresh = await findSiteById(site.id)
          const captures = await getCaptures()
          const hasReceiver = !!(await getConfig()).receiverUrl
          sendResponse({
            ok: !!hasReceiver && fresh.syncState.status === 'SYNCED',
            state: fresh.syncState,
            hasCapture: !!(captures[site.id] && Object.keys(captures[site.id].tokens || {}).length),
            hasReceiver,
          })
          return
        }
        case 'CHECK_PAGE_READY': {
          // 页面就绪（bridge 通知），检查凭证并按需同步
          const site = await findSiteByOrigin(msg.origin)
          if (site && site.enabled && site.tokenPaths.length) {
            scheduleSync(site.id, 500)
          }
          sendResponse({ ok: true })
          return
        }
        default:
          sendResponse({ ok: false, error: 'unknown_message' })
      }
    } catch (e) {
      try { sendResponse({ ok: false, error: e.message }) } catch (e2) { /* ignore */ }
    }
  })()
  return true // async sendResponse
})

// ---------- 站点页面就绪检查（tab 更新时） ----------
chrome.tabs.onUpdated.addListener(async (tabId, info, tab) => {
  if (info.status !== 'complete') return
  if (!tab.url || !tab.url.startsWith('http')) return
  let origin
  try { origin = new URL(tab.url).origin } catch (e) { return }
  const site = await findSiteByOrigin(origin)
  if (site && site.enabled && site.tokenPaths.length) {
    scheduleSync(site.id, 800) // 页面就绪后检查当前凭证，必要时同步
  }
})

// ---------- 安装/更新 ----------
chrome.runtime.onInstalled.addListener(async () => {
  const cfg = await getConfig()
  if (!cfg.schemaVersion) {
    await chrome.storage.local.set({
      appConfig: { schemaVersion: 1, sites: [], receiverUrl: '', deviceToken: '', diagnostics: true },
    })
  }
  console.log('[website-auth-helper] installed, sites:', (await getConfig()).sites.length)
})
