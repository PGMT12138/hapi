import { useQuery } from '@tanstack/react-query'
import type { ApiClient } from '@/api/client'
import { queryKeys } from '@/lib/query-keys'

export function useCcSkillDetail(api: ApiClient | null, machineId: string | null, name: string | null) {
    const query = useQuery({
        queryKey: queryKeys.ccSkillDetail(machineId ?? '', name ?? ''),
        queryFn: async () => {
            if (!api || !machineId || !name) throw new Error('API unavailable')
            return await api.getCcSkillDetail(machineId, name)
        },
        enabled: Boolean(api && machineId && name),
    })

    return {
        detail: query.data?.detail ?? null,
        isLoading: query.isLoading,
        error: query.error instanceof Error ? query.error.message : query.error ? 'Failed to load skill detail' : null,
    }
}

export function useCcMcpServerDetail(api: ApiClient | null, machineId: string | null, name: string | null) {
    const query = useQuery({
        queryKey: queryKeys.ccMcpServerDetail(machineId ?? '', name ?? ''),
        queryFn: async () => {
            if (!api || !machineId || !name) throw new Error('API unavailable')
            return await api.getCcMcpServerDetail(machineId, name)
        },
        enabled: Boolean(api && machineId && name),
        // tools fetch can be slow, allow longer stale time
        staleTime: 30_000,
    })

    return {
        detail: query.data?.detail ?? null,
        isLoading: query.isLoading,
        error: query.error instanceof Error ? query.error.message : query.error ? 'Failed to load MCP server detail' : null,
    }
}
