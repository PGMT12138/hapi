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
            secretId: string
            secretKey: string
            language: string
            region: string
        }) => {
            if (!api) throw new Error('API unavailable')
            return await api.updateSttConfig(data)
        },
        onSuccess: invalidate,
    })

    const deleteConfig = useMutation({
        mutationFn: async () => {
            if (!api) throw new Error('API unavailable')
            return await api.deleteSttConfig()
        },
        onSuccess: invalidate,
    })

    return {
        updateConfig: updateConfig.mutateAsync,
        deleteConfig: deleteConfig.mutateAsync,
        isPending: updateConfig.isPending || deleteConfig.isPending,
    }
}
