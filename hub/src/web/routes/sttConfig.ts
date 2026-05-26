import { Hono } from 'hono'
import { z } from 'zod'
import type { SttProvider } from '@hapi/protocol/stt'
import type { Store } from '../../store'
import type { WebAppEnv } from '../middleware/auth'

const sttProviderSchema = z.enum(['tencent', 'xunfei'] as const satisfies ReadonlyArray<SttProvider>)

const upsertSttConfigSchema = z.object({
    provider: sttProviderSchema,
    appId: z.string().min(1),
    secretId: z.string().optional(),
    secretKey: z.string().optional(),
    apiKey: z.string().optional(),
    apiSecret: z.string().optional(),
    language: z.string().min(1),
    region: z.string().min(1)
}).refine(
    (data) => data.provider === 'tencent' ? !!(data.secretId && data.secretKey) : true,
    { message: 'secretId and secretKey are required for tencent provider', path: ['secretId'] }
).refine(
    (data) => data.provider === 'xunfei' ? !!(data.apiKey && data.apiSecret) : true,
    { message: 'apiKey and apiSecret are required for xunfei provider', path: ['apiKey'] }
)

function maskSecret(key: string): string {
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
                secretKey: config.secretKey ? maskSecret(config.secretKey) : undefined,
                apiKey: config.apiKey ? maskSecret(config.apiKey) : undefined,
                apiSecret: config.apiSecret ? maskSecret(config.apiSecret) : undefined
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

        // If masked secrets start with "****", don't update them - keep existing values
        const secretKey = data.secretKey?.startsWith('****') ? undefined : data.secretKey
        const apiKey = data.apiKey?.startsWith('****') ? undefined : data.apiKey
        const apiSecret = data.apiSecret?.startsWith('****') ? undefined : data.apiSecret

        const config = store.sttConfig.upsert(namespace, {
            provider: data.provider,
            appId: data.appId,
            secretId: data.secretId,
            secretKey,
            apiKey,
            apiSecret,
            language: data.language,
            region: data.region
        })

        return c.json({
            config: {
                ...config,
                secretKey: config.secretKey ? maskSecret(config.secretKey) : undefined,
                apiKey: config.apiKey ? maskSecret(config.apiKey) : undefined,
                apiSecret: config.apiSecret ? maskSecret(config.apiSecret) : undefined
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
