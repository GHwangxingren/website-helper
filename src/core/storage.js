// storage.js — chrome.storage.local 封装（非敏感配置 + 展示用捕获数据）

const CONFIG_KEY = 'appConfig'
const CAPTURE_KEY = 'captures' // 展示用捕获数据（按站点）

const DEFAULT_CONFIG = () => ({ schemaVersion: 1, sites: [], receiverUrl: '', deviceToken: '', diagnostics: true })

/**
 * 配置归一化：修复历史脏数据 / 结构异常，保证 sites 一定是数组、元素有合法 syncState。
 * 所有读取出口（getConfig）统一走这里，杜绝 "sites.find is not a function" 类运行时错误。
 */
function normalizeConfig(raw) {
  const cfg = { ...DEFAULT_CONFIG(), ...(raw && typeof raw === 'object' ? raw : {}) }
  if (!Array.isArray(cfg.sites)) {
    // 兼容：sites 被写成对象（以 id 为键的 map）→ 转数组；其他类型 → 空数组
    if (cfg.sites && typeof cfg.sites === 'object') {
      cfg.sites = Object.values(cfg.sites)
    } else {
      cfg.sites = []
    }
  }
  cfg.sites = cfg.sites
    .filter((s) => s && typeof s === 'object')
    .map((s) => ({
      ...s,
      tokenPaths: Array.isArray(s.tokenPaths) ? s.tokenPaths : [],
      enabled: typeof s.enabled === 'boolean' ? s.enabled : true,
      autoSync: typeof s.autoSync === 'boolean' ? s.autoSync : true,
      syncState: {
        status: 'UNCONFIGURED',
        lastSyncAt: null,
        lastError: null,
        credFingerprint: null,
        syncedTokenLabels: [],
        syncedTokenCount: null,
        ...(s.syncState && typeof s.syncState === 'object' ? s.syncState : {}),
      },
    }))
  cfg.receiverUrl = typeof cfg.receiverUrl === 'string' ? cfg.receiverUrl : ''
  cfg.deviceToken = typeof cfg.deviceToken === 'string' ? cfg.deviceToken : ''
  cfg.diagnostics = typeof cfg.diagnostics === 'boolean' ? cfg.diagnostics : true
  return cfg
}

/** 读取全局配置 */
export async function getConfig() {
  const { [CONFIG_KEY]: cfg } = await chrome.storage.local.get(CONFIG_KEY)
  return normalizeConfig(cfg)
}

/**
 * 深度转纯对象：剥离 Vue reactive/Proxy 包装。
 * chrome.storage 的 set 会静默丢弃含原型链的结构，导致下次读出 sites 缺失或异常。
 */
function toPlain(value) {
  return JSON.parse(JSON.stringify(value))
}

/** 保存全局配置（全量覆盖） */
export async function saveConfig(cfg) {
  await chrome.storage.local.set({ [CONFIG_KEY]: toPlain(normalizeConfig(cfg)) })
}

/** 更新单个站点（immutable 更新） */
export async function updateSite(siteId, patch) {
  const cfg = await getConfig()
  const idx = cfg.sites.findIndex((s) => s.id === siteId)
  if (idx === -1) return null
  cfg.sites[idx] = { ...cfg.sites[idx], ...toPlain(patch) }
  await saveConfig(cfg)
  return cfg.sites[idx]
}

/** 按 Origin 查站点 */
export async function findSiteByOrigin(origin) {
  const cfg = await getConfig()
  return cfg.sites.find((s) => s.origin === origin.replace(/\/+$/, '')) || null
}

/** 按 id 查站点 */
export async function findSiteById(siteId) {
  const cfg = await getConfig()
  return cfg.sites.find((s) => s.id === siteId) || null
}

// ---------- 捕获数据（展示用，Popup 展示抓到的数据） ----------

/**
 * 读取全部捕获数据
 * @returns {Promise<Record<string, Object>>} siteId -> { tokens: {label: value}, capturedAt, source }
 */
export async function getCaptures() {
  const { [CAPTURE_KEY]: caps } = await chrome.storage.local.get(CAPTURE_KEY)
  return caps && typeof caps === 'object' ? caps : {}
}

/** 写入站点捕获数据（展示用） */
export async function setSiteCapture(siteId, capture) {
  const caps = await getCaptures()
  caps[siteId] = toPlain(capture)
  await chrome.storage.local.set({ [CAPTURE_KEY]: caps })
}

/** 清空站点捕获数据 */
export async function clearSiteCapture(siteId) {
  const caps = await getCaptures()
  delete caps[siteId]
  await chrome.storage.local.set({ [CAPTURE_KEY]: caps })
}
