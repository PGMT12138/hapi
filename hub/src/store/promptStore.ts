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
