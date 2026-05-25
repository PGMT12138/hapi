import { createHmac, randomUUID } from 'node:crypto'
import WebSocket from 'ws'
import type { SttProvider, SttSession, SttSessionConfig, SttResult } from './types'

type WsData = Buffer | ArrayBuffer | Buffer[]

interface TencentAsrMessage {
    code: number
    message: string
    result?: {
        voice_text_str: string
        is_end: number
        slice_type: number
    }
    final?: number
}

class TencentSttSession implements SttSession {
    private ws: WebSocket | null = null
    private resultCallback: ((result: SttResult) => void) | null = null
    private errorCallback: ((error: Error) => void) | null = null
    private doneCallback: (() => void) | null = null
    private endResolve: (() => void) | null = null
    private endReject: ((error: Error) => void) | null = null
    private ended = false
    private currentPartialText = ''

    constructor(
        private readonly config: SttSessionConfig,
    ) {}

    async connect(): Promise<void> {
        const { url, signStr } = this.buildSignedUrl()
        console.log(`[STT-Tencent] Connecting to ASR WebSocket...`)
        return new Promise<void>((resolve, reject) => {
            this.ws = new WebSocket(url)

            this.ws.on('open', () => {
                console.log('[STT-Tencent] WebSocket connected')
                resolve()
            })

            this.ws.on('message', (data: WsData) => {
                this.handleMessage(data)
            })

            this.ws.on('error', (err: Error) => {
                console.error('[STT-Tencent] WebSocket error:', err.message)
                if (this.errorCallback) {
                    this.errorCallback(err)
                }
                if (this.endReject) {
                    this.endReject(err)
                }
            })

            this.ws.on('close', () => {
                console.log('[STT-Tencent] WebSocket closed')
                if (this.endResolve) {
                    this.endResolve()
                }
            })

            this.ws.once('error', (err: Error) => {
                reject(err)
            })
        })
    }

    sendAudio(audio: Buffer): void {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(audio)
        }
    }

    async endSession(): Promise<void> {
        if (this.ended) return
        this.ended = true
        console.log('[STT-Tencent] endSession called')

        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            const endFrame = { type: 'end' }
            this.ws.send(JSON.stringify(endFrame))

            return new Promise<void>((resolve, reject) => {
                this.endResolve = resolve
                this.endReject = reject
                setTimeout(() => {
                    this.cleanup()
                    resolve()
                }, 5000)
            })
        }
    }

    onResult(callback: (result: SttResult) => void): void {
        this.resultCallback = callback
    }

    onError(callback: (error: Error) => void): void {
        this.errorCallback = callback
    }

    onDone(callback: () => void): void {
        this.doneCallback = callback
    }

    private handleMessage(data: WsData): void {
        try {
            const msg: TencentAsrMessage = JSON.parse(data.toString())
            console.log(`[STT-Tencent] Message: code=${msg.code}${msg.result ? `, slice_type=${msg.result.slice_type}, text="${msg.result.voice_text_str}"` : ''}${msg.final !== undefined ? `, final=${msg.final}` : ''}`)

            if (msg.code !== 0) {
                if (this.errorCallback) {
                    this.errorCallback(new Error(`Tencent ASR error [${msg.code}]: ${msg.message}`))
                }
                return
            }

            if (msg.result && this.resultCallback) {
                if (msg.result.slice_type === 0) {
                    this.currentPartialText = ''
                }

                const fullText = msg.result.voice_text_str
                const isFinal = msg.result.is_end === 1 && msg.result.slice_type === 2

                if (isFinal) {
                    this.resultCallback({
                        text: fullText,
                        isFinal: true,
                    })
                    this.currentPartialText = ''
                } else {
                    const delta = fullText.slice(this.currentPartialText.length)
                    this.resultCallback({
                        text: delta,
                        isFinal: false,
                    })
                    this.currentPartialText = fullText
                }
            }

            if (msg.final === 1) {
                this.cleanup()
                this.doneCallback?.()
                return
            }
        } catch {
            // Ignore malformed messages
        }
    }

    /**
     * Build the signed WebSocket URL for Tencent Cloud ASR v2 API.
     *
     * URL format: wss://asr.cloud.tencent.com/asr/v2/<appid>?<params>
     *
     * Signing steps (per Tencent docs):
     * 1. Collect all params except signature, sort by key in dictionary order
     * 2. Build signing string: asr.cloud.tencent.com/asr/v2/<appid>?key1=value1&key2=value2...
     *    (the full URL without the wss:// protocol prefix)
     * 3. HMAC-SHA1 with secretKey, then base64 encode → signature
     * 4. URL-encode the signature value, then append to the full request URL
     */
    private buildSignedUrl(): { url: string; signStr: string } {
        const timestamp = Math.floor(Date.now() / 1000)
        const expired = timestamp + 86400
        const nonce = Math.floor(Math.random() * 100000)
        const voiceId = randomUUID().replace(/-/g, '').slice(0, 16)

        const engineModel = this.getEngineModel()

        const params: Record<string, string> = {
            engine_model_type: engineModel,
            expired: String(expired),
            needvad: '1',
            nonce: String(nonce),
            secretid: this.config.secretId,
            timestamp: String(timestamp),
            voice_format: '1',
            voice_id: voiceId,
        }

        // Step 1: sort params by key
        const sortedKeys = Object.keys(params).sort()
        const paramStr = sortedKeys.map(k => `${k}=${params[k]}`).join('&')

        // Step 2: build signing string (URL without protocol prefix)
        const signStr = `asr.cloud.tencent.com/asr/v2/${this.config.appId}?${paramStr}`

        // Step 3: HMAC-SHA1 with secretKey, base64 encode
        const signature = createHmac('sha1', this.config.secretKey)
            .update(signStr)
            .digest('base64')

        // Step 4: URL-encode the signature and build final URL
        const encodedSig = encodeURIComponent(signature)
        const url = `wss://asr.cloud.tencent.com/asr/v2/${this.config.appId}?${paramStr}&signature=${encodedSig}`

        return { url, signStr }
    }

    private getEngineModel(): string {
        if (this.config.language === 'en') return '16k_en'
        return '16k_zh'
    }

    private cleanup(): void {
        if (this.ws) {
            try { this.ws.close() } catch {}
            this.ws = null
        }
    }
}

export class TencentCloudSttProvider implements SttProvider {
    async startSession(config: SttSessionConfig): Promise<SttSession> {
        const session = new TencentSttSession(config)
        await session.connect()
        return session
    }
}
