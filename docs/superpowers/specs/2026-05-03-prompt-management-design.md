# Prompt Management Feature Design

## Overview

Add a prompt management feature to HAPI that allows users to create, edit, and delete reusable prompts, and quickly insert them into the chat composer via a dialog selector.

## Requirements

1. Users can create, edit, and delete prompts (name + content) on a dedicated management page
2. Users can select a prompt from a dialog in the chat composer, which replaces the current input content
3. Prompts are persisted in SQLite with namespace isolation
4. Follow existing `ModelConfigPreset` patterns exactly — no new architectural decisions

## Data Model

### SQLite Table: `prompts`

| Column | Type | Constraints |
|---|---|---|
| id | TEXT | PRIMARY KEY |
| namespace | TEXT | NOT NULL DEFAULT 'default' |
| name | TEXT | NOT NULL |
| content | TEXT | NOT NULL |
| created_at | INTEGER | NOT NULL |
| updated_at | INTEGER | NOT NULL |

- `UNIQUE(namespace, name)` — no duplicate names per namespace
- `INDEX idx_prompts_namespace ON prompts(namespace)`
- `id` generated via `nanoid()`

### TypeScript Types

```typescript
type StoredPrompt = {
  id: string
  namespace: string
  name: string
  content: string
  createdAt: number
  updatedAt: number
}
```

## Backend (Hub)

### Store Layer

Two files following `modelConfigPresets.ts` / `modelConfigPresetStore.ts` pattern:

- `hub/src/store/prompts.ts` — Pure CRUD functions:
  - `toStoredPrompt(row)` — DB row → TypeScript type
  - `getPromptsByNamespace(db, namespace)` — List all prompts
  - `getPromptById(db, id)` — Single prompt lookup
  - `insertPrompt(db, namespace, name, content)` — Create
  - `updatePrompt(db, id, name, content)` — Update
  - `deletePrompt(db, id)` — Delete

- `hub/src/store/promptStore.ts` — `PromptStore` class wrapping the functions

### Schema Migration

In `hub/src/store/index.ts`:
- Add `CREATE TABLE IF NOT EXISTS prompts (...)` to `createSchema()`
- Increment `SCHEMA_VERSION` from 9 to 10
- Add `migrateFromV9ToV10()` with the same CREATE TABLE + CREATE INDEX

### REST API Routes

New file `hub/src/web/routes/prompts.ts`:

| Method | Path | Description |
|---|---|---|
| GET | `/api/prompts` | List all prompts for namespace |
| POST | `/api/prompts` | Create a prompt |
| PUT | `/api/prompts/:id` | Update a prompt |
| DELETE | `/api/prompts/:id` | Delete a prompt |

Request/response format follows `modelConfigPresets.ts`:
- Request body validated with Zod: `{ name: z.string().trim().min(1).max(200), content: z.string().min(1) }`
- Success: `{ prompt: StoredPrompt }` or `{ prompts: StoredPrompt[] }`
- Errors: `{ error: string }` with appropriate HTTP status codes
- 409 on duplicate name within namespace

Register route in `hub/src/web/index.ts` alongside existing routes.

## Frontend (Web)

### Management Page: `/prompts`

Route added to `web/src/router.tsx`. Page structure mirrors `/model-presets`:

- Header with back button and "Prompts" title
- Scrollable list of prompt cards showing name + content preview
- Each card expands to show full content with edit/delete actions
- Floating action button to add a new prompt
- Inline edit mode within expanded cards
- Navigation entry added to settings/sidebar

### Chat Integration

In `web/src/components/AssistantChat/HappyComposer.tsx`:
- Add a button (icon button) that opens a `PromptPickerDialog`
- `PromptPickerDialog` component:
  - Uses existing dialog component
  - Displays list of prompts (name + truncated content preview)
  - Click a prompt → calls `composer.setValue(prompt.content)` → closes dialog
  - Empty state message when no prompts exist, with link to management page

### Data Layer

Following existing query/mutation patterns:
- `web/src/hooks/queries/usePrompts.ts` — TanStack Query hook for fetching prompts
- `web/src/hooks/mutations/usePromptMutations.ts` — Mutation hooks for CRUD
- Query key: `['prompts']` in `web/src/lib/query-keys.ts`
- API client methods in `web/src/api/client.ts`

## File Changes Summary

### New Files
- `hub/src/store/prompts.ts`
- `hub/src/store/promptStore.ts`
- `hub/src/web/routes/prompts.ts`
- `web/src/routes/prompts/index.tsx`
- `web/src/components/PromptPickerDialog.tsx`
- `web/src/hooks/queries/usePrompts.ts`
- `web/src/hooks/mutations/usePromptMutations.ts`

### Modified Files
- `hub/src/store/index.ts` — Add schema + migration
- `hub/src/store/types.ts` — Add `StoredPrompt` type
- `hub/src/web/index.ts` — Register prompts route
- `web/src/router.tsx` — Add `/prompts` route
- `web/src/api/client.ts` — Add prompt API methods
- `web/src/lib/query-keys.ts` — Add prompt query keys
- `web/src/components/AssistantChat/HappyComposer.tsx` — Add prompt picker button
