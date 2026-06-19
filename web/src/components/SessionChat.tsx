import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { useNavigate } from '@tanstack/react-router'
import { AssistantRuntimeProvider } from '@assistant-ui/react'
import type { ApiClient } from '@/api/client'
import type {
    AttachmentMetadata,
    CodexCollaborationMode,
    DecryptedMessage,
    PermissionMode,
    Session,
    SlashCommand,
} from '@/types/api'
import type { PendingSchedule } from '@/components/AssistantChat/ScheduleTimePicker'
import { resolvePendingSchedule } from '@/components/AssistantChat/ScheduleTimePicker'
import type { ChatBlock, NormalizedMessage } from '@/chat/types'
import type { Suggestion } from '@/hooks/useActiveSuggestions'
import { normalizeDecryptedMessage } from '@/chat/normalize'
import { reduceChatBlocks } from '@/chat/reducer'
import { reconcileChatBlocks } from '@/chat/reconcile'
import { buildConversationOutline } from '@/chat/outline'
import { buildVisibleChatBlocks, isToolGroupBlock, type ToolGroupBlock } from '@/chat/toolGroups'
import { extractContextCommandOutput, computeContextGrowth, computeModelNamesFromHistory, computeTokenDeltasFromHistory, computePendingTokenBlocks, computeDurationFromHistory } from '@/chat/contextOutput'
import { isQueuedForInvocation } from '@/lib/messages'
import { HappyComposer } from '@/components/AssistantChat/HappyComposer'
import { HappyThread } from '@/components/AssistantChat/HappyThread'
import { ContextPanel } from '@/components/ContextPanel'
import { QueuedMessagesBar } from '@/components/AssistantChat/QueuedMessagesBar'
import { useHappyRuntime } from '@/lib/assistant-runtime'
import { createAttachmentAdapter } from '@/lib/attachmentAdapter'
import { useTranslation } from '@/lib/use-translation'
import { SessionHeader } from '@/components/SessionHeader'
import { TeamPanel } from '@/components/TeamPanel'
import { useAssistantApi } from '@assistant-ui/react'
import { usePlatform } from '@/hooks/usePlatform'
import { useSessionActions } from '@/hooks/mutations/useSessionActions'
import { useCodexModels } from '@/hooks/queries/useCodexModels'
import { useVoiceOptional } from '@/lib/voice-context'
import { useStt } from '@/hooks/useStt'
import { useAppContext } from '@/lib/app-context'
import { RealtimeVoiceSession, registerSessionStore, registerVoiceHooksStore, voiceHooks } from '@/realtime'
import { isRemoteTerminalSupported } from '@/utils/terminalSupport'

/** Handles injecting STT results into the composer when recognition completes */
function SttTextInjector(props: {
    sttStatus: 'idle' | 'recording' | 'recognizing'
    sttText: string
    sttError: string | null
    onSttReset: () => void
}) {
    const api = useAssistantApi()
    const wasActiveRef = useRef(false)

    useEffect(() => {
        const isActive = props.sttStatus === 'recording' || props.sttStatus === 'recognizing'
        if (isActive) wasActiveRef.current = true

        if (props.sttText && wasActiveRef.current) {
            flushSync(() => {
                api.composer().setText(props.sttText)
            })
        }

        if (props.sttStatus === 'idle' && wasActiveRef.current) {
            wasActiveRef.current = false
            if (!props.sttError) {
                props.onSttReset()
            }
        }
    }, [props.sttStatus, props.sttText, props.sttError, props.onSttReset, api])

    return null
}

function getOutlineTitle(session: Session): string {
    if (session.metadata?.name) {
        return session.metadata.name
    }
    if (session.metadata?.summary?.text) {
        return session.metadata.summary.text
    }
    if (session.metadata?.path) {
        return session.metadata.path
    }
    return session.id.slice(0, 8)
}

const TokenDeltaContext = createContext<Map<string, number>>(new Map())
const PendingTokenDeltaContext = createContext<Set<string>>(new Set())
const ModelNameContext = createContext<Map<string, string>>(new Map())
const DurationContext = createContext<Map<string, number>>(new Map())

export function useTokenDelta(blockId: string | undefined): number | undefined {
    const deltas = useContext(TokenDeltaContext)
    if (!blockId) return undefined
    return deltas.get(blockId)
}

export function useTokenDeltaPending(blockId: string | undefined): boolean {
    const pending = useContext(PendingTokenDeltaContext)
    if (!blockId) return false
    return pending.has(blockId)
}

export function useModelNameFromContext(blockId: string | undefined): string | undefined {
    const models = useContext(ModelNameContext)
    if (!blockId) return undefined
    return models.get(blockId)
}

export function useDurationFromContext(blockId: string | undefined): number | undefined {
    const durations = useContext(DurationContext)
    if (!blockId) return undefined
    return durations.get(blockId)
}

export function SessionChat(props: {
    api: ApiClient
    session: Session
    messages: DecryptedMessage[]
    messagesWarning: string | null
    hasMoreMessages: boolean
    isLoadingMessages: boolean
    isLoadingMoreMessages: boolean
    isSending: boolean
    pendingCount: number
    messagesVersion: number
    onBack: () => void
    onRefresh: () => void
    onLoadMore: () => Promise<unknown>
    onSend: (text: string, attachments?: AttachmentMetadata[], scheduledAt?: number | null) => void
    onFlushPending: () => void
    onAtBottomChange: (atBottom: boolean) => void
    onRetryMessage?: (localId: string) => void
    autocompleteSuggestions?: (query: string) => Promise<Suggestion[]>
    availableSlashCommands?: readonly SlashCommand[]
}) {
    const { haptic } = usePlatform()
    const { t } = useTranslation()
    const navigate = useNavigate()
    const sessionInactive = !props.session.active
    const terminalSupported = isRemoteTerminalSupported(props.session.metadata)
    const normalizedCacheRef = useRef<Map<string, { source: DecryptedMessage; normalized: NormalizedMessage | null }>>(new Map())
    const blocksByIdRef = useRef<Map<string, ChatBlock>>(new Map())
    const visibleGroupsRef = useRef<ToolGroupBlock[]>([])
    const [forceScrollToken, setForceScrollToken] = useState(0)
    const [outlineOpen, setOutlineOpen] = useState(false)
    const [contextPanelOpen, setContextPanelOpen] = useState(false)
    const [contextFetching, setContextFetching] = useState(false)
    const contextFetchingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const contextFetchingStartRef = useRef(0)
    const fetchingBaselineCreatedAtRef = useRef(0)
    const contextReceivedForCycleRef = useRef(false)
    const agentFlavor = props.session.metadata?.flavor ?? null
    const controlledByUser = props.session.agentState?.controlledByUser === true
    const codexCollaborationModeSupported = agentFlavor === 'codex' && !controlledByUser
    const codexModelsState = useCodexModels({
        api: props.api,
        sessionId: props.session.id,
        enabled: agentFlavor === 'codex' && props.session.active && !controlledByUser
    })
    const codexModelOptions = useMemo(() => {
        if (agentFlavor !== 'codex') {
            return undefined
        }

        const options: Array<{ value: string | null; label: string }> = []
        for (const codexModel of codexModelsState.models) {
            options.push({
                value: codexModel.id,
                label: codexModel.displayName
            })
        }
        return options
    }, [agentFlavor, codexModelsState.models])
    const {
        abortSession,
        switchSession,
        setPermissionMode,
        setCollaborationMode,
        setModel,
        setModelReasoningEffort,
        setEffort
    } = useSessionActions(
        props.api,
        props.session.id,
        agentFlavor,
        codexCollaborationModeSupported
    )

    // Voice assistant integration
    const voice = useVoiceOptional()

    // STT integration
    const { token: sttToken, baseUrl: sttBaseUrl } = useAppContext()
    const stt = useStt(props.api, sttBaseUrl, sttToken)

    // Register session store for voice client tools
    useEffect(() => {
        registerSessionStore({
            getSession: () => props.session as { agentState?: { requests?: Record<string, unknown> } } | null,
            sendMessage: (_sessionId: string, message: string) => props.onSend(message),
            approvePermission: async (_sessionId: string, requestId: string) => {
                await props.api.approvePermission(props.session.id, requestId)
                props.onRefresh()
            },
            denyPermission: async (_sessionId: string, requestId: string) => {
                await props.api.denyPermission(props.session.id, requestId)
                props.onRefresh()
            }
        })
    }, [props.session, props.api, props.onSend, props.onRefresh])

    useEffect(() => {
        registerVoiceHooksStore(
            (sessionId) => (sessionId === props.session.id ? props.session : null),
            (sessionId) => (sessionId === props.session.id ? props.messages : [])
        )
    }, [props.session, props.messages])

    // Track and report new messages to voice assistant
    // Note: voiceHooks internally checks isVoiceSessionStarted() so we don't need to check voice.status here
    const prevMessagesRef = useRef<DecryptedMessage[]>([])

    useEffect(() => {
        const prevIds = new Set(prevMessagesRef.current.map(m => m.id))
        const newMessages = props.messages.filter(m => !prevIds.has(m.id))

        if (newMessages.length > 0) {
            voiceHooks.onMessages(props.session.id, newMessages)
        }

        prevMessagesRef.current = props.messages
    }, [props.messages, props.session.id])

    // Report ready event when thinking stops
    // Note: voiceHooks internally checks isVoiceSessionStarted() so we don't need to check voice.status here
    const prevThinkingRef = useRef(props.session.thinking)

    useEffect(() => {
        if (prevThinkingRef.current && !props.session.thinking) {
            voiceHooks.onReady(props.session.id)
            // Skip if we already received context for this cycle
            // (happens when /context processing triggers another thinking→false)
            if (contextReceivedForCycleRef.current) {
                contextReceivedForCycleRef.current = false
            } else {
                fetchingBaselineCreatedAtRef.current = contextCommandOutputRef.current?.createdAt ?? 0
                contextFetchingStartRef.current = Date.now()
                setContextFetching(true)
                if (contextFetchingTimeoutRef.current) clearTimeout(contextFetchingTimeoutRef.current)
                contextFetchingTimeoutRef.current = setTimeout(() => setContextFetching(false), 30_000)
            }
        }

        prevThinkingRef.current = props.session.thinking
    }, [props.session.thinking, props.session.id])

    // Report permission requests to voice assistant
    // Note: voiceHooks internally checks isVoiceSessionStarted() so we don't need to check voice.status here
    const prevRequestIdsRef = useRef<Set<string>>(new Set())

    useEffect(() => {
        const requests = props.session.agentState?.requests ?? {}
        const currentIds = new Set(Object.keys(requests))

        for (const [requestId, request] of Object.entries(requests)) {
            if (!prevRequestIdsRef.current.has(requestId)) {
                voiceHooks.onPermissionRequested(
                    props.session.id,
                    requestId,
                    (request as { tool?: string }).tool ?? 'unknown',
                    (request as { arguments?: unknown }).arguments
                )
            }
        }

        prevRequestIdsRef.current = currentIds
    }, [props.session.agentState?.requests, props.session.id])

    const handleVoiceToggle = useCallback(async () => {
        if (!voice) return
        if (voice.status === 'connected' || voice.status === 'connecting') {
            await voice.stopVoice()
        } else {
            await voice.startVoice(props.session.id)
        }
    }, [voice, props.session.id])

    const handleVoiceMicToggle = useCallback(() => {
        if (!voice) return
        voice.toggleMic()
    }, [voice])

    const handleSttToggle = useCallback(() => {
        if (!stt.isConfigured) {
            navigate({ to: '/settings/voice' })
            return
        }
        if (!stt.isAvailable) {
            alert('当前环境不支持语音输入。请通过 HTTPS 访问，或在 Chrome 浏览器中使用。')
            return
        }
        if (stt.state.status === 'idle') {
            stt.start()
        } else if (stt.state.status === 'recording') {
            stt.stop()
        }
        // If recognizing, do nothing — wait for result
    }, [stt, navigate])

    // Track session id to clear caches when it changes
    const prevSessionIdRef = useRef<string | null>(null)

    useEffect(() => {
        normalizedCacheRef.current.clear()
        blocksByIdRef.current.clear()
        visibleGroupsRef.current = []
        setOutlineOpen(false)
        setContextPanelOpen(false)
    }, [props.session.id])

    // Exclude user messages that haven't been invoked yet — those appear in the
    // QueuedMessagesBar above the composer, not in the thread timeline. The
    // `isQueuedForInvocation` predicate is shared with the window store and the
    // floating bar so the three views never disagree about queued state.
    const visibleMessages = useMemo(
        () => props.messages.filter((m) => !isQueuedForInvocation(m)),
        [props.messages]
    )

    const normalizedMessages: NormalizedMessage[] = useMemo(() => {
        // Clear caches immediately when session changes (before useEffect runs)
        if (prevSessionIdRef.current !== null && prevSessionIdRef.current !== props.session.id) {
            normalizedCacheRef.current.clear()
            blocksByIdRef.current.clear()
            visibleGroupsRef.current = []
        }
        prevSessionIdRef.current = props.session.id

        const cache = normalizedCacheRef.current
        const normalized: NormalizedMessage[] = []
        const seen = new Set<string>()
        for (const message of visibleMessages) {
            seen.add(message.id)
            const cached = cache.get(message.id)
            if (cached && cached.source === message) {
                if (cached.normalized) normalized.push(cached.normalized)
                continue
            }
            const next = normalizeDecryptedMessage(message)
            cache.set(message.id, { source: message, normalized: next })
            if (next) normalized.push(next)
        }
        for (const id of cache.keys()) {
            if (!seen.has(id)) {
                cache.delete(id)
            }
        }
        return normalized
    }, [visibleMessages])

    const reduced = useMemo(
        () => reduceChatBlocks(normalizedMessages, props.session.agentState),
        [normalizedMessages, props.session.agentState]
    )

    const metadataContext = useMemo(() => {
        const meta = props.session.metadata as Record<string, unknown> | undefined
        const cw = meta?.contextWindow
        if (typeof cw !== 'object' || cw === null) return { usedPercentage: undefined }
        const data = cw as Record<string, unknown>
        const usedPercentage = typeof data.usedPercentage === 'number' ? data.usedPercentage : undefined
        const contextWindowSize = typeof data.contextWindowSize === 'number' ? data.contextWindowSize : undefined
        const usedTokens = typeof data.totalInputTokens === 'number' ? data.totalInputTokens : undefined
        return { usedPercentage, contextWindowSize, usedTokens }
    }, [props.session.metadata])
    const reconciled = useMemo(
        () => reconcileChatBlocks(reduced.blocks, blocksByIdRef.current),
        [reduced.blocks]
    )

    useEffect(() => {
        blocksByIdRef.current = reconciled.byId
    }, [reconciled.byId])

    const contextCommandOutput = useMemo(
        () => extractContextCommandOutput(reconciled.blocks),
        [reconciled.blocks]
    )
    const contextCommandOutputRef = useRef(contextCommandOutput)
    contextCommandOutputRef.current = contextCommandOutput

    useEffect(() => {
        if (
            contextCommandOutput
            && contextFetchingStartRef.current > 0
            && contextCommandOutput.createdAt > fetchingBaselineCreatedAtRef.current
        ) {
            contextReceivedForCycleRef.current = true
            const elapsed = Date.now() - contextFetchingStartRef.current
            const remaining = Math.max(0, 1500 - elapsed)
            if (contextFetchingTimeoutRef.current) clearTimeout(contextFetchingTimeoutRef.current)
            contextFetchingTimeoutRef.current = setTimeout(() => {
                setContextFetching(false)
                contextFetchingStartRef.current = 0
            }, remaining)
        }
    }, [contextCommandOutput])

    // Compute token deltas from full block history (survives page refresh)
    const tokenDeltas = useMemo(
        () => computeTokenDeltasFromHistory(reconciled.blocks),
        [reconciled.blocks]
    )

    // Compute model names from context output history
    const modelNames = useMemo(
        () => computeModelNamesFromHistory(reconciled.blocks),
        [reconciled.blocks]
    )

    // Compute durations from block history
    const durationMap = useMemo(
        () => computeDurationFromHistory(reconciled.blocks),
        [reconciled.blocks]
    )

    // Compute context growth (delta between last two context outputs)
    const contextGrowth = useMemo(
        () => computeContextGrowth(reconciled.blocks),
        [reconciled.blocks]
    )

    // Compute pending blocks (assistant blocks after last context output)
    const pendingTokenBlocks = useMemo(
        () => computePendingTokenBlocks(reconciled.blocks),
        [reconciled.blocks]
    )

    const CONTEXT_USAGE_RE = /^## Context Usage/m

    const displayBlocks = useMemo(() => {
        return reconciled.blocks.filter(
            (block) => block.kind !== 'agent-text' || !CONTEXT_USAGE_RE.test(block.text)
        )
    }, [reconciled.blocks])

    const visibleBlocks = useMemo(
        () => buildVisibleChatBlocks(displayBlocks, {
            hasMoreMessages: props.hasMoreMessages,
            previousGroups: visibleGroupsRef.current
        }),
        [displayBlocks, props.hasMoreMessages]
    )

    useEffect(() => {
        visibleGroupsRef.current = visibleBlocks.filter(isToolGroupBlock)
    }, [visibleBlocks])

    const outlineItems = useMemo(
        () => buildConversationOutline(displayBlocks),
        [displayBlocks]
    )

    const outlineTitle = useMemo(
        () => getOutlineTitle(props.session),
        [props.session]
    )

    const handleOpenOutline = useCallback(() => {
        setContextPanelOpen(false)
        setOutlineOpen(true)
    }, [])

    // Permission mode change handler
    const handlePermissionModeChange = useCallback(async (mode: PermissionMode) => {
        try {
            await setPermissionMode(mode)
            haptic.notification('success')
            props.onRefresh()
        } catch (e) {
            haptic.notification('error')
            console.error('Failed to set permission mode:', e)
        }
    }, [setPermissionMode, props.onRefresh, haptic])

    const handleCollaborationModeChange = useCallback(async (mode: CodexCollaborationMode) => {
        try {
            await setCollaborationMode(mode)
            haptic.notification('success')
            props.onRefresh()
        } catch (e) {
            haptic.notification('error')
            console.error('Failed to set collaboration mode:', e)
        }
    }, [setCollaborationMode, props.onRefresh, haptic])

    // Model mode change handler
    const handleModelChange = useCallback(async (model: string | null) => {
        try {
            await setModel(model)
            haptic.notification('success')
            props.onRefresh()
        } catch (e) {
            haptic.notification('error')
            console.error('Failed to set model:', e)
        }
    }, [setModel, props.onRefresh, haptic])

    const handleModelReasoningEffortChange = useCallback(async (modelReasoningEffort: string | null) => {
        try {
            await setModelReasoningEffort(modelReasoningEffort)
            haptic.notification('success')
            props.onRefresh()
        } catch (e) {
            haptic.notification('error')
            console.error('Failed to set model reasoning effort:', e)
        }
    }, [setModelReasoningEffort, props.onRefresh, haptic])

    const handleEffortChange = useCallback(async (effort: string | null) => {
        try {
            await setEffort(effort)
            haptic.notification('success')
            props.onRefresh()
        } catch (e) {
            haptic.notification('error')
            console.error('Failed to set effort:', e)
        }
    }, [setEffort, props.onRefresh, haptic])

    // Abort handler
    const handleAbort = useCallback(async () => {
        await abortSession()
        props.onRefresh()
    }, [abortSession, props.onRefresh])

    // Switch to remote handler
    const handleSwitchToRemote = useCallback(async () => {
        await switchSession()
        props.onRefresh()
    }, [switchSession, props.onRefresh])

    const handleViewFiles = useCallback(() => {
        navigate({
            to: '/sessions/$sessionId/files',
            params: { sessionId: props.session.id }
        })
    }, [navigate, props.session.id])

    const handleViewTerminal = useCallback(() => {
        navigate({
            to: '/sessions/$sessionId/terminal',
            params: { sessionId: props.session.id }
        })
    }, [navigate, props.session.id])

    const [pendingSchedule, setPendingSchedule] = useState<PendingSchedule | null>(null)

    const handleSend = useCallback((text: string, attachments?: AttachmentMetadata[]) => {
        const scheduledAt = resolvePendingSchedule(pendingSchedule)
        setPendingSchedule(null)
        props.onSend(text, attachments, scheduledAt)
        setForceScrollToken((token) => token + 1)
    }, [props.onSend, pendingSchedule])

    const attachmentAdapter = useMemo(() => {
        if (!props.session.active) {
            return undefined
        }
        return createAttachmentAdapter(props.api, props.session.id)
    }, [props.api, props.session.id, props.session.active])

    const runtime = useHappyRuntime({
        session: props.session,
        blocks: visibleBlocks,
        isSending: props.isSending,
        onSendMessage: handleSend,
        onAbort: handleAbort,
        attachmentAdapter,
        allowSendWhenInactive: true
    })

    return (
        <div className="flex h-full min-h-0 flex-col">
            <SessionHeader
                session={props.session}
                onBack={props.onBack}
                onViewFiles={props.session.metadata?.path ? handleViewFiles : undefined}
                onOpenOutline={handleOpenOutline}
                api={props.api}
                onSessionDeleted={props.onBack}
            />

            {props.session.teamState && (
                <TeamPanel teamState={props.session.teamState} />
            )}

            {sessionInactive ? (
                <div className="px-3 pt-3">
                    <div className="mx-auto w-full max-w-content rounded-md bg-[var(--app-subtle-bg)] p-3 text-sm text-[var(--app-hint)]">
                        Session is inactive. Sending will resume it automatically.
                    </div>
                </div>
            ) : null}

            <TokenDeltaContext.Provider value={tokenDeltas}>
            <PendingTokenDeltaContext.Provider value={pendingTokenBlocks}>
            <ModelNameContext.Provider value={modelNames}>
            <DurationContext.Provider value={durationMap}>
            <AssistantRuntimeProvider runtime={runtime}>
                <SttTextInjector
                    sttStatus={stt.state.status}
                    sttText={stt.state.text}
                    sttError={stt.state.error}
                    onSttReset={stt.reset}
                />
                <div className="relative flex min-h-0 flex-1 flex-col">
                    <HappyThread
                        key={props.session.id}
                        api={props.api}
                        sessionId={props.session.id}
                        metadata={props.session.metadata}
                        disabled={sessionInactive}
                        onRefresh={props.onRefresh}
                        onRetryMessage={props.onRetryMessage}
                        onFlushPending={props.onFlushPending}
                        onAtBottomChange={props.onAtBottomChange}
                        isLoadingMessages={props.isLoadingMessages}
                        messagesWarning={props.messagesWarning}
                        hasMoreMessages={props.hasMoreMessages}
                        isLoadingMoreMessages={props.isLoadingMoreMessages}
                        onLoadMore={props.onLoadMore}
                        pendingCount={props.pendingCount}
                        rawMessagesCount={visibleMessages.length}
                        normalizedMessagesCount={normalizedMessages.length}
                        messagesVersion={props.messagesVersion}
                        forceScrollToken={forceScrollToken}
                        outlineOpen={outlineOpen}
                        outlineTitle={outlineTitle}
                        outlineItems={outlineItems}
                        onOutlineOpenChange={setOutlineOpen}
                    />

                    {codexCollaborationModeSupported && codexModelsState.error ? (
                        <div className="px-3 pb-2">
                            <div className="mx-auto w-full max-w-content rounded-md bg-[var(--app-subtle-bg)] p-3 text-sm text-red-600">
                                {t('session.codexModelsLoadFailed')}: {codexModelsState.error}
                            </div>
                        </div>
                    ) : null}

                    <div className="px-3">
                        <QueuedMessagesBar
                            sessionId={props.session.id}
                            onCancelMessage={(localId) => props.api.cancelQueuedMessage(props.session.id, localId).catch(() => {})}
                        />
                    </div>

                    <HappyComposer
                        key={props.session.id}
                        sessionId={props.session.id}
                        disabled={props.isSending}
                        permissionMode={props.session.permissionMode}
                        collaborationMode={codexCollaborationModeSupported ? props.session.collaborationMode : undefined}
                        model={props.session.model}
                        modelReasoningEffort={agentFlavor === 'codex' ? props.session.modelReasoningEffort : undefined}
                        effort={props.session.effort}
                        agentFlavor={agentFlavor}
                        availableModelOptions={agentFlavor === 'codex' ? codexModelOptions : undefined}
                        active={props.session.active}
                        allowSendWhenInactive
                        thinking={props.session.thinking}
                        agentState={props.session.agentState}
                        backgroundTaskCount={props.session.backgroundTaskCount}
                        usedPercentage={metadataContext.usedPercentage}
                        contextWindowSize={metadataContext.contextWindowSize}
                        usedTokens={metadataContext.usedTokens}
                        parsedContext={contextCommandOutput?.parsed ?? null}
                        contextFetching={contextFetching}
                        onContextClick={() => setContextPanelOpen(true)}
                        controlledByUser={controlledByUser}
                        onCollaborationModeChange={
                            codexCollaborationModeSupported && props.session.active && !controlledByUser
                                ? handleCollaborationModeChange
                                : undefined
                        }
                        onPermissionModeChange={handlePermissionModeChange}
                        onModelChange={
                            agentFlavor === 'codex'
                                ? (props.session.active && !controlledByUser && !codexModelsState.error ? handleModelChange : undefined)
                                : handleModelChange
                        }
                        onModelReasoningEffortChange={
                            agentFlavor === 'codex' && props.session.active && !controlledByUser
                                ? handleModelReasoningEffortChange
                                : undefined
                        }
                        onEffortChange={handleEffortChange}
                        onSwitchToRemote={handleSwitchToRemote}
                        onTerminal={props.session.active && terminalSupported ? handleViewTerminal : undefined}
                        terminalUnsupported={props.session.active && !terminalSupported}
                        autocompleteSuggestions={props.autocompleteSuggestions}
                        voiceStatus={voice?.status}
                        voiceMicMuted={voice?.micMuted}
                        onVoiceToggle={voice ? handleVoiceToggle : undefined}
                        onVoiceMicToggle={voice ? handleVoiceMicToggle : undefined}
                        sttStatus={stt.state.status}
                        onSttToggle={handleSttToggle}
                        pendingSchedule={pendingSchedule}
                        onSchedule={setPendingSchedule}
                        onClearSchedule={() => setPendingSchedule(null)}
                        hasAttachments={false}
                    />
                </div>
            </AssistantRuntimeProvider>
            </DurationContext.Provider>
            </ModelNameContext.Provider>
            </PendingTokenDeltaContext.Provider>
            </TokenDeltaContext.Provider>

            {/* Voice session component - renders nothing but initializes ElevenLabs */}
            {voice && (
                <RealtimeVoiceSession
                    api={props.api}
                    micMuted={voice.micMuted}
                    onStatusChange={voice.setStatus}
                />
            )}

            {contextPanelOpen ? (
                <ContextPanel
                    contextCommandOutput={contextCommandOutput}
                    contextGrowth={contextGrowth}
                    onClose={() => setContextPanelOpen(false)}
                    onRefresh={() => handleSend('/context')}
                />
            ) : null}
        </div>
    )
}
