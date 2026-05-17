# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

HAPI is a local-first platform for running AI coding agents (Claude Code, Codex, Gemini, OpenCode) with remote control via web/phone/Telegram. It wraps agents in a CLI, connects them to a hub server, and serves a React PWA for remote interaction.

**Why HAPI?** Local-first alternative to Happy. Same terminal experience, same muscle memory, but with remote control capabilities.

## Build & Dev Commands

```bash
bun install                        # Install all workspace dependencies
bun run dev                        # Start hub + web dev servers concurrently
bun run build                      # Build all packages (cli + hub + web)
bun run build:single-exe           # Build all-in-one binary (web assets embedded)

# Type checking
bun run typecheck                  # All packages
bun run typecheck:cli              # CLI only
bun run typecheck:hub              # Hub only
bun run typecheck:web              # Web only

# Testing
bun run test                       # All packages (cli tests require `bun run tools:unpack` first via cli test script)
bun run test:cli                   # CLI only (uses vitest)
bun run test:hub                   # Hub only (uses bun test)
bun run test:web                   # Web only (uses vitest with jsdom)

# Run a single test file
cd cli && bunx vitest run src/claude/model.test.ts
cd web && bunx vitest run src/components/SessionList.test.tsx
# Hub uses bun test directly — no vitest
cd hub && bun test src/store/sessions.test.ts

# Hub configuration
export CLI_API_TOKEN="shared-secret"   # Required: shared secret for CLI/web auth
export HAPI_PUBLIC_URL="https://..."   # Required for Telegram Mini App
export TELEGRAM_BOT_TOKEN="..."        # Optional: Telegram bot integration
```

## Architecture

Bun workspace monorepo with five packages: `cli`, `hub`, `web`, `shared`, `website`.

```
CLI (agent wrapper)  ──Socket.IO──>  Hub (server)  ──SSE/REST──>  Web (PWA)
```

**Data flow:**
1. CLI spawns an agent process, connects to hub via Socket.IO
2. Agent events → CLI parses → hub (socket `message`) → SQLite + SSE broadcast
3. Web subscribes to SSE `/api/events` for live updates
4. User actions in Web → hub REST API → RPC through Socket.IO → CLI → agent

### CLI (`cli/`)

The distributable npm package (`@twsxtd/hapi`). Wraps agent processes and communicates with the hub.

- `src/commands/` — CLI subcommands; `runCli.ts` is the entry point
- `src/claude/` — Claude Code wrapper and hooks
- `src/codex/` — Codex integration
- `src/gemini/`, `src/opencode/`, `src/cursor/` — Other agent integrations
- `src/agent/` — Multi-agent support (Gemini via ACP)
- `src/runner/` — Background daemon for remote session spawning
- `src/api/` — Socket.IO client, hub connection, auth
- `src/ui/` — Terminal UI (Ink/React components)
- `src/modules/` — Bundled tools (ripgrep, difftastic, git)

CLI tests use vitest with `.env.integration-test` for env vars.

### Hub (`hub/`)

HTTP API server (Hono) + Socket.IO + SSE + Telegram bot.

- `src/web/routes/` — REST endpoints (sessions, messages, auth, terminals, machines, git, voice, push, permissions)
- `src/socket/handlers/cli/` — Socket.IO event handlers for CLI connections
- `src/sync/` — Core orchestration: `sessionCache.ts`, `messageService.ts`, `rpcGateway.ts`
- `src/store/` — SQLite persistence (better-sqlite3)
- `src/sse/` — Server-Sent Events manager
- `src/telegram/` — Bot commands and callbacks
- `src/notifications/` — Push (VAPID) + Telegram notifications
- `src/visibility/` — Client visibility tracking

Hub tests use `bun test` (not vitest).

### Web (`web/`)

React PWA using TanStack Router + TanStack Query + assistant-ui + Tailwind v4.

- `src/routes/` — Page components (TanStack Router file-based routing in `router.tsx`)
- `src/components/` — Reusable UI (SessionList, SessionChat, NewSession, WorkspaceBrowser)
- `src/hooks/queries/` — TanStack Query hooks
- `src/hooks/mutations/` — Mutation hooks
- `src/realtime/` — SSE subscription and Socket.IO client
- `src/chat/` — Chat UI with assistant-ui integration
- `src/api/client.ts` — API client

Web tests use vitest with jsdom environment.

### Shared (`shared/`, published as `@hapi/protocol`)

Common types, Zod schemas, Socket.IO event types, and utilities shared across all packages. Exported via subpath imports (e.g., `@hapi/protocol/types`, `@hapi/protocol/schemas`).

## Key Patterns

- **RPC**: CLI registers handlers (`rpc-register` socket event). Hub routes requests via `rpcGateway.ts` to the correct CLI instance.
- **Versioned updates**: CLI sends `update-metadata`/`update-state` with a version number. Hub rejects stale updates.
- **Session modes**: `local` (terminal-driven) vs `remote` (web-controlled), switchable mid-session.
- **Permission modes**: `default`, `acceptEdits`, `bypassPermissions`, `plan` — defined in `shared/src/modes.ts`.
- **Namespaces**: Multi-user isolation via `CLI_API_TOKEN:<namespace>` suffix on socket connections.
- **Path aliases**: `@/*` maps to `./src/*` in each package.
- **Zod schemas**: Runtime validation in `shared/src/schemas.ts`; use Zod v4.

## Conventions

- TypeScript strict mode; no untyped code.
- 4-space indentation.
- Test files (`*.test.ts`, `*.test.tsx`) live next to source.
- No backward compatibility concerns — breaking old formats is acceptable.
- Prefer pragmatism over overengineering. Write necessary tests only.
- 提交信息（commit message）永远用中文。

## Common Tasks Reference

| Task | Key Files |
|------|-----------|
| Add CLI command | `cli/src/commands/`, `cli/src/index.ts` |
| Add API endpoint | `hub/src/web/routes/`, register in `hub/src/web/index.ts` |
| Add Socket.IO event | `hub/src/socket/handlers/cli/`, `shared/src/socket.ts` |
| Add web route | `web/src/routes/`, `web/src/router.tsx` |
| Add web component | `web/src/components/` |
| Modify session logic | `hub/src/sync/sessionCache.ts`, `hub/src/sync/syncEngine.ts` |
| Modify message handling | `hub/src/sync/messageService.ts` |
| Add notification type | `hub/src/notifications/` |
| Add shared type | `shared/src/types.ts`, `shared/src/schemas.ts` |

## HTTP API Reference

### Authentication (`hub/src/web/routes/auth.ts`)
- `POST /api/auth` - Get JWT token (Telegram initData or `CLI_API_TOKEN[:namespace]`)
- `POST /api/bind` - Bind Telegram account using initData + `CLI_API_TOKEN:<namespace>`

### Sessions (`hub/src/web/routes/sessions.ts`)
- `GET /api/sessions` - List all sessions
- `GET /api/sessions/:id` - Get session details
- `POST /api/sessions/:id/abort` - Abort session
- `POST /api/sessions/:id/switch` - Switch session to remote mode
- `POST /api/sessions/:id/resume` - Resume inactive session
- `POST /api/sessions/:id/upload` - Upload file (base64, max 50MB)
- `POST /api/sessions/:id/archive` - Archive active session
- `PATCH /api/sessions/:id` - Rename session
- `DELETE /api/sessions/:id` - Delete inactive session

### Messages (`hub/src/web/routes/messages.ts`)
- `GET /api/sessions/:id/messages` - Get messages (paginated)
- `POST /api/sessions/:id/messages` - Send message

## Git Push 规则

**所有代码推送到 fork 仓库 `myfork`（PGMT12138/hapi），不推送到 `origin`（tiann/hapi）。**

```
git push myfork <branch>
```

- `origin` → tiann/hapi（上游，只读，不 push）
- `myfork` → PGMT12138/hapi（个人 fork，推送目标）

## Hub Restart Procedure

**精准重启 hub，避免会话中断：**
1. 只杀 hub 进程，不要杀 runner 进程（runner 负责管理正在运行的 agent 会话）
2. 杀掉 hub 的同时立即启动新 hub，减少服务中断时间
3. **不要用** `lsof -ti:3006 | xargs kill`，该端口上同时有 hub、runner、claude 三个进程，会全部杀掉导致会话中断
4. 不要用 `grep`/`pgrep` 匹配命令行自动提取 PID，会匹配到含 shell snapshot 路径的无关 bash 进程
5. 正确做法：先手动 `ps aux | grep 'bun run dev:hub'` 找到 hub PID（只取命令列为 `bun run dev:hub` 的那行，排除含 snapshot 路径的 bash 进程），再执行 `kill <PID> && sleep 1 && setsid nohup bun run dev:hub > hub/nohup.out 2>&1 &`
6. 启动 hub 前必须先 `cd /home/projects/hapi`

## Critical Thinking Guidelines

1. Fix root cause (not band-aid).
2. Unsure: read more code; if still stuck, ask w/ short options.
3. Conflicts: call out; pick safer path.
4. Unrecognized changes: assume other agent; keep going; focus your changes. If it causes issues, stop + ask user.
