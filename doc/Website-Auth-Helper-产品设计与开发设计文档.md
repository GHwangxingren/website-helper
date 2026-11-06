# Website Auth Helper
## 产品设计与开发设计文档

**版本：** V1.1  
**日期：** 2026-11-06  
**状态：** 设计基线 / 待真实网站联调  
**平台：** Chrome / Chromium，Manifest V3  
**技术栈：** Vue 3、TypeScript、Vite、Chrome Extension APIs  
**参考实现：** `E:\p\vue-extension`（会话凭证对接助手 v1.2.0，单站点原型）

---

# 1. 项目概述

## 1.1 背景

目标网站为用户购买并有权管理的网站。原项目开发人员已离开，当前无法修改网站源码，也缺少原始工程。用户希望通过浏览器扩展，在正常登录目标网站后，自动发现并同步该网站的认证凭证，供用户自建后端在获得授权的前提下管理和使用。

本项目不修改目标网站，不绕过认证、验证码、MFA 或访问控制。扩展只针对用户配置并明确授权的目标网站，读取用户确认的 Token 字段及指定名称的 Cookie。

## 1.2 产品目标

1. 自动分析 `localStorage`、`sessionStorage` 中可能的 Token 字段。
2. 由用户确认真正用于认证的字段，避免误采集。
3. 只读取配置名称白名单中的 Cookie，支持 HttpOnly Cookie。
4. 在已确认凭证变化时触发自动同步。
5. 将凭证通过 HTTPS 发送至用户自有后端。
6. **支持配置多个捕获网站**：每个站点独立配置 Origin、Cookie 白名单、Token 路径与同步策略（V1.1 新增，详见第 17 章）。
7. 为后续批量文件下载功能提供统一的登录态管理基础（详见第 18 章）。

## 1.3 非目标

- 不自动填写账号密码或自动登录。
- 不绕过验证码、MFA、风控或权限控制。
- 不采集其他网站 Cookie。
- 不无差别抓取所有请求和响应正文。
- 不把 Token/Cookie 暴露给页面脚本、第三方分析服务或普通日志。
- 不承诺通用自动发现覆盖所有网站。

## 1.4 已确认需求

| 项目 | 确认结果 |
|---|---|
| Token 存储位置 | 未知，需要插件自动分析 |
| Cookie 范围 | 只获取指定名称 |
| 同步策略 | 登录成功和凭证更新时自动同步 |
| 网站域名 | 暂未提供 |
| 网站源码 | 无法修改 |
| 后端 | 用户自建接收接口 |
| 插件形态 | Chrome 浏览器扩展 |

---

# 2. 用户流程与业务流程

## 2.1 首次配置流程

1. 安装扩展并打开目标网站。
2. 用户正常登录目标网站。
3. 打开扩展，新增捕获站点：填写目标网站 Origin、Cookie 名称白名单（后端接收 API 全局配置一次）。
4. 点击"授权并启用监测"，Chrome 弹出目标域名和后端域名权限申请。
5. 点击"扫描 Token"，扩展扫描当前页面 Web Storage。
6. 展示候选字段、存储区域、JSON 路径及脱敏值。
7. 用户勾选确认真正的认证字段并保存。
8. 用户执行一次同步测试，确认后端收到数据。
9. 需要监控更多网站时，重复步骤 1-8 逐站点添加（第 17 章）。

## 2.2 自动同步流程

- 用户已登录，已确认 Token 字段可读取：执行初始化同步。
- 已选 Storage 字段变化：触发去抖动同步。
- 白名单 Cookie 新增或更新：触发同步。
- 用户点击“立即同步测试”：执行手动同步。
- 页面重新打开或刷新：页面就绪后检查当前凭证，必要时同步。

通用扩展无法对所有网站准确判断“登录成功”。第一版以已确认凭证可读、值变化作为登录成功/更新的代理信号。真实网站联调后，可以增加站点专用登录接口成功判断。

## 2.3 异常流程

- 扫描不到候选项：提示可能使用 IndexedDB、内存变量、Service Worker 或其他存储，需要站点专项适配。
- 后端不可达：展示失败状态，不输出凭证明文。
- 目标标签页关闭：当前任务终止；重新打开目标网站后再检查。
- 用户撤销域名权限：停止采集并提示重新授权。
- Cookie 删除或退出登录：同步失效状态，不应继续保留为有效登录态。
- Token 过期：由后端认证结果判定，提示用户重新登录。

---

# 3. 产品功能设计

## 3.1 功能清单

| 模块 | 功能 | 优先级 |
|---|---|---|
| 网站配置 | 配置目标网站 Origin | P0 |
| 多站点配置 | 多站点独立配置、站点列表管理、按站点启用/停用 | P0（V1.1） |
| 后端配置 | 配置接收 API URL | P0 |
| Cookie 配置 | 配置 Cookie 名称白名单（按站点） | P0 |
| 权限管理 | 按需申请目标站点和 API 域名权限 | P0 |
| Token 发现 | 扫描 localStorage/sessionStorage | P0 |
| Token 确认 | 候选字段勾选、保存路径 | P0 |
| Cookie 读取 | 通过 chrome.cookies 获取指定 Cookie | P0 |
| 自动同步 | Storage/Cookie 变化触发同步 | P0 |
| 手动测试 | 立即同步并展示结果 | P0 |
| 状态管理 | 最近同步时间、成功/失败状态 | P1 |
| 诊断面板 | 捕获来源统计、网络日志、存储快照（参考 demo Popup） | P1（V1.1） |
| 高级适配 | IndexedDB、站点专用适配器 | P2 |
| 批量下载 | 分页遍历、文件提取、下载队列 | V0.4（第 18 章） |

## 3.2 配置界面（Popup / Options）

采用「Popup 轻量概览 + Options 完整管理」双层结构（沿用 demo 的形态）：

**Popup（工具栏弹窗）**：
- 当前站点选择器（多站点时切换活动站点）。
- 活动站点的同步状态、最近捕获凭证摘要（脱敏）、最近一次上报结果。
- 快捷操作：立即同步测试、扫描 Token、打开完整配置。

**Options（配置页）**：
- 站点列表管理：新增 / 编辑 / 删除 / 启用 / 停用捕获站点。
- 每站点配置（详见 17.2 站点配置模型）：
  - 目标网站 Origin，例如 `https://portal.example.com`。
  - Cookie 名称白名单，英文逗号分隔，例如 `SESSION, JSESSIONID`。
  - 已确认 Token 字段路径列表。
  - 自动同步开关。
- 全局配置：
  - 后端接收 API，例如 `https://api.example.com/api/extension/auth/sync`。
  - 后端设备授权凭证（生产环境建议短期、可撤销凭证）。
  - 诊断数据展示开关。
- 诊断面板（参考 demo）：捕获来源统计、网络日志（最近 50 条）、页面存储快照。

主要操作：
- 新增站点并授权（触发 Chrome 域名权限申请）。
- 授权并启用监测。
- 扫描 Token。
- 保存选中的 Token 字段。
- 保存配置。
- 立即同步测试。

## 3.3 Token 候选列表

展示存储区域、Key、JSON 子路径、脱敏值、发现方式和勾选状态。默认不展示完整 Token，不将明文候选值写入 `chrome.storage`、日志或分析事件。

## 3.4 同步状态

按站点维护独立状态：

- 未配置
- 等待授权
- 监测已启用
- 等待确认 Token 字段
- 同步中
- 同步成功
- 同步失败
- 权限已撤销
- 凭证疑似过期（必须由后端验证结果支持）

---

# 4. 技术架构

## 4.1 架构图

```text
┌──────────────────────────────────────┐
│ 目标网站页面                          │
│ 登录 / localStorage / sessionStorage │
└──────────────────┬───────────────────┘
                   │
          ┌────────▼────────┐
          │ Content Script  │
          │ 监测已选字段变化 │
          └────────┬────────┘
                   │ runtime message
          ┌────────▼────────┐
          │ Background SW  │
          │ 任务调度/去重    │
          │ Cookie API      │
          │ 读取已确认 Token │
          │ HTTPS 回传       │
          └────────┬────────┘
                   │
          ┌────────▼────────┐
          │ 用户自有后端     │
          │ 校验/加密/存储   │
          └─────────────────┘
```

Token 扫描与读取通过 `chrome.scripting.executeScript` 在目标页面 `MAIN` world 执行；后台通过扩展特权 API 读取 Cookie 并向后端发送请求。

## 4.2 组件职责

### Popup（Vue UI）
- 管理网站、API、Cookie 白名单等配置。
- 申请可选域名权限。
- 扫描并展示 Token 候选项。
- 保存用户确认的字段路径。
- 展示同步状态并提供手动测试。

### Content Script（ISOLATED world）
- 在目标网站运行。
- 监测用户确认的 Storage 字段是否变化。
- 仅发送“字段变化”通知，不传递 Token 明文。
- 不读取 HttpOnly Cookie。

### Background Service Worker
- 读取扩展配置。
- 接收 Content Script 通知。
- 调用 `chrome.scripting.executeScript` 读取确认字段。
- 调用 `chrome.cookies` 读取指定 Cookie。
- 执行去抖动、去重、同步和错误处理。

### MAIN world
- 在页面上下文访问 Web Storage。
- 执行用户主动扫描和后台指定字段读取。
- 当前版本不全局监听或转发所有 fetch/XHR Response Body。

## 4.3 分层原因

- MAIN world 能访问页面运行环境，但没有扩展特权 API。
- Content Script 默认隔离于页面 JavaScript，适合轻量消息通知。
- Background Service Worker 可使用扩展权限，负责 Cookie API、网络请求和任务调度。
- Popup 只负责交互，不承担长期监控。

---

# 5. Manifest V3 权限设计

```json
{
  "manifest_version": 3,
  "permissions": ["storage", "cookies", "scripting", "tabs"],
  "optional_host_permissions": ["http://*/*", "https://*/*"],
  "background": {
    "service_worker": "assets/background.js",
    "type": "module"
  },
  "action": {
    "default_popup": "index.html"
  }
}
```

权限说明：
- `storage`：保存非敏感配置。
- `cookies`：读取指定 Cookie，包括 HttpOnly。
- `scripting`：在用户授权的目标页面执行扫描。
- `tabs`：检查当前标签页是否为目标网站。
- `optional_host_permissions`：运行时按需申请目标网站和后端 API 域名权限。

生产版应将权限收敛到明确域名，避免长期申请宽泛的所有 HTTP/HTTPS 权限。

---

# 6. Token 自动发现设计

## 6.1 第一阶段扫描范围

扫描：
- `window.localStorage`
- `window.sessionStorage`
- 可解析 JSON 字符串中的嵌套对象
- 常见字段名：`token`、`auth`、`jwt`、`session`、`access`、`refresh`
- 外观符合 JWT 三段式结构的字符串

字段名和 JWT 格式只用于生成候选项，不代表该值一定有效。

## 6.2 字段路径模型

```ts
interface TokenPath {
  area: 'localStorage' | 'sessionStorage'
  key: string
  path: string[]
  label: string
}
```

例如存储值：

```json
{
  "authInfo": {
    "accessToken": "..."
  }
}
```

字段路径：

```json
{
  "area": "localStorage",
  "key": "userInfo",
  "path": ["authInfo", "accessToken"],
  "label": "localStorage.userInfo.authInfo.accessToken"
}
```

## 6.3 未覆盖的存储形式

- IndexedDB
- 页面内存变量、闭包
- Service Worker 自有存储
- 自定义加密/混淆存储
- 其他浏览器专有存储机制

扫描不到时，应针对目标网站做专项适配，不应盲目上传未知字段。

## 6.4 登录接口 Response 处理策略

当前原型不读取登录接口 Response Body。通过 `postMessage` 或 DOM 事件将响应正文桥接到隔离世界，可能被页面脚本观察或伪造，增加凭证泄露风险。

如确有需要：
1. 在授权测试环境确认登录/刷新 API 路径和响应字段。
2. 编写目标站点专用适配器，只匹配明确接口。
3. 只提取必要字段，不复制整个响应。
4. 校验来源、事件类型、字段白名单和消息有效性。
5. 避免将完整凭证广播给页面其他脚本。
6. 经过安全评审后启用。

---

# 7. Cookie 获取设计

## 7.1 获取方式

使用 `chrome.cookies.getAll()` 读取目标域名 Cookie，再按用户配置的名称白名单过滤。该 API 可读取 HttpOnly Cookie，但扩展必须具有对应域名权限。

## 7.2 Cookie 数据模型

```ts
interface SyncedCookie {
  name: string
  value: string
  domain: string
  path: string
  httpOnly: boolean
  secure: boolean
  sameSite: string
  expirationDate?: number
}
```

## 7.3 过滤原则

- 只处理目标网站及明确确认的相关子域。
- 只上传配置的 Cookie 名称。
- 名称严格匹配、区分大小写。
- 不上传其他域名 Cookie。
- 不默认读取或上传全部 Cookie。
- 多子域认证时，逐一确认 Cookie Domain 与权限范围。

## 7.4 Cookie 更新与删除

监听 `chrome.cookies.onChanged`：
- 只关注白名单名称。
- 校验 Cookie Domain 与目标域名关系。
- 新增/更新触发去抖动同步。
- 删除事件应同步凭证失效或退出状态，不能简单忽略。
- 需要区分浏览器替换 Cookie、过期、用户主动删除等原因。

---

# 8. 自动同步设计

## 8.1 触发条件

| 事件 | 动作 |
|---|---|
| 首次启用且凭证已可读 | 初始化同步 |
| 已选 Storage 字段变化 | 去抖动后同步 |
| 白名单 Cookie 新增/更新 | 去抖动后同步 |
| 用户手动测试 | 立即同步 |
| 页面刷新/重新打开 | 页面就绪后检查并按需同步 |
| Cookie 删除/退出登录 | 同步失效状态 |

“登录成功”不能仅靠通用脚本在所有网站准确判断。第一版以凭证出现或变化作为代理信号；联调后可增加站点专用登录成功识别。

## 8.2 去抖动、去重和并发

- 去抖动建议 500–1500ms。
- 比较凭证内容指纹，未变化则不重复上传。
- 不将明文凭证写入日志或普通持久化状态。
- Service Worker 可能休眠或重启，不能只依赖内存变量去重。
- 生产版使用服务端幂等键、同步锁和多标签页并发控制。
- 失败重试应有次数上限、退避策略和超时。

## 8.3 状态机

```text
DISABLED
   │ 用户启用
   ▼
WAITING_FOR_AUTH
   │ 检测到已确认凭证
   ▼
READY
   │ 凭证变化 / 手动触发
   ▼
SYNCING
   ├── 2xx ──> SYNCED
   └── 错误 ─> FAILED
                  │ 满足重试条件
                  └──> SYNCING
```

---

# 9. 后端接口设计

## 9.1 推荐接口

```http
POST /api/extension/auth/sync
Authorization: Bearer <short-lived-device-token>
Content-Type: application/json
```

不建议把长期静态密钥作为唯一鉴权方式。建议由用户后端签发短期、可撤销、可绑定设备的授权凭证。

## 9.2 请求体示例

```json
{
  "schemaVersion": 1,
  "siteOrigin": "https://portal.example.com",
  "deviceId": "extension-installation-id",
  "syncId": "unique-idempotency-key",
  "syncedAt": "2026-11-06T01:00:00.000Z",
  "tokens": {
    "localStorage.userInfo.authInfo.accessToken": "..."
  },
  "cookies": [
    {
      "name": "SESSION",
      "value": "...",
      "domain": "portal.example.com",
      "path": "/",
      "httpOnly": true,
      "secure": true,
      "sameSite": "lax",
      "expirationDate": 1794000000
    }
  ]
}
```

## 9.3 成功响应

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "accepted": true,
    "syncId": "unique-idempotency-key",
    "receivedAt": "2026-11-06T01:00:02.000Z"
  }
}
```

## 9.4 后端职责

- 校验设备授权凭证、用户身份及目标网站绑定。
- 校验 `siteOrigin` 白名单。
- 校验请求大小、字段数量、Cookie 名称白名单。
- Token/Cookie 加密存储，密钥由 KMS 或安全密钥管理方案托管。
- 凭证与普通业务数据隔离。
- 设置 TTL、轮换、撤销和删除机制。
- 日志、APM、异常堆栈中不得记录凭证明文。
- 同步历史只展示时间、状态和字段名称。
- 支持幂等处理，防止重复写入。

## 9.5 CORS

Chrome 扩展请求 Origin 通常为 `chrome-extension://<extension-id>`。后端应明确允许发布版扩展 ID，正确处理 OPTIONS 预检请求。生产环境不应无条件开放任意来源。

---

# 10. 安全与隐私设计

认证凭证等同于账号访问能力，必须按高敏感凭证处理。

## 10.1 最小权限
- 只授权明确的目标 Origin。
- 只请求必要的后端 API Origin。
- Cookie 只按名称白名单读取。
- Token 只读取用户确认的字段。
- 不监听无关网站或无关接口。

## 10.2 生命周期
- 明文凭证只在内存中短暂持有。
- 不写入 `chrome.storage`、普通日志或分析事件。
- 后端加密存储并设置 TTL。
- 提供设备解绑、凭证撤销、删除机制。
- 关闭同步后停止上传；需要彻底停止时同时卸载动态脚本并撤销域名权限。

## 10.3 页面隔离
- 不把 Token 放入 DOM、自定义事件或页面可访问的全局变量。
- 不接受页面任意发来的上传凭证消息。
- 不向页面世界暴露后端授权密钥。
- 校验消息发送方、tab URL、Origin 和消息类型。
- MAIN world 只执行必要的读取操作。

## 10.4 传输安全
- 生产环境强制 HTTPS。
- 后端校验设备授权、目标域名和请求结构。
- 使用时间戳、随机 syncId、短期设备凭证降低重放风险。
- 限制请求频率、负载大小和凭证数量。

---

# 11. 工程结构与技术选型

```text
website-auth-helper/
├── public/
│   └── manifest.json
├── src/
│   ├── background.ts
│   ├── content.ts
│   ├── types.ts
│   └── popup/
│       ├── App.vue
│       ├── main.ts
│       └── style.css
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
└── README.md
```

| 技术 | 用途 |
|---|---|
| Vue 3 | Popup UI |
| TypeScript | 类型安全 |
| Vite | 多入口构建 |
| Chrome MV3 | 扩展运行环境 |
| `chrome.storage` | 非敏感配置 |
| `chrome.scripting` | 页面上下文扫描 |
| `chrome.cookies` | 指定 Cookie 读取 |
| `chrome.runtime` | 扩展消息 |
| Fetch API | HTTPS 回传 |

## 11.1 构建与安装

```bash
pnpm install
pnpm build
```

打开 `chrome://extensions`，启用开发者模式，选择“加载已解压的扩展程序”，选择 `dist` 目录。

---

# 12. 当前原型说明与生产化修正清单

已评估的原型包括：
- `E:\p\vue-extension`（会话凭证对接助手 v1.2.0）：单站点三路捕获原型（webRequest 请求头 / MAIN world fetch/XHR 响应体 / 周期存储扫描），Vue 3 Popup + Options，background/hook/bridge 三文件职责划分清晰，可直接参考其交互设计。
- V1.0 文档附带 ZIP 原型：Storage 扫描、Cookie 白名单、后台同步基础模块。

两者都是联调起点，不是已完成安全审计的生产版本。demo 中需要修正的额外问题（详见第 17.5 节）：周期全量存储快照上报、fetch/XHR 响应体默认全量拦截、siteHost 硬编码。

正式开发前必须修正和验证：

1. **Content Script 构建格式**：确保输出为 Chrome 可直接加载的单文件，不依赖未打包 ESM import。
2. **动态脚本注册**：验证 `registerContentScripts` 的注册、更新、卸载及扩展重启行为；域名变更时清理旧注册。
3. **权限申请**：只申请目标网站与后端 API Origin。
4. **初始化同步**：用户已扫描并保存字段后，页面启动时检查当前凭证；不能只依赖后续变化事件。
5. **Cookie 删除**：处理退出登录、Cookie 删除和过期。
6. **去重**：不要用包含 `syncedAt` 的整个请求体作为凭证去重依据；使用凭证内容指纹，且不持久化明文。
7. **并发**：多标签页同步需要任务锁或服务端幂等。
8. **鉴权**：生产环境使用短期、可撤销设备授权凭证。
9. **响应校验**：校验响应结构、HTTP 状态、超时与重试策略。
10. **日志脱敏**：所有日志和错误提示不得包含 Token/Cookie。
11. **开关语义**：关闭自动同步时停止事件处理，并提供撤销脚本注册/权限的操作。
12. **真实网站适配**：确认域名、Cookie 名称、登录流程和刷新逻辑后才能最终定型。

---

# 13. 测试计划

## 13.1 功能测试

| 编号 | 场景 | 预期 |
|---|---|---|
| F01 | 配置合法 Origin | 保存成功 |
| F02 | 用户拒绝域名权限 | 不启用采集 |
| F03 | Storage 有 JWT | 发现候选项并脱敏 |
| F04 | 嵌套 JSON 中有 Token | 显示正确路径 |
| F05 | 用户不确认候选项 | 不同步该字段 |
| F06 | 配置 Cookie 白名单 | 只同步指定名称 |
| F07 | 白名单含 HttpOnly Cookie | Cookies API 可读取 |
| F08 | 已选 Token 值变化 | 去抖动触发同步 |
| F09 | 白名单 Cookie 更新 | 触发同步 |
| F10 | 凭证未变化 | 不重复上传 |
| F11 | 后端 4xx/5xx | 展示失败，不泄露凭证 |
| F12 | 关闭自动同步 | 不再自动上传 |
| F13 | 非目标页面触发同步 | 拒绝同步 |
| F14 | 多标签页同时触发 | 不产生不可控重复写入 |

## 13.2 安全测试

- 页面脚本无法通过 DOM 或全局变量读取扩展后台凭证。
- 非目标域名不能触发同步。
- 未配置 Cookie 名称不会进入请求体。
- 未确认 Storage 字段不会进入请求体。
- 控制台、日志、APM 不包含凭证明文。
- 撤销设备凭证后，后端拒绝后续同步。
- 关闭同步后，后台不再发送请求。

## 13.3 兼容性测试

- Chrome 稳定版。
- Service Worker 休眠与重启。
- 多标签页。
- 页面刷新、跳转、重新登录。
- 主域和子域 Cookie。
- HTTPS 生产环境。

---

# 14. 版本迭代计划

## V0.1 基础原型
- Popup 配置。
- 域名授权。
- Web Storage 扫描。
- 用户确认 Token 路径。
- 指定 Cookie 名称读取。
- 手动同步测试。

## V0.2 目标网站联调
- 确认真实 Token 存储结构。
- 确认 Cookie 名称、Domain、Path。
- 增加站点登录成功判断。
- 验证 Token 刷新和重新登录。
- 完成后端接口联调。

## V0.3 生产可靠性
- 短期设备授权凭证。
- 同步状态与历史。
- 幂等、并发锁、重试与超时。
- 退出登录、Cookie 删除、凭证撤销。
- 权限收敛和安全审计。

## V0.4 批量下载
- 复用目标网站授权状态。
- 分页遍历文件列表。
- 提取文件元数据和下载地址。
- 下载队列、并发限制、失败重试。
- 进度展示、断点续传（取决于站点和文件服务器能力）。
- 处理分页接口、下载接口、跨域和文件名。

（详细设计见第 18 章）

---

# 15. 待提供信息

正式适配需要：
1. 目标网站 Origin（及是否多站点，见第 17 章）。
2. 登录页面 URL（移除敏感参数）。
3. 后端接收接口 URL。
4. 后端设备授权方式。
5. Cookie 名称（只提供名称，不提供值）。
6. 登录后是否跳转、是否使用 SSO 子域。
7. Token 是否自动刷新。
8. 是否有退出登录、账号切换场景。
9. 批量下载的列表页与分页方式（见第 18 章：列表页 URL 模板、分页参数、下载地址获取方式、是否支持 Range）。

---

# 16. 验收标准

第一阶段完成需满足：
- 可配置并授权单一目标网站。
- 可扫描并确认 Token 字段。
- 只读取指定 Cookie 名称。
- 登录后可触发初始化同步。
- 已确认 Token 或白名单 Cookie 变化时自动同步。
- 后端验证设备授权并安全接收凭证。
- 凭证不变时不重复写入。
- 关闭同步或撤销权限后不再上传。
- UI 和日志不展示凭证明文。
- 有明确的成功、失败、权限不足和未发现凭证提示。
- 多站点场景：各站点独立启停与同步，互不干扰（第 17 章）。

**不要发送真实 Token、Cookie、账号密码或完整认证请求头。** 联调优先使用测试账号和脱敏信息。

---

# 17. 可配置捕获网站设计（V1.1 新增）

## 17.1 现状与问题

参考实现 `E:\p\vue-extension`（会话凭证对接助手 v1.2.0）为**单站点硬编码**架构：

- `manifest.json` 的 `host_permissions` 与 `content_scripts.matches` 写死 `http://10.255.56.127/*`。
- `background.js` 的 `SITE_HOST`、`webRequest` 监听的 `urls` 均为常量。
- `hook.js` 每 3 秒全量扫描 localStorage/sessionStorage 并上报快照。

问题：更换/新增目标站点需要改代码重新打包，无法运维化配置；全量快照上报存在过度采集风险。

## 17.2 目标架构：多站点配置模型

将"站点"升级为一等配置对象，所有采集行为由配置驱动：

```ts
interface SiteConfig {
  id: string                    // 站点唯一标识，uuid
  name: string                  // 展示名，例如 "内部门户"
  origin: string                // https://portal.example.com
  enabled: boolean              // 是否启用捕获
  cookieNames: string[]         // Cookie 名称白名单（按站点）
  tokenPaths: TokenPath[]       // 已确认 Token 字段路径（按站点）
  autoSync: boolean             // 自动同步开关（按站点）
  captureSources: {             // 捕获来源开关（按站点）
    storage: boolean            // Storage 扫描
    requestHeaders: boolean     // webRequest 请求头
    responseHook: boolean       // fetch/XHR 响应体拦截（默认关闭，见 17.5）
  }
  syncState: SiteSyncState      // 同步状态（按站点，见 3.4）
  lastSyncAt?: string
  lastCredFingerprint?: string  // 凭证内容指纹（非明文）
}

interface AppConfig {
  schemaVersion: 1
  sites: SiteConfig[]
  receiverUrl: string           // 后端接收 API（全局）
  deviceToken: string           // 设备授权凭证（全局）
  diagnostics: boolean         // 诊断面板开关
}
```

## 17.3 动态注册流程

新增站点时不再修改代码，而是运行时动态注册：

1. Options 页新增站点 → 填写 Origin → 保存 `SiteConfig`。
2. 调用 `chrome.permissions.request({ origins: [origin + '/*'] })` 申请域名权限。
3. 权限通过后：
   - `chrome.scripting.registerContentScripts({ id: 'site-' + siteId, matches: [origin + '/*'], js: ['bridge.js'], runAt: 'document_start' })` 注册隔离世界脚本。
   - `chrome.webRequest.onSendHeaders.addListener` 监听器统一注册一次，回调内按 `url.hostname` 路由到对应 `SiteConfig`（替代 demo 中按常量过滤）。
4. 站点删除或停用时：
   - `chrome.scripting.unregisterContentScripts({ ids: ['site-' + siteId] })`。
   - `chrome.permissions.remove({ origins: [origin + '/*'] })` 撤销域名权限。
   - 清理该站点的同步状态与凭证指纹（不保留残留数据）。

## 17.4 权限模型

```json
{
  "permissions": ["storage", "cookies", "scripting", "tabs", "webRequest"],
  "optional_host_permissions": ["http://*/*", "https://*/*"]
}
```

- `optional_host_permissions` 保留通配，但**只在用户添加站点时按 Origin 精确申请**，Chrome 会向用户展示具体域名确认框。
- 生产环境（上架/分发）改为在 `optional_host_permissions` 或 `host_permissions` 中列出明确域名清单。
- 每个 Content Script 注册 ID 与站点 ID 绑定，支持独立增删，互不影响其他站点。

## 17.5 捕获来源分级（收敛 demo 的三路捕获）

demo 的三路捕获（webRequest 请求头 / MAIN world fetch-XHR 响应体 / 周期存储扫描）保留，但按风险分级管控：

| 来源 | 机制 | 默认 | 说明 |
|---|---|---|---|
| Storage 扫描 | `executeScript` 按需 + Storage 事件 | 开启 | 只读已确认路径；不再周期全量快照上报 |
| 请求头 | `webRequest.onSendHeaders` | 开启 | 只匹配白名单头名与站点 Origin |
| 响应体拦截 | MAIN world hook fetch/XHR | 关闭 | 见 6.4 安全约束，作为站点专用适配器按需启用 |

对照 demo 的修正点：
- 移除"每 3 秒全量扫描 + 全量快照存入 chrome.storage"：改为 Storage 变化事件（`window.addEventListener('storage')` 由 bridge 转发）+ 页面就绪时单次按路径读取。
- Popup 的诊断面板（reqSeen / fetchHooked / 网络日志 / 存储快照统计）保留为开发诊断能力，`diagnostics` 关闭时不记录网络日志与存储快照，避免生产环境过度留存数据。

## 17.6 多站点数据隔离

- 后端同步请求体以 `siteOrigin` 区分站点，`siteOrigin` 必须在用户后端白名单内（见 9.4）。
- 凭证指纹按站点独立维护，A 站点变化不触发 B 站点同步。
- Options 站点列表展示每站点独立的：状态、最近同步时间、凭证字段数、Cookie 数。

## 17.7 迁移与兼容

- V1.0 的单站点配置（`siteOrigin` + `cookieNames` 单组）迁移为一个 `SiteConfig` 条目。
- demo（vue-extension）保持独立原型，不直接升级；正式实现以本文档第 11 章工程结构为准，吸收其 background/hook/bridge 三文件职责划分与 Popup 诊断面板交互设计。

---

# 18. 批量文件下载设计（V0.4）

> 说明：原计划参考的 WorkBuddy 分享页《批量下载网页文件列表》当前无法访问（需原会话登录态，页面内容为空）。本章基于 V0.4 规划项与第 17 章登录态能力设计；待分享内容可获取后，可对照补充站点特定的分页与下载接口细节。

## 18.1 功能定位

复用第 17 章已同步的目标网站登录态，由扩展在浏览器内完成：

1. 遍历目标网站文件列表页（含分页）。
2. 提取文件元数据（名称、大小、更新时间）与下载地址。
3. 排队下载文件到本地（经用户确认下载目录后）。
4. 展示进度，支持失败重试与断点（取决于文件服务器支持 Range）。

## 18.2 前置条件

- 目标网站登录态有效（凭证同步链路已跑通）。
- 已知文件列表页 URL 模式与分页参数（页码 / 游标 / 滚动加载）。
- 已知文件下载地址的获取方式（列表接口直出 / 需二次请求签名 URL）。

## 18.3 数据流

```text
Background Service Worker（任务调度）
   │ 1. 打开列表页 / 调用列表接口（带登录态 Cookie）
   ▼
列表响应 → 解析分页 → 文件元数据 + 下载 URL
   │ 2. 写入下载队列（chrome.storage.local，持久化）
   ▼
下载队列 Worker（并发 N，默认 2-3）
   │ 3. fetch 下载 URL（credentials: 'include'）
   ▼
chrome.downloads.download() / OPFS 暂存
   │ 4. 汇报进度 → Popup/Options 进度面板
   ▼
完成清单（成功/失败/重试）→ 导出 CSV
```

## 18.4 下载队列与并发控制

```ts
interface DownloadTask {
  id: string
  siteId: string
  url: string
  fileName: string
  fileSize?: number
  status: 'pending' | 'downloading' | 'done' | 'failed' | 'skipped'
  attempts: number           // 已重试次数，上限 3
  error?: string             // 脱敏后的错误摘要
  downloadedAt?: string
}

interface DownloadJobConfig {
  listPageUrl: string        // 列表页 URL 模板，{{page}} 占位
  pageStart: number          // 起始页
  pageEnd: number | 'auto'   // 终止页，auto = 遍历到空页
  concurrency: number        // 下载并发数，默认 2，上限 5
  retryLimit: number         // 单文件重试上限，默认 3
  retryBackoffMs: number     // 重试退避基数，默认 5000，指数退避
  fileNameConflict: 'overwrite' | 'skip' | 'rename'
}
```

关键规则：
- 队列持久化到 `chrome.storage.local`，Service Worker 休眠后可恢复继续。
- 并发下载请求显式携带 `credentials: 'include'`，依赖目标站点 Cookie 登录态（即第 17 章同步的 Cookie 白名单）。
- 下载 URL 若有时效签名，入队前即时获取，过期（403）时重新请求列表页刷新 URL 后重试。
- 失败重试采用指数退避（5s → 10s → 20s），超过上限标记 `failed`，任务继续，不阻塞队列。
- 文件名冲突策略默认 `rename`（追加序号），避免静默覆盖用户文件。

## 18.5 断点续传

- 优先方案：HEAD 探测文件服务器是否支持 `Accept-Ranges: bytes`；支持则分片 fetch（Range 请求）写入 OPFS，中断后从已完成分片继续。
- 不支持 Range：失败文件整文件重下，已完成的文件按队列状态跳过（`status: 'done'`）。
- Service Worker 30 秒空闲休眠风险：下载期间用长连接/周期性消息保活，或采用 `chrome.downloads.download()` 交给浏览器下载管理器（推荐，进度与断点由 Chrome 接管，扩展只负责生成任务）。

## 18.6 配置界面（Options · 批量下载 Tab）

- 选择站点（来自第 17 章站点列表）。
- 列表页 URL 模板 + 分页参数试跑（"抓取第 1 页预览"，展示解析出的文件条数与字段）。
- 并发数、重试、文件名冲突策略。
- 下载目录：调用 `chrome.downloads.download` 时的目标路径参数或弹窗确认。
- 任务面板：进度条（已完成/总数）、失败列表（可单条重试）、导出清单 CSV。

## 18.7 权限补充

```json
{
  "permissions": ["storage", "cookies", "scripting", "tabs", "webRequest", "downloads"]
}
```

- `downloads`：V0.4 引入，仅在用户发起批量下载任务时使用。
- 下载请求天然携带目标站点 Cookie（浏览器下载管理器行为），无需额外凭证注入。

## 18.8 安全与边界

- 批量下载仅限第 17 章中已授权的站点，下载 URL 必须与站点 Origin 同域或其文件 CDN 子域（入队前校验，防开放重定向）。
- 列表页解析只在已授权站点页面上执行（Content Script / executeScript）。
- 单任务文件数上限（默认 1000）与总大小提示，防止误操作拖垮目标站点。
- 请求频率限制：列表翻页间隔默认 ≥ 500ms，下载并发 ≤ 5，避免对目标站点造成压力。
- 下载的文件不经过后端，直接落本地；后端仅接收任务统计（可选）。

## 18.9 验收标准

- 配置列表页模板后可预览第 1 页文件数与字段。
- 全量遍历分页，文件元数据与 URL 提取完整。
- 并发下载不超限，失败重试符合退避策略。
- Service Worker 休眠后恢复，队列状态不丢失。
- 文件名冲突按策略处理，不静默覆盖。
- 断网/登录态失效时任务可暂停，重新登录后可继续。

---

# 附录 A：建议 API 契约

```http
POST /api/extension/auth/sync
Authorization: Bearer <short-lived-device-token>
Content-Type: application/json
```

```json
{
  "schemaVersion": 1,
  "siteOrigin": "https://portal.example.com",
  "deviceId": "device-id",
  "syncId": "uuid",
  "syncedAt": "ISO-8601",
  "tokens": {},
  "cookies": []
}
```

# 附录 B：关键 Chrome API

- `chrome.permissions.request()`：按需申请网站权限。
- `chrome.scripting.registerContentScripts()`：注册动态 Content Script。
- `chrome.scripting.unregisterContentScripts()`：按站点注销动态脚本。
- `chrome.scripting.executeScript()`：在目标页面执行受控扫描。
- `chrome.cookies.getAll()`：读取指定域名 Cookie。
- `chrome.cookies.onChanged`：监听 Cookie 变化。
- `chrome.storage.local`：保存非敏感配置。
- `chrome.runtime.onMessage`：扩展上下文消息通信。
- `chrome.webRequest.onSendHeaders`：监听目标站点请求头凭证（按 Origin 路由）。
- `chrome.downloads.download()`：批量下载文件落盘（V0.4）。

官方参考：
- https://developer.chrome.com/docs/extensions/develop/concepts/declare-permissions
- https://developer.chrome.com/docs/extensions/reference/api/cookies
- https://developer.chrome.com/docs/extensions/reference/api/scripting
- https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts
- https://developer.chrome.com/docs/extensions/develop/concepts/service-workers
- https://developer.chrome.com/docs/extensions/reference/api/downloads
- https://developer.chrome.com/docs/extensions/reference/api/webRequest

---

# 附录 C：变更记录

## V1.1（2026-11-06）

**审核结论（对 V1.0 的主要修订）：**

1. **多站点架构升级**：V1.0 及参考 demo（`E:\p\vue-extension`）均为单站点硬编码（manifest matches / SITE_HOST 常量），新增第 17 章"可配置捕获网站设计"：SiteConfig 配置模型、动态注册/注销 Content Script、按 Origin 路由的 webRequest 监听、捕获来源分级管控、多站点数据隔离与迁移方案。
2. **收敛 demo 的高风险行为**：demo 的"每 3 秒全量扫描 Storage + 全量快照入 chrome.storage + fetch/XHR 响应体默认拦截"存在过度采集与留存风险，明确为：Storage 事件驱动 + 按确认路径读取；响应体拦截默认关闭，作为站点专用适配器按需启用；诊断面板仅在 diagnostics 开启时记录。
3. **批量下载完整设计**：将 V0.4 一句话规划扩为第 18 章：数据流、下载队列与并发模型、断点续传（优先 chrome.downloads）、配置界面、downloads 权限、安全边界与验收标准。
4. **配置界面拆分**：Popup 概览 + Options 完整管理（沿用 demo 形态），Popup 增加站点切换器。
5. **同步状态按站点维护**：3.4 明确状态机实例化为每站点独立。
6. 待提供信息补充批量下载所需细节（列表页模板、分页方式、Range 支持）。

**遗留事项：**
- WorkBuddy 分享页《批量下载网页文件列表》无法访问（需原会话登录态），第 18 章为通用设计；获取到分享内容后需对照补充站点特定细节。
- 目标网站 Origin、Cookie 名称、列表页 URL 模板等待用户提供（第 15 章）。
