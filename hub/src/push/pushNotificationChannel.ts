import { isObject, unwrapRoleWrappedRecordEnvelope } from '@hapi/protocol'
import type { Session } from '../sync/syncEngine'
import type { NotificationChannel, TaskNotification } from '../notifications/notificationTypes'
import { getAgentName, getSessionName } from '../notifications/sessionInfo'
import type { SSEManager } from '../sse/sseManager'
import type { Machine } from '../sync/machineCache'
import type { PushPayload, PushService } from './pushService'

const MAX_DETAIL_LENGTH = 80
const NOTIFICATION_SNIPPET_LENGTH = 50

type MachineResolver = (machineId: string | null) => Machine | undefined
type LastAssistantTextResolver = (sessionId: string) => string | null

export class PushNotificationChannel implements NotificationChannel {
    constructor(
        private readonly pushService: PushService,
        private readonly sseManager: SSEManager,
        private readonly appUrl: string,
        private readonly resolveMachine: MachineResolver = () => undefined,
        private readonly resolveLastAssistantText: LastAssistantTextResolver = () => null
    ) {}

    private getMachineName(session: Session): string {
        try {
            const machineId = (session.metadata as Record<string, unknown>)?.machineId as string | undefined ?? null
            const machine = this.resolveMachine(machineId)
            return machine?.metadata?.displayName || machine?.metadata?.host || ''
        } catch {
            return ''
        }
    }

    private truncate(text: string, max: number): string {
        if (text.length <= max) return text
        return text.slice(0, max) + '...'
    }

    private getLastResponseSnippet(sessionId: string): string | null {
        const fullText = this.resolveLastAssistantText(sessionId)
        if (!fullText) return null
        return this.truncate(fullText, NOTIFICATION_SNIPPET_LENGTH)
    }

    private buildToastData(session: Session, title: string, body: string, detail?: string) {
        const url = this.buildSessionPath(session.id)
        try {
            const agentName = getAgentName(session)
            const sessionName = getSessionName(session)
            const machineName = this.getMachineName(session)
            const projectPath = (session.metadata as Record<string, unknown>)?.path as string | undefined

            const lines: string[] = []
            if (sessionName) lines.push(sessionName)
            if (projectPath) lines.push(`项目: ${projectPath}`)
            if (agentName) lines.push(`Agent: ${agentName}`)
            if (detail) lines.push(this.truncate(detail, MAX_DETAIL_LENGTH))

            return {
                title,
                body: lines.length > 0 ? lines.join('\n') : body,
                subText: machineName || '',
                sessionId: session.id,
                url
            }
        } catch (error) {
            console.error('[PushNotificationChannel] buildToastData failed, using fallback:', error)
            return { title, body, sessionId: session.id, url }
        }
    }

    async sendPermissionRequest(session: Session): Promise<void> {
        if (!session.active) {
            return
        }

        const name = getSessionName(session)
        const request = session.agentState?.requests
            ? Object.values(session.agentState.requests)[0]
            : null
        const toolName = request?.tool ? ` (${request.tool})` : ''

        const payload: PushPayload = {
            title: 'Permission Request',
            body: `${name}${toolName}`,
            tag: `permission-${session.id}`,
            data: {
                type: 'permission-request',
                sessionId: session.id,
                url: this.buildSessionPath(session.id)
            }
        }

        await this.pushService.sendToNamespace(session.namespace, payload)

        await this.sseManager.sendToast(session.namespace, {
            type: 'toast',
            data: this.buildToastData(session, payload.title, payload.body, this.getLastResponseSnippet(session.id) ?? undefined)
        })
    }

    async sendReady(session: Session): Promise<void> {
        if (!session.active) {
            return
        }

        const agentName = getAgentName(session)
        const name = getSessionName(session)
        const snippet = this.getLastResponseSnippet(session.id)
        const bodyText = snippet ? `${agentName}: ${snippet}` : `${agentName} is waiting in ${name}`

        const payload: PushPayload = {
            title: 'Ready for input',
            body: bodyText,
            tag: `ready-${session.id}`,
            data: {
                type: 'ready',
                sessionId: session.id,
                url: this.buildSessionPath(session.id)
            }
        }

        await this.pushService.sendToNamespace(session.namespace, payload)

        await this.sseManager.sendToast(session.namespace, {
            type: 'toast',
            data: this.buildToastData(session, payload.title, payload.body, snippet ?? undefined)
        })
    }

    async sendTaskNotification(session: Session, notification: TaskNotification): Promise<void> {
        if (!session.active) {
            return
        }

        const agentName = getAgentName(session)
        const name = getSessionName(session)
        const normalizedStatus = notification.status?.trim().toLowerCase()
        const isFailure = normalizedStatus === 'failed'
            || normalizedStatus === 'error'
            || normalizedStatus === 'killed'
            || normalizedStatus === 'aborted'
        const detail = notification.summary
            ? this.truncate(notification.summary, MAX_DETAIL_LENGTH)
            : this.getLastResponseSnippet(session.id) ?? undefined

        const payload: PushPayload = {
            title: isFailure ? 'Task failed' : 'Task completed',
            body: `${agentName} · ${name} · ${notification.summary}`,
            data: {
                type: 'task-notification',
                sessionId: session.id,
                url: this.buildSessionPath(session.id)
            }
        }

        await this.pushService.sendToNamespace(session.namespace, payload)

        await this.sseManager.sendToast(session.namespace, {
            type: 'toast',
            data: this.buildToastData(session, payload.title, payload.body, detail)
        })
    }

    async sendSessionCompletion(session: Session, _reason: string): Promise<void> {

        const agentName = getAgentName(session)
        const name = getSessionName(session)
        const snippet = this.getLastResponseSnippet(session.id)
        const bodyText = snippet ? `${agentName}: ${snippet}` : `${agentName} · ${name}`
        const detail = _reason ? this.truncate(_reason, MAX_DETAIL_LENGTH) : snippet ?? undefined

        const payload: PushPayload = {
            title: 'Session completed',
            body: bodyText,
            data: {
                type: 'session-completion',
                sessionId: session.id,
                url: this.buildSessionPath(session.id)
            }
        }

        await this.pushService.sendToNamespace(session.namespace, payload)

        await this.sseManager.sendToast(session.namespace, {
            type: 'toast',
            data: this.buildToastData(session, payload.title, payload.body, detail)
        })
    }

    private buildSessionPath(sessionId: string): string {
        return `/sessions/${sessionId}`
    }
}

export function extractAssistantText(content: unknown): string | null {
    if (!isObject(content)) return null

    // Try role-wrapped format: { role: 'assistant', content: [...] }
    // or { type: 'assistant', message: { role: 'assistant', content: [...] } }
    const record = unwrapRoleWrappedRecordEnvelope(content)
    if (record?.role === 'assistant') {
        const text = extractTextFromContent(record.content)
        if (text && !isContextOutput(text)) return text
    }

    // Try nested envelope format: { content: { data: { type: 'assistant', message: { content: [...] } } } }
    const outerContent = content.content
    if (isObject(outerContent)) {
        const data = outerContent.data
        if (isObject(data) && data.type === 'assistant') {
            const message = data.message
            if (isObject(message)) {
                const text = extractTextFromContent(message.content)
                if (text && !isContextOutput(text)) return text
            }
        }
    }

    // Try direct data format: { data: { type: 'assistant', message: { content: [...] } } }
    const directData = content.data
    if (isObject(directData) && directData.type === 'assistant') {
        const message = directData.message
        if (isObject(message)) {
            const text = extractTextFromContent(message.content)
            if (text && !isContextOutput(text)) return text
        }
    }

    return null
}

function isContextOutput(text: string): boolean {
    return text.includes('## Context Usage')
        || text.includes('<system-reminder>')
        || text.includes('<command-name>')
}

function extractTextFromContent(inner: unknown): string | null {
    if (typeof inner === 'string') return inner || null

    if (Array.isArray(inner)) {
        for (const block of inner) {
            if (isObject(block) && block.type === 'text' && typeof block.text === 'string' && block.text) {
                return block.text
            }
        }
    }

    if (isObject(inner) && inner.type === 'text' && typeof inner.text === 'string' && inner.text) {
        return inner.text
    }

    return null
}
