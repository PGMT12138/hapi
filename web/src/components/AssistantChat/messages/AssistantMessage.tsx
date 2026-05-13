import { useState, useEffect } from 'react'
import { MessagePrimitive, useAssistantState } from '@assistant-ui/react'
import { MarkdownText } from '@/components/assistant-ui/markdown-text'
import { Reasoning, ReasoningGroup } from '@/components/assistant-ui/reasoning'
import { HappyToolMessage } from '@/components/AssistantChat/messages/ToolMessage'
import { CliOutputBlock } from '@/components/CliOutputBlock'
import { CopyIcon, CheckIcon } from '@/components/icons'
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard'
import type { HappyChatMessageMetadata } from '@/lib/assistant-runtime'
import { getAssistantCopyText } from '@/components/AssistantChat/messages/assistantCopyText'
import { getConversationMessageAnchorId } from '@/chat/outline'
import { formatTimestamp, formatDuration } from '@/chat/presentation'
import { formatModelName } from '@hapi/protocol'
import { formatTokens } from '@/lib/formatTokens'
import { useTokenDelta, useTokenDeltaPending } from '@/components/SessionChat'

const TOOL_COMPONENTS = {
    Fallback: HappyToolMessage
} as const

const MESSAGE_PART_COMPONENTS = {
    Text: MarkdownText,
    Reasoning: Reasoning,
    ReasoningGroup: ReasoningGroup,
    tools: TOOL_COMPONENTS
} as const

function PendingDots() {
    return (
        <span className="ml-1.5 inline-flex items-center gap-[3px] px-2 py-0.5 rounded-md bg-[var(--app-subtle-bg)]">
            {[0, 1, 2].map(i => (
                <span
                    key={i}
                    className="h-1 w-1 rounded-full bg-[var(--app-hint)] animate-[bounce-dot_1.2s_ease-in-out_infinite]"
                    style={{ animationDelay: `${i * 0.15}s` }}
                />
            ))}
        </span>
    )
}

export function HappyAssistantMessage() {
    const { copied, copy } = useCopyToClipboard()
    const messageId = useAssistantState(({ message }) => message.id)
    const isCliOutput = useAssistantState(({ message }) => {
        const custom = message.metadata.custom as Partial<HappyChatMessageMetadata> | undefined
        return custom?.kind === 'cli-output'
    })
    const cliText = useAssistantState(({ message }) => {
        const custom = message.metadata.custom as Partial<HappyChatMessageMetadata> | undefined
        if (custom?.kind !== 'cli-output') return ''
        return message.content.find((part) => part.type === 'text')?.text ?? ''
    })
    const toolOnly = useAssistantState(({ message }) => {
        if (message.role !== 'assistant') return false
        const parts = message.content
        return parts.length > 0 && parts.every((part) => part.type === 'tool-call')
    })
    const copyText = useAssistantState(({ message }) => {
        if (message.role !== 'assistant') return ''
        return getAssistantCopyText(message.content)
    })
    const createdAt = useAssistantState(({ message }) => message.createdAt)
    const durationMs = useAssistantState(({ message }) => {
        const custom = message.metadata.custom as Partial<HappyChatMessageMetadata> | undefined
        return custom?.durationMs
    })
    const modelName = useAssistantState(({ message }) => {
        const custom = message.metadata.custom as Partial<HappyChatMessageMetadata> | undefined
        return formatModelName(custom?.model)
    })
    // Extract block ID from message ID (format: "assistant:<blockId>")
    const blockId = useAssistantState(({ message }) => {
        if (message.role !== 'assistant') return undefined
        const id = message.id
        const prefix = 'assistant:'
        return id.startsWith(prefix) ? id.slice(prefix.length) : undefined
    })
    const tokenDelta = useTokenDelta(blockId)
    const isPending = useTokenDeltaPending(blockId)

    // Auto-hide pending indicator after timeout
    const [pendingExpired, setPendingExpired] = useState(false)
    useEffect(() => {
        if (!isPending || tokenDelta != null) {
            setPendingExpired(false)
            return
        }
        setPendingExpired(false)
        const timer = setTimeout(() => setPendingExpired(true), 30000)
        return () => clearTimeout(timer)
    }, [isPending, tokenDelta])

    const showPending = isPending && tokenDelta == null && !pendingExpired

    const rootClass = toolOnly
        ? 'py-1 min-w-0 max-w-full overflow-x-hidden'
        : 'px-1 min-w-0 max-w-full overflow-x-hidden'

    if (isCliOutput) {
        return (
            <MessagePrimitive.Root
                id={getConversationMessageAnchorId(messageId)}
                className="scroll-mt-4 px-1 min-w-0 max-w-full overflow-x-hidden"
            >
                <CliOutputBlock text={cliText} />
            </MessagePrimitive.Root>
        )
    }

    return (
        <MessagePrimitive.Root
            id={getConversationMessageAnchorId(messageId)}
            className={`${rootClass} ${copyText ? 'group/msg' : ''} scroll-mt-4`}
        >
            <div className="min-w-0">
                <MessagePrimitive.Content components={MESSAGE_PART_COMPONENTS} />
            </div>
            {copyText && (
                <div className="hidden sm:flex justify-end mt-1 opacity-0 group-hover/msg:opacity-100 transition-opacity">
                    <button
                        type="button"
                        title="Copy"
                        className="p-0.5 rounded hover:bg-[var(--app-subtle-bg)] transition-colors"
                        onClick={() => copy(copyText)}
                    >
                        {copied
                            ? <CheckIcon className="h-3.5 w-3.5 text-green-500" />
                            : <CopyIcon className="h-3.5 w-3.5 text-[var(--app-hint)]" />}
                    </button>
                </div>
            )}
            {createdAt && (
                <div className="mt-0.5 text-[11px] text-[var(--app-fg)] opacity-50">
                    {modelName && (
                        <span className="mr-1.5 font-medium">{modelName}</span>
                    )}
                    {formatTimestamp(createdAt instanceof Date ? createdAt.getTime() : Number(createdAt))}
                    {durationMs != null && ` (${formatDuration(durationMs)})`}
                    {tokenDelta != null && (
                        <span className="ml-1.5 px-1.5 py-px rounded bg-[var(--app-subtle-bg)] text-[var(--app-fg)] font-medium text-[11px]">+{formatTokens(tokenDelta)}</span>
                    )}
                    {showPending && <PendingDots />}
                </div>
            )}
        </MessagePrimitive.Root>
    )
}
