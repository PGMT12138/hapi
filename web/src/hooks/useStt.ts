import { useCallback, useRef, useState } from 'react'
import type { SttLanguage, SttSessionStatus } from '@hapi/protocol/stt'
import { disconnectSttSocket } from '@/realtime/stt-socket'
import { useSttConfig } from './queries/useSttConfig'
import type { ApiClient } from '@/api/client'
import type { Socket } from 'socket.io-client'

interface SttState {
    status: SttSessionStatus
    confirmedText: string
    currentText: string
    error: string | null
}

function downsampleAndConvertTo16BitPCM(
    inputData: Float32Array,
    inputSampleRate: number,
    outputSampleRate: number,
): Int16Array {
    if (inputSampleRate === outputSampleRate) {
        const output = new Int16Array(inputData.length)
        for (let i = 0; i < inputData.length; i++) {
            const s = Math.max(-1, Math.min(1, inputData[i]))
            output[i] = s < 0 ? s * 0x8000 : s * 0x7fff
        }
        return output
    }
    const ratio = inputSampleRate / outputSampleRate
    const outputLength = Math.round(inputData.length / ratio)
    const output = new Int16Array(outputLength)
    for (let i = 0; i < outputLength; i++) {
        const inputIndex = i * ratio
        const index = Math.floor(inputIndex)
        const fraction = inputIndex - index
        let value: number
        if (index + 1 < inputData.length) {
            value = inputData[index] * (1 - fraction) + inputData[index + 1] * fraction
        } else {
            value = inputData[index]
        }
        const s = Math.max(-1, Math.min(1, value))
        output[i] = s < 0 ? s * 0x8000 : s * 0x7fff
    }
    return output
}

export function useStt(api: ApiClient | null, serverUrl: string, token: string) {
    const { config } = useSttConfig(api)
    const [state, setState] = useState<SttState>({
        status: 'idle',
        confirmedText: '',
        currentText: '',
        error: null,
    })

    const audioContextRef = useRef<AudioContext | null>(null)
    const processorRef = useRef<ScriptProcessorNode | null>(null)
    const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null)
    const mediaRecorderRef = useRef<MediaRecorder | null>(null)
    const streamRef = useRef<MediaStream | null>(null)
    const socketRef = useRef<Socket | null>(null)
    const pcmModeRef = useRef(false)
    const recognizingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    const hasUserMedia = typeof navigator !== 'undefined'
        && typeof navigator.mediaDevices?.getUserMedia === 'function'

    const hasAudioContext = typeof AudioContext !== 'undefined'
        || typeof (window as unknown as { webkitAudioContext?: unknown }).webkitAudioContext !== 'undefined'

    const hasMediaRecorder = typeof MediaRecorder !== 'undefined'

    const isAvailable = hasUserMedia && (hasAudioContext || hasMediaRecorder)

    const isConfigured = Boolean(config?.appId && config?.secretId && config?.secretKey)

    const text = state.confirmedText + state.currentText

    const start = useCallback(async () => {
        if (!isAvailable || !isConfigured) return

        setState({ status: 'recording', confirmedText: '', currentText: '', error: null })

        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    channelCount: 1,
                    echoCancellation: true,
                    noiseSuppression: true,
                },
            })
            streamRef.current = stream

            const { getSttSocket } = await import('@/realtime/stt-socket')
            const socket = getSttSocket(serverUrl, token)
            socketRef.current = socket

            socket.off('stt:result')
            socket.off('stt:error')
            socket.off('stt:done')
            socket.off('stt:started')
            socket.off('connect_error')

            socket.on('stt:result', (result: { text: string; isFinal: boolean }) => {
                setState((prev) => {
                    if (result.isFinal) {
                        // 一句话结束：将当前句文本移入已确认区，清空当前句
                        return {
                            ...prev,
                            confirmedText: prev.confirmedText + result.text,
                            currentText: '',
                        }
                    } else {
                        // 中间结果：追加 delta 到当前句
                        return {
                            ...prev,
                            currentText: prev.currentText + result.text,
                        }
                    }
                })
            })

            socket.on('stt:error', (data: { message: string }) => {
                setState({ status: 'idle', confirmedText: '', currentText: '', error: data.message })
                clearRecognizingTimeout()
                disconnectSttSocket()
                cleanupAudio()
            })

            socket.on('stt:done', () => {
                setState((prev) => {
                    if (prev.status === 'recognizing') {
                        clearRecognizingTimeout()
                        return { status: 'idle', confirmedText: prev.confirmedText, currentText: '', error: null }
                    }
                    return prev
                })
            })

            await new Promise<void>((resolve, reject) => {
                if (socket.connected) {
                    resolve()
                    return
                }
                socket.once('connect', () => resolve())
                socket.once('connect_error', (err: Error) => reject(err))
                socket.connect()
            })

            const usePcm = hasAudioContext
            pcmModeRef.current = usePcm

            socket.emit('stt:start', {
                language: (config?.language ?? 'zh') as SttLanguage,
                mode: usePcm ? 'pcm' as const : 'webm' as const,
            })

            await new Promise<void>((resolve, reject) => {
                const timeout = setTimeout(() => reject(new Error('STT session startup timeout')), 10_000)
                socket.once('stt:started', () => {
                    clearTimeout(timeout)
                    resolve()
                })
                socket.once('stt:error', (data: { message: string }) => {
                    clearTimeout(timeout)
                    reject(new Error(data.message))
                })
            })

            if (usePcm) {
                startPcmCapture(stream, socket)
            } else {
                startMediaRecorderCapture(stream, socket)
            }
        } catch (error) {
            setState({
                status: 'idle',
                confirmedText: '',
                currentText: '',
                error: error instanceof Error ? error.message : 'Failed to start recording',
            })
            cleanupAudio()
        }
    }, [isAvailable, isConfigured, config?.language, serverUrl, token, hasAudioContext])

    function startPcmCapture(stream: MediaStream, socket: Socket) {
        const AudioCtx = AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
        const audioContext = new AudioCtx()
        audioContextRef.current = audioContext

        const source = audioContext.createMediaStreamSource(stream)
        sourceRef.current = source

        const processor = audioContext.createScriptProcessor(4096, 1, 1)
        processorRef.current = processor

        processor.onaudioprocess = (e) => {
            const inputData = e.inputBuffer.getChannelData(0)
            const pcm16 = downsampleAndConvertTo16BitPCM(inputData, audioContext.sampleRate, 16000)
            if (pcm16.length > 0 && socket.connected) {
                socket.emit('stt:audio', { data: pcm16.buffer as ArrayBuffer })
            }
        }

        source.connect(processor)
        processor.connect(audioContext.destination)
    }

    function startMediaRecorderCapture(stream: MediaStream, socket: Socket) {
        const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
            ? 'audio/webm;codecs=opus'
            : MediaRecorder.isTypeSupported('audio/mp4')
                ? 'audio/mp4'
                : 'audio/webm'

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
    }

    const stop = useCallback(async () => {
        const recorder = mediaRecorderRef.current
        if (recorder && recorder.state !== 'inactive') {
            recorder.stop()
        }

        const socket = socketRef.current
        if (socket?.connected) {
            socket.emit('stt:stop')
            setState((prev) => ({
                ...prev,
                status: 'recognizing',
            }))

            // 兜底超时：如果服务器没有发 stt:done，10秒后强制结束
            recognizingTimeoutRef.current = setTimeout(() => {
                setState((prev) => {
                    if (prev.status === 'recognizing') {
                        disconnectSttSocket()
                        return { status: 'idle', confirmedText: prev.confirmedText, currentText: '', error: null }
                    }
                    return prev
                })
            }, 10_000)
        } else {
            setState((prev) => ({
                ...prev,
                status: 'idle',
            }))
            disconnectSttSocket()
        }

        cleanupAudio()
    }, [])

    const reset = useCallback(() => {
        clearRecognizingTimeout()
        disconnectSttSocket()
        cleanupAudio()
        setState({ status: 'idle', confirmedText: '', currentText: '', error: null })
    }, [])

    function clearRecognizingTimeout() {
        if (recognizingTimeoutRef.current) {
            clearTimeout(recognizingTimeoutRef.current)
            recognizingTimeoutRef.current = null
        }
    }

    function cleanupAudio() {
        processorRef.current?.disconnect()
        sourceRef.current?.disconnect()
        audioContextRef.current?.close()
        streamRef.current?.getTracks().forEach((t) => t.stop())
        processorRef.current = null
        sourceRef.current = null
        audioContextRef.current = null
        mediaRecorderRef.current = null
        streamRef.current = null
        socketRef.current = null
    }

    return {
        state: { status: state.status, text, error: state.error },
        start,
        stop,
        reset,
        isAvailable,
        isConfigured,
    }
}
