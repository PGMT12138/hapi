import type { Database } from 'bun:sqlite'
import type { StoredModelConfigPreset } from './types'
import {
    deleteModelConfigPreset,
    getModelConfigPresetById,
    getModelConfigPresetsByNamespace,
    insertModelConfigPreset,
    updateModelConfigPreset
} from './modelConfigPresets'

export class ModelConfigPresetStore {
    constructor(private readonly db: Database) {}

    add(namespace: string, data: { name: string; env: Record<string, string> }): StoredModelConfigPreset {
        return insertModelConfigPreset(this.db, namespace, data)
    }

    update(namespace: string, id: string, data: { name?: string; env?: Record<string, string> }): StoredModelConfigPreset | null {
        return updateModelConfigPreset(this.db, namespace, id, data)
    }

    delete(namespace: string, id: string): boolean {
        return deleteModelConfigPreset(this.db, namespace, id)
    }

    list(namespace: string): StoredModelConfigPreset[] {
        return getModelConfigPresetsByNamespace(this.db, namespace)
    }

    get(namespace: string, id: string): StoredModelConfigPreset | null {
        return getModelConfigPresetById(this.db, namespace, id)
    }
}
