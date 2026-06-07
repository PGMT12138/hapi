import { useQuery } from '@tanstack/react-query'
import type { ApiClient } from '@/api/client'
import { queryKeys } from '@/lib/query-keys'

interface CcSkill {
    name: string
    description?: string
    overrideState: string | null
    scope: 'global' | 'project'
    projectPath?: string
}

export function useCcSkills(api: ApiClient | null, machineId: string | null): {
    skills: CcSkill[]
    isLoading: boolean
    error: string | null
} {
    const query = useQuery({
        queryKey: queryKeys.ccSkills(machineId ?? ''),
        queryFn: async () => {
            if (!api || !machineId) throw new Error('API unavailable')
            return await api.getCcSkills(machineId)
        },
        enabled: Boolean(api && machineId),
    })

    return {
        skills: query.data?.skills ?? [],
        isLoading: query.isLoading,
        error: query.error instanceof Error ? query.error.message : query.error ? 'Failed to load skills' : null,
    }
}
