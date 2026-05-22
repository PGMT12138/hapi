import { useQuery } from '@tanstack/react-query'
import type { ApiClient } from '@/api/client'
import type { SlashCommandFavorite } from '@/types/api'
import { queryKeys } from '@/lib/query-keys'

export function useSlashCommandFavorites(api: ApiClient | null, agentType: string): {
    favorites: SlashCommandFavorite[]
    favoriteNames: Set<string>
    isLoading: boolean
    error: string | null
} {
    const query = useQuery({
        queryKey: queryKeys.slashCommandFavorites(agentType),
        queryFn: async () => {
            if (!api) throw new Error('API unavailable')
            return await api.getSlashCommandFavorites(agentType)
        },
        enabled: Boolean(api),
    })

    const favorites = query.data?.favorites ?? []
    const favoriteNames = new Set(favorites.map((f) => f.commandName))

    return {
        favorites,
        favoriteNames,
        isLoading: query.isLoading,
        error: query.error instanceof Error ? query.error.message : query.error ? 'Failed to load favorites' : null,
    }
}
