import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { ApiClient } from '@/api/client'
import { queryKeys } from '@/lib/query-keys'

export function useSlashCommandFavoriteActions(api: ApiClient | null, agentType: string) {
    const queryClient = useQueryClient()

    const invalidate = () => {
        void queryClient.invalidateQueries({ queryKey: queryKeys.slashCommandFavorites(agentType) })
    }

    const addFavorite = useMutation({
        mutationFn: async (commandName: string) => {
            if (!api) throw new Error('API unavailable')
            return await api.addSlashCommandFavorite(agentType, commandName)
        },
        onSuccess: invalidate,
    })

    const removeFavorite = useMutation({
        mutationFn: async (commandName: string) => {
            if (!api) throw new Error('API unavailable')
            return await api.removeSlashCommandFavorite(agentType, commandName)
        },
        onSuccess: invalidate,
    })

    return {
        addFavorite: addFavorite.mutateAsync,
        removeFavorite: removeFavorite.mutateAsync,
        isPending: addFavorite.isPending || removeFavorite.isPending,
    }
}
