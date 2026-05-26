import { Hono } from 'hono'
import { z } from 'zod'
import type { SttProvider } from '@hapi/protocol/stt'
import type { Store } from '../../store'
import type { WebAppEnv } from '../middleware/auth'

const sttProviderSchema = z.enum(['tencent', 'xunfei'] as const satisfies ReadonlyArray<SttProvider>)

function maskSecret(key: string): string {
    if (key.length <= 4) return '****'
    return '****' + key.slice(-4)
}

const upsertSttConfigSchema = z.object({
    provider: sttProviderSchema,
    appId: z.string().min(1),
    secretId: z.string().optional(),
    secretKey: z.string().optional(),
    apiKey: z.string().optional(),
    apiSecret: z.string().optional(),
    language: z.string().min(1),
    region: z.string().min(1),
    active: z.boolean().optional(),
}).refine(
    (data) => {
        if (data.provider === 'tencent') {
            return !!data.secretId && !!data.secretKey
        }
        if (data.provider === 'xunfei') {
            return !!data.apiKey && !!data.apiSecret
        }
        return true
    },
    { message: '服务商对应凭证字段不能为空' }
)

export function createSttConfigRoutes(store: Store): Hono<WebAppEnv> {
    const app = new Hono<WebAppEnv>()

    app.get('/stt/config', (c) => {
        const namespace = c.get('namespace')
        const configs = store.sttConfig.list(namespace)
        return c.json({
            configs: configs.map(cfg => ({
                ...cfg,
                secretKey: maskSecret(cfg.secretKey),
                apiKey: maskSecret(cfg.apiKey),
                apiSecret: maskSecret(cfg.apiSecret),
            }))
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

        const secretKey = data.secretKey?.startsWith('****') ? undefined : data.secretKey
        const apiKey = data.apiKey?.startsWith('****') ? undefined : data.apiKey
        const apiSecret = data.apiSecret?.startsWith('****') ? undefined : data.apiSecret

        const config = store.sttConfig.upsert(namespace, data.provider, {
            appId: data.appId,
            secretId: data.secretId,
            secretKey,
            apiKey,
            apiSecret,
            language: data.language,
            region: data.region,
            active: data.active,
        })

        return c.json({
            config: {
                ...config,
                secretKey: maskSecret(config.secretKey),
                apiKey: maskSecret(config.apiKey),
                apiSecret: maskSecret(config.apiSecret),
            }
        })
    })

    app.delete('/stt/config', (c) => {
        const namespace = c.get('namespace')
        const provider = c.req.query('provider')
        if (!provider) {
            return c.json({ error: 'Missing provider parameter' }, 400)
        }
        const deleted = store.sttConfig.delete(namespace, provider)
        if (!deleted) {
            return c.json({ error: 'STT config not found' }, 404)
        }
        return c.json({ ok: true })
    })

    app.patch('/stt/config/active', async (c) => {
        const namespace = c.get('namespace')
        const body = await c.req.json().catch(() => null)
        const parsed = z.object({ provider: sttProviderSchema }).safeParse(body)
        if (!parsed.success) {
            return c.json({ error: 'Invalid body' }, 400)
        }
        const config = store.sttConfig.setActive(namespace, parsed.data.provider)
        if (!config) {
            return c.json({ error: 'STT config not found' }, 404)
        }
        return c.json({
            config: {
                ...config,
                secretKey: maskSecret(config.secretKey),
                apiKey: maskSecret(config.apiKey),
                apiSecret: maskSecret(config.apiSecret),
            }
        })
    })

    return app
}
