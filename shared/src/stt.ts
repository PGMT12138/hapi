/** STT 配置供应商 */
export type SttProvider = 'tencent'

/** STT 识别语言 */
export type SttLanguage = 'zh' | 'en' | 'auto'

/** STT 会话状态 */
export type SttSessionStatus = 'idle' | 'recording' | 'recognizing'

/** STT 识别结果 */
export interface SttResult {
    text: string
    isFinal: boolean
}

// --- Socket.IO 事件类型 ---

/** client → server 事件 */
export interface SttClientEvents {
    'stt:start': (data: { language: SttLanguage; mode?: 'pcm' | 'webm' }) => void
    'stt:audio': (data: { data: ArrayBuffer }) => void
    'stt:stop': () => void
}

/** server → client 事件 */
export interface SttServerEvents {
    'stt:started': (data: { sessionId: string }) => void
    'stt:result': (data: SttResult) => void
    'stt:done': () => void
    'stt:error': (data: { message: string }) => void
}

export const STT_DEFAULT_LANGUAGE: SttLanguage = 'zh'
export const STT_DEFAULT_REGION = 'ap-beijing'
export const STT_DEFAULT_APPID = ''

// --- 一句话识别 (Sentence Recognition) ---

/** 一句话识别请求 */
export interface SttSentenceRequest {
    audio: string  // base64 encoded PCM/ WAV audio
    language: SttLanguage
    format?: 'pcm' | 'wav'
}

/** 一句话识别响应 */
export interface SttSentenceResponse {
    text: string
}
