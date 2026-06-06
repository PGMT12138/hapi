import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { ApiClient } from '@/api/client'
import { queryKeys } from '@/lib/query-keys'

export function useCcExtensionActions(api: ApiClient | null, machineId: string | null) {
    const queryClient = useQueryClient()

    const invalidateSkills = () => {
        if (machineId) {
            void queryClient.invalidateQueries({ queryKey: queryKeys.ccSkills(machineId) })
        }
    }

    const invalidateMcpServers = () => {
        if (machineId) {
            void queryClient.invalidateQueries({ queryKey: queryKeys.ccMcpServers(machineId) })
        }
    }

    const updateSkillOverride = useMutation({
        mutationFn: async ({ name, enabled }: { name: string; enabled: boolean }) => {
            if (!api || !machineId) throw new Error('API unavailable')
            return await api.updateCcSkillOverride(machineId, name, enabled)
        },
        onSuccess: invalidateSkills,
    })

    const updateMcpServerStatus = useMutation({
        mutationFn: async ({ name, enabled }: { name: string; enabled: boolean }) => {
            if (!api || !machineId) throw new Error('API unavailable')
            return await api.updateCcMcpServerStatus(machineId, name, enabled)
        },
        onSuccess: invalidateMcpServers,
    })

    return {
        updateSkillOverride: updateSkillOverride.mutateAsync,
        updateMcpServerStatus: updateMcpServerStatus.mutateAsync,
        isPending: updateSkillOverride.isPending || updateMcpServerStatus.isPending,
    }
}
