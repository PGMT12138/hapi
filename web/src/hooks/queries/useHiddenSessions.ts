import { useQuery } from '@tanstack/react-query'
import type { ApiClient } from '@/api/client'
import { queryKeys } from '@/lib/query-keys'

export function useHiddenSessions(api: ApiClient | null) {
    const query = useQuery({
        queryKey: queryKeys.hiddenSessions,
        queryFn: async () => {
            if (!api) throw new Error('API unavailable')
            return await api.getHiddenSessions()
        },
        enabled: Boolean(api),
    })

    return {
        sessions: query.data?.sessions ?? [],
        isLoading: query.isLoading,
        error: query.error instanceof Error ? query.error.message : query.error ? 'Failed to load hidden sessions' : null,
        refetch: query.refetch,
    }
}
