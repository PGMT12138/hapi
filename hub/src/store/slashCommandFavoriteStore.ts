import type { Database } from 'bun:sqlite'
import type { StoredSlashCommandFavorite } from './types'
import {
    deleteSlashCommandFavorite,
    getSlashCommandFavorites,
    insertSlashCommandFavorite
} from './slashCommandFavorites'

export class SlashCommandFavoriteStore {
    constructor(private readonly db: Database) {}

    add(namespace: string, agentType: string, commandName: string): StoredSlashCommandFavorite {
        return insertSlashCommandFavorite(this.db, namespace, agentType, commandName)
    }

    remove(namespace: string, agentType: string, commandName: string): boolean {
        return deleteSlashCommandFavorite(this.db, namespace, agentType, commandName)
    }

    list(namespace: string, agentType: string): StoredSlashCommandFavorite[] {
        return getSlashCommandFavorites(this.db, namespace, agentType)
    }
}
