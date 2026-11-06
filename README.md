# Website Auth Helper（Vue 3 版）

Chrome MV3 扩展。捕获用户自有网站（已授权配置）的登录 Token（localStorage / sessionStorage，含嵌套 JSON 路径），在 Popup 展示抓到的数据，并可同步到自建后端接口。

设计文档：`C:\Users\GW00354021\Desktop\prd\Website-Auth-Helper-产品设计与开发设计文档.md`（V1.1）

## 当前范围（V0.1）

- 多站点可配置：Origin 可在 Options 页添加/停用/删除，动态注册 Content Script + 按需申请域名权限
- Token 捕获：Storage 扫描候选 → 用户勾选确认 → Storage 变化事件驱动自动捕获
- Cookie 捕获：暂未实现（后续版本，PRD 第 7 章）
- 后端同步：接收 URL 可配置，可留空（留空时仅本地展示）；变化去重、指纹比对
- 批量下载：未实现（PRD 第 18 章）

## 项目结构

```
website-helper/
├── public/                 # 原样拷贝进 dist
│   ├── manifest.json        # MV3 配置（optional_host_permissions 运行时申请）
│   ├── bridge.js            # 隔离世界 content script（动态注册，消息桥）
│   └── hook.js              # MAIN world（动态注册，Storage setItem/removeItem 通知）
├── src/
│   ├── background/
│   │   └── index.js         # service worker（Vite 入口，打包为 dist/background.js）
│   ├── core/
│   │   ├── types.js         # SiteConfig/TokenPath 模型
│   │   ├── storage.js       # chrome.storage 封装
│   │   ├── scanner.js       # 扫描函数（参考实现；background 内联同款）
│   │   └── sync.js          # 同步上报
│   ├── popup/               # 工具栏弹窗（站点切换 / 捕获数据 / 手动同步）
│   └── options/             # 配置页（站点 CRUD / 扫描确认 / 后端配置）
├── popup.html
├── options.html
├── vite.config.js           # base: './' 相对路径 + 三入口（background/popup/options）
└── package.json
```

## 开发

```bash
npm install
npm run dev     # vite build --watch
npm run build   # 一次性构建
```

加载：打开 `chrome://extensions/`，启用开发者模式，「加载已解压的扩展程序」，选择 `dist/` 目录。

## 使用流程

1. Options 页添加站点（填 Origin，Chrome 弹窗授权域名）
2. 打开并登录目标网站
3. Options 页点击「扫描 Token 候选字段」
4. 勾选真正用于认证的字段并保存
5. Popup 即可看到捕获的 Token（自动，登录/凭证变化时更新）
6. 配置后端接收 URL 后，可「立即同步测试」

## 注意事项

1. `vite.config.js` 的 `base: './'` 不能改（chrome-extension:// 协议下绝对路径加载不到资源）
2. background 是 Vite 打包入口（`src/background/index.js` → `dist/background.js`），可 import `src/core/*`；`public/` 下文件原样拷贝（manifest、bridge、hook）
3. 上架前补图标
4. 接收接口务必部署在内网或加访问控制——它收到的就是能登录你系统的凭证
