import { createHmac } from 'node:crypto'
import WebSocket from 'ws'
import type { SttProvider, SttSession, SttSessionConfig, SttResult } from './types'

type WsData = Buffer | ArrayBuffer | Buffer[]

interface XunfeiAsrMessage {
    code: number
    message: string
    sid: string
    data?: {
        result?: {
            sn: number
            ls: boolean
            bg: number
            ed: number
            ws: Array<{
                bg: number
                cw: Array<{ w: string }>
            }>
            pgs?: 'apd' | 'rpl'
            rg?: [number, number]
        }
        status: number
    }
}

class XunfeiSttSession implements SttSession {
    private ws: WebSocket | null = null
    private resultCallback: ((result: SttResult) => void) | null = null
    private errorCallback: ((error: Error) => void) | null = null
    private doneCallback: (() => void) | null = null
    private endResolve: (() => void) | null = null
    private endReject: ((error: Error) => void) | null = null
    private ended = false
    private resultSegments = new Map<number, string>()

    constructor(
        private readonly config: SttSessionConfig,
    ) {}

    async connect(): Promise<void> {
        const url = this.buildSignedUrl()
        console.log(`[STT-Xunfei] Connecting to ASR WebSocket...`)
        return new Promise<void>((resolve, reject) => {
            this.ws = new WebSocket(url)

            this.ws.on('open', () => {
                console.log('[STT-Xunfei] WebSocket connected')
                this.sendFirstFrame()
                resolve()
            })

            this.ws.on('message', (data: WsData) => {
                this.handleMessage(data)
            })

            this.ws.on('error', (err: Error) => {
                console.error('[STT-Xunfei] WebSocket error:', err.message)
                this.errorCallback?.(err)
                this.endReject?.(err)
            })

            this.ws.on('close', () => {
                console.log('[STT-Xunfei] WebSocket closed')
                this.endResolve?.()
            })

            this.ws.once('error', (err: Error) => {
                reject(err)
            })
        })
    }

    sendAudio(audio: Buffer): void {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            const frame = {
                data: {
                    status: 1,
                    format: 'audio/L16;rate=16000',
                    encoding: 'raw',
                    audio: audio.toString('base64'),
                },
            }
            this.ws.send(JSON.stringify(frame))
        }
    }

    async endSession(): Promise<void> {
        if (this.ended) return
        this.ended = true
        console.log('[STT-Xunfei] endSession called')

        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            const endFrame = {
                data: {
                    status: 2,
                    format: 'audio/L16;rate=16000',
                    encoding: 'raw',
                    audio: '',
                },
            }
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

    private buildSignedUrl(): string {
        const host = 'iat-api.xfyun.cn'
        const path = '/v2/iat'
        const date = new Date().toUTCString()

        const signatureOrigin = `host: ${host}\ndate: ${date}\nGET ${path} HTTP/1.1`

        const signature = createHmac('sha256', this.config.apiSecret)
            .update(signatureOrigin)
            .digest('base64')

        const authorizationOrigin = `api_key="${this.config.apiKey}", algorithm="hmac-sha256", headers="host date request-line", signature="${signature}"`

        const authorization = Buffer.from(authorizationOrigin).toString('base64')

        const encodedAuth = encodeURIComponent(authorization)
        const encodedDate = encodeURIComponent(date)
        return `wss://${host}${path}?authorization=${encodedAuth}&date=${encodedDate}&host=${host}`
    }

    private sendFirstFrame(): void {
        const language = this.config.language === 'en' ? 'en_us' : 'zh_cn'
        const accent = this.config.language === 'en' ? '' : 'mandarin'

        const business: Record<string, unknown> = {
            language,
            domain: 'iat',
            accent,
            dwa: 'wpgs',
            ptt: 1,
            eos: 3000,
        }
        if (!accent) {
            delete business.accent
        }

        const frame = {
            common: { app_id: this.config.appId },
            business,
            data: {
                status: 0,
                format: 'audio/L16;rate=16000',
                encoding: 'raw',
                audio: '',
            },
        }
        this.ws?.send(JSON.stringify(frame))
        console.log(`[STT-Xunfei] First frame sent: language=${language}, accent=${accent || '(none)'}`)
    }

    private handleMessage(data: WsData): void {
        try {
            const msg: XunfeiAsrMessage = JSON.parse(data.toString())
            console.log(`[STT-Xunfei] Message: code=${msg.code}${msg.data?.result ? `, sn=${msg.data.result.sn}, pgs=${msg.data.result.pgs ?? 'none'}, status=${msg.data.status}` : ''}`)

            if (msg.code !== 0) {
                this.errorCallback?.(new Error(`Xunfei ASR error [${msg.code}]: ${msg.message}`))
                return
            }

            if (msg.data?.result && this.resultCallback) {
                const result = msg.data.result
                const text = result.ws.map(w => w.cw.map(c => c.w).join('')).join('')

                if (result.pgs === 'rpl' && result.rg) {
                    const [start, end] = result.rg
                    for (let i = start; i <= end; i++) {
                        this.resultSegments.delete(i)
                    }
                    this.resultSegments.set(result.sn, text)

                    const fullText = this.reconstructText()
                    this.resultCallback({
                        text: fullText,
                        isFinal: false,
                        replace: true,
                    })
                } else {
                    this.resultSegments.set(result.sn, text)

                    const isFinal = result.ls === true && msg.data.status === 2
                    if (isFinal) {
                        const fullText = this.reconstructText()
                        this.resultCallback({
                            text: fullText,
                            isFinal: true,
                        })
                        this.resultSegments.clear()
                    } else if (result.pgs === 'apd') {
                        this.resultCallback({
                            text,
                            isFinal: false,
                        })
                    } else {
                        const fullText = this.reconstructText()
                        this.resultCallback({
                            text: fullText,
                            isFinal: false,
                            replace: true,
                        })
                    }
                }
            }

            if (msg.data?.status === 2) {
                this.cleanup()
                this.doneCallback?.()
            }
        } catch {
            // Ignore malformed messages
        }
    }

    private reconstructText(): string {
        const keys = [...this.resultSegments.keys()].sort((a, b) => a - b)
        return keys.map(k => this.resultSegments.get(k)!).join('')
    }

    private cleanup(): void {
        if (this.ws) {
            try { this.ws.close() } catch {}
            this.ws = null
        }
        this.resultSegments.clear()
    }
}

export class XunfeiSttProvider implements SttProvider {
    async startSession(config: SttSessionConfig): Promise<SttSession> {
        const session = new XunfeiSttSession(config)
        await session.connect()
        return session
    }
}
