import type { Session } from '../sync/syncEngine'
import type { NotificationChannel, TaskNotification } from '../notifications/notificationTypes'
import { getAgentName, getSessionName } from '../notifications/sessionInfo'
import type { SSEManager } from '../sse/sseManager'
import type { Machine } from '../sync/machineCache'
import type { VisibilityTracker } from '../visibility/visibilityTracker'
import type { PushPayload, PushService } from './pushService'

type MachineResolver = (machineId: string | null) => Machine | undefined

export class PushNotificationChannel implements NotificationChannel {
    constructor(
        private readonly pushService: PushService,
        private readonly sseManager: SSEManager,
        private readonly visibilityTracker: VisibilityTracker,
        private readonly appUrl: string,
        private readonly resolveMachine: MachineResolver = () => undefined
    ) {}

    private getMachineName(session: Session): string {
        const machineId = (session.metadata as Record<string, unknown>)?.machineId as string | undefined ?? null
        const machine = this.resolveMachine(machineId)
        return machine?.metadata?.displayName || machine?.metadata?.host || 'Unknown'
    }

    private buildToastData(session: Session, title: string, body: string) {
        const url = this.buildSessionPath(session.id)
        return {
            title,
            body,
            sessionId: session.id,
            url,
            agentName: getAgentName(session),
            sessionName: getSessionName(session),
            machineName: this.getMachineName(session)
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

        if (this.visibilityTracker.hasVisibleConnection(session.namespace)) {
            await this.sseManager.sendToast(session.namespace, {
                type: 'toast',
                data: this.buildToastData(session, payload.title, payload.body)
            })
        }
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

        if (this.visibilityTracker.hasVisibleConnection(session.namespace)) {
            await this.sseManager.sendToast(session.namespace, {
                type: 'toast',
                data: this.buildToastData(session, payload.title, payload.body)
            })
        }
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

        if (this.visibilityTracker.hasVisibleConnection(session.namespace)) {
            await this.sseManager.sendToast(session.namespace, {
                type: 'toast',
                data: this.buildToastData(session, payload.title, payload.body)
            })
        }
    }

    async sendSessionCompletion(session: Session, _reason: string): Promise<void> {
        if (!session.active) {
            return
        }

        const agentName = getAgentName(session)
        const name = getSessionName(session)

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

        if (this.visibilityTracker.hasVisibleConnection(session.namespace)) {
            await this.sseManager.sendToast(session.namespace, {
                type: 'toast',
                data: this.buildToastData(session, payload.title, payload.body)
            })
        }
    }

    private buildSessionPath(sessionId: string): string {
        return `/sessions/${sessionId}`
    }
}
