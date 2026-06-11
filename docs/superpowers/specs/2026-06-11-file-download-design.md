# Web 端文件下载功能设计

## 目标

在 HAPI Web 端对话页面中，当 agent 通过 Write/Edit 等工具创建或修改文件后，用户可以在工具结果卡片中点击下载按钮，通过浏览器下载该文件。

## 数据流

```
用户点击下载按钮
  → Web fetch GET /api/sessions/:id/download?path=xxx
  → Hub 收到请求 → RPC 调用 CLI readFile
  → CLI 读文件返回 base64 → Hub 解码为二进制
  → Hub 流式返回给浏览器 → 浏览器触发下载
```

## 方案选择

**方案 A：复用现有 readFile RPC + Hub 下载端点**

- CLI 端已有 `readFile` RPC（读文件返回 base64）
- Hub 已有 `readSessionFile` 代理方法
- 只需新增 Hub 下载端点和 Web 端 UI

优势：改动最小，CLI 端零改动，复用现有基础设施。

## 实现细节

### 1. Hub 端：新增下载端点

**文件**：`hub/src/web/routes/sessions.ts`

新增路由 `GET /sessions/:id/download`：

- 参数：
  - `path`（必填）：要下载的文件路径
  - `filename`（可选）：下载时的文件名，默认取 path 的 basename
- 实现逻辑：
  1. 验证 session 存在且可达
  2. 调用 `engine.readSessionFile(sessionId, path)` 获取 base64 内容
  3. 解码 base64 为 Buffer
  4. 设置响应头：
     - `Content-Type: application/octet-stream`
     - `Content-Disposition: attachment; filename="<basename>"`
     - `Content-Length: <buffer.length>`
  5. 返回二进制 body

与现有 `GET /sessions/:id/file` 端点的区别：现有端点返回 JSON `{ success, content(base64) }`，新端点直接返回二进制流供浏览器下载。

### 2. Web 端：API 客户端

**文件**：`web/src/api/client.ts`

新增方法：

```typescript
downloadFile(sessionId: string, path: string, filename?: string): Promise<void>
```

实现：
1. 构造 URL `/api/sessions/:id/download?path=xxx&filename=xxx`
2. 使用 `fetch` 获取响应
3. 将响应 body 转为 Blob
4. 创建 `<a>` 元素，设置 `href = URL.createObjectURL(blob)` 和 `download = filename`
5. 触发 click 下载
6. 清理 `URL.revokeObjectURL`

### 3. Web 端：UI 组件

#### 3a. DownloadButton 组件

**新建文件**：`web/src/components/ToolCard/DownloadButton.tsx`

Props：
- `sessionId: string`
- `filePath: string`
- `className?: string`

行为：
- 显示下载图标按钮
- 点击时调用 `api.downloadFile(sessionId, filePath, basename(filePath))`
- loading 状态：按钮禁用 + 旋转图标
- 错误状态：显示简短错误提示（toast 或 inline）

#### 3b. MutationResultView 修改

**文件**：`web/src/components/ToolCard/views/_results.tsx`

修改 `MutationResultView`（Write/Edit/MultiEdit 共用的结果视图）：
- 从 `props.block.tool.input` 中提取文件路径（`file_path` 或 `path` 字段）
- 当 `state === 'completed'` 且存在文件路径时，在结果文本下方渲染 DownloadButton
- 需要 sessionId：从 `props.metadata` 或路由上下文中获取

#### 3c. ReadResultView 修改

**文件**：`web/src/components/ToolCard/views/_results.tsx`

修改 `ReadResultView`：
- 已有文件路径信息（`extractReadFileContent` 返回 `filePath`）
- 在文件内容下方添加 DownloadButton

### 4. ToolViewProps 扩展

**文件**：`web/src/components/ToolCard/views/_all.tsx`

需要扩展 `ToolViewProps` 类型，增加 `sessionId` 字段。

确认：`ToolCard` 组件已有 `sessionId` 和 `api` props，但 `ToolViewProps` 只有 `{ block, metadata, surface }`。需要在 ToolCard 传递 `sessionId` 给 ToolViewProps，这样 DownloadButton 才能获取到 sessionId 来构造下载 URL。

改动：
1. `ToolViewProps` 增加 `sessionId?: string` 字段
2. ToolCard 渲染 ResultToolView 时传入 `sessionId={props.sessionId}`

## 涉及文件清单

| 文件 | 改动类型 |
|------|----------|
| `hub/src/web/routes/sessions.ts` | 新增下载路由 |
| `web/src/api/client.ts` | 新增 downloadFile 方法 |
| `web/src/components/ToolCard/DownloadButton.tsx` | 新建下载按钮组件 |
| `web/src/components/ToolCard/views/_results.tsx` | 修改 MutationResultView 和 ReadResultView |
| `web/src/components/ToolCard/views/_all.tsx` | 可能扩展 ToolViewProps |

## 不在范围内

- CLI 端代码修改（复用现有 readFile RPC）
- shared 包类型定义修改
- Bash 工具结果的文件路径检测（后续增强）
- 下载进度条
- 大文件分块传输优化
