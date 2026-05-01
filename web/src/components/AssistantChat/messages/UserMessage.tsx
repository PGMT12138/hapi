import { MessagePrimitive, useAssistantState } from '@assistant-ui/react'
import { LazyRainbowText } from '@/components/LazyRainbowText'
import { useHappyChatContext } from '@/components/AssistantChat/context'
import type { HappyChatMessageMetadata } from '@/lib/assistant-runtime'
import { MessageStatusIndicator } from '@/components/AssistantChat/messages/MessageStatusIndicator'
import { MessageAttachments } from '@/components/AssistantChat/messages/MessageAttachments'
import { CliOutputBlock } from '@/components/CliOutputBlock'
import { CopyIcon, CheckIcon } from '@/components/icons'
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard'
import { getConversationMessageAnchorId } from '@/chat/outline'
import { formatTimestamp } from '@/chat/presentation'

export function HappyUserMessage() {
    const ctx = useHappyChatContext()
    const { copied, copy } = useCopyToClipboard()
    const role = useAssistantState(({ message }) => message.role)
    const messageId = useAssistantState(({ message }) => message.id)
    const text = useAssistantState(({ message }) => {
        if (message.role !== 'user') return ''
        return message.content.find((part) => part.type === 'text')?.text ?? ''
    })
    const status = useAssistantState(({ message }) => {
        if (message.role !== 'user') return undefined
        const custom = message.metadata.custom as Partial<HappyChatMessageMetadata> | undefined
        return custom?.status
    })
    const localId = useAssistantState(({ message }) => {
        if (message.role !== 'user') return null
        const custom = message.metadata.custom as Partial<HappyChatMessageMetadata> | undefined
        return custom?.localId ?? null
    })
    const attachments = useAssistantState(({ message }) => {
        if (message.role !== 'user') return undefined
        const custom = message.metadata.custom as Partial<HappyChatMessageMetadata> | undefined
        return custom?.attachments
    })
    const createdAt = useAssistantState(({ message }) => message.createdAt)
    const isCliOutput = useAssistantState(({ message }) => {
        const custom = message.metadata.custom as Partial<HappyChatMessageMetadata> | undefined
        return custom?.kind === 'cli-output'
    })
    const cliText = useAssistantState(({ message }) => {
        const custom = message.metadata.custom as Partial<HappyChatMessageMetadata> | undefined
        if (custom?.kind !== 'cli-output') return ''
        return message.content.find((part) => part.type === 'text')?.text ?? ''
    })

    if (role !== 'user') return null
    const canRetry = status === 'failed' && typeof localId === 'string' && Boolean(ctx.onRetryMessage)
    const onRetry = canRetry ? () => ctx.onRetryMessage!(localId) : undefined

    const userBubbleClass = `w-fit min-w-0 max-w-[92%] ml-auto rounded-xl bg-[var(--app-secondary-bg)] border border-[var(--app-border)] px-3 py-2 text-[var(--app-fg)] shadow-sm`

    if (isCliOutput) {
        return (
            <MessagePrimitive.Root
                id={getConversationMessageAnchorId(messageId)}
                className="scroll-mt-4 px-1 min-w-0 max-w-full overflow-x-hidden"
            >
                <div className="ml-auto w-full max-w-[92%]">
                    <CliOutputBlock text={cliText} />
                </div>
            </MessagePrimitive.Root>
        )
    }

    const hasText = text.length > 0
    const hasAttachments = attachments && attachments.length > 0

    return (
        <div className="w-fit min-w-0 max-w-[92%] ml-auto scroll-mt-4" id={getConversationMessageAnchorId(messageId)}>
            <MessagePrimitive.Root className={`${userBubbleClass} group/msg`}>
                {hasText && <LazyRainbowText text={text} />}
                {hasAttachments && <MessageAttachments attachments={attachments} />}
                {status && (
                    <div className="flex items-center justify-end gap-1 mt-0.5">
                        <MessageStatusIndicator status={status} onRetry={onRetry} />
                    </div>
                )}
            </MessagePrimitive.Root>
            <div className="mt-0.5 flex items-center justify-end gap-1.5 text-[10px] text-[var(--app-hint)]">
                {createdAt && (
                    <span>
                        {formatTimestamp(createdAt instanceof Date ? createdAt.getTime() : Number(createdAt))}
                    </span>
                )}
                {hasText && (
                    <button
                        type="button"
                        title="Copy"
                        className="p-0.5 rounded hover:bg-[var(--app-subtle-bg)] transition-[background-color]"
                        onClick={() => copy(text)}
                    >
                        {copied
                            ? <CheckIcon className="h-3.5 w-3.5 text-green-500" />
                            : <CopyIcon className="h-3.5 w-3.5" />}
                    </button>
                )}
            </div>
        </div>
    )
}
