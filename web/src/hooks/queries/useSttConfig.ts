import { useQuery } from '@tanstack/react-query'
import type { ApiClient } from '@/api/client'
import type { SttConfig } from '@/types/api'
import { queryKeys } from '@/lib/query-keys'

export function useSttConfig(api: ApiClient | null): {
    config: SttConfig | null
    isLoading: boolean
    error: string | null
} {
    const query = useQuery({
        queryKey: queryKeys.sttConfig,
        queryFn: async () => {
            if (!api) throw new Error('API unavailable')
            return await api.getSttConfig()
        },
        enabled: Boolean(api),
    })

    return {
        config: query.data?.config ?? null,
        isLoading: query.isLoading,
        error: query.error instanceof Error ? query.error.message : query.error ? 'Failed to load STT config' : null,
    }
}
