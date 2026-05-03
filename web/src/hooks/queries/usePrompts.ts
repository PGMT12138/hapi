import { useQuery } from '@tanstack/react-query'
import type { ApiClient } from '@/api/client'
import { queryKeys } from '@/lib/query-keys'

export function usePrompts(api: ApiClient | null) {
    const query = useQuery({
        queryKey: queryKeys.prompts,
        queryFn: async () => {
            if (!api) throw new Error('API unavailable')
            return await api.getPrompts()
        },
        enabled: Boolean(api),
    })

    return {
        prompts: query.data?.prompts ?? [],
        isLoading: query.isLoading,
        error: query.error instanceof Error ? query.error.message : query.error ? 'Failed to load prompts' : null,
    }
}
