// sync.js — 凭证同步到自建后端（POST JSON）

import { getConfig, updateSite, findSiteById } from './storage.js'

/** 简单字符串哈希，用于凭证内容指纹（非明文） */
function fingerprint(str) {
  let h1 = 0x811c9dc5
  let h2 = 0x01000193
  for (let i = 0; i < str.length; i++) {
    h1 ^= str.charCodeAt(i)
    h1 = Math.imul(h1, 16777619)
    h2 = (h2 + str.charCodeAt(i) * (i + 1)) | 0
  }
  return (h1 >>> 0).toString(16) + (h2 >>> 0).toString(16)
}

/**
 * 同步站点凭证到后端。
 * @param {string} siteId
 * @param {{[label:string]: string}} tokens - 明文 token（仅内存中短暂持有）
 * @returns {Promise<{ok:boolean, status?:number, reason?:string, skipped?:boolean}>}
 */
export async function syncSite(siteId, tokens) {
  const cfg = await getConfig()
  const site = cfg.sites.find((s) => s.id === siteId)
  if (!site) return { ok: false, reason: 'site_not_found' }
  if (!cfg.receiverUrl) return { ok: false, skipped: true, reason: 'no_receiver' }

  const labels = Object.keys(tokens || {})
  if (!labels.length) return { ok: false, reason: 'no_tokens' }

  const fp = fingerprint(labels.map((l) => l + '=' + tokens[l]).join('\n'))
  // 凭证未变化，不重复上传
  if (site.syncState.credFingerprint === fp) {
    return { ok: true, status: 200, reason: 'unchanged' }
  }

  await updateSite(siteId, { syncState: { ...site.syncState, status: 'SYNCING' } })

  const body = {
    schemaVersion: 1,
    siteOrigin: site.origin,
    deviceId: await getDeviceId(),
    syncId: crypto.randomUUID(),
    syncedAt: new Date().toISOString(),
    tokens,
  }

  try {
    const resp = await fetch(cfg.receiverUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(cfg.deviceToken ? { Authorization: 'Bearer ' + cfg.deviceToken } : {}),
      },
      body: JSON.stringify(body),
    })
    const ok = resp.ok
    await updateSite(siteId, {
      syncState: {
        status: ok ? 'SYNCED' : 'FAILED',
        lastSyncAt: new Date().toISOString(),
        lastError: ok ? null : `HTTP ${resp.status}`,
        credFingerprint: ok ? fp : site.syncState.credFingerprint,
        syncedTokenLabels: labels,
        syncedTokenCount: labels.length,
      },
    })
    return { ok, status: resp.status }
  } catch (e) {
    await updateSite(siteId, {
      syncState: {
        ...site.syncState,
        status: 'FAILED',
        lastError: 'network_error',
        lastSyncAt: new Date().toISOString(),
      },
    })
    return { ok: false, reason: e.message }
  }
}

/** 设备 ID（安装时生成，存 chrome.storage.local） */
export async function getDeviceId() {
  const { deviceId } = await chrome.storage.local.get('deviceId')
  if (deviceId) return deviceId
  const id = crypto.randomUUID()
  await chrome.storage.local.set({ deviceId: id })
  return id
}
