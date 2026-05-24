import type { Database } from 'bun:sqlite'
import type { StoredSttConfig } from './types'

type DbSttConfigRow = {
    id: number
    namespace: string
    provider: string
    secret_id: string
    secret_key: string
    language: string
    region: string
    updated_at: string
}

function toStoredSttConfig(row: DbSttConfigRow): StoredSttConfig {
    return {
        id: row.id,
        namespace: row.namespace,
        provider: row.provider,
        secretId: row.secret_id,
        secretKey: row.secret_key,
        language: row.language,
        region: row.region,
        updatedAt: row.updated_at
    }
}

export function getSttConfigByNamespace(db: Database, namespace: string): StoredSttConfig | null {
    const row = db.prepare(
        'SELECT * FROM stt_configs WHERE namespace = ?'
    ).get(namespace) as DbSttConfigRow | undefined
    return row ? toStoredSttConfig(row) : null
}

export function upsertSttConfig(
    db: Database,
    namespace: string,
    data: { provider: string; secretId: string; secretKey?: string; language: string; region: string }
): StoredSttConfig {
    const existing = getSttConfigByNamespace(db, namespace)

    if (existing) {
        const secretKey = data.secretKey ?? existing.secretKey
        db.prepare(`
            UPDATE stt_configs
            SET provider = @provider, secret_id = @secretId, secret_key = @secretKey, language = @language, region = @region, updated_at = datetime('now')
            WHERE namespace = @namespace
        `).run({
            provider: data.provider,
            secretId: data.secretId,
            secretKey,
            language: data.language,
            region: data.region,
            namespace
        })
    } else {
        db.prepare(`
            INSERT INTO stt_configs (namespace, provider, secret_id, secret_key, language, region, updated_at)
            VALUES (@namespace, @provider, @secretId, @secretKey, @language, @region, datetime('now'))
        `).run({
            namespace,
            provider: data.provider,
            secretId: data.secretId,
            secretKey: data.secretKey ?? '',
            language: data.language,
            region: data.region
        })
    }

    return getSttConfigByNamespace(db, namespace)!
}

export function deleteSttConfig(db: Database, namespace: string): boolean {
    const result = db.prepare(
        'DELETE FROM stt_configs WHERE namespace = ?'
    ).run(namespace)
    return result.changes > 0
}
