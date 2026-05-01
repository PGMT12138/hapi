import { logger } from '@/ui/logger'
import { readFile, writeFile, mkdir, unlink } from 'fs/promises'
import { join, resolve } from 'path'
import { existsSync } from 'fs'
import type { RpcHandlerManager } from '@/api/rpc/RpcHandlerManager'
import { rpcError } from '../rpcResponses'

interface ProjectSettings {
    apiKey?: string
    [key: string]: unknown
}

interface ReadProjectEnvRequest {
    directory: string
}

interface ReadProjectEnvResponse {
    success: boolean
    apiKey?: string
    hasLocal?: boolean
    error?: string
}

interface WriteProjectEnvRequest {
    directory: string
    apiKey: string | null
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
            const apiKey = settings.apiKey
            return {
                success: true,
                apiKey: typeof apiKey === 'string' ? apiKey : '',
                hasLocal: typeof apiKey === 'string' && apiKey.length > 0
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

            if (data.apiKey === null) {
                // Remove apiKey from settings, delete file if empty
                if (!existsSync(filePath)) return { success: true }
                const settings = await readSettingsFile(filePath)
                delete settings.apiKey
                const keys = Object.keys(settings)
                if (keys.length === 0) {
                    await unlink(filePath)
                } else {
                    await writeFile(filePath, JSON.stringify(settings, null, 2))
                }
                return { success: true }
            }

            // Write apiKey into settings
            if (!existsSync(claudeDir)) {
                await mkdir(claudeDir, { recursive: true })
            }
            const settings = await readSettingsFile(filePath)
            settings.apiKey = data.apiKey
            await writeFile(filePath, JSON.stringify(settings, null, 2))
            return { success: true }
        } catch (error) {
            logger.debug('Failed to write project settings:', error)
            return rpcError('Failed to write project settings')
        }
    })
}
