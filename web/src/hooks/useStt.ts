import { useCallback, useRef, useState } from 'react'
import type { SttLanguage, SttSessionStatus } from '@hapi/protocol/stt'
import { getSttSocket, disconnectSttSocket } from '@/realtime/stt-socket'
import { useSttConfig } from './queries/useSttConfig'
import type { ApiClient } from '@/api/client'

interface SttState {
    status: SttSessionStatus
    text: string
    error: string | null
}

export function useStt(api: ApiClient | null, serverUrl: string, token: string) {
    const { config } = useSttConfig(api)
    const [state, setState] = useState<SttState>({
        status: 'idle',
        text: '',
        error: null,
    })

    const mediaRecorderRef = useRef<MediaRecorder | null>(null)
    const streamRef = useRef<MediaStream | null>(null)

    const isAvailable = typeof navigator !== 'undefined'
        && typeof navigator.mediaDevices?.getUserMedia === 'function'
        && typeof MediaRecorder !== 'undefined'

    const isConfigured = Boolean(config?.secretId && config?.secretKey)

    const start = useCallback(async () => {
        if (!isAvailable || !isConfigured) return

        setState({ status: 'recording', text: '', error: null })

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
            streamRef.current = stream

            const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
                ? 'audio/webm;codecs=opus'
                : MediaRecorder.isTypeSupported('audio/mp4')
                    ? 'audio/mp4'
                    : 'audio/webm'

            const socket = getSttSocket(serverUrl, token)

            socket.on('stt:result', (result) => {
                setState((prev) => ({
                    ...prev,
                    text: result.isFinal ? result.text : prev.text + result.text,
                    status: result.isFinal ? 'idle' : prev.status,
                }))
            })

            socket.on('stt:error', (data) => {
                setState({ status: 'idle', text: '', error: data.message })
                disconnectSttSocket()
                streamRef.current?.getTracks().forEach((t) => t.stop())
                streamRef.current = null
            })

            await new Promise<void>((resolve, reject) => {
                socket.on('stt:started', () => resolve())
                socket.on('connect_error', (err) => reject(err))
                socket.connect()
                socket.emit('stt:start', { language: (config?.language ?? 'zh') as SttLanguage })
            })

            const mediaRecorder = new MediaRecorder(stream, { mimeType })
            mediaRecorderRef.current = mediaRecorder

            mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0 && socket.connected) {
                    event.data.arrayBuffer().then((buffer) => {
                        socket.emit('stt:audio', { data: buffer })
                    })
                }
            }

            mediaRecorder.start(250)
        } catch (error) {
            setState({
                status: 'idle',
                text: '',
                error: error instanceof Error ? error.message : 'Failed to start recording',
            })
            streamRef.current?.getTracks().forEach((t) => t.stop())
            streamRef.current = null
        }
    }, [isAvailable, isConfigured, config?.language, serverUrl, token])

    const stop = useCallback(async () => {
        const recorder = mediaRecorderRef.current
        if (recorder && recorder.state !== 'inactive') {
            recorder.stop()
        }

        const socket = getSttSocket(serverUrl, token)
        if (socket.connected) {
            socket.emit('stt:stop')
            setState((prev) => ({
                ...prev,
                status: 'recognizing',
            }))
        }

        streamRef.current?.getTracks().forEach((t) => t.stop())
        streamRef.current = null
        mediaRecorderRef.current = null
    }, [serverUrl, token])

    const reset = useCallback(() => {
        disconnectSttSocket()
        streamRef.current?.getTracks().forEach((t) => t.stop())
        streamRef.current = null
        mediaRecorderRef.current = null
        setState({ status: 'idle', text: '', error: null })
    }, [])

    return {
        state,
        start,
        stop,
        reset,
        isAvailable,
        isConfigured,
    }
}
