import type { SttLanguage } from '@hapi/protocol/stt'
import { z } from 'zod'
import { STT_DEFAULT_LANGUAGE, STT_DEFAULT_REGION } from '@hapi/protocol/stt'
import type { SttProvider } from '../../stt/types'
import { SttSessionManager } from '../../stt/session'
import type { SocketWithData } from '../socketTypes'

const sttStartSchema = z.object({
    language: z.enum(['zh', 'en', 'auto']).optional(),
    mode: z.enum(['pcm', 'webm']).optional(),
})

const sttAudioSchema = z.object({
    data: z.union([z.instanceof(ArrayBuffer), z.instanceof(Uint8Array), z.instanceof(Buffer)]),
})

type SttSocket = SocketWithData

export type SttHandlersDeps = {
    tencentProvider: SttProvider
    xunfeiProvider: SttProvider
    getSttConfig: (namespace: string) => {
        provider: string
        appId: string
        secretId: string
        secretKey: string
        apiKey: string
        apiSecret: string
    } | null
}

export function registerSttHandlers(socket: SttSocket, deps: SttHandlersDeps): void {
    const { tencentProvider, xunfeiProvider, getSttConfig } = deps
    const namespace = typeof socket.data.namespace === 'string' ? socket.data.namespace : null

    const emitSttError = (message: string) => {
        socket.emit('stt:error' as never, { message } as never)
    }

    socket.on('stt:start' as never, (data: unknown) => {
        console.log('[STT-Handler] stt:start received')
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
        const inputMimeType = parsed.data.mode === 'pcm' ? 'audio/pcm' : 'audio/webm'

        const provider = sttConfig.provider === 'xunfei' ? xunfeiProvider : tencentProvider

        const manager = new SttSessionManager()

        activeSessions.set(socket.id, manager)

        manager.onError((error) => {
            emitSttError(error.message)
            cleanupSession(socket.id)
        })

        manager.onResult((result) => {
            socket.emit('stt:result' as never, result as never)
        })

        manager.onDone(() => {
            console.log('[STT-Handler] Session done, emitting stt:done')
            socket.emit('stt:done' as never)
            cleanupSession(socket.id)
        })

        manager.start(
            provider,
            {
                provider: sttConfig.provider,
                language,
                region: STT_DEFAULT_REGION,
                appId: sttConfig.appId,
                secretId: sttConfig.secretId,
                secretKey: sttConfig.secretKey,
                apiKey: sttConfig.apiKey,
                apiSecret: sttConfig.apiSecret,
            },
            inputMimeType,
        ).then(() => {
            console.log('[STT-Handler] Session started, emitting stt:started')
            socket.emit('stt:started' as never, { sessionId: socket.id } as never)
        }).catch((error: Error) => {
            console.error('[STT-Handler] Session start failed:', error.message)
            emitSttError(error.message)
            cleanupSession(socket.id)
        })
    })

    socket.on('stt:audio' as never, (data: unknown) => {
        const parsed = sttAudioSchema.safeParse(data)
        if (!parsed.success) {
            console.error('[STT-Handler] stt:audio validation failed:', parsed.error.message)
            return
        }

        const manager = activeSessions.get(socket.id)
        if (!manager) {
            return
        }

        const rawData = parsed.data.data
        const buffer = rawData instanceof ArrayBuffer
            ? Buffer.from(rawData)
            : Buffer.from(rawData as Uint8Array)
        manager.sendAudio(buffer)
    })

    socket.on('stt:stop' as never, () => {
        console.log('[STT-Handler] stt:stop received')
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
