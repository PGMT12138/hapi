# Prompt Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a prompt management feature with CRUD page at `/prompts` and a prompt picker dialog in the chat composer.

**Architecture:** Follow the existing `ModelConfigPreset` pattern exactly — a `prompts` SQLite table in the hub store, REST routes via Hono, TanStack Query hooks in the web app, and a Radix UI dialog for the chat composer picker.

**Tech Stack:** better-sqlite3, Hono, Zod, TanStack Router/Query, Radix UI Dialog, Tailwind CSS

---

### Task 1: Hub — Store layer (CRUD functions)

**Files:**
- Create: `hub/src/store/prompts.ts`
- Modify: `hub/src/store/types.ts`

- [ ] **Step 1: Add `StoredPrompt` type to `hub/src/store/types.ts`**

Add at the end of the file, before the closing of the last type:

```typescript
export type StoredPrompt = {
    id: string
    namespace: string
    name: string
    content: string
    createdAt: number
    updatedAt: number
}
```

- [ ] **Step 2: Create `hub/src/store/prompts.ts`**

```typescript
import type { Database } from 'bun:sqlite'
import { randomUUID } from 'crypto'
import type { StoredPrompt } from './types'

type DbPromptRow = {
    id: string
    namespace: string
    name: string
    content: string
    created_at: number
    updated_at: number
}

function toStoredPrompt(row: DbPromptRow): StoredPrompt {
    return {
        id: row.id,
        namespace: row.namespace,
        name: row.name,
        content: row.content,
        createdAt: row.created_at,
        updatedAt: row.updated_at
    }
}

export function insertPrompt(
    db: Database,
    namespace: string,
    data: { name: string; content: string }
): StoredPrompt {
    const now = Date.now()
    const id = randomUUID()
    db.prepare(`
        INSERT INTO prompts (id, namespace, name, content, created_at, updated_at)
        VALUES (@id, @namespace, @name, @content, @createdAt, @updatedAt)
    `).run({
        id,
        namespace,
        name: data.name,
        content: data.content,
        createdAt: now,
        updatedAt: now
    })
    return getPromptById(db, namespace, id)!
}

export function updatePrompt(
    db: Database,
    namespace: string,
    id: string,
    data: { name?: string; content?: string }
): StoredPrompt | null {
    const existing = getPromptById(db, namespace, id)
    if (!existing) return null

    const name = data.name ?? existing.name
    const content = data.content ?? existing.content
    const now = Date.now()
    db.prepare(`
        UPDATE prompts
        SET name = @name, content = @content, updated_at = @updatedAt
        WHERE id = @id AND namespace = @namespace
    `).run({ name, content, updatedAt: now, id, namespace })

    return getPromptById(db, namespace, id)
}

export function deletePrompt(db: Database, namespace: string, id: string): boolean {
    const result = db.prepare(
        'DELETE FROM prompts WHERE id = ? AND namespace = ?'
    ).run(id, namespace)
    return result.changes > 0
}

export function getPromptsByNamespace(db: Database, namespace: string): StoredPrompt[] {
    const rows = db.prepare(
        'SELECT * FROM prompts WHERE namespace = ? ORDER BY name'
    ).all(namespace) as DbPromptRow[]
    return rows.map(toStoredPrompt)
}

export function getPromptById(db: Database, namespace: string, id: string): StoredPrompt | null {
    const row = db.prepare(
        'SELECT * FROM prompts WHERE id = ? AND namespace = ?'
    ).get(id, namespace) as DbPromptRow | undefined
    return row ? toStoredPrompt(row) : null
}
```

- [ ] **Step 3: Create `hub/src/store/promptStore.ts`**

```typescript
import type { Database } from 'bun:sqlite'
import type { StoredPrompt } from './types'
import {
    deletePrompt,
    getPromptById,
    getPromptsByNamespace,
    insertPrompt,
    updatePrompt
} from './prompts'

export class PromptStore {
    constructor(private readonly db: Database) {}

    add(namespace: string, data: { name: string; content: string }): StoredPrompt {
        return insertPrompt(this.db, namespace, data)
    }

    update(namespace: string, id: string, data: { name?: string; content?: string }): StoredPrompt | null {
        return updatePrompt(this.db, namespace, id, data)
    }

    delete(namespace: string, id: string): boolean {
        return deletePrompt(this.db, namespace, id)
    }

    list(namespace: string): StoredPrompt[] {
        return getPromptsByNamespace(this.db, namespace)
    }

    get(namespace: string, id: string): StoredPrompt | null {
        return getPromptById(this.db, namespace, id)
    }
}
```

- [ ] **Step 4: Run typecheck**

Run: `cd hub && bunx tsc --noEmit`
Expected: No errors (files compile but aren't wired into Store class yet)

- [ ] **Step 5: Commit**

```bash
git add hub/src/store/prompts.ts hub/src/store/promptStore.ts hub/src/store/types.ts
git commit -m "feat(hub): add prompt store CRUD functions and types"
```

---

### Task 2: Hub — Schema migration and Store wiring

**Files:**
- Modify: `hub/src/store/index.ts`

- [ ] **Step 1: Add `prompts` property to Store class**

In `hub/src/store/index.ts`, add the import at the top:

```typescript
import { PromptStore } from './promptStore'
```

Add the property declaration alongside other store properties:

```typescript
readonly prompts: PromptStore
```

Initialize in the constructor after `this.modelConfigPresets = new ModelConfigPresetStore(this.db)`:

```typescript
this.prompts = new PromptStore(this.db)
```

- [ ] **Step 2: Increment schema version**

Change `SCHEMA_VERSION` from `9` to `10`.

Add the migration step in `buildStepMigrations`:

```typescript
9: () => this.migrateFromV9ToV10(),
```

- [ ] **Step 3: Add table creation to `createSchema()`**

Add after the `model_config_presets` table creation and its index:

```sql
CREATE TABLE IF NOT EXISTS prompts (
    id TEXT PRIMARY KEY,
    namespace TEXT NOT NULL DEFAULT 'default',
    name TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    UNIQUE(namespace, name)
);
CREATE INDEX IF NOT EXISTS idx_prompts_namespace ON prompts(namespace);
```

- [ ] **Step 4: Add migration method**

```typescript
private migrateFromV9ToV10(): void {
    this.db.exec(`
        CREATE TABLE IF NOT EXISTS prompts (
            id TEXT PRIMARY KEY,
            namespace TEXT NOT NULL DEFAULT 'default',
            name TEXT NOT NULL,
            content TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            UNIQUE(namespace, name)
        );
        CREATE INDEX IF NOT EXISTS idx_prompts_namespace ON prompts(namespace);
    `)
}
```

- [ ] **Step 5: Run typecheck**

Run: `cd hub && bunx tsc --noEmit`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add hub/src/store/index.ts
git commit -m "feat(hub): add prompts table schema and migration v9→v10"
```

---

### Task 3: Hub — REST API routes

**Files:**
- Create: `hub/src/web/routes/prompts.ts`
- Modify: `hub/src/web/server.ts`

- [ ] **Step 1: Create `hub/src/web/routes/prompts.ts`**

```typescript
import { Hono } from 'hono'
import { z } from 'zod'
import type { Store } from '../../store'
import type { WebAppEnv } from '../middleware/auth'

const createPromptSchema = z.object({
    name: z.string().trim().min(1).max(200),
    content: z.string().min(1)
})

const updatePromptSchema = z.object({
    name: z.string().trim().min(1).max(200).optional(),
    content: z.string().min(1).optional()
})

export function createPromptRoutes(store: Store): Hono<WebAppEnv> {
    const app = new Hono<WebAppEnv>()

    app.get('/prompts', (c) => {
        const namespace = c.get('namespace')
        const prompts = store.prompts.list(namespace)
        return c.json({ prompts })
    })

    app.post('/prompts', async (c) => {
        const body = await c.req.json().catch(() => null)
        const parsed = createPromptSchema.safeParse(body)
        if (!parsed.success) {
            return c.json({ error: 'Invalid body' }, 400)
        }

        const namespace = c.get('namespace')
        try {
            const prompt = store.prompts.add(namespace, parsed.data)
            return c.json({ prompt })
        } catch (e) {
            const msg = e instanceof Error ? e.message : 'Failed to create prompt'
            if (msg.includes('UNIQUE constraint')) {
                return c.json({ error: 'Prompt name already exists' }, 409)
            }
            return c.json({ error: msg }, 500)
        }
    })

    app.put('/prompts/:id', async (c) => {
        const id = c.req.param('id')
        const body = await c.req.json().catch(() => null)
        const parsed = updatePromptSchema.safeParse(body)
        if (!parsed.success) {
            return c.json({ error: 'Invalid body' }, 400)
        }

        const namespace = c.get('namespace')
        try {
            const prompt = store.prompts.update(namespace, id, parsed.data)
            if (!prompt) {
                return c.json({ error: 'Prompt not found' }, 404)
            }
            return c.json({ prompt })
        } catch (e) {
            const msg = e instanceof Error ? e.message : 'Failed to update prompt'
            if (msg.includes('UNIQUE constraint')) {
                return c.json({ error: 'Prompt name already exists' }, 409)
            }
            return c.json({ error: msg }, 500)
        }
    })

    app.delete('/prompts/:id', (c) => {
        const id = c.req.param('id')
        const namespace = c.get('namespace')
        const deleted = store.prompts.delete(namespace, id)
        if (!deleted) {
            return c.json({ error: 'Prompt not found' }, 404)
        }
        return c.json({ ok: true })
    })

    return app
}
```

- [ ] **Step 2: Register route in `hub/src/web/server.ts`**

Add import:

```typescript
import { createPromptRoutes } from './routes/prompts'
```

Add route registration after `createModelConfigPresetRoutes`:

```typescript
app.route('/api', createPromptRoutes(options.store))
```

- [ ] **Step 3: Run typecheck**

Run: `cd hub && bunx tsc --noEmit`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add hub/src/web/routes/prompts.ts hub/src/web/server.ts
git commit -m "feat(hub): add REST API routes for prompt CRUD"
```

---

### Task 4: Web — API client and query keys

**Files:**
- Modify: `web/src/api/client.ts`
- Modify: `web/src/lib/query-keys.ts`

- [ ] **Step 1: Add query key to `web/src/lib/query-keys.ts`**

Add after the `modelConfigPresets` key:

```typescript
prompts: ['prompts'] as const,
```

- [ ] **Step 2: Add API methods to `web/src/api/client.ts`**

Add these methods to the `ApiClient` class, after the model config preset methods:

```typescript
async getPrompts() {
    const res = await this.fetch('/api/prompts')
    return res.json() as Promise<{ prompts: Prompt[] }>
}

async createPrompt(name: string, content: string) {
    const res = await this.fetch('/api/prompts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, content }),
    })
    return res.json() as Promise<{ prompt: Prompt }>
}

async updatePrompt(id: string, data: { name?: string; content?: string }) {
    const res = await this.fetch(`/api/prompts/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    })
    return res.json() as Promise<{ prompt: Prompt }>
}

async deletePrompt(id: string) {
    const res = await this.fetch(`/api/prompts/${id}`, { method: 'DELETE' })
    return res.json() as Promise<{ ok: boolean }>
}
```

Also add the `Prompt` type. Find where `ModelConfigPreset` type is defined (likely `web/src/types/api.ts` or inline) and add:

```typescript
export type Prompt = {
    id: string
    namespace: string
    name: string
    content: string
    createdAt: number
    updatedAt: number
}
```

- [ ] **Step 3: Run typecheck**

Run: `cd web && bunx tsc --noEmit`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add web/src/api/client.ts web/src/lib/query-keys.ts
git commit -m "feat(web): add prompt API client methods and query keys"
```

---

### Task 5: Web — TanStack Query hooks

**Files:**
- Create: `web/src/hooks/queries/usePrompts.ts`
- Create: `web/src/hooks/mutations/usePromptActions.ts`

- [ ] **Step 1: Create `web/src/hooks/queries/usePrompts.ts`**

```typescript
import { useQuery } from '@tanstack/react-query'
import type { ApiClient } from '@/api/client'
import { queryKeys } from '@/lib/query-keys'

export function usePrompts(api: ApiClient | null) {
    const query = useQuery({
        queryKey: queryKeys.prompts,
        queryFn: async () => {
            if (!api) throw new Error('API unavailable')
            return await api.getPrompts()
        },
        enabled: Boolean(api),
    })

    return {
        prompts: query.data?.prompts ?? [],
        isLoading: query.isLoading,
        error: query.error instanceof Error ? query.error.message : query.error ? 'Failed to load prompts' : null,
    }
}
```

- [ ] **Step 2: Create `web/src/hooks/mutations/usePromptActions.ts`**

```typescript
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { ApiClient } from '@/api/client'
import { queryKeys } from '@/lib/query-keys'

export function usePromptActions(api: ApiClient | null) {
    const queryClient = useQueryClient()

    const invalidate = () => {
        void queryClient.invalidateQueries({ queryKey: queryKeys.prompts })
    }

    const createPrompt = useMutation({
        mutationFn: async (input: { name: string; content: string }) => {
            if (!api) throw new Error('API unavailable')
            return await api.createPrompt(input.name, input.content)
        },
        onSuccess: invalidate,
    })

    const updatePrompt = useMutation({
        mutationFn: async (input: { id: string; name?: string; content?: string }) => {
            if (!api) throw new Error('API unavailable')
            return await api.updatePrompt(input.id, { name: input.name, content: input.content })
        },
        onSuccess: invalidate,
    })

    const deletePrompt = useMutation({
        mutationFn: async (id: string) => {
            if (!api) throw new Error('API unavailable')
            return await api.deletePrompt(id)
        },
        onSuccess: invalidate,
    })

    return {
        createPrompt: createPrompt.mutateAsync,
        updatePrompt: updatePrompt.mutateAsync,
        deletePrompt: deletePrompt.mutateAsync,
        isPending: createPrompt.isPending || updatePrompt.isPending || deletePrompt.isPending,
    }
}
```

- [ ] **Step 3: Run typecheck**

Run: `cd web && bunx tsc --noEmit`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add web/src/hooks/queries/usePrompts.ts web/src/hooks/mutations/usePromptActions.ts
git commit -m "feat(web): add TanStack Query hooks for prompt CRUD"
```

---

### Task 6: Web — Prompts management page

**Files:**
- Create: `web/src/routes/prompts/index.tsx`
- Modify: `web/src/router.tsx`

- [ ] **Step 1: Create `web/src/routes/prompts/index.tsx`**

This page follows the `ModelPresetsPage` pattern — header, list of prompt cards with expand/edit/delete, and a floating add button.

```tsx
import { useCallback, useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useApi } from '@/hooks/useApi'
import { usePrompts } from '@/hooks/queries/usePrompts'
import { usePromptActions } from '@/hooks/mutations/usePromptActions'
import { useTranslation } from '@/i18n/useTranslation'

export const Route = createFileRoute('/prompts/')({
    component: PromptsPage,
})

function PromptsPage() {
    const navigate = useNavigate()
    const api = useApi()
    const { prompts, isLoading } = usePrompts(api)
    const actions = usePromptActions(api)
    const { t } = useTranslation()
    const [expandedId, setExpandedId] = useState<string | null>(null)
    const [addingNew, setAddingNew] = useState(false)

    return (
        <div className="flex h-full flex-col">
            {/* Header */}
            <div className="flex items-center gap-3 border-b border-[var(--app-border)] px-4 py-3">
                <button
                    onClick={() => navigate({ to: '/settings' })}
                    className="rounded-lg p-1.5 hover:bg-[var(--app-hover)]"
                >
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                    </svg>
                </button>
                <h1 className="text-lg font-semibold">{t('Prompts')}</h1>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4">
                {isLoading ? (
                    <div className="flex items-center justify-center py-12 text-[var(--app-hint)]">
                        {t('Loading...')}
                    </div>
                ) : prompts.length === 0 && !addingNew ? (
                    <div className="flex flex-col items-center justify-center py-12 text-[var(--app-hint)]">
                        <p>{t('No prompts yet')}</p>
                        <p className="mt-1 text-sm">{t('Tap + to add your first prompt')}</p>
                    </div>
                ) : (
                    <div className="mx-auto flex max-w-content flex-col gap-3">
                        {addingNew && (
                            <PromptCard
                                mode="create"
                                onSave={async (name, content) => {
                                    await actions.createPrompt({ name, content })
                                    setAddingNew(false)
                                }}
                                onCancel={() => setAddingNew(false)}
                            />
                        )}
                        {prompts.map((prompt) => (
                            <PromptCard
                                key={prompt.id}
                                prompt={prompt}
                                expanded={expandedId === prompt.id}
                                onToggle={() => setExpandedId(expandedId === prompt.id ? null : prompt.id)}
                                onSave={async (name, content) => {
                                    await actions.updatePrompt({ id: prompt.id, name, content })
                                }}
                                onDelete={async () => {
                                    await actions.deletePrompt(prompt.id)
                                    setExpandedId(null)
                                }}
                                isPending={actions.isPending}
                            />
                        ))}
                    </div>
                )}
            </div>

            {/* FAB */}
            {!addingNew && (
                <button
                    onClick={() => setAddingNew(true)}
                    className="fixed bottom-6 right-6 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--app-button)] text-[var(--app-button-text)] shadow-lg active:scale-95"
                >
                    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                    </svg>
                </button>
            )}
        </div>
    )
}

function PromptCard({
    prompt,
    expanded,
    onToggle,
    onSave,
    onDelete,
    isPending,
    mode,
}: {
    prompt?: { id: string; name: string; content: string }
    expanded?: boolean
    onToggle?: () => void
    onSave: (name: string, content: string) => Promise<void>
    onDelete?: () => Promise<void>
    isPending?: boolean
    mode?: 'create' | 'edit'
}) {
    const [name, setName] = useState(prompt?.name ?? '')
    const [content, setContent] = useState(prompt?.content ?? '')
    const isCreate = mode === 'create'

    if (isCreate || expanded) {
        return (
            <div className="rounded-xl border border-[var(--app-border)] bg-[var(--app-secondary-bg)] p-4">
                <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Prompt name"
                    className="mb-3 w-full rounded-lg border border-[var(--app-border)] bg-[var(--app-bg)] px-3 py-2 text-sm outline-none focus:border-[var(--app-link)]"
                />
                <textarea
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    placeholder="Prompt content"
                    rows={4}
                    className="mb-3 w-full resize-none rounded-lg border border-[var(--app-border)] bg-[var(--app-bg)] px-3 py-2 text-sm outline-none focus:border-[var(--app-link)]"
                />
                <div className="flex justify-end gap-2">
                    <button
                        onClick={() => {
                            if (isCreate) setName('')
                            setContent('')
                            onToggle?.()
                        }}
                        className="rounded-lg px-3 py-1.5 text-sm text-[var(--app-hint)] hover:bg-[var(--app-hover)]"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={() => onSave(name, content)}
                        disabled={!name.trim() || !content.trim() || isPending}
                        className="rounded-lg bg-[var(--app-button)] px-3 py-1.5 text-sm font-medium text-[var(--app-button-text)] disabled:opacity-50"
                    >
                        {isCreate ? 'Add' : 'Save'}
                    </button>
                </div>
            </div>
        )
    }

    return (
        <button
            onClick={onToggle}
            className="w-full rounded-xl border border-[var(--app-border)] bg-[var(--app-secondary-bg)] p-4 text-left"
        >
            <div className="flex items-center justify-between">
                <span className="font-medium">{prompt!.name}</span>
                <svg className="h-4 w-4 text-[var(--app-hint)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
            </div>
            <p className="mt-1 line-clamp-2 text-sm text-[var(--app-hint)]">{prompt!.content}</p>
        </button>
    )
}
```

- [ ] **Step 2: Register route in `web/src/router.tsx`**

Add import at the top alongside other route imports:

```typescript
import PromptsPage from './routes/prompts'
```

Add route definition alongside `modelPresetsRoute`:

```typescript
const promptsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/prompts',
    component: PromptsPage,
})
```

Add to route tree:

```typescript
export const routeTree = rootRoute.addChildren([
    // ... existing routes ...
    modelPresetsRoute,
    promptsRoute,
])
```

- [ ] **Step 3: Run typecheck**

Run: `cd web && bunx tsc --noEmit`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add web/src/routes/prompts/index.tsx web/src/router.tsx
git commit -m "feat(web): add prompts management page at /prompts"
```

---

### Task 7: Web — Prompt picker dialog in chat composer

**Files:**
- Create: `web/src/components/PromptPickerDialog.tsx`
- Modify: `web/src/components/AssistantChat/HappyComposer.tsx`

- [ ] **Step 1: Create `web/src/components/PromptPickerDialog.tsx`**

```tsx
import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { useApi } from '@/hooks/useApi'
import { usePrompts } from '@/hooks/queries/usePrompts'

type Props = {
    open: boolean
    onOpenChange: (open: boolean) => void
    onSelect: (content: string) => void
}

export function PromptPickerDialog({ open, onOpenChange, onSelect }: Props) {
    const api = useApi()
    const { prompts, isLoading } = usePrompts(api)

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Select a Prompt</DialogTitle>
                    <DialogDescription>Choose a prompt to insert into the composer</DialogDescription>
                </DialogHeader>
                <div className="mt-3 max-h-[50vh] overflow-y-auto">
                    {isLoading ? (
                        <div className="py-6 text-center text-sm text-[var(--app-hint)]">Loading...</div>
                    ) : prompts.length === 0 ? (
                        <div className="py-6 text-center text-sm text-[var(--app-hint)]">
                            No prompts yet. Add some in Settings → Prompts.
                        </div>
                    ) : (
                        <div className="flex flex-col gap-2">
                            {prompts.map((prompt) => (
                                <button
                                    key={prompt.id}
                                    onClick={() => {
                                        onSelect(prompt.content)
                                        onOpenChange(false)
                                    }}
                                    className="w-full rounded-lg border border-[var(--app-border)] p-3 text-left hover:bg-[var(--app-hover)]"
                                >
                                    <div className="font-medium">{prompt.name}</div>
                                    <div className="mt-1 line-clamp-2 text-sm text-[var(--app-hint)]">
                                        {prompt.content}
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    )
}
```

- [ ] **Step 2: Add prompt picker button to `web/src/components/AssistantChat/HappyComposer.tsx`**

Add import:

```typescript
import { PromptPickerDialog } from '@/components/PromptPickerDialog'
```

Add state in the component:

```typescript
const [promptPickerOpen, setPromptPickerOpen] = useState(false)
```

Add the dialog component in the JSX:

```tsx
<PromptPickerDialog
    open={promptPickerOpen}
    onOpenChange={setPromptPickerOpen}
    onSelect={(content) => {
        // Replace composer content with selected prompt
        composer.setValue(content)
    }}
/>
```

Add the prompt picker button in the composer toolbar area (near the attachment button or settings button). Use a simple text icon:

```tsx
<button
    type="button"
    onClick={() => setPromptPickerOpen(true)}
    className="rounded-lg p-2 text-[var(--app-hint)] hover:bg-[var(--app-hover)]"
    title="Insert prompt"
>
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
</button>
```

- [ ] **Step 3: Run typecheck**

Run: `cd web && bunx tsc --noEmit`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add web/src/components/PromptPickerDialog.tsx web/src/components/AssistantChat/HappyComposer.tsx
git commit -m "feat(web): add prompt picker dialog to chat composer"
```

---

### Task 8: Web — Settings page navigation entry

**Files:**
- Modify: `web/src/routes/settings/index.tsx`

- [ ] **Step 1: Add "Prompts" link to the settings page**

Find the settings page and add a navigation row for prompts, similar to the existing "Model Presets" entry. It should link to `/prompts`:

```tsx
<button
    onClick={() => navigate({ to: '/prompts' })}
    className="flex w-full items-center justify-between rounded-lg px-4 py-3 hover:bg-[var(--app-hover)]"
>
    <span>Prompts</span>
    <svg className="h-4 w-4 text-[var(--app-hint)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
    </svg>
</button>
```

- [ ] **Step 2: Run typecheck**

Run: `cd web && bunx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add web/src/routes/settings/index.tsx
git commit -m "feat(web): add prompts link to settings page"
```

---

### Task 9: Full build verification

- [ ] **Step 1: Run full typecheck**

Run: `bun run typecheck`
Expected: PASS

- [ ] **Step 2: Run hub tests**

Run: `cd hub && bun test`
Expected: PASS

- [ ] **Step 3: Run web tests**

Run: `cd web && bunx vitest run`
Expected: PASS

- [ ] **Step 4: Run full build**

Run: `bun run build`
Expected: PASS

- [ ] **Step 5: Manual smoke test**

Start dev server with `bun run dev`, then:
1. Navigate to Settings → Prompts
2. Create a prompt with name "Test" and content "Hello world"
3. Verify it appears in the list
4. Edit the prompt content
5. Delete the prompt
6. Go to a chat session, click the prompt picker button
7. Create another prompt, verify it shows in the picker
8. Select a prompt, verify it replaces the composer content
