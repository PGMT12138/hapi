import type { SttProvider, SttSession, SttResult, SttSessionConfig } from './types'
import { AudioTranscoder, detectInputFormat } from './transcoder'

export class SttSessionManager {
    private transcoder: AudioTranscoder | null = null
    private providerSession: SttSession | null = null
    private resultCallback: ((result: SttResult) => void) | null = null
    private errorCallback: ((error: Error) => void) | null = null
    private doneCallback: (() => void) | null = null
    private pcmMode = false

    async start(
        provider: SttProvider,
        config: SttSessionConfig,
        inputMimeType: string,
    ): Promise<void> {
        const inputFormat = detectInputFormat(inputMimeType)
        this.pcmMode = inputFormat === 'pcm'

        console.log(`[STT] Starting session: format=${inputFormat}, pcmMode=${this.pcmMode}, lang=${config.language}, appId=${config.appId}`)

        this.providerSession = await provider.startSession(config)
        console.log('[STT] Provider session connected')

        if (this.resultCallback) {
            this.providerSession.onResult(this.resultCallback)
        }
        if (this.errorCallback) {
            this.providerSession.onError(this.errorCallback)
        }
        if (this.doneCallback) {
            this.providerSession.onDone(this.doneCallback)
        }

        if (this.pcmMode) {
            console.log('[STT] PCM direct passthrough mode, no transcoding needed')
        } else {
            this.transcoder = new AudioTranscoder()
            this.transcoder.start(inputFormat)
            this.transcoder.onData((pcmData) => {
                this.providerSession?.sendAudio(pcmData)
            })
            console.log('[STT] Transcoder started')
        }
    }

    sendAudio(chunk: Buffer): void {
        if (this.pcmMode) {
            this.providerSession?.sendAudio(chunk)
        } else {
            this.transcoder?.write(chunk)
        }
    }

    stop(): void {
        if (this.pcmMode) {
            console.log('[STT] Stop called (PCM mode), sending end frame to provider')
            this.providerSession?.endSession().catch((err) => {
                console.error('[STT] endSession error:', err.message)
            })
        } else {
            console.log('[STT] Stop called, ending transcoder')
            this.transcoder?.onEnd(() => {
                console.log('[STT] Transcoder finished, sending end frame to provider')
                this.providerSession?.endSession().catch((err) => {
                    console.error('[STT] endSession error:', err.message)
                })
            })
            this.transcoder?.end()
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

    destroy(): void {
        console.log('[STT] Destroy called')
        this.transcoder?.destroy()
        try { this.providerSession?.endSession() } catch {}
        this.transcoder = null
        this.providerSession = null
        this.pcmMode = false
    }
}
