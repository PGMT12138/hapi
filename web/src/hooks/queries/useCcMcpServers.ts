import { useQuery } from '@tanstack/react-query'
import type { ApiClient } from '@/api/client'
import { queryKeys } from '@/lib/query-keys'

interface CcMcpServer {
    name: string
    type: string
    url?: string
    command?: string
    enabled: boolean
}

export function useCcMcpServers(api: ApiClient | null, machineId: string | null): {
    servers: CcMcpServer[]
    isLoading: boolean
    error: string | null
} {
    const query = useQuery({
        queryKey: queryKeys.ccMcpServers(machineId ?? ''),
        queryFn: async () => {
            if (!api || !machineId) throw new Error('API unavailable')
            return await api.getCcMcpServers(machineId)
        },
        enabled: Boolean(api && machineId),
    })

    return {
        servers: query.data?.servers ?? [],
        isLoading: query.isLoading,
        error: query.error instanceof Error ? query.error.message : query.error ? 'Failed to load MCP servers' : null,
    }
}
