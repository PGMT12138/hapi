import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { ApiClient } from '@/api/client'
import { queryKeys } from '@/lib/query-keys'

export function useGlobalEnvActions(api: ApiClient | null, machineId: string | null) {
    const queryClient = useQueryClient()

    const invalidate = () => {
        if (machineId) {
            void queryClient.invalidateQueries({ queryKey: queryKeys.globalEnv(machineId) })
        }
    }

    const updateGlobalEnv = useMutation({
        mutationFn: async (env: Record<string, string>) => {
            if (!api || !machineId) throw new Error('API unavailable')
            return await api.setGlobalEnv(machineId, env)
        },
        onSuccess: invalidate,
    })

    return {
        updateGlobalEnv: updateGlobalEnv.mutateAsync,
        isPending: updateGlobalEnv.isPending,
    }
}
