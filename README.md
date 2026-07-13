# 圆桌会议 / Roundtable Desktop

<p align="center">
  <img src="https://raw.githubusercontent.com/fchen6878-oss/roundtable-desktop/main/assets/icon-dialogue.png" alt="Roundtable" width="96">
</p>

<p align="center">
  <strong>AI 驱动的多角色辩论与决策辅助桌面客户端</strong><br>
  <em>Multi-role AI debate & decision-making assistant powered by LLMs</em>
</p>

---

## 特性 / Features

- **多角色 AI 辩论** — 编排多个 AI 角色（产品经理、工程师、投资人等）围绕同一议题从不同视角展开讨论
- **导演模式** — 作为主持人随时介入，给指定角色下达指令（补充观点/反对/支持）
- **分支探索** — 在辩论关键节点生成新分支，探索「如果换个方向会怎样」
- **观点碰撞图** — 可视化对比不同分支的观点差异，辅助决策
- **场景预设** — 内置技术决策、产品规划、投资理财等 6 大场景模板
- **自动更新** — 基于 GitHub Releases 的 electron-updater 自动检测更新
- **完全离线可用** — Mock 模式无需 API Key 即可体验完整流程

## 截图 / Screenshots

| 多角色辩论进行中 | 模型接入设置 |
|:---:|:---:|
| <img src="https://raw.githubusercontent.com/fchen6878-oss/roundtable-desktop/main/docs/screenshots/debate-main.png" alt="辩论主界面" width="560"> | <img src="https://raw.githubusercontent.com/fchen6878-oss/roundtable-desktop/main/docs/screenshots/model-settings.png" alt="模型设置" width="420"> |

## 快速开始 / Quick Start

### 安装 / Install

从 [Releases](../../releases) 下载最新版安装包（`圆桌会议-Setup-x.x.x.exe`），Windows 10+。

### 本地开发 / Dev

```bash
git clone https://github.com/fchen6878-oss/roundtable-desktop.git
cd roundtable-desktop
npm install
npm start          # 启动开发窗口
npm run dist        # 打包安装包
```

> 国内网络受限时，Electron 二进制下载可设镜像：见 [README_DESKTOP.md](./README_DESKTOP.md)

## 技术栈 / Tech Stack

| 层 | 技术 |
|---|------|
| 桌面框架 | [Electron](https://electronjs.org/) |
| 渲染层 | 原生 HTML + CSS + Vanilla JS |
| 图标 | [Lucide Icons](https://lucide.dev) (CSS mask) |
| 构建 | electron-builder (NSIS) |
| 自动更新 | electron-updater (GitHub Releases) |
| AI 对接 | OpenAI 兼容 API（支持 DeepSeek / 通义千问 / Kimi 等） |
| 本地存储 | [better-sqlite3](https://github.com/WiseLibs/better-sqlite3)（会议记录） |
| 密钥加密 | Electron [safeStorage](https://www.electronjs.org/docs/latest/api/safe-storage)（OS 级加密） |

## 数据存储 / Data Storage

| 数据 | 存储位置 | 加密 | 跨设备 |
|------|---------|------|--------|
| **模型配置（API Key）** | 主进程加密后入库（SQLite `providers` 表，密文） | ✅ safeStorage（Windows DPAPI / macOS Keychain） | ❌ 仅本机 |
| **会议记录** | 本地 SQLite 数据库 `<userData>/roundtable.db`（`meetings` / `messages` / `providers` 三表） | — | ❌ 仅本机 |
| **会议记录导出** | 用户主动点「导出纪要」生成的 `.md` 文件 | — | ✅（自行传输） |

**设计原则**：渲染层（前端）不直接接触数据库与密钥，全部经主进程 IPC（`window.api`）完成。

- **API Key 不落明文**：配置改走主进程，Key 经 `safeStorage` 加密后以密文存入数据库；前端「查看明文」仅临时取回、关闭即清空，绝不写入 `localStorage`。首次启动会自动把旧版明文密钥加密迁移入库。
- **会议记录自动存档**：每条发言经辩论引擎实时写入 `messages` 表，关掉再开不丢失。菜单「会议 → 历史会议」可列出全部会议并回看完整讨论，亦支持导出 Markdown 纪要。
- **完全离线可用**：Mock 模式无需任何 API Key 即可体验完整流程，本地数据库同样记录 Mock 会议。

## 项目结构

```
roundtable/
├── index.html            # 主界面（渲染层入口）
├── styles.css            # 设计系统 Token + 全局样式
├── src/
│   ├── engine.js         # 辩论引擎：轮次调度 / 导演指令 / 分支管理
│   ├── mock.js           # Mock 模型：离线模拟对话（无需 API Key）
│   ├── ui.js             # UI 渲染：面板 / 弹窗 / 交互逻辑
│   ├── clients.js        # 真实 API 客户端（OpenAI 兼容）
│   └── compare.js        # 分支对比算法与碰撞图渲染
├── electron/
│   ├── main.js           # Electron 主进程：窗口 / 菜单 / 更新 / 单实例锁 / IPC
│   ├── preload.js        # 安全桥：contextBridge 暴露 window.api（db/* + keys/*）
│   └── db.js            # 本地存储层：better-sqlite3 建表 / 加密密钥 CRUD
├── build/                # 构建资源（图标 / NSIS 配置）
└── test/smoke.cjs        # 冒烟测试套件
```

## 贡献 / Contributing

Issue 和 PR 均欢迎！详见 [Issues](../../issues) 页面。

## License

[MIT](./LICENSE)
