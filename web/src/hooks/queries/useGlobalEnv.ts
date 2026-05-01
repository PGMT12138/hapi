import { useQuery } from '@tanstack/react-query'
import type { ApiClient } from '@/api/client'
import { queryKeys } from '@/lib/query-keys'

export function useGlobalEnv(api: ApiClient | null, machineId: string | null): {
    env: Record<string, string>
    isLoading: boolean
    error: string | null
} {
    const query = useQuery({
        queryKey: queryKeys.globalEnv(machineId ?? ''),
        queryFn: async () => {
            if (!api || !machineId) throw new Error('API unavailable')
            return await api.getGlobalEnv(machineId)
        },
        enabled: Boolean(api && machineId),
    })

    return {
        env: query.data?.env ?? {},
        isLoading: query.isLoading,
        error: query.error instanceof Error ? query.error.message : query.error ? 'Failed to load global env' : null,
    }
}
