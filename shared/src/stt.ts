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
    'stt:start': (data: { language: SttLanguage }) => void
    'stt:audio': (data: { data: ArrayBuffer }) => void
    'stt:stop': () => void
}

/** server → client 事件 */
export interface SttServerEvents {
    'stt:started': (data: { sessionId: string }) => void
    'stt:result': (data: SttResult) => void
    'stt:error': (data: { message: string }) => void
}

export const STT_DEFAULT_LANGUAGE: SttLanguage = 'zh'
export const STT_DEFAULT_REGION = 'ap-beijing'
