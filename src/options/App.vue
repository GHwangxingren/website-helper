<script setup>
import { ref, computed, onMounted } from 'vue'

const loading = ref(true)
const config = ref(null)
const captures = ref({})
const selectedSiteId = ref('')
const savingGlobal = ref(false)
const globalMsg = ref('')
const siteMsg = ref('')
const siteErr = ref('')

// 新增站点表单
const newSite = ref({ name: '', origin: '' })

// 扫描状态
const scanning = ref(false)
const candidates = ref([])
const scanErr = ref('')
const checkedCandidates = ref({}) // candidateIndex -> true

const sites = computed(() => (config.value ? config.value.sites : []))
const selectedSite = computed(() => sites.value.find((s) => s.id === selectedSiteId.value) || null)

async function loadState() {
  const resp = await chrome.runtime.sendMessage({ type: 'GET_STATE' })
  if (resp.ok) {
    config.value = resp.config
    captures.value = resp.captures
    if (!selectedSiteId.value && resp.config.sites.length) selectedSiteId.value = resp.config.sites[0].id
  }
  loading.value = false
}

onMounted(loadState)

// ---------- 全局配置 ----------

async function saveGlobal() {
  savingGlobal.value = true
  globalMsg.value = ''
  const cfg = JSON.parse(JSON.stringify(config.value))
  if (cfg.receiverUrl && !/^https?:\/\//.test(cfg.receiverUrl)) {
    globalMsg.value = '接口地址需以 http:// 或 https:// 开头'
    savingGlobal.value = false
    return
  }
  await chrome.storage.local.set({ appConfig: cfg })
  globalMsg.value = '已保存'
  savingGlobal.value = false
  setTimeout(() => (globalMsg.value = ''), 2000)
}

// ---------- 站点管理 ----------

async function persistConfig() {
  // 深拷贝剥离 Vue reactive Proxy，再交给 chrome.storage（Proxy 直接 set 行为不可靠）
  await chrome.storage.local.set({ appConfig: JSON.parse(JSON.stringify(config.value)) })
}

async function addSite() {
  siteErr.value = ''
  siteMsg.value = ''
  const origin = newSite.value.origin.trim().replace(/\/+$/, '')
  const name = newSite.value.name.trim()
  if (!origin || !/^https?:\/\//.test(origin)) {
    siteErr.value = 'Origin 需以 http:// 或 https:// 开头，例如 https://portal.example.com'
    return
  }
  if (sites.value.some((s) => s.origin === origin)) {
    siteErr.value = '该站点已存在'
    return
  }
  // 申请域名权限
  let granted = false
  try {
    granted = await chrome.permissions.request({ origins: [origin + '/*'] })
  } catch (e) {
    siteErr.value = '权限申请失败：' + e.message
    return
  }
  if (!granted) {
    siteErr.value = '未授权该域名，站点未启用捕获（可稍后在站点列表中重新授权）'
  }
  const site = {
    id: crypto.randomUUID(),
    name: name || origin.replace(/^https?:\/\//, ''),
    origin,
    enabled: granted,
    tokenPaths: [],
    autoSync: true,
    syncState: {
      status: 'WAITING_TOKEN',
      lastSyncAt: null,
      lastError: null,
      credFingerprint: null,
      syncedTokenLabels: [],
      syncedTokenCount: null,
    },
  }
  config.value.sites.push(site)
  await persistConfig()
  await registerSiteScripts(site)
  selectedSiteId.value = site.id
  newSite.value = { name: '', origin: '' }
  siteMsg.value = granted ? '站点已添加并授权' : '站点已添加（未授权，捕获不生效）'
  setTimeout(() => (siteMsg.value = ''), 3000)
}

/** 动态注册 Content Script（bridge + hook，PRD 17.3） */
async function registerSiteScripts(site) {
  const match = site.origin + '/*'
  try {
    await chrome.scripting.registerContentScripts([
      {
        id: 'bridge-' + site.id,
        matches: [match],
        js: ['bridge.js'],
        runAt: 'document_idle',
        persistAcrossSessions: true,
      },
      {
        id: 'hook-' + site.id,
        matches: [match],
        js: ['hook.js'],
        world: 'MAIN',
        runAt: 'document_start',
        persistAcrossSessions: true,
      },
    ])
  } catch (e) {
    // 已注册（重复添加）等情况
    if (!String(e.message).includes('Duplicate')) throw e
  }
}

async function unregisterSiteScripts(site) {
  const ids = ['bridge-' + site.id, 'hook-' + site.id]
  try {
    await chrome.scripting.unregisterContentScripts({ ids })
  } catch (e) { /* 未注册时忽略 */ }
}

async function grantSite(site) {
  const granted = await chrome.permissions.request({ origins: [site.origin + '/*'] })
  if (granted) {
    site.enabled = true
    site.syncState = { ...site.syncState, status: 'WAITING_TOKEN' }
    await persistConfig()
    await registerSiteScripts(site)
  }
}

async function toggleSite(site) {
  if (site.enabled) {
    // 停用：注销脚本 + 撤销权限
    await unregisterSiteScripts(site)
    await chrome.permissions.remove({ origins: [site.origin + '/*'] })
    site.enabled = false
    site.syncState = { ...site.syncState, status: 'REVOKED' }
    siteMsg.value = `站点「${site.name}」已停用并撤销权限`
  } else {
    await grantSite(site)
    if (site.enabled) siteMsg.value = `站点「${site.name}」已启用`
  }
  await persistConfig()
  setTimeout(() => (siteMsg.value = ''), 3000)
}

async function removeSite(site) {
  if (!confirm(`删除站点「${site.name}」？将同时注销脚本并撤销域名权限。`)) return
  await unregisterSiteScripts(site)
  await chrome.permissions.remove({ origins: [site.origin + '/*'] }).catch(() => {})
  config.value.sites = config.value.sites.filter((s) => s.id !== site.id)
  await persistConfig()
  // 清理展示数据
  const caps = await chrome.storage.local.get('captures')
  if (caps.captures) {
    delete caps.captures[site.id]
    await chrome.storage.local.set({ captures: caps.captures })
  }
  if (selectedSiteId.value === site.id) selectedSiteId.value = ''
  siteMsg.value = '站点已删除'
  setTimeout(() => (siteMsg.value = ''), 2000)
  await loadState()
}

// ---------- Token 扫描与确认 ----------

async function scanTokens() {
  if (!selectedSite.value || scanning.value) return
  scanning.value = true
  scanErr.value = ''
  candidates.value = []
  checkedCandidates.value = {}
  try {
    const resp = await chrome.runtime.sendMessage({ type: 'SCAN_TOKENS', siteId: selectedSite.value.id })
    if (!resp.ok) {
      scanErr.value = resp.error || '扫描失败'
    } else {
      candidates.value = resp.candidates || []
      if (!candidates.value.length) {
        scanErr.value = '未发现候选字段。该网站可能使用 IndexedDB、内存变量或其他存储，需站点专项适配（PRD 6.3）。'
      }
    }
  } catch (e) {
    scanErr.value = '扫描失败：' + e.message
  }
  scanning.value = false
}

function labelOf(c) {
  return c.label
}

async function saveConfirmedTokens() {
  if (!selectedSite.value) return
  const picked = candidates.value.filter((_, i) => checkedCandidates.value[i])
  if (!picked.length) {
    scanErr.value = '请先勾选要确认的字段'
    return
  }
  selectedSite.value.tokenPaths = picked.map((c) => ({ area: c.area, key: c.key, path: c.path }))
  selectedSite.value.syncState = { ...selectedSite.value.syncState, status: 'ENABLED' }
  await persistConfig()
  siteMsg.value = `已确认 ${picked.length} 个字段，登录网站后自动捕获`
  setTimeout(() => (siteMsg.value = ''), 3000)
}

async function clearTokenPaths() {
  if (!selectedSite.value) return
  selectedSite.value.tokenPaths = []
  selectedSite.value.syncState = { ...selectedSite.value.syncState, status: 'WAITING_TOKEN' }
  await persistConfig()
}

// 展示辅助
const STATUS_TEXT = {
  UNCONFIGURED: '未配置',
  WAITING_AUTH: '等待授权',
  ENABLED: '监测已启用',
  WAITING_TOKEN: '等待确认 Token 字段',
  SYNCING: '同步中',
  SYNCED: '同步成功',
  FAILED: '同步失败',
  REVOKED: '已停用',
}
</script>

<template>
  <div class="wrap">
    <h1>Website Auth Helper · 配置</h1>
    <p class="sub">站点管理、Token 字段确认与后端接收接口配置</p>

    <div v-if="loading" class="dim">加载中…</div>

    <template v-else>
      <!-- 全局：后端配置 -->
      <section class="card">
        <h2>后端接收接口（全局）</h2>
        <label>接收 API URL（可留空，留空时仅在本地展示捕获数据）</label>
        <input v-model="config.receiverUrl" type="url"
          placeholder="例如 https://api.example.com/api/extension/auth/sync">
        <label>设备授权凭证（Bearer，可选）</label>
        <input v-model="config.deviceToken" type="password" placeholder="短期、可撤销的设备凭证">
        <button class="btn" :disabled="savingGlobal" @click="saveGlobal">
          {{ savingGlobal ? '保存中…' : '保存全局配置' }}
        </button>
        <p v-if="globalMsg" class="ok">{{ globalMsg }}</p>
      </section>

      <!-- 新增站点 -->
      <section class="card">
        <h2>捕获站点</h2>
        <div class="add-row">
          <input v-model="newSite.name" placeholder="名称（可选）" class="in-name">
          <input v-model="newSite.origin" placeholder="https://portal.example.com" class="in-origin">
          <button class="btn" @click="addSite">添加</button>
        </div>
        <p v-if="siteErr" class="err">{{ siteErr }}</p>
        <p v-if="siteMsg" class="ok">{{ siteMsg }}</p>

        <div v-if="!sites.length" class="dim pad">还没有站点。添加后需在 Chrome 弹窗中授权域名。</div>

        <div v-else class="site-list">
          <div v-for="s in sites" :key="s.id" class="site-item" :class="{ active: s.id === selectedSiteId }"
            @click="selectedSiteId = s.id">
            <div class="site-main">
              <span class="site-name">{{ s.name }}</span>
              <span class="site-origin">{{ s.origin }}</span>
            </div>
            <div class="site-meta">
              <span class="tag" :class="{ off: !s.enabled }">{{ s.enabled ? STATUS_TEXT[s.syncState.status] || s.syncState.status : '已停用' }}</span>
              <span class="dim">{{ s.tokenPaths.length }} 个字段</span>
              <button class="mini" @click.stop="toggleSite(s)">{{ s.enabled ? '停用' : '启用' }}</button>
              <button class="mini danger" @click.stop="removeSite(s)">删除</button>
            </div>
          </div>
        </div>
      </section>

      <!-- 选中站点：Token 确认 -->
      <section v-if="selectedSite" class="card">
        <h2>Token 字段 — {{ selectedSite.name }}</h2>

        <div class="hint">
          已确认 {{ selectedSite.tokenPaths.length }} 个字段：
          <span v-for="p in selectedSite.tokenPaths" :key="(p.area + p.key + p.path.join('.'))" class="path-chip">
            {{ p.area }}.{{ p.key }}<template v-if="p.path.length">.{{ p.path.join('.') }}</template>
          </span>
          <a v-if="selectedSite.tokenPaths.length" href="#" class="link" @click.prevent="clearTokenPaths()">清空</a>
        </div>

        <p class="dim">1. 在浏览器中打开并登录 {{ selectedSite.origin }}，然后点击扫描：</p>
        <button class="btn" :disabled="scanning" @click="scanTokens">
          {{ scanning ? '扫描中…' : '扫描 Token 候选字段' }}
        </button>

        <div v-if="candidates.length" class="candidates">
          <p class="dim">2. 勾选真正用于认证的字段并保存：</p>
          <label v-for="(c, i) in candidates" :key="c.label" class="cand">
            <input v-model="checkedCandidates[i]" type="checkbox">
            <span class="cand-label">{{ c.label }}</span>
            <span class="cand-val">{{ c.masked }}</span>
            <span class="cand-how">{{ c.how }}</span>
          </label>
          <button class="btn" @click="saveConfirmedTokens">保存已确认字段</button>
        </div>
        <p v-if="scanErr" class="err">{{ scanErr }}</p>
      </section>
    </template>
  </div>
</template>

<style scoped>
* { margin: 0; padding: 0; box-sizing: border-box; }
.wrap {
  max-width: 680px; margin: 24px auto; padding: 0 16px;
  font-family: 'Segoe UI', 'Microsoft YaHei', sans-serif; font-size: 13px; color: #333;
}
h1 { font-size: 18px; font-weight: 600; margin-bottom: 4px; }
h2 { font-size: 14px; font-weight: 600; margin-bottom: 10px; }
.sub { color: #888; font-size: 12px; margin-bottom: 16px; }
.card {
  background: #fafafa; border: 1px solid #e5e5e5; border-radius: 10px;
  padding: 16px; margin-bottom: 16px;
}
label { display: block; font-weight: 500; margin: 10px 0 4px; font-size: 12px; }
input[type='url'], input[type='password'], input[type='text'] {
  width: 100%; padding: 8px 10px; border: 1px solid #d9d9d9; border-radius: 6px;
  font-size: 13px; font-family: Consolas, monospace; background: #fff;
}
input:focus { outline: none; border-color: #534AB7; }
.btn {
  margin-top: 12px; padding: 8px 20px; border: none; border-radius: 8px;
  background: #534AB7; color: #fff; font-size: 13px; font-weight: 500; cursor: pointer;
}
.btn:hover { background: #43389e; }
.btn:disabled { background: #b9b3e0; }
.mini {
  padding: 3px 10px; border: 1px solid #d9d9d9; border-radius: 6px;
  background: #fff; color: #555; font-size: 11px; cursor: pointer;
}
.mini:hover { border-color: #534AB7; color: #534AB7; }
.mini.danger:hover { border-color: #A32D2D; color: #A32D2D; }
.add-row { display: flex; gap: 8px; }
.in-name { width: 160px; }
.in-origin { flex: 1; }
.add-row input {
  padding: 8px 10px; border: 1px solid #d9d9d9; border-radius: 6px;
  font-size: 12px; font-family: Consolas, monospace;
}
.site-list { margin-top: 12px; }
.site-item {
  background: #fff; border: 1px solid #e5e5e5; border-radius: 8px;
  padding: 10px 12px; margin-bottom: 8px; cursor: pointer;
}
.site-item.active { border-color: #534AB7; }
.site-main { display: flex; justify-content: space-between; gap: 8px; margin-bottom: 6px; }
.site-name { font-weight: 500; }
.site-origin { color: #888; font-family: Consolas, monospace; font-size: 12px; }
.site-meta { display: flex; align-items: center; gap: 10px; }
.tag {
  background: #E1F5EE; color: #0F6E56; border-radius: 4px; padding: 1px 8px; font-size: 11px;
}
.tag.off { background: #f0f0f0; color: #999; }
.dim { color: #999; }
.pad { padding: 8px 0; }
.ok { color: #0F6E56; margin-top: 8px; }
.err { color: #A32D2D; margin-top: 8px; }
.hint { margin-bottom: 10px; line-height: 1.8; font-size: 12px; color: #555; }
.path-chip {
  display: inline-block; background: #EEEDFE; color: #534AB7; border-radius: 4px;
  padding: 1px 6px; margin: 2px 4px 2px 0; font-family: Consolas, monospace; font-size: 11px;
}
.link { color: #534AB7; font-size: 12px; text-decoration: none; margin-left: 8px; }
.candidates { margin-top: 12px; }
.cand {
  display: flex; align-items: center; gap: 8px; padding: 6px 8px;
  border: 1px solid #eee; border-radius: 6px; margin-bottom: 6px;
  background: #fff; font-weight: 400; cursor: pointer;
}
.cand:hover { border-color: #b9b3e0; }
.cand input[type='checkbox'] { accent-color: #534AB7; }
.cand-label { flex: 1; font-family: Consolas, monospace; font-size: 11px; color: #534AB7; word-break: break-all; }
.cand-val { font-family: Consolas, monospace; font-size: 11px; color: #333; max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cand-how { font-size: 10px; color: #999; white-space: nowrap; }
</style>
