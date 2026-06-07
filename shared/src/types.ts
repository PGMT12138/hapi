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

export type CcMcpServerType = 'http' | 'stdio' | 'sse' | 'ws'

export interface CcMcpServer {
    name: string
    type: CcMcpServerType
    url?: string
    command?: string
    enabled: boolean
}
