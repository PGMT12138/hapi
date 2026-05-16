import type { Session } from '../sync/syncEngine'
import type { NotificationChannel, TaskNotification } from '../notifications/notificationTypes'
import { getAgentName, getSessionName } from '../notifications/sessionInfo'
import type { SSEManager } from '../sse/sseManager'
import type { Machine } from '../sync/machineCache'
import type { PushPayload, PushService } from './pushService'

const MAX_DETAIL_LENGTH = 80

type MachineResolver = (machineId: string | null) => Machine | undefined

export class PushNotificationChannel implements NotificationChannel {
    constructor(
        private readonly pushService: PushService,
        private readonly sseManager: SSEManager,
        private readonly appUrl: string,
        private readonly resolveMachine: MachineResolver = () => undefined
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

    private buildToastData(session: Session, title: string, body: string, detail?: string) {
        const url = this.buildSessionPath(session.id)
        try {
            const agentName = getAgentName(session)
            const sessionName = getSessionName(session)
            const machineName = this.getMachineName(session)
            const projectPath = (session.metadata as Record<string, unknown>)?.path as string | undefined

            const lines: string[] = []
            if (sessionName) lines.push(sessionName)
            if (projectPath) lines.push(projectPath)
            if (agentName) lines.push(agentName)
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
        const detail = request?.input
            ? this.truncate(String(request.input), MAX_DETAIL_LENGTH)
            : toolName ? `Tool: ${request.tool}` : undefined

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
            data: this.buildToastData(session, payload.title, payload.body, detail)
        })
    }

    async sendReady(session: Session): Promise<void> {
        if (!session.active) {
            return
        }

        const agentName = getAgentName(session)
        const name = getSessionName(session)

        const payload: PushPayload = {
            title: 'Ready for input',
            body: `${agentName} is waiting in ${name}`,
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
            data: this.buildToastData(session, payload.title, payload.body)
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
            : undefined

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
        if (!session.active) {
            return
        }

        const agentName = getAgentName(session)
        const name = getSessionName(session)
        const detail = _reason ? this.truncate(_reason, MAX_DETAIL_LENGTH) : undefined

        const payload: PushPayload = {
            title: 'Session completed',
            body: `${agentName} · ${name}`,
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
