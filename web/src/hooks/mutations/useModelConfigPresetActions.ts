import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { ApiClient } from '@/api/client'
import { queryKeys } from '@/lib/query-keys'

export function useModelConfigPresetActions(api: ApiClient | null) {
    const queryClient = useQueryClient()

    const invalidate = () => {
        void queryClient.invalidateQueries({ queryKey: queryKeys.modelConfigPresets })
    }

    const createPreset = useMutation({
        mutationFn: async (input: { name: string; env: Record<string, string> }) => {
            if (!api) throw new Error('API unavailable')
            return await api.createModelConfigPreset(input.name, input.env)
        },
        onSuccess: invalidate,
    })

    const updatePreset = useMutation({
        mutationFn: async (input: { id: string; name?: string; env?: Record<string, string> }) => {
            if (!api) throw new Error('API unavailable')
            return await api.updateModelConfigPreset(input.id, { name: input.name, env: input.env })
        },
        onSuccess: invalidate,
    })

    const deletePreset = useMutation({
        mutationFn: async (id: string) => {
            if (!api) throw new Error('API unavailable')
            return await api.deleteModelConfigPreset(id)
        },
        onSuccess: invalidate,
    })

    return {
        createPreset: createPreset.mutateAsync,
        updatePreset: updatePreset.mutateAsync,
        deletePreset: deletePreset.mutateAsync,
        isPending: createPreset.isPending || updatePreset.isPending || deletePreset.isPending,
    }
}
