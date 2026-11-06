<script setup>
import { ref, computed, onMounted } from 'vue'

const loading = ref(true)
const config = ref(null)
const captures = ref({})
const activeSiteId = ref('')
const syncing = ref(false)
const msg = ref('') // 顶部提示

const STATUS_TEXT = {
  UNCONFIGURED: '未配置',
  WAITING_AUTH: '等待授权',
  ENABLED: '监测已启用',
  WAITING_TOKEN: '等待确认 Token 字段',
  SYNCING: '同步中',
  SYNCED: '同步成功',
  FAILED: '同步失败',
  REVOKED: '权限已撤销',
}

const sites = computed(() => (config.value ? config.value.sites : []))
const activeSite = computed(() => sites.value.find((s) => s.id === activeSiteId.value) || sites.value[0] || null)
const capture = computed(() => (activeSite.value ? captures.value[activeSite.value.id] : null))
const tokenEntries = computed(() => (capture.value ? Object.entries(capture.value.tokens || {}) : []))

async function refresh() {
  const resp = await chrome.runtime.sendMessage({ type: 'GET_STATE' })
  if (resp.ok) {
    config.value = resp.config
    captures.value = resp.captures
    if (!activeSiteId.value && resp.config.sites.length) activeSiteId.value = resp.config.sites[0].id
  }
  loading.value = false
}

onMounted(refresh)

function maskVal(v) {
  if (!v) return ''
  if (v.length <= 24) return v.slice(0, 6) + '…'
  return v.slice(0, 10) + '…' + v.slice(-6)
}

function statusText(st) {
  return STATUS_TEXT[st] || st || '未配置'
}

async function copyTokens() {
  if (!capture.value) return
  await navigator.clipboard.writeText(JSON.stringify(capture.value.tokens, null, 2))
  msg.value = '已复制 JSON'
  setTimeout(() => (msg.value = ''), 1500)
}

async function syncNow() {
  if (!activeSite.value || syncing.value) return
  syncing.value = true
  msg.value = ''
  try {
    const resp = await chrome.runtime.sendMessage({ type: 'SYNC_NOW', siteId: activeSite.value.id })
    if (!resp.ok) {
      msg.value = resp.error || (resp.state && resp.state.lastError === 'network_error' ? '同步失败（后端不可达或未配置）' : '同步失败')
    } else {
      msg.value = '同步成功'
    }
    await refresh()
  } catch (e) {
    msg.value = '同步失败：' + e.message
  }
  syncing.value = false
  setTimeout(() => (msg.value = ''), 3000)
}

function openOptions() {
  chrome.runtime.openOptionsPage()
}
</script>

<template>
  <div class="wrap">
    <h1>Website Auth Helper</h1>
    <p class="sub">捕获已授权网站的登录 Token</p>

    <div v-if="loading" class="dim center">加载中…</div>

    <template v-else>
      <!-- 站点选择 -->
      <div v-if="sites.length" class="site-row">
        <select v-model="activeSiteId" class="site-select">
          <option v-for="s in sites" :key="s.id" :value="s.id">{{ s.name }}</option>
        </select>
        <span v-if="activeSite" class="tag" :class="{ off: !activeSite.enabled }">
          {{ activeSite.enabled ? statusText(activeSite.syncState.status) : '已停用' }}
        </span>
      </div>
      <div v-else class="empty">
        <div class="dim">还没有配置站点</div>
        <button class="mini" @click="openOptions">去添加站点 →</button>
      </div>

      <!-- 捕获数据展示 -->
      <div v-if="activeSite" class="status">
        <div class="st-title-row">
          <span class="st-title">捕获的 Token</span>
          <a v-if="tokenEntries.length" href="#" class="copy-link" @click.prevent="copyTokens">复制 JSON</a>
        </div>
        <div v-if="tokenEntries.length" class="tokens">
          <div class="st-line dim">捕获时间：{{ new Date(capture.capturedAt).toLocaleString() }}</div>
          <div v-for="[label, val] in tokenEntries" :key="label" class="cred-row">
            <div class="cred-key">{{ label }}</div>
            <div class="cred-val" :title="label">{{ maskVal(val) }}</div>
          </div>
        </div>
        <div v-else class="st-line dim">
          暂无数据。确认 Token 字段后，登录网站即可自动捕获。
        </div>
      </div>

      <!-- 同步状态 -->
      <div v-if="activeSite" class="status">
        <div class="st-title">同步状态</div>
        <div class="st-line">
          后端接口：{{ config.receiverUrl ? '已配置' : '未配置（仅在本地展示数据）' }}
        </div>
        <div v-if="activeSite.syncState.lastSyncAt" class="st-line dim">
          最近同步：{{ new Date(activeSite.syncState.lastSyncAt).toLocaleString() }}
          <template v-if="activeSite.syncState.lastError"> · {{ activeSite.syncState.lastError }}</template>
        </div>
      </div>

      <div v-if="msg" class="msg">{{ msg }}</div>

      <button v-if="activeSite" class="primary" :disabled="syncing" @click="syncNow">
        {{ syncing ? '同步中…' : '立即同步测试' }}
      </button>

      <a class="opts-link" href="#" @click.prevent="openOptions">站点与后端配置 →</a>
    </template>
  </div>
</template>

<style scoped>
* { margin: 0; padding: 0; box-sizing: border-box; }
.wrap {
  width: 340px; padding: 16px; font-family: 'Segoe UI', 'Microsoft YaHei', sans-serif;
  font-size: 13px; color: #333; background: #fafafa;
}
h1 { font-size: 15px; font-weight: 600; margin-bottom: 4px; }
.sub { color: #888; font-size: 11px; margin-bottom: 14px; }
.site-row { display: flex; gap: 8px; align-items: center; margin-bottom: 12px; }
.site-select {
  flex: 1; padding: 6px 8px; border: 1px solid #d9d9d9; border-radius: 6px;
  font-size: 12px; background: #fff;
}
.tag {
  background: #E1F5EE; color: #0F6E56; border-radius: 4px;
  padding: 2px 8px; font-size: 11px; white-space: nowrap;
}
.tag.off { background: #f0f0f0; color: #999; }
.status {
  margin-top: 12px; font-size: 12px; background: #fff;
  border: 1px solid #e5e5e5; border-radius: 8px; padding: 10px;
}
.st-title-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
.st-title { font-weight: 500; }
.copy-link { color: #534AB7; font-size: 11px; text-decoration: none; }
.st-line { color: #555; line-height: 1.7; }
.cred-row { padding: 4px 0; border-top: 1px dashed #eee; }
.cred-key {
  color: #534AB7; font-family: Consolas, monospace; font-size: 11px;
  word-break: break-all; margin-bottom: 2px;
}
.cred-val {
  color: #333; font-family: Consolas, monospace; font-size: 11px;
  word-break: break-all;
}
.dim { color: #999; }
.center { text-align: center; padding: 20px 0; }
.empty { text-align: center; padding: 16px 0; }
.mini {
  margin-top: 8px; padding: 4px 12px; border: 1px solid #534AB7; border-radius: 6px;
  background: none; color: #534AB7; font-size: 12px; cursor: pointer;
}
.primary {
  width: 100%; margin-top: 14px; padding: 9px 0; border: none; border-radius: 8px;
  background: #534AB7; color: #fff; font-size: 13px; font-weight: 500; cursor: pointer;
}
.primary:hover { background: #43389e; }
.primary:disabled { background: #b9b3e0; }
.msg {
  margin-top: 10px; padding: 6px 10px; border-radius: 6px;
  background: #EEEDFE; color: #534AB7; font-size: 12px;
}
.opts-link {
  display: block; margin-top: 12px; text-align: center;
  color: #534AB7; font-size: 12px; text-decoration: none;
}
</style>
