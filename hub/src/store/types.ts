export type StoredSession = {
    id: string
    tag: string | null
    namespace: string
    machineId: string | null
    createdAt: number
    updatedAt: number
    metadata: unknown | null
    metadataVersion: number
    agentState: unknown | null
    agentStateVersion: number
    model: string | null
    modelReasoningEffort: string | null
    effort: string | null
    todos: unknown | null
    todosUpdatedAt: number | null
    teamState: unknown | null
    teamStateUpdatedAt: number | null
    active: boolean
    activeAt: number | null
    seq: number
    hidden: boolean
}

export type StoredMachine = {
    id: string
    namespace: string
    createdAt: number
    updatedAt: number
    metadata: unknown | null
    metadataVersion: number
    runnerState: unknown | null
    runnerStateVersion: number
    active: boolean
    activeAt: number | null
    seq: number
}

export type StoredMessage = {
    id: string
    sessionId: string
    content: unknown
    createdAt: number
    seq: number
    localId: string | null
    invokedAt: number | null
}

export type StoredUser = {
    id: number
    platform: string
    platformUserId: string
    namespace: string
    createdAt: number
}

export type StoredPushSubscription = {
    id: number
    namespace: string
    endpoint: string
    p256dh: string
    auth: string
    createdAt: number
}

export type StoredModelConfigPreset = {
    id: string
    namespace: string
    name: string
    env: Record<string, string>
    createdAt: number
    updatedAt: number
}

export type StoredPrompt = {
    id: string
    namespace: string
    name: string
    content: string
    createdAt: number
    updatedAt: number
}

export type StoredSlashCommandFavorite = {
    id: string
    namespace: string
    agentType: string
    commandName: string
    createdAt: number
}

export interface StoredSttConfig {
    id: number
    namespace: string
    provider: string
    appId: string
    secretId: string
    secretKey: string
    apiKey: string      // 讯飞 APIKey
    apiSecret: string   // 讯飞 APISecret
    language: string
    region: string
    updatedAt: string
}

export type VersionedUpdateResult<T> =
    | { result: 'success'; version: number; value: T }
    | { result: 'version-mismatch'; version: number; value: T }
    | { result: 'error' }
