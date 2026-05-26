import { createHmac, createHash } from 'node:crypto'
import type { SttSessionConfig } from './types'

const SERVICE = 'asr'
const HOST = 'asr.tencentcloudapi.com'
const ACTION = 'SentenceRecognition'
const VERSION = '2019-06-14'

function getEngineModel(language: string): string {
    if (language === 'en') return '16k_en'
    if (language === 'yue') return '16k_yue'
    return '16k_zh'
}

function hmacSha256(key: Buffer | string, data: string): Buffer {
    return createHmac('sha256', key).update(data).digest()
}

/**
 * Build TC3-HMAC-SHA256 authorization header for Tencent Cloud API.
 */
function buildAuthHeaders(
    payload: string,
    config: SttSessionConfig,
    timestamp: number,
): Record<string, string> {
    const date = new Date(timestamp * 1000).toISOString().split('T')[0]
    const credentialScope = `${date}/${SERVICE}/tc3_request`

    const hashedPayload = createHash('sha256').update(payload).digest('hex')
    const contentType = 'application/json; charset=utf-8'

    const canonicalRequest = [
        'POST',
        '/',
        '',
        `content-type:${contentType}`,
        `host:${HOST}`,
        '',
        'content-type;host',
        hashedPayload,
    ].join('\n')

    const hashedCanonicalRequest = createHash('sha256').update(canonicalRequest).digest('hex')
    const stringToSign = [
        'TC3-HMAC-SHA256',
        String(timestamp),
        credentialScope,
        hashedCanonicalRequest,
    ].join('\n')

    const secretDate = hmacSha256(`TC3${config.secretKey}`, date)
    const secretService = hmacSha256(secretDate, SERVICE)
    const secretSigning = hmacSha256(secretService, 'tc3_request')
    const signature = createHmac('sha256', secretSigning).update(stringToSign).digest('hex')

    const authorization = `TC3-HMAC-SHA256 Credential=${config.secretId}/${credentialScope}, SignedHeaders=content-type;host, Signature=${signature}`

    return {
        'Content-Type': contentType,
        'Host': HOST,
        'X-TC-Action': ACTION,
        'X-TC-Version': VERSION,
        'X-TC-Timestamp': String(timestamp),
        'X-TC-Region': config.region,
        'Authorization': authorization,
    }
}

export interface SentenceRecognitionResult {
    text: string
    audioDuration: number
}

export interface RecognizeOptions {
    format?: 'pcm' | 'wav'
}

/**
 * Call Tencent Cloud SentenceRecognition API.
 * Accepts raw PCM s16le 16kHz mono audio buffer.
 * Sends as raw PCM (VoiceFormat='pcm') by default — WAV wrapping is unnecessary
 * and can cause the API to return empty Result despite computing AudioDuration.
 */
export async function recognizeSentence(
    config: SttSessionConfig,
    pcmAudio: Buffer,
    language: string,
    options: RecognizeOptions = {},
): Promise<SentenceRecognitionResult> {
    let audioData: Buffer
    let voiceFormat: string

    if (options.format === 'wav') {
        audioData = wrapPcmInWav(pcmAudio, 16000, 1, 16)
        voiceFormat = 'wav'
    } else {
        audioData = pcmAudio
        voiceFormat = 'pcm'
    }

    const base64Audio = audioData.toString('base64')

    const body = {
        EngSerViceType: getEngineModel(language),
        SourceType: 1,
        VoiceFormat: voiceFormat,
        Data: base64Audio,
        DataLen: audioData.length,
        ConvertNumMode: 1,
    }

    const payload = JSON.stringify(body)
    const timestamp = Math.floor(Date.now() / 1000)
    const headers = buildAuthHeaders(payload, config, timestamp)

    const response = await fetch(`https://${HOST}`, {
        method: 'POST',
        headers,
        body: payload,
    })

    if (!response.ok) {
        throw new Error(`SentenceRecognition HTTP ${response.status}: ${await response.text()}`)
    }

    const json = await response.json() as {
        Response: {
            Result?: string
            AudioDuration?: number
            Error?: { Code: string; Message: string }
            RequestId: string
        }
    }

    const text = json.Response.Result ?? ''
    console.log(`[STT-Sentence] format=${voiceFormat} audioBytes=${audioData.length} audioDuration=${json.Response.AudioDuration ?? 0} text="${text}" requestId=${json.Response.RequestId}`)
    if (json.Response.Error) {
        throw new Error(`SentenceRecognition error [${json.Response.Error.Code}]: ${json.Response.Error.Message}`)
    }

    return {
        text,
        audioDuration: json.Response.AudioDuration ?? 0,
    }
}

/**
 * Create a WAV file header + PCM data buffer.
 */
function wrapPcmInWav(pcm: Buffer, sampleRate: number, channels: number, bitsPerSample: number): Buffer {
    const byteRate = sampleRate * channels * (bitsPerSample / 8)
    const blockAlign = channels * (bitsPerSample / 8)
    const dataSize = pcm.length
    const headerSize = 44
    const wav = Buffer.alloc(headerSize + dataSize)

    // RIFF header
    wav.write('RIFF', 0)
    wav.writeUInt32LE(36 + dataSize, 4)
    wav.write('WAVE', 8)

    // fmt chunk
    wav.write('fmt ', 12)
    wav.writeUInt32LE(16, 16)           // chunk size
    wav.writeUInt16LE(1, 20)            // PCM format
    wav.writeUInt16LE(channels, 22)
    wav.writeUInt32LE(sampleRate, 24)
    wav.writeUInt32LE(byteRate, 28)
    wav.writeUInt16LE(blockAlign, 32)
    wav.writeUInt16LE(bitsPerSample, 34)

    // data chunk
    wav.write('data', 36)
    wav.writeUInt32LE(dataSize, 40)
    pcm.copy(wav, 44)

    return wav
}
