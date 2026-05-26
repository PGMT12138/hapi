import { Hono } from 'hono'
import { z } from 'zod'
import { STT_DEFAULT_LANGUAGE } from '@hapi/protocol/stt'
import { recognizeSentence } from '../../stt/tencent-sentence'
import type { Store } from '../../store'
import type { WebAppEnv } from '../middleware/auth'

const recognizeSchema = z.object({
    audio: z.string().min(1),
    language: z.enum(['zh', 'en', 'auto']).optional(),
    format: z.enum(['pcm', 'wav']).optional(),
})

export function createSttRoutes(store: Store): Hono<WebAppEnv> {
    const app = new Hono<WebAppEnv>()

    app.post('/stt/recognize', async (c) => {
        const namespace = c.get('namespace')
        if (!namespace) {
            return c.json({ error: 'Missing namespace' }, 400)
        }

        const body = await c.req.json().catch(() => null)
        const parsed = recognizeSchema.safeParse(body)
        if (!parsed.success) {
            return c.json({ error: 'Invalid body' }, 400)
        }

        const sttConfig = store.sttConfig.get(namespace)
        if (!sttConfig) {
            return c.json({ error: 'STT is not configured for this namespace' }, 400)
        }

        const { audio: base64Audio, language = STT_DEFAULT_LANGUAGE } = parsed.data

        let pcmBuffer: Buffer
        try {
            pcmBuffer = Buffer.from(base64Audio, 'base64')
        } catch {
            return c.json({ error: 'Invalid base64 audio data' }, 400)
        }

        if (pcmBuffer.length === 0) {
            return c.json({ text: '', audioDuration: 0 })
        }

        // 3MB limit for base64-decoded audio
        if (pcmBuffer.length > 3 * 1024 * 1024) {
            return c.json({ error: 'Audio data too large (max 3MB, ~60s of PCM)' }, 400)
        }

        try {
            const result = await recognizeSentence(
                {
                    language,
                    region: sttConfig.region,
                    appId: sttConfig.appId,
                    secretId: sttConfig.secretId,
                    secretKey: sttConfig.secretKey,
                },
                pcmBuffer,
                language,
            )
            return c.json({ text: result.text, audioDuration: result.audioDuration })
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Sentence recognition failed'
            console.error('[STT-Route] SentenceRecognition failed:', message)
            return c.json({ error: message }, 500)
        }
    })

    return app
}
