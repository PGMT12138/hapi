import { logger } from '@/ui/logger'
import { readFile, writeFile, mkdir, unlink } from 'fs/promises'
import { join, resolve } from 'path'
import { existsSync } from 'fs'
import type { RpcHandlerManager } from '@/api/rpc/RpcHandlerManager'
import { rpcError } from '../rpcResponses'

interface ProjectSettings {
    env?: Record<string, string>
    [key: string]: unknown
}

interface ReadProjectEnvRequest {
    directory: string
}

interface ReadProjectEnvResponse {
    success: boolean
    env?: Record<string, string>
    hasLocal?: boolean
    error?: string
}

interface WriteProjectEnvRequest {
    directory: string
    env: Record<string, string> | null
}

interface WriteProjectEnvResponse {
    success: boolean
    error?: string
}

function getSettingsFilePath(directory: string): string {
    return join(resolve(directory), '.claude', 'settings.local.json')
}

async function readSettingsFile(filePath: string): Promise<ProjectSettings> {
    if (!existsSync(filePath)) return {}
    const content = await readFile(filePath, 'utf-8')
    return JSON.parse(content) as ProjectSettings
}

export function registerProjectEnvHandlers(rpcHandlerManager: RpcHandlerManager): void {
    rpcHandlerManager.registerHandler<ReadProjectEnvRequest, ReadProjectEnvResponse>('read-project-env', async (data) => {
        try {
            const filePath = getSettingsFilePath(data.directory)
            const settings = await readSettingsFile(filePath)
            const env = settings.env
            const hasLocal = typeof env === 'object' && env !== null && Object.keys(env).length > 0
            return {
                success: true,
                env: hasLocal ? env : {},
                hasLocal
            }
        } catch (error) {
            logger.debug('Failed to read project settings:', error)
            return rpcError('Failed to read project settings')
        }
    })

    rpcHandlerManager.registerHandler<WriteProjectEnvRequest, WriteProjectEnvResponse>('write-project-env', async (data) => {
        try {
            const filePath = getSettingsFilePath(data.directory)
            const claudeDir = join(filePath, '..')

            if (data.env === null) {
                if (!existsSync(filePath)) return { success: true }
                const settings = await readSettingsFile(filePath)
                delete settings.env
                await writeFile(filePath, JSON.stringify(settings, null, 2))
                return { success: true }
            }

            if (!existsSync(claudeDir)) {
                await mkdir(claudeDir, { recursive: true })
            }
            const settings = await readSettingsFile(filePath)
            settings.env = data.env
            await writeFile(filePath, JSON.stringify(settings, null, 2))
            return { success: true }
        } catch (error) {
            logger.debug('Failed to write project settings:', error)
            return rpcError('Failed to write project settings')
        }
    })
}
