import { Hono } from 'hono'
import { z } from 'zod'
import type { Store } from '../../store'
import type { WebAppEnv } from '../middleware/auth'

const createPresetSchema = z.object({
    name: z.string().trim().min(1).max(100),
    env: z.record(z.string(), z.string())
})

const updatePresetSchema = z.object({
    name: z.string().trim().min(1).max(100).optional(),
    env: z.record(z.string(), z.string()).optional()
})

export function createModelConfigPresetRoutes(store: Store): Hono<WebAppEnv> {
    const app = new Hono<WebAppEnv>()

    app.get('/model-config-presets', (c) => {
        const namespace = c.get('namespace')
        const presets = store.modelConfigPresets.list(namespace)
        return c.json({ presets })
    })

    app.post('/model-config-presets', async (c) => {
        const body = await c.req.json().catch(() => null)
        const parsed = createPresetSchema.safeParse(body)
        if (!parsed.success) {
            return c.json({ error: 'Invalid body' }, 400)
        }

        const namespace = c.get('namespace')
        try {
            const preset = store.modelConfigPresets.add(namespace, parsed.data)
            return c.json({ preset })
        } catch (e) {
            const msg = e instanceof Error ? e.message : 'Failed to create preset'
            if (msg.includes('UNIQUE constraint')) {
                return c.json({ error: 'Preset name already exists' }, 409)
            }
            return c.json({ error: msg }, 500)
        }
    })

    app.put('/model-config-presets/:id', async (c) => {
        const id = c.req.param('id')
        const body = await c.req.json().catch(() => null)
        const parsed = updatePresetSchema.safeParse(body)
        if (!parsed.success) {
            return c.json({ error: 'Invalid body' }, 400)
        }

        const namespace = c.get('namespace')
        try {
            const preset = store.modelConfigPresets.update(namespace, id, parsed.data)
            if (!preset) {
                return c.json({ error: 'Preset not found' }, 404)
            }
            return c.json({ preset })
        } catch (e) {
            const msg = e instanceof Error ? e.message : 'Failed to update preset'
            if (msg.includes('UNIQUE constraint')) {
                return c.json({ error: 'Preset name already exists' }, 409)
            }
            return c.json({ error: msg }, 500)
        }
    })

    app.delete('/model-config-presets/:id', (c) => {
        const id = c.req.param('id')
        const namespace = c.get('namespace')
        const deleted = store.modelConfigPresets.delete(namespace, id)
        if (!deleted) {
            return c.json({ error: 'Preset not found' }, 404)
        }
        return c.json({ ok: true })
    })

    return app
}
