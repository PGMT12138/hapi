import { useQuery } from '@tanstack/react-query'
import type { ApiClient } from '@/api/client'
import type { TokenPlanUsageResponse } from '@/types/api'
import { queryKeys } from '@/lib/query-keys'
import { useDeferredReady } from '@/hooks/useDeferredReady'

export function useTokenPlanUsage(
    api: ApiClient | null,
    machineId: string | null,
    directory: string | null
): {
    available: boolean
    data: TokenPlanUsageResponse | null
    isLoading: boolean
    error: string | null
    refetch: () => void
} {
    const deferredReady = useDeferredReady()
    const query = useQuery({
        queryKey: queryKeys.tokenPlanUsage(machineId ?? '', directory ?? ''),
        queryFn: async () => {
            if (!api || !machineId || !directory) throw new Error('API unavailable')
            return await api.getTokenPlanUsage(machineId, directory)
        },
        enabled: Boolean(api && machineId && directory) && deferredReady,
        staleTime: 30_000,
        refetchInterval: 30_000,
        retry: false,
    })

    const resp = query.data
    return {
        available: resp?.available ?? false,
        data: resp ?? null,
        isLoading: query.isLoading,
        error: resp?.error ?? (query.error instanceof Error ? query.error.message : null),
        refetch: () => { query.refetch() },
    }
}
