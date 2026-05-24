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
}

class TencentSttSession implements SttSession {
    private ws: WebSocket | null = null
    private resultCallback: ((result: SttResult) => void) | null = null
    private errorCallback: ((error: Error) => void) | null = null
    private endResolve: (() => void) | null = null
    private endReject: ((error: Error) => void) | null = null
    private ended = false

    constructor(
        private readonly config: SttSessionConfig,
    ) {}

    async connect(): Promise<void> {
        const url = this.buildSignedUrl()
        return new Promise<void>((resolve, reject) => {
            this.ws = new WebSocket(url)

            this.ws.on('open', () => {
                // No start frame needed for the v2 API - all params are in the URL
                resolve()
            })

            this.ws.on('message', (data: WsData) => {
                this.handleMessage(data)
            })

            this.ws.on('error', (err: Error) => {
                if (this.errorCallback) {
                    this.errorCallback(err)
                }
                if (this.endReject) {
                    this.endReject(err)
                }
            })

            this.ws.on('close', () => {
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

    private handleMessage(data: WsData): void {
        try {
            const msg: TencentAsrMessage = JSON.parse(data.toString())

            if (msg.code !== 0) {
                if (this.errorCallback) {
                    this.errorCallback(new Error(`Tencent ASR error [${msg.code}]: ${msg.message}`))
                }
                return
            }

            if (msg.result && this.resultCallback) {
                // slice_type: 0=开始, 1=中间结果, 2=最终结果
                this.resultCallback({
                    text: msg.result.voice_text_str,
                    isFinal: msg.result.is_end === 1 && msg.result.slice_type === 2,
                })
            }
        } catch {
            // Ignore malformed messages
        }
    }

    /**
     * Build the signed WebSocket URL for Tencent Cloud ASR v2 API.
     *
     * Signing steps:
     * 1. Collect all params except signature
     * 2. Sort by key in dictionary order
     * 3. Join as key1=value1&key2=value2&...
     * 4. HMAC-SHA1 with secretKey, then base64 encode
     */
    private buildSignedUrl(): string {
        const timestamp = Math.floor(Date.now() / 1000)
        const expired = timestamp + 86400
        const nonce = Math.floor(Math.random() * 100000)
        const voiceId = randomUUID().replace(/-/g, '').slice(0, 16)

        const engineModel = this.getEngineModel()

        // All params except signature, sorted by key
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

        // Build signature string: sort keys, join as key=value&
        const sortedKeys = Object.keys(params).sort()
        const signStr = sortedKeys.map(k => `${k}=${params[k]}`).join('&')

        // HMAC-SHA1 with secretKey, base64 encode
        const signature = createHmac('sha1', this.config.secretKey)
            .update(signStr)
            .digest('base64')

        // Build URL with all params including signature
        const allParams = { ...params, signature }
        const qs = new URLSearchParams(allParams).toString()

        return `wss://asr.cloud.tencent.com/asr/v2?${qs}`
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
