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
