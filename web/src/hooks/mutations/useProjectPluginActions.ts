import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { ApiClient } from '@/api/client'
import { queryKeys } from '@/lib/query-keys'

export function useProjectPluginActions(api: ApiClient | null, machineId: string | null, directory: string) {
    const queryClient = useQueryClient()

    const invalidate = () => {
        if (machineId && directory) {
            void queryClient.invalidateQueries({ queryKey: queryKeys.projectPlugins(machineId, directory) })
        }
    }

    const updatePluginStatus = useMutation({
        mutationFn: async ({ name, enabled }: { name: string; enabled: boolean }) => {
            if (!api || !machineId) throw new Error('API unavailable')
            return await api.updateProjectPluginStatus(machineId, directory, name, enabled)
        },
        onSuccess: invalidate,
    })

    const clearAll = useMutation({
        mutationFn: async () => {
            if (!api || !machineId) throw new Error('API unavailable')
            return await api.clearProjectPluginOverrides(machineId, directory)
        },
        onSuccess: invalidate,
    })

    return {
        updatePluginStatus: updatePluginStatus.mutateAsync,
        clearAll: clearAll.mutateAsync,
        isPending: updatePluginStatus.isPending || clearAll.isPending,
    }
}
