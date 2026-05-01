import { useQuery } from '@tanstack/react-query'
import type { ApiClient } from '@/api/client'
import type { ModelConfigPreset } from '@/types/api'
import { queryKeys } from '@/lib/query-keys'

export function useModelConfigPresets(api: ApiClient | null): {
    presets: ModelConfigPreset[]
    isLoading: boolean
    error: string | null
} {
    const query = useQuery({
        queryKey: queryKeys.modelConfigPresets,
        queryFn: async () => {
            if (!api) throw new Error('API unavailable')
            return await api.getModelConfigPresets()
        },
        enabled: Boolean(api),
    })

    return {
        presets: query.data?.presets ?? [],
        isLoading: query.isLoading,
        error: query.error instanceof Error ? query.error.message : query.error ? 'Failed to load presets' : null,
    }
}
