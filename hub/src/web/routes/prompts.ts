import { Hono } from 'hono'
import { z } from 'zod'
import type { Store } from '../../store'
import type { WebAppEnv } from '../middleware/auth'

const createPromptSchema = z.object({
    name: z.string().trim().min(1).max(200),
    content: z.string().min(1)
})

const updatePromptSchema = z.object({
    name: z.string().trim().min(1).max(200).optional(),
    content: z.string().min(1).optional()
})

export function createPromptRoutes(store: Store): Hono<WebAppEnv> {
    const app = new Hono<WebAppEnv>()

    app.get('/prompts', (c) => {
        const namespace = c.get('namespace')
        const prompts = store.prompts.list(namespace)
        return c.json({ prompts })
    })

    app.post('/prompts', async (c) => {
        const body = await c.req.json().catch(() => null)
        const parsed = createPromptSchema.safeParse(body)
        if (!parsed.success) {
            return c.json({ error: 'Invalid body' }, 400)
        }

        const namespace = c.get('namespace')
        try {
            const prompt = store.prompts.add(namespace, parsed.data)
            return c.json({ prompt })
        } catch (e) {
            const msg = e instanceof Error ? e.message : 'Failed to create prompt'
            if (msg.includes('UNIQUE constraint')) {
                return c.json({ error: 'Prompt name already exists' }, 409)
            }
            return c.json({ error: msg }, 500)
        }
    })

    app.put('/prompts/:id', async (c) => {
        const id = c.req.param('id')
        const body = await c.req.json().catch(() => null)
        const parsed = updatePromptSchema.safeParse(body)
        if (!parsed.success) {
            return c.json({ error: 'Invalid body' }, 400)
        }

        const namespace = c.get('namespace')
        try {
            const prompt = store.prompts.update(namespace, id, parsed.data)
            if (!prompt) {
                return c.json({ error: 'Prompt not found' }, 404)
            }
            return c.json({ prompt })
        } catch (e) {
            const msg = e instanceof Error ? e.message : 'Failed to update prompt'
            if (msg.includes('UNIQUE constraint')) {
                return c.json({ error: 'Prompt name already exists' }, 409)
            }
            return c.json({ error: msg }, 500)
        }
    })

    app.delete('/prompts/:id', (c) => {
        const id = c.req.param('id')
        const namespace = c.get('namespace')
        const deleted = store.prompts.delete(namespace, id)
        if (!deleted) {
            return c.json({ error: 'Prompt not found' }, 404)
        }
        return c.json({ ok: true })
    })

    return app
}
