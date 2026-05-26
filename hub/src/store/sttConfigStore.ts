import type { Database } from 'bun:sqlite'
import type { StoredSttConfig } from './types'
import { getSttConfigsByNamespace, getActiveSttConfig, getSttConfigByProvider, upsertSttConfig, deleteSttConfig, setSttConfigActive } from './sttConfig'

export class SttConfigStore {
    constructor(private readonly db: Database) {}

    list(namespace: string): StoredSttConfig[] {
        return getSttConfigsByNamespace(this.db, namespace)
    }

    getActive(namespace: string): StoredSttConfig | null {
        return getActiveSttConfig(this.db, namespace)
    }

    getByProvider(namespace: string, provider: string): StoredSttConfig | null {
        return getSttConfigByProvider(this.db, namespace, provider)
    }

    upsert(namespace: string, provider: string, data: {
        appId?: string
        secretId?: string
        secretKey?: string
        apiKey?: string
        apiSecret?: string
        language: string
        region: string
        active?: boolean
    }): StoredSttConfig {
        return upsertSttConfig(this.db, namespace, provider, data)
    }

    delete(namespace: string, provider: string): boolean {
        return deleteSttConfig(this.db, namespace, provider)
    }

    setActive(namespace: string, provider: string): StoredSttConfig | null {
        return setSttConfigActive(this.db, namespace, provider)
    }
}
