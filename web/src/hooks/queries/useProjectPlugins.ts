import { useQuery } from '@tanstack/react-query'
import type { ApiClient } from '@/api/client'
import { queryKeys } from '@/lib/query-keys'

export interface ProjectPlugin {
    name: string
    pluginKey: string
    description?: string
    version?: string
    author?: string
    homepage?: string
    hasMcp: boolean
    skillCount: number
    globalEnabled: boolean
    projectEnabled: boolean | null
    managedLocally: boolean
    effectiveEnabled: boolean
}

export function useProjectPlugins(api: ApiClient | null, machineId: string | null, directory: string | null): {
    plugins: ProjectPlugin[]
    isLoading: boolean
    error: string | null
} {
    const trimmedDirectory = directory?.trim() ?? ''
    const query = useQuery({
        queryKey: queryKeys.projectPlugins(machineId ?? '', trimmedDirectory),
        queryFn: async () => {
            if (!api || !machineId || !trimmedDirectory) throw new Error('API unavailable')
            return await api.getProjectPlugins(machineId, trimmedDirectory)
        },
        enabled: Boolean(api && machineId && trimmedDirectory),
    })

    return {
        plugins: query.data?.plugins ?? [],
        isLoading: query.isLoading,
        error: query.error instanceof Error ? query.error.message : query.error ? 'Failed to load project plugins' : null,
    }
}
