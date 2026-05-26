import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { ApiClient } from '@/api/client'
import { queryKeys } from '@/lib/query-keys'

export function useSttConfigActions(api: ApiClient | null) {
    const queryClient = useQueryClient()

    const invalidate = () => {
        void queryClient.invalidateQueries({ queryKey: queryKeys.sttConfig })
    }

    const updateConfig = useMutation({
        mutationFn: async (data: {
            provider: string
            appId: string
            secretId?: string
            secretKey?: string
            apiKey?: string
            apiSecret?: string
            language: string
            region: string
            active?: boolean
        }) => {
            if (!api) throw new Error('API unavailable')
            return await api.updateSttConfig(data)
        },
        onSuccess: invalidate,
    })

    const deleteConfig = useMutation({
        mutationFn: async (provider: string) => {
            if (!api) throw new Error('API unavailable')
            return await api.deleteSttConfig(provider)
        },
        onSuccess: invalidate,
    })

    const setActive = useMutation({
        mutationFn: async (provider: string) => {
            if (!api) throw new Error('API unavailable')
            return await api.setActiveSttConfig(provider)
        },
        onSuccess: invalidate,
    })

    return {
        updateConfig: updateConfig.mutateAsync,
        deleteConfig: deleteConfig.mutateAsync,
        setActive: setActive.mutateAsync,
        isPending: updateConfig.isPending || deleteConfig.isPending || setActive.isPending,
    }
}
