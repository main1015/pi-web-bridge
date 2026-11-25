# Pi Web

**Pi Web** 是轻量级编码 Agent [pi.dev](https://pi.dev/) 的网页实时交互版本。它将原本需要在命令行中记忆与输入的繁琐参数（如 `--tools`、`@file`、交互式确认与终端切换）整合进一个简洁直观的浏览器工作台，并支持全程流式实时交互。

---

## 核心功能

- **实时流式响应与工具执行**
  基于 SSE 实时流式展示模型推理过程、回复文本，以及 `read`、`write`、`edit`、`bash`、`grep`、`find`、`ls` 的执行状态、耗时与逐行代码 Diff。
- **随时中断与中途插话引导（Steer）**
  Agent 执行过程中可随时按 `Esc` 或点击「中断」终止当前任务，也可以直接输入新指令点击「插话引导」立即调整方向。
- **可视化工作区与在线编辑**
  左侧提供多会话历史与工作区文件树（支持新建/删除文件及切换 Node.js / Python / 空白示例模板）；右侧支持代码预览、在线编辑保存（`Cmd/Ctrl + S`）。
- **内置 Web 终端**
  无需切换回本地命令行，直接在右侧 **Web 终端**面板运行测试或 Shell 脚本（支持 `↑` / `↓` 历史命令）。
- **多种执行引擎与页面内模型设置**
  可在右侧「模型设置」面板（或点击输入框左下角模型标签 / 输入 `/model`）直接修改，无需改代码：
  - **内置 Gemini**：开箱即用，支持自由指定任意 Gemini 模型 ID、思考深度（LOW/MEDIUM/HIGH）及最大工具步数。
  - **OpenAI 兼容 / Ollama**：可配置本地 Ollama (`http://localhost:11434/v1`)、LM Studio 或兼容 `/chat/completions` 接口与模型名称。
  - **本地 Pi CLI 桥接 (`pi --mode rpc`)**：如果本机安装了官方 `pi`（`@mariozechner/pi-coding-agent`），可直接通过 JSONL RPC 协议桥接驱动本地 `pi` 进程，复用你本机的 Provider、模型与扩展配置。
- **工具权限控制与快捷操作**
  - 右侧**工具权限**面板可一键切换「完整代理」「只读审查（`read, grep, find, ls`）」「纯对话」，也可自定义附加指令（`AGENTS.md`）。
  - 输入框支持 `/` 快捷命令菜单与 `@` 工作区文件引用补全。
  - 支持浅色 / 深色主题切换。

---

## 环境要求

- **Node.js 20+**（推荐 v22）
- **Bash**（macOS / Linux 自带；Windows 用户请在 WSL 或 Git Bash 中运行）
- **Gemini API Key**（从 Google AI Studio 获取）

---

## 快速开始

### 1. 配置密钥

复制环境变量模板并填入你的 `GEMINI_API_KEY`：

```bash
cp .env.example .env
```

编辑 `.env`：

```env
GEMINI_API_KEY="你的_GEMINI_API_KEY"
```

### 2. 使用启动脚本运行

```bash
chmod +x start.sh
./start.sh
```

启动后在浏览器访问 `http://localhost:3000`。

> 若本地尚未安装依赖，`./start.sh` 会自动执行 `npm install`；默认工作区为项目根目录下的 `./pi-workspace`。

---

## 启动脚本参数 (`./start.sh --help`)

| 参数 | 说明 | 默认值 |
| --- | --- | --- |
| `-p, --port <端口>` | 指定 HTTP 服务监听端口 | `3000` |
| `-H, --host <地址>` | 指定监听地址（仅本机访问可用 `127.0.0.1`） | `0.0.0.0` |
| `-w, --workspace <路径>` | 指定要管理的本地项目目录 | `./pi-workspace` |
| `-k, --api-key <密钥>` | 临时传入 `GEMINI_API_KEY` | 读取 `.env` / 环境变量 |
| `--prod` | 以生产模式启动（若无 `dist/` 会自动构建） | 开发模式 |
| `--build` | 配合 `--prod` 强制重新执行前端打包 | 否 |
| `--install` | 启动前强制执行一次 `npm install` | 否 |
| `-h, --help` | 显示命令行帮助信息 | — |

### 常用示例

```bash
# 指定端口为 8080
./start.sh -p 8080

# 用 Pi Web 直接管理本地已有项目，且仅允许本机访问
./start.sh -p 4000 -H 127.0.0.1 -w ~/code/my-project

# 临时通过命令行传入 API Key 启动
./start.sh -k "AIza..." -p 3000

# 构建并以生产模式运行
./start.sh --prod -p 3000
```

也可以直接运行服务端入口：

```bash
npx tsx server.ts --port 8080 --workspace ~/code/my-project
```

---

## 快捷命令与快捷键

在对话输入框中输入 `/` 可触发命令菜单，输入 `@` 可检索并挂载工作区文件：

- `/new` — 新建会话
- `/clear` — 清空当前会话消息
- `/readonly` — 切换为只读审查模式（仅启用 `read`、`grep`、`find`、`ls`）
- `/full` — 启用全部 7 个工具
- `/test` — 让 Agent 运行工作区测试并汇报或修复问题
- `/review` — 对工作区代码执行只读审查
- `Esc` — 执行过程中随时中断当前 Agent 任务
- `Cmd/Ctrl + S` — 在右侧文件编辑器中保存修改

---

## 目录结构

```text
.
├── server.ts                 # Express + Vite 服务入口与 CLI 参数解析
├── server/
│   ├── agent.ts              # Gemini 流式 Agent 循环与工具调度
│   ├── workspace.ts          # 工作区沙箱文件操作、Diff 计算与 Bash 执行
│   └── sessions.ts           # 本地会话持久化存储 (pi-sessions.json)
├── src/
│   ├── App.tsx               # 主工作台布局与 SSE 流式状态管理
│   ├── types/pi.ts           # 前后端共享 TypeScript 类型定义
│   └── components/           # 侧边栏、工具调用块、文件检查/终端面板、输入框
├── start.sh                  # 一键启动脚本 (支持 --help 与端口/工作区参数)
├── .env.example              # 环境变量配置示例
└── package.json
```
