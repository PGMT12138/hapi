# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

HAPI 是一个 local-first 平台，用于运行 AI 编码 Agent（Claude Code, Codex, Gemini, OpenCode）并通过 Web/手机/Telegram 远程控制。它是 Happy 的本地优先替代方案。

```
CLI (agent wrapper)  ──Socket.IO──>  Hub (server)  ──SSE/REST──>  Web (PWA)
```

**Data flow:** CLI 拉起 agent 进程 → 解析事件经 Socket.IO 发送到 hub → hub 写 SQLite 并通过 SSE 广播 → Web 订阅 SSE 获取实时更新。反向操作走 REST API → RPC → Socket.IO → CLI → agent。

## Build & Dev Commands

```bash
bun install                        # 安装依赖
bun run dev                        # 启动 hub + web 开发服务器
bun run build                      # 构建所有包
bun run build:single-exe           # 构建单文件二进制（内嵌 web 资源）

bun run typecheck                  # 类型检查（所有包）
bun run test                       # 测试（所有包）

# 单文件测试
cd cli && bunx vitest run src/claude/model.test.ts    # CLI/Web 用 vitest
cd hub && bun test src/store/sessions.test.ts          # Hub 用 bun test

# Hub 环境变量
export CLI_API_TOKEN="shared-secret"   # 必须：CLI/Web 认证共享密钥
export HAPI_PUBLIC_URL="https://..."   # Telegram Mini App 需要
export TELEGRAM_BOT_TOKEN="..."        # 可选：Telegram 集成
```

## Architecture

Bun workspace monorepo，包含 `cli`、`hub`、`web`、`shared`、`website` 五个包。

### CLI (`cli/`) — npm 包 `@twsxtd/hapi`

- `src/commands/` — 子命令入口（`runCli.ts`）
- `src/claude/`, `src/codex/`, `src/gemini/`, `src/opencode/`, `src/cursor/` — 各 Agent 集成
- `src/agent/` — 多 Agent 支持（Gemini via ACP）
- `src/runner/` — 后台守护进程，远程拉起 session
- `src/api/` — Socket.IO 客户端，hub 连接与认证
- `src/ui/` — 终端 UI（Ink/React）
- `src/modules/` — 内置工具（ripgrep, difftastic, git）

CLI 测试使用 vitest，环境变量在 `.env.integration-test`。

### Hub (`hub/`) — Hono HTTP + Socket.IO + SSE + Telegram Bot

- `src/web/server.ts` — 路由注册入口，所有 API 端点在这里挂载
- `src/web/routes/` — REST 端点（auth, bind, sessions, messages, events, permissions, machines, git, cli, push, voice, stt, sttConfig, modelConfigPresets, prompts, slashCommandFavorites）
- `src/socket/handlers/cli/` — Socket.IO 事件处理
- `src/sync/` — 核心编排：`sessionCache.ts`, `messageService.ts`, `rpcGateway.ts`
- `src/store/` — SQLite 持久化（better-sqlite3），每个领域有 `*Store.ts`（数据访问）配对
- `src/sse/` — Server-Sent Events 管理器
- `src/notifications/` — 推送（VAPID）+ Telegram 通知

Hub 测试使用 `bun test`。

### Web (`web/`) — TanStack Router + Query + assistant-ui + Tailwind v4

- `src/routes/` — 页面组件（路由定义在 `router.tsx`）
- `src/components/` — UI 组件
- `src/hooks/queries/` + `src/hooks/mutations/` — TanStack Query hooks
- `src/realtime/` — SSE 订阅和 Socket.IO 客户端
- `src/chat/` — assistant-ui 聊天 UI
- `src/api/client.ts` — API 客户端

Web 测试使用 vitest + jsdom。

### Shared (`shared/`，发布为 `@hapi/protocol`)

跨包共享的类型、Zod schema、Socket.IO 事件类型和工具函数。通过 subpath exports 导出（如 `@hapi/protocol/types`, `@hapi/protocol/schemas`）。

## Key Patterns

- **RPC**: CLI 通过 `rpc-register` socket 事件注册处理器，hub 经 `rpcGateway.ts` 路由到对应 CLI 实例
- **Versioned updates**: CLI 发送 `update-metadata`/`update-state` 时带版本号，hub 拒绝过期更新
- **Session modes**: `local`（终端驱动）vs `remote`（web 控制），可中途切换
- **Permission modes**: `default`, `acceptEdits`, `bypassPermissions`, `plan`（定义在 `shared/src/modes.ts`）
- **Namespaces**: 通过 `CLI_API_TOKEN:<namespace>` 后缀实现多用户隔离
- **Path aliases**: `@/*` → `./src/*`（每个包内）
- **Zod v4**: 运行时校验在 `shared/src/schemas.ts`

## Conventions

- TypeScript strict，4 空格缩进
- 测试文件（`*.test.ts`, `*.test.tsx`）放在源文件旁边
- 不需要向后兼容，可以破坏旧格式
- 务实优先，只写必要的测试
- 提交信息永远用中文

## Common Tasks

| Task | Key Files |
|------|-----------|
| 添加 CLI 命令 | `cli/src/commands/`, `cli/src/index.ts` |
| 添加 API 端点 | `hub/src/web/routes/`，在 `hub/src/web/server.ts` 注册 |
| 添加 Socket.IO 事件 | `hub/src/socket/handlers/cli/`, `shared/src/socket.ts` |
| 添加 Web 页面 | `web/src/routes/`, `web/src/router.tsx` |
| 修改 session 逻辑 | `hub/src/sync/sessionCache.ts`, `hub/src/sync/syncEngine.ts` |
| 修改消息处理 | `hub/src/sync/messageService.ts` |
| 添加 shared 类型 | `shared/src/types.ts`, `shared/src/schemas.ts` |

## Git Push 规则

**所有代码推送到 fork 仓库 `myfork`（PGMT12138/hapi），不推送到 `origin`（tiann/hapi）。**

```
git push myfork <branch>
```

## Hub 重启步骤

精准重启 hub 避免会话中断：
1. 只杀 hub 进程，不要杀 runner（管理 agent 会话）
2. **不要用** `lsof -ti:3006 | xargs kill`（会杀 hub、runner、claude 三个进程）
3. 不要用 `grep`/`pgrep` 自动提取 PID（会匹配含 snapshot 路径的 bash 进程）
4. 手动 `ps aux | grep 'bun run dev:hub'` 找 hub PID，然后 `kill <PID> && sleep 1 && setsid nohup bun run dev:hub > hub/nohup.out 2>&1 &`

## Critical Thinking Guidelines

1. 修复根本原因（不要打补丁）
2. 不确定时：多读代码；仍卡住就用简短选项提问
3. 有冲突时：指出冲突，选择更安全的路径
4. 遇到未识别的变更：假设是其他 agent 做的，继续专注自己的变更
