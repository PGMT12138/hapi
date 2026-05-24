import type { SttProvider, SttSession, SttResult, SttSessionConfig } from './types'
import { AudioTranscoder, detectInputFormat } from './transcoder'

export class SttSessionManager {
    private transcoder: AudioTranscoder | null = null
    private providerSession: SttSession | null = null

    async start(
        provider: SttProvider,
        config: SttSessionConfig,
        inputMimeType: string,
    ): Promise<void> {
        const inputFormat = detectInputFormat(inputMimeType)
        this.transcoder = new AudioTranscoder()
        this.providerSession = await provider.startSession(config)
        this.transcoder.start(inputFormat)
        this.transcoder.onData((pcmData) => {
            this.providerSession?.sendAudio(pcmData)
        })
    }

    sendAudio(chunk: Buffer): void {
        this.transcoder?.write(chunk)
    }

    stop(): void {
        this.transcoder?.end()
    }

    onResult(callback: (result: SttResult) => void): void {
        this.providerSession?.onResult(callback)
    }

    onError(callback: (error: Error) => void): void {
        this.providerSession?.onError(callback)
    }

    destroy(): void {
        this.transcoder?.destroy()
        try { this.providerSession?.endSession() } catch {}
        this.transcoder = null
        this.providerSession = null
    }
}
