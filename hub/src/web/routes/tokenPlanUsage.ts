import { Hono } from 'hono'
import type { SyncEngine } from '../../sync/syncEngine'
import type { WebAppEnv } from '../middleware/auth'
import { requireMachine } from './guards'

type Platform = 'zai' | 'zhipu'

type TokenPlanLimit = {
    type: string
    percentage?: number
    currentValue?: number
    usage?: number
    usageDetails?: Array<{ modelCode: string; usage: number }>
    nextResetTime?: string
    resetAt?: string
    windowStart?: string
    windowEnd?: string
    expiresAt?: string
    [key: string]: unknown
}

type TokenPlanUsageResponse = {
    available: boolean
    platform?: Platform
    quota?: {
        limits: TokenPlanLimit[]
    }
    modelUsage?: unknown
    toolUsage?: unknown
    error?: string
}

type CachedEntry<T> = {
    data: T
    expires: number
}

const envCache = new Map<string, CachedEntry<Record<string, string>>>()
const usageCache = new Map<string, CachedEntry<TokenPlanUsageResponse>>()

const ENV_CACHE_TTL = 300_000
const USAGE_CACHE_TTL = 30_000

function detectPlatform(baseUrl: string): { platform: Platform; baseDomain: string } | null {
    try {
        const parsed = new URL(baseUrl)
        const baseDomain = parsed.origin
        if (baseUrl.includes('api.z.ai')) {
            return { platform: 'zai', baseDomain }
        }
        if (baseUrl.includes('open.bigmodel.cn') || baseUrl.includes('dev.bigmodel.cn')) {
            return { platform: 'zhipu', baseDomain }
        }
    } catch {
        // invalid URL
    }
    return null
}

function formatDateTime(date: Date): string {
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

function getTimeWindow(): { startTime: string; endTime: string } {
    const now = new Date()
    const startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, now.getHours(), 0, 0, 0)
    const endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), 59, 59, 999)
    return {
        startTime: formatDateTime(startDate),
        endTime: formatDateTime(endDate)
    }
}

async function fetchUsageEndpoint(
    baseDomain: string,
    authToken: string,
    path: string,
    queryParams?: string
): Promise<unknown> {
    const url = queryParams ? `${baseDomain}${path}${queryParams}` : `${baseDomain}${path}`
    const response = await fetch(url, {
        method: 'GET',
        headers: {
            'Authorization': authToken,
            'Accept-Language': 'en-US,en',
            'Content-Type': 'application/json'
        }
    })
    if (!response.ok) {
        throw new Error(`HTTP ${response.status} from ${path}`)
    }
    return await response.json()
}

async function fetchAllUsage(
    baseDomain: string,
    authToken: string
): Promise<{ quota: unknown; modelUsage: unknown; toolUsage: unknown }> {
    const { startTime, endTime } = getTimeWindow()
    const queryParams = `?startTime=${encodeURIComponent(startTime)}&endTime=${encodeURIComponent(endTime)}`

    const [quota, modelUsage, toolUsage] = await Promise.all([
        fetchUsageEndpoint(baseDomain, authToken, '/api/monitor/usage/quota/limit'),
        fetchUsageEndpoint(baseDomain, authToken, '/api/monitor/usage/model-usage', queryParams),
        fetchUsageEndpoint(baseDomain, authToken, '/api/monitor/usage/tool-usage', queryParams)
    ])

    return { quota, modelUsage, toolUsage }
}

async function resolveEnv(
    engine: SyncEngine,
    machineId: string,
    directory: string
): Promise<Record<string, string>> {
    const cacheKey = `${machineId}:${directory}`
    const cached = envCache.get(cacheKey)
    if (cached && Date.now() < cached.expires) {
        return cached.data
    }

    let env: Record<string, string> = {}

    try {
        const projectResult = await engine.readProjectEnv(machineId, directory)
        if (projectResult.success && projectResult.env) {
            env = projectResult.env
        }
    } catch {
        // project env not available
    }

    if (!env.ANTHROPIC_BASE_URL) {
        try {
            const globalResult = await engine.readGlobalEnv(machineId)
            if (globalResult.success && globalResult.env) {
                env = { ...env, ...globalResult.env }
            }
        } catch {
            // global env not available
        }
    }

    envCache.set(cacheKey, { data: env, expires: Date.now() + ENV_CACHE_TTL })
    return env
}

export function createTokenPlanUsageRoutes(getSyncEngine: () => SyncEngine | null): Hono<WebAppEnv> {
    const app = new Hono<WebAppEnv>()

    app.get('/token-plan-usage', async (c) => {
        const engine = getSyncEngine()
        if (!engine) {
            return c.json({ available: false, error: 'Not connected' } satisfies TokenPlanUsageResponse, 503)
        }

        const machineId = c.req.query('machineId')
        const directory = c.req.query('directory')
        if (!machineId || !directory) {
            return c.json({ available: false, error: 'machineId and directory are required' } satisfies TokenPlanUsageResponse, 400)
        }

        const machine = requireMachine(c, engine, machineId)
        if (machine instanceof Response) {
            return machine
        }

        const usageCacheKey = `${machineId}:${directory}`
        const cachedUsage = usageCache.get(usageCacheKey)
        if (cachedUsage && Date.now() < cachedUsage.expires) {
            return c.json(cachedUsage.data)
        }

        try {
            const env = await resolveEnv(engine, machineId, directory)
            const baseUrl = env.ANTHROPIC_BASE_URL || ''
            const authToken = env.ANTHROPIC_AUTH_TOKEN || ''

            if (!authToken || !baseUrl) {
                const resp: TokenPlanUsageResponse = { available: false }
                usageCache.set(usageCacheKey, { data: resp, expires: Date.now() + USAGE_CACHE_TTL })
                return c.json(resp)
            }

            const detected = detectPlatform(baseUrl)
            if (!detected) {
                const resp: TokenPlanUsageResponse = { available: false }
                usageCache.set(usageCacheKey, { data: resp, expires: Date.now() + USAGE_CACHE_TTL })
                return c.json(resp)
            }

            const { platform, baseDomain } = detected
            const { quota, modelUsage, toolUsage } = await fetchAllUsage(baseDomain, authToken)

            const quotaData = quota as { data?: { limits?: TokenPlanLimit[] } } | null
            const limits = quotaData?.data?.limits ?? []

            const resp: TokenPlanUsageResponse = {
                available: true,
                platform,
                quota: { limits },
                modelUsage: (modelUsage as { data?: unknown })?.data ?? modelUsage,
                toolUsage: (toolUsage as { data?: unknown })?.data ?? toolUsage
            }

            usageCache.set(usageCacheKey, { data: resp, expires: Date.now() + USAGE_CACHE_TTL })
            return c.json(resp)
        } catch (error) {
            const resp: TokenPlanUsageResponse = {
                available: true,
                error: error instanceof Error ? error.message : 'Failed to fetch usage data'
            }
            usageCache.set(usageCacheKey, { data: resp, expires: Date.now() + USAGE_CACHE_TTL })
            return c.json(resp)
        }
    })

    return app
}
