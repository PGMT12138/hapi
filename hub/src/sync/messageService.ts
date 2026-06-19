import type { AttachmentMetadata, DecryptedMessage } from '@hapi/protocol/types'
import type { Server } from 'socket.io'
import type { Store } from '../store'
import { EventPublisher } from './eventPublisher'

export class MessageService {
    constructor(
        private readonly store: Store,
        private readonly io: Server,
        private readonly publisher: EventPublisher,
        private readonly onSessionActivity?: (sessionId: string, updatedAt: number) => void
    ) {
    }

    getMessagesPage(sessionId: string, options: { limit: number; beforeSeq: number | null }): {
        messages: DecryptedMessage[]
        page: {
            limit: number
            beforeSeq: number | null
            nextBeforeSeq: number | null
            hasMore: boolean
        }
    } {
        const stored = this.store.messages.getMessages(sessionId, options.limit, options.beforeSeq ?? undefined)
        const messages: DecryptedMessage[] = stored.map((message) => ({
            id: message.id,
            seq: message.seq,
            localId: message.localId,
            content: message.content,
            createdAt: message.createdAt,
            invokedAt: message.invokedAt,
            scheduledAt: message.scheduledAt
        }))

        let oldestSeq: number | null = null
        for (const message of messages) {
            if (typeof message.seq !== 'number') continue
            if (oldestSeq === null || message.seq < oldestSeq) {
                oldestSeq = message.seq
            }
        }

        const nextBeforeSeq = oldestSeq
        const hasMore = nextBeforeSeq !== null
            && this.store.messages.getMessages(sessionId, 1, nextBeforeSeq).length > 0

        return {
            messages,
            page: {
                limit: options.limit,
                beforeSeq: options.beforeSeq,
                nextBeforeSeq,
                hasMore
            }
        }
    }

    getMessagesPageByPosition(
        sessionId: string,
        options: { limit: number; before?: { at: number; seq: number } | null }
    ): {
        messages: DecryptedMessage[]
        page: {
            limit: number
            nextBeforeSeq: number | null
            nextBeforeAt: number | null
            hasMore: boolean
        }
    } {
        const before = options.before ?? undefined
        const pageRows = this.store.messages.getMessagesByPosition(sessionId, options.limit, before)

        // Latest-page request (no cursor): also include uninvoked local user messages
        // out-of-band, so refresh / secondary clients can still see queued rows even
        // when their position key (createdAt) places them outside the latest page.
        // The cursor stays anchored to pageRows so out-of-band rows don't affect
        // pagination of older pages.
        const queuedRows = before === undefined
            ? this.store.messages.getUninvokedLocalMessages(sessionId)
            : []

        const byId = new Map<string, typeof pageRows[number]>()
        for (const row of pageRows) byId.set(row.id, row)
        for (const row of queuedRows) byId.set(row.id, row)

        const stored = [...byId.values()].sort((a, b) => {
            const at = (a.invokedAt ?? a.createdAt) - (b.invokedAt ?? b.createdAt)
            return at !== 0 ? at : a.seq - b.seq
        })

        const messages: DecryptedMessage[] = stored.map((message) => ({
            id: message.id,
            seq: message.seq,
            localId: message.localId,
            content: message.content,
            createdAt: message.createdAt,
            invokedAt: message.invokedAt,
            scheduledAt: message.scheduledAt
        }))

        // The cursor is the oldest row in the actual position-ordered page (pageRows[0]).
        // Out-of-band queued rows are not part of the cursor — they are pinned to
        // every latest-page response.
        const oldest = pageRows[0] ?? null
        const oldestSeq: number | null = oldest?.seq ?? null
        const oldestPositionAt: number | null = oldest
            ? oldest.invokedAt ?? oldest.createdAt
            : null

        const hasMore = oldestSeq !== null && oldestPositionAt !== null
            && this.store.messages.getMessagesByPosition(
                sessionId,
                1,
                { at: oldestPositionAt, seq: oldestSeq }
            ).length > 0

        return {
            messages,
            page: {
                limit: options.limit,
                nextBeforeSeq: oldestSeq,
                nextBeforeAt: oldestPositionAt,
                hasMore
            }
        }
    }

    /** CLI reconnect backfill — excludes future-scheduled rows. */
    getDeliverableMessagesAfter(sessionId: string, options: { afterSeq: number; limit: number; now: number }): DecryptedMessage[] {
        const stored = this.store.messages.getDeliverableMessagesAfter(sessionId, options.afterSeq, options.now, options.limit)
        return stored.map((message) => ({
            id: message.id,
            seq: message.seq,
            localId: message.localId,
            content: message.content,
            createdAt: message.createdAt,
            invokedAt: message.invokedAt,
            scheduledAt: message.scheduledAt
        }))
    }

    async sendMessage(
        sessionId: string,
        payload: {
            text: string
            localId?: string | null
            attachments?: AttachmentMetadata[]
            sentFrom?: 'telegram-bot' | 'webapp'
            ephemeral?: boolean
            scheduledAt?: number | null
        }
    ): Promise<void> {
        if (payload.scheduledAt != null && (payload.attachments?.length ?? 0) > 0) {
            throw new Error('sendMessage: scheduled messages with attachments are not supported')
        }

        const sentFrom = payload.sentFrom ?? 'webapp'

        const content = {
            role: 'user',
            content: {
                type: 'text',
                text: payload.text,
                attachments: payload.attachments
            },
            meta: {
                sentFrom
            }
        }

        if (payload.ephemeral) {
            const ephemeralId = `eph-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
            const now = Date.now()

            const update = {
                id: ephemeralId,
                seq: null,
                createdAt: now,
                body: {
                    t: 'new-message' as const,
                    sid: sessionId,
                    message: {
                        id: ephemeralId,
                        seq: null,
                        createdAt: now,
                        localId: payload.localId ?? null,
                        content
                    }
                }
            }
            this.io.of('/cli').to(`session:${sessionId}`).emit('update', update)
            // No SSE broadcast — ephemeral messages should be invisible to web clients
            return
        }

        const msg = this.store.messages.addMessage(sessionId, content, payload.localId ?? undefined, payload.scheduledAt ?? undefined)
        this.onSessionActivity?.(sessionId, msg.createdAt)

        const isFutureScheduled = msg.scheduledAt !== null && msg.scheduledAt > Date.now()
        if (!isFutureScheduled) {
            const update = {
                id: msg.id,
                seq: msg.seq,
                createdAt: msg.createdAt,
                body: {
                    t: 'new-message' as const,
                    sid: sessionId,
                    message: {
                        id: msg.id,
                        seq: msg.seq,
                        createdAt: msg.createdAt,
                        localId: msg.localId,
                        content: msg.content
                    }
                }
            }
            this.io.of('/cli').to(`session:${sessionId}`).emit('update', update)
        }

        this.publisher.emit({
            type: 'message-received',
            sessionId,
            message: {
                id: msg.id,
                seq: msg.seq,
                localId: msg.localId,
                content: msg.content,
                createdAt: msg.createdAt,
                invokedAt: msg.invokedAt,
                scheduledAt: msg.scheduledAt
            }
        })
    }

    /** Force-invoke all immediate-queued messages for a session at session end. */
    sweepImmediateQueuedOnSessionEnd(
        sessionId: string,
        invokedAt: number
    ): { localIds: string[]; invokedAt: number } | null {
        const queued = this.store.messages.getImmediateQueuedLocalMessages(sessionId)
        const localIds = queued
            .map((m) => m.localId)
            .filter((id): id is string => typeof id === 'string')
        if (localIds.length === 0) return null
        this.store.messages.markMessagesInvoked(sessionId, localIds, invokedAt)
        this.publisher.emit({ type: 'messages-consumed', sessionId, localIds, invokedAt })
        return { localIds, invokedAt }
    }

    /** Called by the hub 5-second tick. Finds mature scheduled messages and emits
     *  them to CLI via socket.io. Does NOT call markMessagesInvoked — the CLI ack
     *  (messages-consumed) handles that. Messages are re-emitted on each tick until
     *  the CLI acks, so a hub restart will naturally re-emit pending rows. */
    releaseMatureScheduledMessages(now: number): void {
        const mature = this.store.messages.getMatureScheduledMessages(now)
        for (const msg of mature) {
            const update = {
                id: msg.id,
                seq: msg.seq,
                createdAt: msg.createdAt,
                body: {
                    t: 'new-message' as const,
                    sid: msg.sessionId,
                    message: {
                        id: msg.id,
                        seq: msg.seq,
                        createdAt: msg.createdAt,
                        localId: msg.localId,
                        content: msg.content
                    }
                }
            }
            this.io.of('/cli').to(`session:${msg.sessionId}`).emit('update', update)
        }
    }

    /** Cancel a queued message. Future-scheduled messages are deleted directly
     *  (they were never emitted to CLI). Immediate-queued messages cannot be
     *  cancelled because the CLI may have already consumed them. */
    cancelQueuedMessage(sessionId: string, localId: string): boolean {
        const lookup = this.store.messages.lookupQueuedMessage(sessionId, localId)
        if (lookup.status === 'absent') return false
        if (lookup.status === 'invoked') return false
        const { scheduledAt, resolvedId } = lookup
        const now = Date.now()
        if (scheduledAt !== null && scheduledAt > now) {
            this.store.messages.deleteQueuedMessageById(sessionId, resolvedId)
            this.publisher.emit({ type: 'message-cancelled', sessionId, messageId: resolvedId, localId })
            return true
        }
        return false
    }
}
