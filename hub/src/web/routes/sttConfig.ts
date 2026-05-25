import { Hono } from 'hono'
import { z } from 'zod'
import { STT_DEFAULT_LANGUAGE, STT_DEFAULT_REGION } from '@hapi/protocol/stt'
import type { SttProvider } from '@hapi/protocol/stt'
import type { Store } from '../../store'
import type { WebAppEnv } from '../middleware/auth'

const sttProviderSchema = z.enum(['tencent'] as const satisfies ReadonlyArray<SttProvider>)

const upsertSttConfigSchema = z.object({
    provider: sttProviderSchema,
    appId: z.string().min(1),
    secretId: z.string().min(1),
    secretKey: z.string().min(1),
    language: z.string().min(1),
    region: z.string().min(1)
})

function maskSecretKey(key: string): string {
    if (key.length <= 4) return '****'
    return '****' + key.slice(-4)
}

export function createSttConfigRoutes(store: Store): Hono<WebAppEnv> {
    const app = new Hono<WebAppEnv>()

    app.get('/stt/config', (c) => {
        const namespace = c.get('namespace')
        const config = store.sttConfig.get(namespace)
        if (!config) {
            return c.json({ config: null })
        }
        return c.json({
            config: {
                ...config,
                secretKey: maskSecretKey(config.secretKey)
            }
        })
    })

    app.put('/stt/config', async (c) => {
        const body = await c.req.json().catch(() => null)
        const parsed = upsertSttConfigSchema.safeParse(body)
        if (!parsed.success) {
            return c.json({ error: 'Invalid body' }, 400)
        }

        const namespace = c.get('namespace')
        const data = parsed.data

        // If secretKey starts with "****", don't update it - keep existing value
        const secretKey = data.secretKey?.startsWith('****') ? undefined : data.secretKey

        const config = store.sttConfig.upsert(namespace, {
            provider: data.provider,
            appId: data.appId,
            secretId: data.secretId,
            secretKey,
            language: data.language,
            region: data.region
        })

        return c.json({
            config: {
                ...config,
                secretKey: maskSecretKey(config.secretKey)
            }
        })
    })

    app.delete('/stt/config', (c) => {
        const namespace = c.get('namespace')
        const deleted = store.sttConfig.delete(namespace)
        if (!deleted) {
            return c.json({ error: 'STT config not found' }, 404)
        }
        return c.json({ ok: true })
    })

    return app
}
