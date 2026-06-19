import { useCallback, useSyncExternalStore } from 'react'
import { getMessageWindowState, subscribeMessageWindow } from '@/lib/message-window-store'
import { isQueuedForInvocation } from '@/lib/messages'
import { EMPTY_STATE } from '@/hooks/queries/useMessages'
import { normalizeDecryptedMessage } from '@/chat/normalize'
import type { DecryptedMessage } from '@/types/api'
import { useTranslation } from '@/lib/use-translation'

function ClockIcon() {
    return (
        <svg
            className="h-[14px] w-[14px] shrink-0"
            viewBox="0 0 16 16"
            fill="none"
            aria-hidden="true"
        >
            <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" />
            <path
                d="M8 5v3.5l2.5 1.5"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </svg>
    )
}

function CancelIcon() {
    return (
        <svg
            className="h-3.5 w-3.5"
            viewBox="0 0 16 16"
            fill="none"
            aria-hidden="true"
        >
            <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
    )
}

function formatScheduledTime(ms: number): string {
    const d = new Date(ms)
    const now = new Date()
    const pad = (n: number) => String(n).padStart(2, '0')

    if (d.toDateString() === now.toDateString()) {
        return `${pad(d.getHours())}:${pad(d.getMinutes())}`
    }

    const tomorrow = new Date(now)
    tomorrow.setDate(tomorrow.getDate() + 1)
    if (d.toDateString() === tomorrow.toDateString()) {
        return `${pad(d.getHours())}:${pad(d.getMinutes())}`
    }

    return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function useQueuedMessages(sessionId: string): DecryptedMessage[] {
    const state = useSyncExternalStore(
        useCallback((listener) => subscribeMessageWindow(sessionId, listener), [sessionId]),
        useCallback(() => getMessageWindowState(sessionId), [sessionId]),
        () => EMPTY_STATE
    )

    const allMessages = [...state.messages, ...state.pending]
    return allMessages.filter(isQueuedForInvocation)
}

function getTextFromMessage(msg: DecryptedMessage): string {
    const normalized = normalizeDecryptedMessage(msg)
    if (!normalized || normalized.role !== 'user') {
        return ''
    }
    const text = (normalized.content.text ?? '').trim()
    if (text) {
        return text
    }
    const attachments = normalized.content.attachments ?? []
    if (attachments.length === 0) {
        return ''
    }
    return attachments.map((a) => a.filename ?? 'attachment').join(', ')
}

export function QueuedMessagesBar({ sessionId, onCancelMessage }: { sessionId: string; onCancelMessage?: (localId: string) => void }) {
    const queued = useQueuedMessages(sessionId)
    const { t } = useTranslation()

    const handleCancel = (msg: DecryptedMessage) => {
        if (msg.localId && onCancelMessage) {
            onCancelMessage(msg.localId)
        }
    }

    if (queued.length === 0) {
        return null
    }

    return (
        <div
            role="status"
            className="mx-auto w-full max-w-content mb-1"
        >
            <div className="px-3 py-2 text-sm text-[var(--app-fg-muted)]">
                <div className="flex items-center gap-1.5 mb-1.5 text-xs font-medium text-[var(--app-hint)]">
                    <ClockIcon />
                    <span>{t('queued.label')}</span>
                </div>
                <ul
                    className="flex flex-col gap-1.5 max-h-32 sm:max-h-48 overflow-y-auto"
                >
                    {queued.map((msg) => {
                        const text = getTextFromMessage(msg)
                        const isScheduled = msg.scheduledAt != null && msg.scheduledAt > Date.now()
                        return (
                            <li
                                key={msg.localId ?? msg.id}
                                className="flex items-start gap-2 min-w-0 rounded-lg bg-[var(--app-secondary-bg)] px-3 py-2 shadow-sm"
                            >
                                <span className="line-clamp-3 whitespace-pre-wrap break-words text-[var(--app-fg)] flex-1">{text}</span>
                                {isScheduled ? (
                                    <div className="flex items-center gap-1.5 shrink-0">
                                        <span className="text-xs text-[var(--app-hint)] whitespace-nowrap">
                                            {formatScheduledTime(msg.scheduledAt!)}
                                        </span>
                                        <button
                                            type="button"
                                            onClick={() => handleCancel(msg)}
                                            className="text-[var(--app-hint)] hover:text-[var(--app-fg)] transition-colors"
                                            aria-label={t('queued.cancel')}
                                        >
                                            <CancelIcon />
                                        </button>
                                    </div>
                                ) : null}
                            </li>
                        )
                    })}
                </ul>
            </div>
        </div>
    )
}
