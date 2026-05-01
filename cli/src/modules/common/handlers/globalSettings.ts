import { logger } from '@/ui/logger'
import { readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import { existsSync } from 'fs'
import { homedir } from 'os'
import type { RpcHandlerManager } from '@/api/rpc/RpcHandlerManager'
import { rpcError } from '../rpcResponses'

interface GlobalSettings {
    env?: Record<string, string>
    [key: string]: unknown
}

interface ReadGlobalEnvResponse {
    success: boolean
    env?: Record<string, string>
    error?: string
}

interface WriteGlobalEnvRequest {
    env: Record<string, string>
}

interface WriteGlobalEnvResponse {
    success: boolean
    error?: string
}

function getGlobalSettingsPath(): string {
    const configDir = process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude')
    return join(configDir, 'settings.json')
}

async function readSettingsFile(filePath: string): Promise<GlobalSettings> {
    if (!existsSync(filePath)) return {}
    const content = await readFile(filePath, 'utf-8')
    return JSON.parse(content) as GlobalSettings
}

export function registerGlobalSettingsHandlers(rpcHandlerManager: RpcHandlerManager): void {
    rpcHandlerManager.registerHandler<void, ReadGlobalEnvResponse>('read-global-env', async () => {
        try {
            const filePath = getGlobalSettingsPath()
            const settings = await readSettingsFile(filePath)
            const env = typeof settings.env === 'object' && settings.env !== null ? settings.env : {}
            return { success: true, env }
        } catch (error) {
            logger.debug('Failed to read global settings:', error)
            return rpcError('Failed to read global settings')
        }
    })

    rpcHandlerManager.registerHandler<WriteGlobalEnvRequest, WriteGlobalEnvResponse>('write-global-env', async (data) => {
        try {
            const filePath = getGlobalSettingsPath()
            const settings = await readSettingsFile(filePath)
            settings.env = data.env
            await writeFile(filePath, JSON.stringify(settings, null, 2))
            return { success: true }
        } catch (error) {
            logger.debug('Failed to write global settings:', error)
            return rpcError('Failed to write global settings')
        }
    })
}
