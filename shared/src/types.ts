export type {
    AgentState,
    AgentStateCompletedRequest,
    AgentStateRequest,
    AttachmentMetadata,
    DecryptedMessage,
    Metadata,
    Session,
    SyncEvent,
    TeamMember,
    TeamMessage,
    TeamState,
    TeamTask,
    TodoItem,
    WorktreeMetadata
} from './schemas'

export type { SessionSummary, SessionSummaryMetadata } from './sessionSummary'
export { AGENT_MESSAGE_PAYLOAD_TYPE } from './modes'

export type {
    AgentFlavor,
    ClaudePermissionMode,
    CodexCollaborationMode,
    CodexCollaborationModeOption,
    CodexPermissionMode,
    CursorPermissionMode,
    GeminiPermissionMode,
    OpencodePermissionMode,
    PermissionMode,
    PermissionModeOption,
    PermissionModeTone
} from './modes'

export type { ClaudeModelPreset, GeminiModelPreset } from './models'

/** 'off' = blocked via permissions.deny Skill(name); null = active (default) */
export type CcSkillOverrideState = 'off'

export interface CcSkill {
    name: string
    description?: string
    overrideState: CcSkillOverrideState | null
    scope: 'global' | 'project'
    projectPath?: string
}

export interface ProjectSkill {
    name: string
    folderName: string
    description?: string
    scope: 'global' | 'project'
    projectPath?: string
    globalOverride: CcSkillOverrideState | null
    projectOverride: CcSkillOverrideState | null
    managedLocally: boolean
    effectiveState: CcSkillOverrideState | null
}

export interface ProjectPlugin {
    name: string
    pluginKey: string
    description?: string
    version?: string
    author?: string
    homepage?: string
    hasMcp: boolean
    skillCount: number
    globalEnabled: boolean
    projectEnabled: boolean | null
    managedLocally: boolean
    effectiveEnabled: boolean
}

export type CcMcpServerType = 'http' | 'stdio' | 'sse' | 'ws'

export interface CcMcpServer {
    name: string
    type: CcMcpServerType
    url?: string
    command?: string
    enabled: boolean
}

export interface CcPlugin {
    name: string
    description?: string
    version?: string
    author?: string
    homepage?: string
    installedAt?: string
    lastUpdated?: string
    installPath: string
    hasMcp: boolean
    skillCount: number
    enabled: boolean
}
