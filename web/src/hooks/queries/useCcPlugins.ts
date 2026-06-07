import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { ApiClient } from '@/api/client'
import { queryKeys } from '@/lib/query-keys'

interface CcPlugin {
    name: string
    description?: string
    version?: string
    author?: string
    homepage?: string
    installedAt?: string
    lastUpdated?: string
    installPath: string
    hasMcp: boolean
    skillCount: number
    enabled: boolean
}

export function useCcPlugins(api: ApiClient | null, machineId: string | null): {
    plugins: CcPlugin[]
    isLoading: boolean
    error: string | null
} {
    const query = useQuery({
        queryKey: queryKeys.ccPlugins(machineId ?? ''),
        queryFn: async () => {
            if (!api || !machineId) throw new Error('API unavailable')
            return await api.getCcPlugins(machineId)
        },
        enabled: Boolean(api && machineId),
    })

    return {
        plugins: query.data?.plugins ?? [],
        isLoading: query.isLoading,
        error: query.error instanceof Error ? query.error.message : query.error ? 'Failed to load plugins' : null,
    }
}

export function useCcPluginActions(api: ApiClient | null, machineId: string | null): {
    updatePluginStatus: (data: { name: string; enabled: boolean }) => Promise<void>
    isPending: boolean
} {
    const queryClient = useQueryClient()

    const mutation = useMutation({
        mutationFn: async (data: { name: string; enabled: boolean }) => {
            if (!api || !machineId) throw new Error('API unavailable')
            const result = await api.updateCcPluginStatus(machineId, data.name, data.enabled)
            if (!result.success) throw new Error(result.error || 'Failed to update plugin status')
        },
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: queryKeys.ccPlugins(machineId ?? '') })
        },
    })

    return {
        updatePluginStatus: mutation.mutateAsync,
        isPending: mutation.isPending,
    }
}
