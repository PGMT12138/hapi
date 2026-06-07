import { useQuery } from '@tanstack/react-query'
import type { ApiClient } from '@/api/client'
import { queryKeys } from '@/lib/query-keys'

export function useCcPluginDetail(api: ApiClient | null, machineId: string | null, name: string | null): {
    detail: {
        name: string
        description?: string
        version?: string
        author?: string
        homepage?: string
        license?: string
        installedAt?: string
        lastUpdated?: string
        installPath: string
        hasMcp: boolean
        mcpConfig?: Record<string, unknown>
        skills: Array<{ name: string; description?: string }>
        files: string[]
    } | null
    isLoading: boolean
    error: string | null
} {
    const query = useQuery({
        queryKey: queryKeys.ccPluginDetail(machineId ?? '', name ?? ''),
        queryFn: async () => {
            if (!api || !machineId || !name) throw new Error('API unavailable')
            return await api.getCcPluginDetail(machineId, name)
        },
        enabled: Boolean(api && machineId && name),
    })

    return {
        detail: query.data?.detail ?? null,
        isLoading: query.isLoading,
        error: query.error instanceof Error ? query.error.message : query.error ? 'Failed to load plugin detail' : null,
    }
}
