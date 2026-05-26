export interface SttSessionConfig {
    provider: string
    language: string
    region: string
    appId: string
    secretId: string       // 腾讯云 SecretId
    secretKey: string      // 腾讯云 SecretKey
    apiKey: string         // 讯飞 APIKey
    apiSecret: string      // 讯飞 APISecret
}

export interface SttResult {
    text: string
    isFinal: boolean
    /** 为 true 时 text 为完整文本，前端应替换而非追加 */
    replace?: boolean
}

export interface SttProvider {
    startSession(config: SttSessionConfig): Promise<SttSession>
}

export interface SttSession {
    sendAudio(audio: Buffer): void
    endSession(): Promise<void>
    onResult(callback: (result: SttResult) => void): void
    onError(callback: (error: Error) => void): void
    onDone(callback: () => void): void
}
