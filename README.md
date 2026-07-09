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
│   └── main.js           # Electron 主进程：窗口 / 菜单 / 更新 / 单实例锁
├── build/                # 构建资源（图标 / NSIS 配置）
└── test/smoke.cjs        # 冒烟测试套件
```

## 贡献 / Contributing

Issue 和 PR 均欢迎！详见 [Issues](../../issues) 页面。

## License

[MIT](./LICENSE)
