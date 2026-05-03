import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { ApiClient } from '@/api/client'
import { queryKeys } from '@/lib/query-keys'

export function usePromptActions(api: ApiClient | null) {
    const queryClient = useQueryClient()

    const invalidate = () => {
        void queryClient.invalidateQueries({ queryKey: queryKeys.prompts })
    }

    const createPrompt = useMutation({
        mutationFn: async (input: { name: string; content: string }) => {
            if (!api) throw new Error('API unavailable')
            return await api.createPrompt(input.name, input.content)
        },
        onSuccess: invalidate,
    })

    const updatePrompt = useMutation({
        mutationFn: async (input: { id: string; name?: string; content?: string }) => {
            if (!api) throw new Error('API unavailable')
            return await api.updatePrompt(input.id, { name: input.name, content: input.content })
        },
        onSuccess: invalidate,
    })

    const deletePrompt = useMutation({
        mutationFn: async (id: string) => {
            if (!api) throw new Error('API unavailable')
            return await api.deletePrompt(id)
        },
        onSuccess: invalidate,
    })

    return {
        createPrompt: createPrompt.mutateAsync,
        updatePrompt: updatePrompt.mutateAsync,
        deletePrompt: deletePrompt.mutateAsync,
        isPending: createPrompt.isPending || updatePrompt.isPending || deletePrompt.isPending,
    }
}
