import type { Database } from 'bun:sqlite'
import { randomUUID } from 'crypto'
import type { StoredSlashCommandFavorite } from './types'

type DbSlashCommandFavoriteRow = {
    id: string
    namespace: string
    agent_type: string
    command_name: string
    created_at: number
}

function toStoredSlashCommandFavorite(row: DbSlashCommandFavoriteRow): StoredSlashCommandFavorite {
    return {
        id: row.id,
        namespace: row.namespace,
        agentType: row.agent_type,
        commandName: row.command_name,
        createdAt: row.created_at
    }
}

export function insertSlashCommandFavorite(
    db: Database,
    namespace: string,
    agentType: string,
    commandName: string
): StoredSlashCommandFavorite {
    const now = Date.now()
    const id = randomUUID()
    db.prepare(`
        INSERT INTO slash_command_favorites (id, namespace, agent_type, command_name, created_at)
        VALUES (@id, @namespace, @agentType, @commandName, @createdAt)
    `).run({
        id,
        namespace,
        agentType,
        commandName,
        createdAt: now
    })
    return getSlashCommandFavoriteByCompositeKey(db, namespace, agentType, commandName)!
}

export function deleteSlashCommandFavorite(
    db: Database,
    namespace: string,
    agentType: string,
    commandName: string
): boolean {
    const result = db.prepare(
        'DELETE FROM slash_command_favorites WHERE namespace = ? AND agent_type = ? AND command_name = ?'
    ).run(namespace, agentType, commandName)
    return result.changes > 0
}

export function getSlashCommandFavorites(
    db: Database,
    namespace: string,
    agentType: string
): StoredSlashCommandFavorite[] {
    const rows = db.prepare(
        'SELECT * FROM slash_command_favorites WHERE namespace = ? AND agent_type = ? ORDER BY command_name'
    ).all(namespace, agentType) as DbSlashCommandFavoriteRow[]
    return rows.map(toStoredSlashCommandFavorite)
}

export function getSlashCommandFavoriteByCompositeKey(
    db: Database,
    namespace: string,
    agentType: string,
    commandName: string
): StoredSlashCommandFavorite | null {
    const row = db.prepare(
        'SELECT * FROM slash_command_favorites WHERE namespace = ? AND agent_type = ? AND command_name = ?'
    ).get(namespace, agentType, commandName) as DbSlashCommandFavoriteRow | undefined
    return row ? toStoredSlashCommandFavorite(row) : null
}
