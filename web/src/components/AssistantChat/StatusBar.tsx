import {
    getCodexCollaborationModeLabel
} from '@hapi/protocol'
import { useMemo } from 'react'
import type { AgentState, CodexCollaborationMode, PermissionMode } from '@/types/api'
import type { ConversationStatus } from '@/realtime/types'
import type { ParsedContextData } from '@/chat/contextOutput'
import { formatTokens } from '@/lib/formatTokens'
import { useTranslation } from '@/lib/use-translation'

// Vibing messages for thinking state
const VIBING_MESSAGES = [
    "Accomplishing", "Actioning", "Actualizing", "Baking", "Booping", "Brewing",
    "Calculating", "Cerebrating", "Channelling", "Churning", "Clauding", "Coalescing",
    "Cogitating", "Computing", "Combobulating", "Concocting", "Conjuring", "Considering",
    "Contemplating", "Cooking", "Crafting", "Creating", "Crunching", "Deciphering",
    "Deliberating", "Determining", "Discombobulating", "Divining", "Doing", "Effecting",
    "Elucidating", "Enchanting", "Envisioning", "Finagling", "Flibbertigibbeting",
    "Forging", "Forming", "Frolicking", "Generating", "Germinating", "Hatching",
    "Herding", "Honking", "Ideating", "Imagining", "Incubating", "Inferring",
    "Manifesting", "Marinating", "Meandering", "Moseying", "Mulling", "Mustering",
    "Musing", "Noodling", "Percolating", "Perusing", "Philosophising", "Pontificating",
    "Pondering", "Processing", "Puttering", "Puzzling", "Reticulating", "Ruminating",
    "Scheming", "Schlepping", "Shimmying", "Simmering", "Smooshing", "Spelunking",
    "Spinning", "Stewing", "Sussing", "Synthesizing", "Thinking", "Tinkering",
    "Transmuting", "Unfurling", "Unravelling", "Vibing", "Wandering", "Whirring",
    "Wibbling", "Wizarding", "Working", "Wrangling"
]

// Stepped context usage colors: changes every 10% starting from 50%
function getContextUsageStyle(usedPercent: number): { color: string; bgColor: string } {
    if (usedPercent >= 90) return { color: 'text-red-500', bgColor: 'bg-red-500/15' }
    if (usedPercent >= 80) return { color: 'text-red-500', bgColor: 'bg-red-500/10' }
    if (usedPercent >= 70) return { color: 'text-amber-500', bgColor: 'bg-orange-500/10' }
    if (usedPercent >= 60) return { color: 'text-amber-600', bgColor: 'bg-amber-500/10' }
    if (usedPercent >= 50) return { color: 'text-yellow-600', bgColor: 'bg-yellow-500/10' }
    return { color: 'text-[var(--app-hint)]', bgColor: 'bg-[var(--app-subtle-bg)]' }
}

function getConnectionStatus(
    active: boolean,
    thinking: boolean,
    agentState: AgentState | null | undefined,
    voiceStatus: ConversationStatus | undefined,
    backgroundTaskCount: number,
    t: (key: string) => string,
    sttStatus?: 'idle' | 'recording' | 'recognizing'
): { text: string; color: string; dotColor: string; isPulsing: boolean } {
    const hasPermissions = agentState?.requests && Object.keys(agentState.requests).length > 0

    // STT recording takes highest priority
    if (sttStatus === 'recording') {
        return {
            text: '录音中...',
            color: 'text-red-500',
            dotColor: 'bg-red-500',
            isPulsing: true
        }
    }

    // Voice connecting takes priority
    if (voiceStatus === 'connecting') {
        return {
            text: t('voice.connecting'),
            color: 'text-[#007AFF]',
            dotColor: 'bg-[#007AFF]',
            isPulsing: true
        }
    }

    if (!active) {
        return {
            text: t('misc.offline'),
            color: 'text-[#999]',
            dotColor: 'bg-[#999]',
            isPulsing: false
        }
    }

    if (hasPermissions) {
        return {
            text: t('misc.permissionRequired'),
            color: 'text-[#FF9500]',
            dotColor: 'bg-[#FF9500]',
            isPulsing: true
        }
    }

    if (thinking) {
        const vibingMessage = VIBING_MESSAGES[Math.floor(Math.random() * VIBING_MESSAGES.length)].toLowerCase() + '…'
        return {
            text: vibingMessage,
            color: 'text-[#007AFF]',
            dotColor: 'bg-[#007AFF]',
            isPulsing: true
        }
    }

    if (backgroundTaskCount > 0) {
        return {
            text: `${backgroundTaskCount} background task${backgroundTaskCount > 1 ? 's' : ''} running`,
            color: 'text-[#007AFF]',
            dotColor: 'bg-[#007AFF]',
            isPulsing: true
        }
    }

    return {
        text: t('misc.online'),
        color: 'text-[#34C759]',
        dotColor: 'bg-[#34C759]',
        isPulsing: false
    }
}

function formatCodexReasoningLabel(effort?: string | null): string {
    const normalized = effort?.trim().toLowerCase()
    if (!normalized || normalized === 'default') return 'reasoning default'
    return `reasoning ${normalized}`
}

function isCodexFastMode(model?: string | null, effort?: string | null): boolean {
    const normalizedEffort = effort?.trim().toLowerCase()
    if (normalizedEffort === 'none' || normalizedEffort === 'minimal' || normalizedEffort === 'low') {
        return true
    }

    const normalizedModel = model?.trim().toLowerCase() ?? ''
    return normalizedModel.includes('mini') || normalizedModel.includes('fast')
}

function getTokenPlanStyle(remainingPercent: number): { color: string; bgColor: string } {
    if (remainingPercent < 15) return { color: 'text-red-500', bgColor: 'bg-red-500/15' }
    if (remainingPercent < 30) return { color: 'text-orange-500', bgColor: 'bg-orange-500/10' }
    if (remainingPercent < 50) return { color: 'text-amber-600', bgColor: 'bg-amber-500/10' }
    return { color: 'text-emerald-500', bgColor: 'bg-emerald-500/10' }
}

export function StatusBar(props: {
    active: boolean
    thinking: boolean
    agentState: AgentState | null | undefined
    backgroundTaskCount?: number
    usedPercentage?: number | null
    contextWindowSize?: number | null
    usedTokens?: number | null
    model?: string | null
    modelReasoningEffort?: string | null
    permissionMode?: PermissionMode
    collaborationMode?: CodexCollaborationMode
    agentFlavor?: string | null
    voiceStatus?: ConversationStatus
    sttStatus?: 'idle' | 'recording' | 'recognizing'
    parsedContext?: ParsedContextData | null
    contextFetching?: boolean
    onContextClick?: () => void
    tokenPlanRemainingPercent?: number | null
    onTokenPlanClick?: () => void
}) {
    const { t } = useTranslation()
    const connectionStatus = useMemo(
        () => getConnectionStatus(props.active, props.thinking, props.agentState, props.voiceStatus, props.backgroundTaskCount ?? 0, t, props.sttStatus),
        [props.active, props.thinking, props.agentState, props.voiceStatus, props.backgroundTaskCount, t, props.sttStatus]
    )

    const contextLabel = useMemo(() => {
        if (props.contextFetching) {
            return { text: t('session.context.fetching'), freeText: null, color: 'text-[#007AFF]', bgColor: 'bg-[var(--app-subtle-bg)]', isFetching: true }
        }

        const parsed = props.parsedContext
        if (parsed) {
            const percent = parsed.tokensPercentage
            const { color, bgColor } = getContextUsageStyle(percent)

            // Extract Free space tokens and percentage from category section
            let freeTokens: string | null = null
            let freePercent: string | null = null
            for (const section of parsed.sections) {
                for (const row of section.rows) {
                    if (row[0] === 'Free space') {
                        freeTokens = row[1] ?? null
                        freePercent = row[2] ?? null
                        break
                    }
                }
                if (freeTokens) break
            }

            const text = freeTokens
                ? `${parsed.tokensUsed} / ${parsed.tokensTotal} (${percent}%) • ${freeTokens} (${freePercent ?? ''})`
                : `${parsed.tokensUsed} / ${parsed.tokensTotal} (${percent}%)`

            return { text, freeText: null, color, bgColor, isFetching: false }
        }

        if (props.usedPercentage == null) return null
        const { color, bgColor } = getContextUsageStyle(Math.round(props.usedPercentage))

        const used = props.usedTokens != null ? formatTokens(props.usedTokens) : `${Math.round(props.usedPercentage)}%`
        const size = props.contextWindowSize ? formatTokens(props.contextWindowSize) : ''
        const percent = Math.round(props.usedPercentage)
        const text = size
            ? `${used} / ${size} (${percent}%)`
            : `${used} (${percent}%)`

        return { text, freeText: null, color, bgColor, isFetching: false }
    }, [props.contextFetching, props.parsedContext, props.usedPercentage, props.contextWindowSize, props.usedTokens, t])

    const displayCollaborationMode = props.agentFlavor === 'codex' && props.collaborationMode === 'plan'
        ? props.collaborationMode
        : null
    const collaborationModeLabel = displayCollaborationMode
        ? getCodexCollaborationModeLabel(displayCollaborationMode)
        : null
    const codexReasoningLabel = props.agentFlavor === 'codex'
        ? formatCodexReasoningLabel(props.modelReasoningEffort)
        : null
    const codexFastMode = props.agentFlavor === 'codex'
        ? isCodexFastMode(props.model, props.modelReasoningEffort)
        : false

    return (
        <div className="flex items-center justify-between px-2 pb-1">
            <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5">
                    <span
                        className={`h-2 w-2 rounded-full ${connectionStatus.dotColor} ${connectionStatus.isPulsing ? 'animate-pulse' : ''}`}
                    />
                    <span className={`text-xs ${connectionStatus.color}`}>
                        {connectionStatus.text}
                    </span>
                </div>
                <div className="flex items-center gap-1.5">
                    {contextLabel ? (
                        <button
                            type="button"
                            onClick={props.onContextClick}
                            className={`flex items-center gap-2 rounded-md px-2 py-0.5 text-left transition-colors ${contextLabel.bgColor}${contextLabel.isFetching ? ' animate-pulse' : ''}`}
                        >
                            <span className={`text-[11px] font-medium ${contextLabel.color}`}>
                                {contextLabel.text}
                            </span>
                            {contextLabel.freeText ? (
                                <span className={`text-[11px] font-medium ${contextLabel.color}`}>
                                    {contextLabel.freeText}
                                </span>
                            ) : null}
                        </button>
                    ) : null}
                    {props.tokenPlanRemainingPercent != null ? (
                        <button
                            type="button"
                            onClick={props.onTokenPlanClick}
                            className={`flex items-center gap-1 rounded-md px-2 py-0.5 text-left transition-colors ${getTokenPlanStyle(props.tokenPlanRemainingPercent).bgColor}`}
                        >
                            <span className={`text-[11px] font-bold leading-none ${getTokenPlanStyle(props.tokenPlanRemainingPercent).color}`}>
                                TP
                            </span>
                            <span className={`text-[11px] font-medium ${getTokenPlanStyle(props.tokenPlanRemainingPercent).color}`}>
                                {Math.round(props.tokenPlanRemainingPercent)}%
                            </span>
                        </button>
                    ) : null}
                </div>
            </div>

            <div className="flex min-w-0 items-center gap-2">
                {codexReasoningLabel ? (
                    <span className="text-xs text-[var(--app-hint)]">
                        {codexReasoningLabel}
                    </span>
                ) : null}
                {codexFastMode ? (
                    <span className="text-xs text-[#34C759]">
                        fast
                    </span>
                ) : null}
                {collaborationModeLabel ? (
                    <span className="text-xs text-blue-500">
                        {collaborationModeLabel}
                    </span>
                ) : null}
            </div>
        </div>
    )
}
