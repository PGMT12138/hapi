import { Hono } from 'hono'
import { z } from 'zod'
import type { Store } from '../../store'
import type { WebAppEnv } from '../middleware/auth'

const addFavoriteSchema = z.object({
    agentType: z.string().trim().min(1),
    commandName: z.string().trim().min(1)
})

export function createSlashCommandFavoriteRoutes(store: Store): Hono<WebAppEnv> {
    const app = new Hono<WebAppEnv>()

    app.get('/slash-command-favorites', (c) => {
        const namespace = c.get('namespace')
        const agentType = c.req.query('agentType') ?? 'claude'
        const favorites = store.slashCommandFavorites.list(namespace, agentType)
        return c.json({ favorites })
    })

    app.post('/slash-command-favorites', async (c) => {
        const body = await c.req.json().catch(() => null)
        const parsed = addFavoriteSchema.safeParse(body)
        if (!parsed.success) {
            return c.json({ error: 'Invalid body' }, 400)
        }

        const namespace = c.get('namespace')
        try {
            const favorite = store.slashCommandFavorites.add(namespace, parsed.data.agentType, parsed.data.commandName)
            return c.json({ favorite })
        } catch (e) {
            const msg = e instanceof Error ? e.message : 'Failed to add favorite'
            if (msg.includes('UNIQUE constraint')) {
                return c.json({ error: 'Already favorited' }, 409)
            }
            return c.json({ error: msg }, 500)
        }
    })

    app.delete('/slash-command-favorites/:agentType/:commandName', (c) => {
        const agentType = c.req.param('agentType')
        const commandName = c.req.param('commandName')
        const namespace = c.get('namespace')
        const removed = store.slashCommandFavorites.remove(namespace, agentType, commandName)
        if (!removed) {
            return c.json({ error: 'Favorite not found' }, 404)
        }
        return c.json({ ok: true })
    })

    return app
}
