import type { Database } from 'bun:sqlite'
import type { StoredSttConfig } from './types'
import { getSttConfigByNamespace, upsertSttConfig, deleteSttConfig } from './sttConfig'

export class SttConfigStore {
    constructor(private readonly db: Database) {}

    get(namespace: string): StoredSttConfig | null {
        return getSttConfigByNamespace(this.db, namespace)
    }

    upsert(namespace: string, data: { provider: string; appId?: string; secretId?: string; secretKey?: string; apiKey?: string; apiSecret?: string; language: string; region: string }): StoredSttConfig {
        return upsertSttConfig(this.db, namespace, data)
    }

    delete(namespace: string): boolean {
        return deleteSttConfig(this.db, namespace)
    }
}
