import { useQuery } from '@tanstack/react-query'
import type { ApiClient } from '@/api/client'
import { queryKeys } from '@/lib/query-keys'

export interface ProjectSkill {
    name: string
    folderName: string
    description?: string
    scope: 'global' | 'project'
    projectPath?: string
    globalOverride: string | null
    projectOverride: string | null
    managedLocally: boolean
    effectiveState: string | null
}

export function useProjectSkills(api: ApiClient | null, machineId: string | null, directory: string | null): {
    skills: ProjectSkill[]
    isLoading: boolean
    error: string | null
} {
    const trimmedDirectory = directory?.trim() ?? ''
    const query = useQuery({
        queryKey: queryKeys.projectSkills(machineId ?? '', trimmedDirectory),
        queryFn: async () => {
            if (!api || !machineId || !trimmedDirectory) throw new Error('API unavailable')
            return await api.getProjectSkills(machineId, trimmedDirectory)
        },
        enabled: Boolean(api && machineId && trimmedDirectory),
    })

    return {
        skills: query.data?.skills ?? [],
        isLoading: query.isLoading,
        error: query.error instanceof Error ? query.error.message : query.error ? 'Failed to load project skills' : null,
    }
}
