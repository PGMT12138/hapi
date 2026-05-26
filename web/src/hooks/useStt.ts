import { useCallback, useEffect, useRef, useState } from 'react'
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

interface NativeSttAudioBridge {
    isAvailable(): boolean
    start(): boolean
    stop(): void
    requestPermission(): void
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

function getNativeBridge(): NativeSttAudioBridge | null {
    const w = window as unknown as { SttAudioBridge?: NativeSttAudioBridge }
    if (w.SttAudioBridge && w.SttAudioBridge.isAvailable()) {
        return w.SttAudioBridge
    }
    return null
}

function isInWebView(): boolean {
    return typeof (window as unknown as { SttAudioBridge?: unknown }).SttAudioBridge !== 'undefined'
}

function decodeBase64ToArrayBuffer(b64: string): ArrayBuffer {
    const bin = atob(b64)
    const buf = new ArrayBuffer(bin.length)
    const view = new Uint8Array(buf)
    for (let i = 0; i < bin.length; i++) {
        view[i] = bin.charCodeAt(i)
    }
    return buf
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
    const nativeBridgeRef = useRef<NativeSttAudioBridge | null>(null)
    const recognizingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const pcmChunksRef = useRef<Uint8Array[]>([])
    const sentenceRecognizingRef = useRef(false)
    const sttConfigRef = useRef(config)
    sttConfigRef.current = config

    // Track native bridge availability as state so permission changes trigger re-render
    const [bridgeAvailable, setBridgeAvailable] = useState(() => getNativeBridge() !== null)
    const webViewEnv = isInWebView()

    // Listen for permission grant notifications from native side
    useEffect(() => {
        if (!webViewEnv) return

        const handler = () => {
            const available = getNativeBridge() !== null
            setBridgeAvailable(available)
            if (available) {
                setState(prev => prev.error?.includes('麦克风权限') ? { ...prev, error: null } : prev)
            }
        }

        window.addEventListener('__hapiAudioPermissionGranted', handler)
        return () => window.removeEventListener('__hapiAudioPermissionGranted', handler)
    }, [webViewEnv])

    let nativeBridge = getNativeBridge()
    const hasNativeBridge = webViewEnv ? bridgeAvailable : (nativeBridge !== null)

    const hasUserMedia = typeof navigator !== 'undefined'
        && typeof navigator.mediaDevices?.getUserMedia === 'function'

    const hasAudioContext = typeof AudioContext !== 'undefined'
        || typeof (window as unknown as { webkitAudioContext?: unknown }).webkitAudioContext !== 'undefined'

    const hasMediaRecorder = typeof MediaRecorder !== 'undefined'

    // In WebView, only use native bridge — getUserMedia is broken on many Android devices
    const isAvailable = webViewEnv
        ? hasNativeBridge
        : (hasUserMedia && (hasAudioContext || hasMediaRecorder))

    const isConfigured = Boolean(config?.appId && config?.secretId && config?.secretKey)

    const text = state.confirmedText + state.currentText

    const start = useCallback(async () => {
        if (!isAvailable) {
            if (webViewEnv) {
                // In WebView, unavailability means permission not granted
                const bridge = (window as unknown as { SttAudioBridge?: NativeSttAudioBridge }).SttAudioBridge
                if (bridge) {
                    bridge.requestPermission()
                    setState(prev => ({ ...prev, error: '请在弹出的对话框中授予麦克风权限，然后重试' }))
                } else {
                    setState(prev => ({ ...prev, error: '当前环境不支持语音输入' }))
                }
            } else {
                setState(prev => ({ ...prev, error: '当前环境不支持语音输入，请使用 HTTPS 或 Chrome 浏览器' }))
            }
            return
        }
        if (!isConfigured) return

        clearRecognizingTimeout()
        disconnectSttSocket()
        cleanupAudio()

        setState({ status: 'recording', confirmedText: '', currentText: '', error: null })
        pcmChunksRef.current = []
        sentenceRecognizingRef.current = false

        try {
            let stream: MediaStream | null = null

            // In WebView, always use native bridge — getUserMedia is broken on many devices
            if (webViewEnv) {
                nativeBridgeRef.current = nativeBridge
            } else if (hasNativeBridge) {
                nativeBridgeRef.current = nativeBridge
            } else {
                stream = await navigator.mediaDevices.getUserMedia({ audio: true })
                streamRef.current = stream
            }

            const { getSttSocket } = await import('@/realtime/stt-socket')
            const socket = getSttSocket(serverUrl, token)
            socketRef.current = socket

            socket.off('stt:result')
            socket.off('stt:error')
            socket.off('stt:done')
            socket.off('stt:started')
            socket.off('connect_error')

            socket.on('stt:result', (result: { text: string; isFinal: boolean; replace?: boolean }) => {
                setState((prev) => {
                    if (result.isFinal) {
                        return {
                            ...prev,
                            confirmedText: prev.confirmedText + result.text,
                            currentText: '',
                        }
                    } else if (result.replace) {
                        return {
                            ...prev,
                            currentText: result.text,
                        }
                    } else {
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

            const usePcm = webViewEnv || hasNativeBridge || hasAudioContext

            socket.emit('stt:start', {
                language: (config?.language ?? 'zh') as SttLanguage,
                mode: usePcm ? 'pcm' as const : 'webm' as const,
            })

            await new Promise<void>((resolve, reject) => {
                const timeout = setTimeout(() => {
                    reject(new Error('STT session startup timeout'))
                }, 10_000)
                socket.once('stt:started', () => {
                    clearTimeout(timeout)
                    resolve()
                })
                socket.once('stt:error', (data: { message: string }) => {
                    clearTimeout(timeout)
                    reject(new Error(data.message))
                })
            })

            if (webViewEnv || hasNativeBridge) {
                startNativeCapture(socket)
            } else if (usePcm && stream) {
                startPcmCapture(stream, socket)
            } else if (stream) {
                startMediaRecorderCapture(stream, socket)
            }
        } catch (error) {
            const err = error instanceof Error ? error : new Error('Failed to start recording')
            const domName = error instanceof DOMException ? ` (${error.name})` : ''
            setState({
                status: 'idle',
                confirmedText: '',
                currentText: '',
                error: `${err.message}${domName}`,
            })
            cleanupAudio()
        }
    }, [isAvailable, isConfigured, config?.language, serverUrl, token, hasNativeBridge, hasAudioContext, nativeBridge, webViewEnv])

    function startNativeCapture(socket: Socket) {
        const bridge = nativeBridgeRef.current
        if (!bridge) throw new Error('Native audio bridge not available')

        // Register callback for native audio data
        const w = window as unknown as {
            __onSttAudioData?: (b64: string) => void
        }
        w.__onSttAudioData = (b64: string) => {
            if (socket.connected) {
                const buffer = decodeBase64ToArrayBuffer(b64)
                socket.emit('stt:audio', { data: buffer })
            }
            // Buffer PCM for sentence recognition
            const binary = atob(b64)
            const bytes = new Uint8Array(binary.length)
            for (let i = 0; i < binary.length; i++) {
                bytes[i] = binary.charCodeAt(i)
            }
            pcmChunksRef.current.push(bytes)
        }

        const started = bridge.start()
        if (!started) {
            w.__onSttAudioData = undefined
            throw new Error('原生音频录制启动失败，请检查麦克风是否被其他应用占用')
        }
    }

    function startPcmCapture(stream: MediaStream, socket: Socket) {
        const AudioCtx = AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
        const audioContext = new AudioCtx()
        audioContextRef.current = audioContext

        if (audioContext.state === 'suspended') {
            audioContext.resume()
        }

        const source = audioContext.createMediaStreamSource(stream)
        sourceRef.current = source

        const processor = audioContext.createScriptProcessor(4096, 1, 1)
        processorRef.current = processor

        processor.onaudioprocess = (e) => {
            const inputData = e.inputBuffer.getChannelData(0)
            const pcm16 = downsampleAndConvertTo16BitPCM(inputData, audioContext.sampleRate, 16000)
            if (pcm16.length > 0) {
                if (socket.connected) {
                    socket.emit('stt:audio', { data: pcm16.buffer as ArrayBuffer })
                }
                // Buffer PCM for sentence recognition
                pcmChunksRef.current.push(new Uint8Array(pcm16.buffer, pcm16.byteOffset, pcm16.byteLength))
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
        // Stop native bridge if active
        const bridge = nativeBridgeRef.current
        if (bridge) {
            bridge.stop()
        }

        const recorder = mediaRecorderRef.current
        if (recorder && recorder.state !== 'inactive') {
            recorder.stop()
        }

        // Capture PCM chunks before cleanup
        const pcmChunks = pcmChunksRef.current
        pcmChunksRef.current = []

        const socket = socketRef.current
        if (socket?.connected) {
            socket.emit('stt:stop')
            setState((prev) => ({
                ...prev,
                status: 'recognizing',
            }))

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

        // Run sentence recognition in background — replace text when done
        // Xunfei uses real-time streaming with replace corrections; skip sentence recognition
        const isXunfei = sttConfigRef.current?.provider === 'xunfei'
        if (isXunfei) return

        if (pcmChunks.length > 0 && api && isConfigured) {
            const totalLen = pcmChunks.reduce((sum, c) => sum + c.length, 0)
            // Skip if audio is too short (< 0.3s)
            if (totalLen < 16000 * 2 * 0.3) return

            // Cap at ~60s of 16kHz 16-bit mono
            const maxBytes = 16000 * 2 * 60
            let chunks = pcmChunks
            if (totalLen > maxBytes) {
                chunks = []
                let accumulated = 0
                for (const c of pcmChunks) {
                    if (accumulated + c.length > maxBytes) {
                        const remaining = maxBytes - accumulated
                        if (remaining > 0) chunks.push(c.slice(0, remaining))
                        break
                    }
                    chunks.push(c)
                    accumulated += c.length
                }
            }

            sentenceRecognizingRef.current = true
            try {
                const merged = new Uint8Array(chunks.reduce((s, c) => s + c.length, 0))
                let offset = 0
                for (const c of chunks) {
                    merged.set(c, offset)
                    offset += c.length
                }

                // Convert Uint8Array to base64 in chunks to avoid stack overflow
                let base64Audio = ''
                const chunkSize = 8192
                for (let i = 0; i < merged.length; i += chunkSize) {
                    const slice = merged.subarray(i, Math.min(i + chunkSize, merged.length))
                    base64Audio += String.fromCharCode(...slice)
                }
                base64Audio = btoa(base64Audio)

                const res = await fetch(`${serverUrl}/api/stt/recognize`, {
                    method: 'POST',
                    headers: {
                        'content-type': 'application/json',
                        'authorization': `Bearer ${token}`,
                    },
                    body: JSON.stringify({
                        audio: base64Audio,
                        language: config?.language ?? 'zh',
                        format: 'pcm',
                    }),
                })

                if (res.ok) {
                    const data = await res.json() as { text?: string; error?: string }
                    if (data.text && sentenceRecognizingRef.current) {
                        setState(prev => {
                            if (prev.status === 'idle' || prev.status === 'recognizing') {
                                return { status: 'idle', confirmedText: data.text!, currentText: '', error: null }
                            }
                            return prev
                        })
                    }
                }
            } catch {
                // Sentence recognition failed — keep real-time result
            } finally {
                sentenceRecognizingRef.current = false
            }
        }
    }, [api, isConfigured, config?.language, serverUrl, token])

    const reset = useCallback(() => {
        clearRecognizingTimeout()
        disconnectSttSocket()
        cleanupAudio()
        pcmChunksRef.current = []
        sentenceRecognizingRef.current = false
        setState({ status: 'idle', confirmedText: '', currentText: '', error: null })
    }, [])

    function clearRecognizingTimeout() {
        if (recognizingTimeoutRef.current) {
            clearTimeout(recognizingTimeoutRef.current)
            recognizingTimeoutRef.current = null
        }
    }

    function cleanupAudio() {
        const bridge = nativeBridgeRef.current
        if (bridge) {
            bridge.stop()
            nativeBridgeRef.current = null
        }
        const w = window as unknown as { __onSttAudioData?: unknown }
        w.__onSttAudioData = undefined
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
