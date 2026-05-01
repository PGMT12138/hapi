import type { Database } from 'bun:sqlite'
import { randomUUID } from 'crypto'
import { safeJsonParse } from './json'
import type { StoredModelConfigPreset } from './types'

type DbModelConfigPresetRow = {
    id: string
    namespace: string
    name: string
    env: string
    created_at: number
    updated_at: number
}

function toStoredModelConfigPreset(row: DbModelConfigPresetRow): StoredModelConfigPreset {
    return {
        id: row.id,
        namespace: row.namespace,
        name: row.name,
        env: (safeJsonParse(row.env) as Record<string, string>) ?? {},
        createdAt: row.created_at,
        updatedAt: row.updated_at
    }
}

export function insertModelConfigPreset(
    db: Database,
    namespace: string,
    data: { name: string; env: Record<string, string> }
): StoredModelConfigPreset {
    const now = Date.now()
    const id = randomUUID()
    db.prepare(`
        INSERT INTO model_config_presets (id, namespace, name, env, created_at, updated_at)
        VALUES (@id, @namespace, @name, @env, @createdAt, @updatedAt)
    `).run({
        id,
        namespace,
        name: data.name,
        env: JSON.stringify(data.env),
        createdAt: now,
        updatedAt: now
    })
    return getModelConfigPresetById(db, namespace, id)!
}

export function updateModelConfigPreset(
    db: Database,
    namespace: string,
    id: string,
    data: { name?: string; env?: Record<string, string> }
): StoredModelConfigPreset | null {
    const existing = getModelConfigPresetById(db, namespace, id)
    if (!existing) return null

    const name = data.name ?? existing.name
    const env = data.env ?? existing.env
    const now = Date.now()
    db.prepare(`
        UPDATE model_config_presets
        SET name = @name, env = @env, updated_at = @updatedAt
        WHERE id = @id AND namespace = @namespace
    `).run({ name, env: JSON.stringify(env), updatedAt: now, id, namespace })

    return getModelConfigPresetById(db, namespace, id)
}

export function deleteModelConfigPreset(db: Database, namespace: string, id: string): boolean {
    const result = db.prepare(
        'DELETE FROM model_config_presets WHERE id = ? AND namespace = ?'
    ).run(id, namespace)
    return result.changes > 0
}

export function getModelConfigPresetsByNamespace(db: Database, namespace: string): StoredModelConfigPreset[] {
    const rows = db.prepare(
        'SELECT * FROM model_config_presets WHERE namespace = ? ORDER BY name'
    ).all(namespace) as DbModelConfigPresetRow[]
    return rows.map(toStoredModelConfigPreset)
}

export function getModelConfigPresetById(db: Database, namespace: string, id: string): StoredModelConfigPreset | null {
    const row = db.prepare(
        'SELECT * FROM model_config_presets WHERE id = ? AND namespace = ?'
    ).get(id, namespace) as DbModelConfigPresetRow | undefined
    return row ? toStoredModelConfigPreset(row) : null
}
