// scanner.js — Token 候选字段扫描（在页面 MAIN world 执行，由 background 通过 executeScript 调起）

// 常见 token 字段名（小写，用于生成候选项，不代表值一定有效）
const NAME_HINTS = ['token', 'auth', 'jwt', 'session', 'access', 'refresh', 'ticket']
// JWT 三段式
const JWT_RE = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*$/

/** 判断值是否像 token */
function looksLikeToken(v) {
  if (typeof v !== 'string' || v.length < 16) return false
  if (JWT_RE.test(v)) return true
  // 无空格的长随机串
  if (v.length >= 32 && !/\s/.test(v)) return true
  return false
}

/** 判断键名是否像 token 字段 */
function nameLikeToken(k) {
  const lk = String(k).toLowerCase()
  return NAME_HINTS.some((w) => lk.includes(w))
}

/** 深度递归 JSON，找候选字段（上限 4 层） */
function walk(obj, trail, out, depth) {
  if (!obj || typeof obj !== 'object' || depth > 4) return
  for (const k of Object.keys(obj)) {
    const v = obj[k]
    const keyStr = String(k)
    if (typeof v === 'string' && v && (looksLikeToken(v) || nameLikeToken(keyStr))) {
      out.push({ area: trail.area, key: trail.key, path: [...trail.path, keyStr], value: v })
    } else if (typeof v === 'object') {
      walk(v, { area: trail.area, key: trail.key, path: [...trail.path, keyStr] }, out, depth + 1)
    }
  }
}

/**
 * 扫描当前页面 localStorage / sessionStorage，返回候选字段列表。
 * 此函数将被 chrome.scripting.executeScript 以 func + args 方式注入目标页面执行。
 * 返回值（脱敏前缀）：
 *   [{ area, key, path, label, masked, how }]
 */
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
          area,
          key,
          path: p,
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
    try {
      len = store.length
    } catch (e) {
      return
    }
    for (let i = 0; i < len; i++) {
      const k = store.key(i)
      let v = null
      try {
        v = store.getItem(k)
      } catch (e) {
        continue
      }
      if (typeof v !== 'string' || !v) continue
      // 顶层值本身就是 token
      if (looksLikeToken(v) || nameLikeToken(k)) {
        out.push({
          area,
          key: k,
          path: [],
          label: `${area}.${k}`,
          masked: mask(v),
          how: looksLikeToken(v) ? (JWT_RE.test(v) ? 'JWT 格式' : '长随机串') : '字段名匹配',
        })
      }
      // JSON 字符串递归
      if (v.trim().startsWith('{') || v.trim().startsWith('[')) {
        try {
          const parsed = JSON.parse(v)
          if (parsed && typeof parsed === 'object') walk(parsed, area, k, [], out, 1)
        } catch (e) {
          /* 非 JSON，忽略 */
        }
      }
    }
  }
  try {
    grab(localStorage, 'localStorage')
  } catch (e) {
    /* ignore */
  }
  try {
    grab(sessionStorage, 'sessionStorage')
  } catch (e) {
    /* ignore */
  }
  return out
}

/**
 * 按已确认路径读取 token 值（MAIN world 执行）。
 * args: [{ area, key, path }]
 * 返回：{ [label]: value }
 */
function readTokensByPaths(paths) {
  const NAME_HINTS = null // 占位，未使用
  function readPath(store, p) {
    let v
    try {
      v = store.getItem(p.key)
    } catch (e) {
      return undefined
    }
    if (typeof v !== 'string' || !v) return undefined
    if (!p.path || !p.path.length) return v
    let cur
    try {
      cur = JSON.parse(v)
    } catch (e) {
      return undefined
    }
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

// background 通过 chrome.scripting.executeScript({ func }) 调用这两个函数，
// 这里导出以便 background 直接 import func 引用（content script 不 import 本文件）
export { scanStoragePage, readTokensByPaths }
