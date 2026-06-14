import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { ApiClient } from '@/api/client'
import { queryKeys } from '@/lib/query-keys'

export function useProjectSkillActions(api: ApiClient | null, machineId: string | null, directory: string) {
    const queryClient = useQueryClient()

    const invalidate = () => {
        if (machineId && directory) {
            void queryClient.invalidateQueries({ queryKey: queryKeys.projectSkills(machineId, directory) })
        }
    }

    const updateSkillOverride = useMutation({
        mutationFn: async ({ name, enabled }: { name: string; enabled: boolean }) => {
            if (!api || !machineId) throw new Error('API unavailable')
            return await api.updateProjectSkillOverride(machineId, directory, name, enabled)
        },
        onSuccess: invalidate,
    })

    const clearAll = useMutation({
        mutationFn: async () => {
            if (!api || !machineId) throw new Error('API unavailable')
            return await api.clearProjectSkillOverrides(machineId, directory)
        },
        onSuccess: invalidate,
    })

    return {
        updateSkillOverride: updateSkillOverride.mutateAsync,
        clearAll: clearAll.mutateAsync,
        isPending: updateSkillOverride.isPending || clearAll.isPending,
    }
}
