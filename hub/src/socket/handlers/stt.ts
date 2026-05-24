import type { SttClientEvents, SttServerEvents, SttLanguage } from '@hapi/protocol/stt'
import { z } from 'zod'
import { STT_DEFAULT_LANGUAGE, STT_DEFAULT_REGION } from '@hapi/protocol/stt'
import type { SttProvider } from '../../stt/types'
import { SttSessionManager } from '../../stt/session'
import type { SocketServer, SocketWithData } from '../socketTypes'

const sttStartSchema = z.object({
    language: z.enum(['zh', 'en', 'auto']).optional(),
})

const sttAudioSchema = z.object({
    data: z.instanceof(ArrayBuffer),
})

type SttSocket = SocketWithData

export type SttHandlersDeps = {
    io: SocketServer
    sttProvider: SttProvider
    getSttConfig: (namespace: string) => { secretId: string; secretKey: string } | null
}

export function registerSttHandlers(socket: SttSocket, deps: SttHandlersDeps): void {
    const { io, sttProvider, getSttConfig } = deps
    const namespace = typeof socket.data.namespace === 'string' ? socket.data.namespace : null

    const emitSttError = (message: string) => {
        socket.emit('stt:error' as never, { message } as never)
    }

    socket.on('stt:start' as never, (data: unknown) => {
        const parsed = sttStartSchema.safeParse(data)
        if (!parsed.success) {
            emitSttError('Invalid stt:start payload')
            return
        }

        if (!namespace) {
            emitSttError('Missing namespace')
            return
        }

        const sttConfig = getSttConfig(namespace)
        if (!sttConfig) {
            emitSttError('STT is not configured for this namespace')
            return
        }

        const language: SttLanguage = parsed.data.language ?? STT_DEFAULT_LANGUAGE

        const manager = new SttSessionManager()

        activeSessions.set(socket.id, manager)

        manager.onError((error) => {
            emitSttError(error.message)
            cleanupSession(socket.id)
        })

        manager.onResult((result) => {
            socket.emit('stt:result' as never, result as never)
        })

        manager.start(
            sttProvider,
            {
                language,
                region: STT_DEFAULT_REGION,
                secretId: sttConfig.secretId,
                secretKey: sttConfig.secretKey,
            },
            'audio/webm',
        ).then(() => {
            socket.emit('stt:started' as never, { sessionId: socket.id } as never)
        }).catch((error: Error) => {
            emitSttError(error.message)
            cleanupSession(socket.id)
        })
    })

    socket.on('stt:audio' as never, (data: unknown) => {
        const parsed = sttAudioSchema.safeParse(data)
        if (!parsed.success) {
            return
        }

        const manager = activeSessions.get(socket.id)
        if (!manager) {
            return
        }

        manager.sendAudio(Buffer.from(parsed.data.data))
    })

    socket.on('stt:stop' as never, () => {
        const manager = activeSessions.get(socket.id)
        if (!manager) {
            return
        }

        manager.stop()
    })

    socket.on('disconnect', () => {
        cleanupSession(socket.id)
    })
}

const activeSessions = new Map<string, SttSessionManager>()

function cleanupSession(socketId: string): void {
    const manager = activeSessions.get(socketId)
    if (manager) {
        manager.destroy()
        activeSessions.delete(socketId)
    }
}
