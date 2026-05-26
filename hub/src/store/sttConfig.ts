import type { Database } from 'bun:sqlite'
import type { StoredSttConfig } from './types'

type DbSttConfigRow = {
    id: number
    namespace: string
    provider: string
    app_id: string
    secret_id: string
    secret_key: string
    api_key: string
    api_secret: string
    language: string
    region: string
    active: number
    updated_at: string
}

function toStoredSttConfig(row: DbSttConfigRow): StoredSttConfig {
    return {
        id: row.id,
        namespace: row.namespace,
        provider: row.provider,
        appId: row.app_id,
        secretId: row.secret_id,
        secretKey: row.secret_key,
        apiKey: row.api_key,
        apiSecret: row.api_secret,
        language: row.language,
        region: row.region,
        active: row.active,
        updatedAt: row.updated_at
    }
}

export function getSttConfigsByNamespace(db: Database, namespace: string): StoredSttConfig[] {
    const rows = db.prepare(
        'SELECT * FROM stt_configs WHERE namespace = ? ORDER BY provider'
    ).all(namespace) as DbSttConfigRow[]
    return rows.map(toStoredSttConfig)
}

export function getActiveSttConfig(db: Database, namespace: string): StoredSttConfig | null {
    const row = db.prepare(
        'SELECT * FROM stt_configs WHERE namespace = ? AND active = 1 LIMIT 1'
    ).get(namespace) as DbSttConfigRow | undefined
    return row ? toStoredSttConfig(row) : null
}

export function getSttConfigByProvider(db: Database, namespace: string, provider: string): StoredSttConfig | null {
    const row = db.prepare(
        'SELECT * FROM stt_configs WHERE namespace = ? AND provider = ?'
    ).get(namespace, provider) as DbSttConfigRow | undefined
    return row ? toStoredSttConfig(row) : null
}

export function upsertSttConfig(
    db: Database,
    namespace: string,
    provider: string,
    data: {
        appId?: string
        secretId?: string
        secretKey?: string
        apiKey?: string
        apiSecret?: string
        language: string
        region: string
        active?: boolean
    }
): StoredSttConfig {
    const existing = getSttConfigByProvider(db, namespace, provider)

    // If setting this config as active, deactivate all others in the namespace first
    if (data.active) {
        db.prepare(
            'UPDATE stt_configs SET active = 0 WHERE namespace = ? AND active = 1'
        ).run(namespace)
    }

    if (existing) {
        const secretKey = data.secretKey ?? existing.secretKey
        const appId = data.appId ?? existing.appId
        const apiKey = data.apiKey ?? existing.apiKey
        const apiSecret = data.apiSecret ?? existing.apiSecret
        const active = data.active !== undefined ? (data.active ? 1 : 0) : existing.active
        db.prepare(`
            UPDATE stt_configs
            SET app_id = @appId, secret_id = @secretId, secret_key = @secretKey, api_key = @apiKey, api_secret = @apiSecret, language = @language, region = @region, active = @active, updated_at = datetime('now')
            WHERE namespace = @namespace AND provider = @provider
        `).run({
            appId,
            secretId: data.secretId ?? existing.secretId,
            secretKey,
            apiKey,
            apiSecret,
            language: data.language,
            region: data.region,
            active,
            namespace,
            provider
        })
    } else {
        const active = data.active ? 1 : 0
        db.prepare(`
            INSERT INTO stt_configs (namespace, provider, app_id, secret_id, secret_key, api_key, api_secret, language, region, active, updated_at)
            VALUES (@namespace, @provider, @appId, @secretId, @secretKey, @apiKey, @apiSecret, @language, @region, @active, datetime('now'))
        `).run({
            namespace,
            provider,
            appId: data.appId ?? '',
            secretId: data.secretId ?? '',
            secretKey: data.secretKey ?? '',
            apiKey: data.apiKey ?? '',
            apiSecret: data.apiSecret ?? '',
            language: data.language,
            region: data.region,
            active
        })
    }

    return getSttConfigByProvider(db, namespace, provider)!
}

export function deleteSttConfig(db: Database, namespace: string, provider: string): boolean {
    const result = db.prepare(
        'DELETE FROM stt_configs WHERE namespace = ? AND provider = ?'
    ).run(namespace, provider)
    return result.changes > 0
}

export function setSttConfigActive(db: Database, namespace: string, provider: string): StoredSttConfig | null {
    // Deactivate all others
    db.prepare(
        'UPDATE stt_configs SET active = 0 WHERE namespace = ? AND active = 1'
    ).run(namespace)
    // Activate the target
    db.prepare(
        'UPDATE stt_configs SET active = 1, updated_at = datetime(\'now\') WHERE namespace = ? AND provider = ?'
    ).run(namespace, provider)
    return getSttConfigByProvider(db, namespace, provider)
}
