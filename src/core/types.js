// types.js — 核心数据模型（纯 JS，JSDoc 标注）

/**
 * Token 字段路径（用户确认后的候选字段）
 * @typedef {Object} TokenPath
 * @property {'localStorage'|'sessionStorage'} area - 存储区域
 * @property {string} key - Storage 键名
 * @property {string[]} path - JSON 嵌套路径（空数组 = 整个值就是 token）
 * @property {string} label - 展示用完整路径，如 "localStorage.userInfo.authInfo.accessToken"
 */

/**
 * 站点配置
 * @typedef {Object} SiteConfig
 * @property {string} id - uuid
 * @property {string} name - 展示名
 * @property {string} origin - https://portal.example.com（不带末尾斜杠）
 * @property {boolean} enabled - 是否启用捕获
 * @property {TokenPath[]} tokenPaths - 已确认 Token 字段路径
 * @property {boolean} autoSync - 自动同步开关（按站点）
 * @property {Object} syncState - 按站点同步状态
 * @property {string|null} syncState.status - 见 STATUS_MAP
 * @property {string|null} syncState.lastSyncAt
 * @property {string|null} syncState.lastError
 * @property {string|null} syncState.credFingerprint - 凭证内容指纹（非明文）
 * @property {string[]} syncState.syncedTokenLabels - 最近一次同步的 token label 列表
 * @property {number|null} syncState.syncedTokenCount - 最近一次同步的 token 数量
 */

/**
 * 全局配置
 * @typedef {Object} AppConfig
 * @property {number} schemaVersion
 * @property {SiteConfig[]} sites
 * @property {string} receiverUrl - 后端接收 API（可留空，留空只展示不同步）
 * @property {string} deviceToken - 设备授权凭证
 * @property {boolean} diagnostics - 诊断面板开关
 */

/** 同步状态枚举 */
export const STATUS_MAP = {
  UNCONFIGURED: '未配置',
  WAITING_AUTH: '等待授权',
  ENABLED: '监测已启用',
  WAITING_TOKEN: '等待确认 Token 字段',
  SYNCING: '同步中',
  SYNCED: '同步成功',
  FAILED: '同步失败',
  REVOKED: '权限已撤销',
}

/** 新建站点配置 */
export function createSite(name, origin) {
  return {
    id: crypto.randomUUID(),
    name: name || origin,
    origin,
    enabled: true,
    tokenPaths: [],
    autoSync: true,
    syncState: {
      status: STATUS_MAP.UNCONFIGURED ? 'UNCONFIGURED' : 'UNCONFIGURED',
      lastSyncAt: null,
      lastError: null,
      credFingerprint: null,
      syncedTokenLabels: [],
      syncedTokenCount: null,
    },
  }
}

/** TokenPath 完整标签 */
export function pathLabel(p) {
  const base = `${p.area}.${p.key}`
  return p.path && p.path.length ? `${base}.${p.path.join('.')}` : base
}
