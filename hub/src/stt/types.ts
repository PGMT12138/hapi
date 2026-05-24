export interface SttSessionConfig {
    language: string
    region: string
    secretId: string
    secretKey: string
}

export interface SttResult {
    text: string
    isFinal: boolean
}

export interface SttProvider {
    startSession(config: SttSessionConfig): Promise<SttSession>
}

export interface SttSession {
    sendAudio(audio: Buffer): void
    endSession(): Promise<void>
    onResult(callback: (result: SttResult) => void): void
    onError(callback: (error: Error) => void): void
}
