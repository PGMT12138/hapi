import { createHmac } from 'node:crypto'
import WebSocket from 'ws'
import type { SttProvider, SttSession, SttSessionConfig, SttResult } from './types'

type WsData = Buffer | ArrayBuffer | Buffer[]

interface TencentAsrMessage {
    code: number
    message: string
    result?: {
        voice_text_str: string
        is_end: number
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
                const startFrame = {
                    type: 'start',
                    engine_model_type: this.getEngineModel(),
                    voice_format: 1,
                    needvad: 1,
                    hotword_id: '',
                    filter_dirty: 1,
                    filter_modal: 1,
                    filter_punc: 1,
                    convert_num_mode: 1,
                    word_info: 0,
                }
                this.ws!.send(JSON.stringify(startFrame))
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
                // Timeout after 5 seconds if no close event
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
                this.resultCallback({
                    text: msg.result.voice_text_str,
                    isFinal: msg.result.is_end === 1,
                })
            }
        } catch {
            // Ignore malformed messages
        }
    }

    private buildSignedUrl(): string {
        const timestamp = Math.floor(Date.now() / 1000)
        const expired = timestamp + 86400

        const stringToSign = `${this.config.secretId}${timestamp}${expired}`
        const signature = createHmac('sha1', this.config.secretKey)
            .update(stringToSign)
            .digest('base64')

        const params = new URLSearchParams({
            secretid: this.config.secretId,
            timestamp: String(timestamp),
            expired: String(expired),
            nonce: String(Math.floor(Math.random() * 100000)),
            engine_model_type: this.getEngineModel(),
            voice_format: '1',
            needvad: '1',
            signature,
        })

        return `wss://asr.cloud.tencent.com/asr/v2?${params.toString()}`
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
