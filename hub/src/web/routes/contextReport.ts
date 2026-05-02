import { Hono } from 'hono'
import { z } from 'zod'
import type { Store } from '../../store'
import type { SyncEngine } from '../../sync/syncEngine'

const contextBodySchema = z.object({
    sid: z.string().min(1),
    data: z.object({
        context_window: z.object({
            total_input_tokens: z.number(),
            total_output_tokens: z.number(),
            context_window_size: z.number(),
            used_percentage: z.number().nullable().optional(),
            remaining_percentage: z.number().nullable().optional(),
            current_usage: z.object({
                input_tokens: z.number(),
                output_tokens: z.number(),
                cache_creation_input_tokens: z.number().optional(),
                cache_read_input_tokens: z.number().optional(),
            }).nullable().optional(),
        }).optional(),
        model: z.unknown().optional(),
        cost: z.unknown().optional(),
    }).passthrough().optional(),
}).passthrough()

export function createContextReportRoutes(
    store: Store,
    getSyncEngine: () => SyncEngine | null,
): Hono {
    const app = new Hono()

    app.post('/sessions/context', async (c) => {
        const body = await c.req.json().catch(() => null)
        const parsed = contextBodySchema.safeParse(body)
        if (!parsed.success) {
            return c.json({ success: false, error: 'Invalid body' }, 400)
        }

        const { sid, data } = parsed.data
        const cw = data?.context_window
        if (!cw) {
            return c.json({ success: true })
        }

        const engine = getSyncEngine()
        if (!engine) {
            return c.json({ success: false, error: 'Engine not available' }, 503)
        }

        const session = engine.getSession(sid)
        if (!session) {
            return c.json({ success: false, error: 'Session not found' }, 404)
        }

        const contextWindowData: Record<string, unknown> = {
            totalInputTokens: cw.total_input_tokens,
            totalOutputTokens: cw.total_output_tokens,
            contextWindowSize: cw.context_window_size,
        }

        if (cw.used_percentage != null) {
            contextWindowData.usedPercentage = cw.used_percentage
        }
        if (cw.current_usage) {
            contextWindowData.currentUsage = {
                inputTokens: cw.current_usage.input_tokens,
                outputTokens: cw.current_usage.output_tokens,
                cacheCreationInputTokens: cw.current_usage.cache_creation_input_tokens,
                cacheReadInputTokens: cw.current_usage.cache_read_input_tokens,
            }
        }

        const currentMeta = (session.metadata ?? {}) as Record<string, unknown>
        const updatedMeta = { ...currentMeta, contextWindow: contextWindowData }

        const result = store.sessions.updateSessionMetadata(
            sid,
            updatedMeta,
            session.metadataVersion,
            session.namespace,
            { touchUpdatedAt: false },
        )

        if (result.result === 'version-mismatch') {
            const freshMeta = (result.value ?? {}) as Record<string, unknown>
            store.sessions.updateSessionMetadata(
                sid,
                { ...freshMeta, contextWindow: contextWindowData },
                result.version,
                session.namespace,
                { touchUpdatedAt: false },
            )
        }

        return c.json({ success: true })
    })

    return app
}
