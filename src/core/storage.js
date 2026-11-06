// storage.js — chrome.storage.local 封装（非敏感配置 + 展示用捕获数据）

const CONFIG_KEY = 'appConfig'
const CAPTURE_KEY = 'captures' // 展示用捕获数据（按站点）

/** 读取全局配置 */
export async function getConfig() {
  const { [CONFIG_KEY]: cfg } = await chrome.storage.local.get(CONFIG_KEY)
  return cfg || { schemaVersion: 1, sites: [], receiverUrl: '', deviceToken: '', diagnostics: true }
}

/** 保存全局配置（全量覆盖） */
export async function saveConfig(cfg) {
  await chrome.storage.local.set({ [CONFIG_KEY]: cfg })
}

/** 更新单个站点（immutable 更新） */
export async function updateSite(siteId, patch) {
  const cfg = await getConfig()
  const idx = cfg.sites.findIndex((s) => s.id === siteId)
  if (idx === -1) return null
  cfg.sites[idx] = { ...cfg.sites[idx], ...patch }
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
  return caps || {}
}

/** 写入站点捕获数据（展示用） */
export async function setSiteCapture(siteId, capture) {
  const caps = await getCaptures()
  caps[siteId] = capture
  await chrome.storage.local.set({ [CAPTURE_KEY]: caps })
}

/** 清空站点捕获数据 */
export async function clearSiteCapture(siteId) {
  const caps = await getCaptures()
  delete caps[siteId]
  await chrome.storage.local.set({ [CAPTURE_KEY]: caps })
}
