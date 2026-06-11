# Web 端文件下载功能实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 Web 端工具结果卡片中添加文件下载按钮，让用户可以一键下载 agent 创建/修改的文件。

**Architecture:** 复用现有 CLI `readFile` RPC（返回 base64），Hub 新增下载端点将 base64 解码为二进制流返回给浏览器。Web 端在 Write/Edit/Read 工具结果卡片中添加 DownloadButton 组件，通过 `useHappyChatContext()` 获取 api 和 sessionId。

**Tech Stack:** Hono (Hub 路由)、React (Web 组件)、TypeScript

---

## File Structure

| 文件 | 操作 | 职责 |
|------|------|------|
| `hub/src/web/routes/sessions.ts` | 修改 | 新增 `GET /sessions/:id/download` 下载端点 |
| `web/src/api/client.ts` | 修改 | 新增 `downloadFile()` 方法 |
| `web/src/components/icons.tsx` | 修改 | 新增 `DownloadIcon` 图标组件 |
| `web/src/components/ToolCard/DownloadButton.tsx` | 新建 | 下载按钮组件（使用 context 获取 api/sessionId） |
| `web/src/components/ToolCard/views/_results.tsx` | 修改 | 在 MutationResultView 和 ReadResultView 中添加下载按钮 |

关键决策：**不修改 `ToolViewProps`**。DownloadButton 通过 `useHappyChatContext()` 获取 `sessionId` 和 `api`，避免修改所有工具视图组件签名。

---

### Task 1: Hub 下载端点

**Files:**
- Modify: `hub/src/web/routes/sessions.ts`

- [ ] **Step 1: 添加 download 路由的 schema 和处理函数**

在 `hub/src/web/routes/sessions.ts` 中，找到现有的 `upload` 路由（`app.post('/sessions/:id/upload'`），在其后面添加下载路由。

首先在文件顶部 schema 区域添加下载参数的 schema：

```typescript
const downloadSchema = z.object({
    path: z.string().min(1),
    filename: z.string().min(1).optional()
})
```

然后在 `app.post('/sessions/:id/upload/delete', ...)` 路由之后添加：

```typescript
    app.get('/sessions/:id/download', async (c) => {
        const engine = requireSyncEngine(c, getSyncEngine)
        if (engine instanceof Response) {
            return engine
        }

        const sessionResult = requireSessionFromParam(c, engine)
        if (sessionResult instanceof Response) {
            return sessionResult
        }

        const parsed = downloadSchema.safeParse(c.req.query())
        if (!parsed.success) {
            return c.json({ error: 'Invalid parameters' }, 400)
        }

        try {
            const result = await engine.readSessionFile(sessionResult.sessionId, parsed.data.path)
            if (!result.success || !result.content) {
                return c.json({ error: result.error ?? 'Failed to read file' }, 500)
            }

            const buffer = Buffer.from(result.content, 'base64')
            const filename = parsed.data.filename ?? parsed.data.path.split(/[/\\]/).pop() ?? 'file'

            return new Response(buffer, {
                headers: {
                    'Content-Type': 'application/octet-stream',
                    'Content-Disposition': `attachment; filename="${filename}"`,
                    'Content-Length': String(buffer.length)
                }
            })
        } catch (error) {
            return c.json({ error: error instanceof Error ? error.message : 'Download failed' }, 500)
        }
    })
```

- [ ] **Step 2: 验证类型检查通过**

Run: `cd /home/projects/hapi/hub && bunx tsc --noEmit --pretty 2>&1 | head -30`
Expected: 无新增类型错误（与下载路由相关）

- [ ] **Step 3: Commit**

```bash
git add hub/src/web/routes/sessions.ts
git commit -m "feat(hub): 添加文件下载端点 GET /sessions/:id/download"
```

---

### Task 2: Web API 客户端 — downloadFile 方法

**Files:**
- Modify: `web/src/api/client.ts`

- [ ] **Step 1: 添加 downloadFile 方法**

在 `web/src/api/client.ts` 中，找到 `readSessionFile` 方法（约第 260 行），在其后面添加：

```typescript
    async downloadFile(sessionId: string, path: string, filename?: string): Promise<void> {
        const params = new URLSearchParams()
        params.set('path', path)
        if (filename) {
            params.set('filename', filename)
        }
        const url = `/api/sessions/${encodeURIComponent(sessionId)}/download?${params.toString()}`
        const response = await fetch(url)
        if (!response.ok) {
            throw new Error(`Download failed: ${response.status}`)
        }
        const blob = await response.blob()
        const blobUrl = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = blobUrl
        a.download = filename ?? path.split(/[/\\]/).pop() ?? 'file'
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(blobUrl)
    }
```

- [ ] **Step 2: 验证类型检查通过**

Run: `cd /home/projects/hapi/web && bunx tsc --noEmit --pretty 2>&1 | head -30`
Expected: 无新增类型错误

- [ ] **Step 3: Commit**

```bash
git add web/src/api/client.ts
git commit -m "feat(web): 添加 downloadFile API 方法"
```

---

### Task 3: DownloadIcon 图标组件

**Files:**
- Modify: `web/src/components/icons.tsx`

- [ ] **Step 1: 添加 DownloadIcon**

在 `web/src/components/icons.tsx` 文件末尾添加：

```typescript
export function DownloadIcon(props: IconProps) {
    return createIcon(
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />,
        props
    )
}
```

- [ ] **Step 2: Commit**

```bash
git add web/src/components/icons.tsx
git commit -m "feat(web): 添加 DownloadIcon 图标组件"
```

---

### Task 4: DownloadButton 组件

**Files:**
- Create: `web/src/components/ToolCard/DownloadButton.tsx`

- [ ] **Step 1: 创建 DownloadButton 组件**

创建 `web/src/components/ToolCard/DownloadButton.tsx`：

```typescript
import { useState } from 'react'
import { useHappyChatContext } from '@/components/AssistantChat/context'
import { DownloadIcon } from '@/components/icons'

interface DownloadButtonProps {
    filePath: string
    className?: string
}

export function DownloadButton({ filePath, className }: DownloadButtonProps) {
    const { api, sessionId } = useHappyChatContext()
    const [downloading, setDownloading] = useState(false)

    const filename = filePath.split(/[/\\]/).pop() ?? 'file'

    const handleClick = async (e: React.MouseEvent) => {
        e.stopPropagation()
        if (downloading) return

        setDownloading(true)
        try {
            await api.downloadFile(sessionId, filePath, filename)
        } catch {
            // 下载失败时短暂显示错误状态
        } finally {
            setDownloading(false)
        }
    }

    return (
        <button
            type="button"
            onClick={handleClick}
            disabled={downloading}
            className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs text-[var(--app-hint)] hover:text-[var(--app-fg)] hover:bg-[var(--app-secondary-bg)] transition-colors ${className ?? ''}`}
            title={`下载 ${filename}`}
        >
            <DownloadIcon className={downloading ? 'animate-pulse' : ''} />
            <span>{downloading ? '下载中…' : filename}</span>
        </button>
    )
}
```

- [ ] **Step 2: 验证类型检查通过**

Run: `cd /home/projects/hapi/web && bunx tsc --noEmit --pretty 2>&1 | head -30`
Expected: 无新增类型错误

- [ ] **Step 3: Commit**

```bash
git add web/src/components/ToolCard/DownloadButton.tsx
git commit -m "feat(web): 添加 DownloadButton 组件"
```

---

### Task 5: 在 MutationResultView 中添加下载按钮

**Files:**
- Modify: `web/src/components/ToolCard/views/_results.tsx`

MutationResultView 是 Write/Edit/MultiEdit 工具共用的结果视图。当工具完成且有文件路径时，显示下载按钮。

- [ ] **Step 1: 添加 DownloadButton import**

在 `_results.tsx` 文件顶部的 import 区域添加：

```typescript
import { DownloadButton } from '@/components/ToolCard/DownloadButton'
```

- [ ] **Step 2: 添加 extractFilePathFromInput 辅助函数**

在 `extractTextFromResult` 函数之后（约第 87 行），添加：

```typescript
function extractFilePathFromInput(input: unknown): string | null {
    if (!isObject(input)) return null
    const filePath = typeof input.file_path === 'string' ? input.file_path
        : typeof input.path === 'string' ? input.path
        : null
    return filePath || null
}
```

- [ ] **Step 3: 修改 MutationResultView 组件**

将 `MutationResultView` 组件（约第 442-474 行）替换为：

```typescript
const MutationResultView: ToolViewComponent = (props: ToolViewProps) => {
    const { state, result, input } = props.block.tool
    const filePath = extractFilePathFromInput(input)
    const canDownload = state === 'completed' && filePath !== null

    if (result === undefined || result === null) {
        if (state === 'completed') {
            return (
                <div className="flex items-center gap-2">
                    <div className="text-sm text-[var(--app-hint)]">Done</div>
                    {canDownload ? <DownloadButton filePath={filePath!} /> : null}
                </div>
            )
        }
        return <div className="text-sm text-[var(--app-hint)]">{placeholderForState(state)}</div>
    }

    const text = extractTextFromResult(result)
    if (typeof text === 'string' && text.trim().length > 0) {
        const className = state === 'error' ? 'text-red-600' : 'text-[var(--app-fg)]'
        const { mode, language } = getMutationResultRenderMode(text, state)
        return (
            <>
                <div className={`text-sm ${className}`}>
                    {renderText(text, { mode, language, collapseLongContent: props.surface === 'inline' })}
                </div>
                {canDownload ? (
                    <div className="mt-2">
                        <DownloadButton filePath={filePath!} />
                    </div>
                ) : null}
                <RawJsonDevOnly value={result} />
            </>
        )
    }

    return (
        <>
            <div className="flex items-center gap-2">
                <div className="text-sm text-[var(--app-hint)]">
                    {state === 'completed' ? 'Done' : '(no output)'}
                </div>
                {canDownload ? <DownloadButton filePath={filePath!} /> : null}
            </div>
            <RawJsonDevOnly value={result} />
        </>
    )
}
```

- [ ] **Step 4: 验证类型检查通过**

Run: `cd /home/projects/hapi/web && bunx tsc --noEmit --pretty 2>&1 | head -30`
Expected: 无新增类型错误

- [ ] **Step 5: Commit**

```bash
git add web/src/components/ToolCard/views/_results.tsx
git commit -m "feat(web): 在 Write/Edit 工具结果卡片中添加下载按钮"
```

---

### Task 6: 在 ReadResultView 中添加下载按钮

**Files:**
- Modify: `web/src/components/ToolCard/views/_results.tsx`

ReadResultView 已经有文件路径信息（通过 `extractReadFileContent`），在文件内容下方添加下载按钮。

- [ ] **Step 1: 修改 ReadResultView 组件**

将 `ReadResultView` 组件（约第 401-440 行）替换为：

```typescript
const ReadResultView: ToolViewComponent = (props: ToolViewProps) => {
    const result = props.block.tool.result

    if (result === undefined || result === null) {
        return <div className="text-sm text-[var(--app-hint)]">{placeholderForState(props.block.tool.state)}</div>
    }

    const file = extractReadFileContent(result)
    if (file) {
        const path = file.filePath ? resolveDisplayPath(file.filePath, props.metadata) : null
        return (
            <>
                {path ? (
                    <div className="mb-2 flex items-center gap-2">
                        <span className="text-xs text-[var(--app-hint)] font-mono break-all">
                            {basename(path)}
                        </span>
                        {file.filePath ? <DownloadButton filePath={file.filePath} /> : null}
                    </div>
                ) : null}
                <CodeBlock code={file.content} language="text" collapseLongContent={props.surface === 'inline'} />
                <RawJsonDevOnly value={result} />
            </>
        )
    }

    const text = extractTextFromResult(result)
    if (text) {
        return (
            <>
                {renderText(text, { mode: 'code', language: 'text', collapseLongContent: props.surface === 'inline' })}
                <RawJsonDevOnly value={result} />
            </>
        )
    }

    return (
        <>
            <div className="text-sm text-[var(--app-hint)]">(no output)</div>
            <RawJsonDevOnly value={result} />
        </>
    )
}
```

- [ ] **Step 2: 验证类型检查通过**

Run: `cd /home/projects/hapi/web && bunx tsc --noEmit --pretty 2>&1 | head -30`
Expected: 无新增类型错误

- [ ] **Step 3: Commit**

```bash
git add web/src/components/ToolCard/views/_results.tsx
git commit -m "feat(web): 在 Read 工具结果卡片中添加下载按钮"
```

---

### Task 7: 端到端验证

- [ ] **Step 1: 启动开发服务器**

Run: `cd /home/projects/hapi && bun run dev`

- [ ] **Step 2: 手动测试**

1. 在 Web 端打开一个活跃的 session
2. 让 agent 执行一个 Write 操作（如创建一个文件）
3. 确认工具结果卡片中出现下载按钮（显示文件名）
4. 点击下载按钮，确认浏览器弹出下载对话框并正确下载文件
5. 确认下载的文件内容与 agent 创建的一致
6. 测试 Read 工具结果中的下载按钮同样正常工作

- [ ] **Step 3: 最终 Commit**

如有修复，提交所有修复。
