import { logger } from '@/ui/logger'
import { readFile, writeFile, mkdir, unlink } from 'fs/promises'
import { createHash } from 'crypto'
import { join, resolve } from 'path'
import { homedir } from 'os'
import { existsSync } from 'fs'
import type { RpcHandlerManager } from '@/api/rpc/RpcHandlerManager'
import { rpcError } from '../rpcResponses'

interface ProjectEnvVars {
    [key: string]: string
}

interface ReadProjectEnvRequest {
    directory: string
}

interface ReadProjectEnvResponse {
    success: boolean
    vars?: ProjectEnvVars
    hasLocal?: boolean
    error?: string
}

interface WriteProjectEnvRequest {
    directory: string
    vars: ProjectEnvVars | null
}

interface WriteProjectEnvResponse {
    success: boolean
    error?: string
}

function getEnvFilePath(directory: string): string {
    const hash = createHash('sha256').update(resolve(directory)).digest('hex').slice(0, 16)
    const hapiHome = process.env.HAPI_HOME?.replace(/^~/, homedir()) || join(homedir(), '.hapi')
    return join(hapiHome, 'project-env', `${hash}.json`)
}

export function registerProjectEnvHandlers(rpcHandlerManager: RpcHandlerManager): void {
    rpcHandlerManager.registerHandler<ReadProjectEnvRequest, ReadProjectEnvResponse>('read-project-env', async (data) => {
        try {
            const envFile = getEnvFilePath(data.directory)
            if (!existsSync(envFile)) {
                return { success: true, vars: {}, hasLocal: false }
            }
            const content = await readFile(envFile, 'utf-8')
            const vars = JSON.parse(content) as ProjectEnvVars
            return { success: true, vars, hasLocal: true }
        } catch (error) {
            logger.debug('Failed to read project env:', error)
            return rpcError('Failed to read project env')
        }
    })

    rpcHandlerManager.registerHandler<WriteProjectEnvRequest, WriteProjectEnvResponse>('write-project-env', async (data) => {
        try {
            const envFile = getEnvFilePath(data.directory)
            const envDir = join(envFile, '..')

            if (data.vars === null || Object.keys(data.vars).length === 0) {
                if (existsSync(envFile)) {
                    await unlink(envFile)
                }
                return { success: true }
            }

            if (!existsSync(envDir)) {
                await mkdir(envDir, { recursive: true })
            }
            await writeFile(envFile, JSON.stringify(data.vars, null, 2))
            return { success: true }
        } catch (error) {
            logger.debug('Failed to write project env:', error)
            return rpcError('Failed to write project env')
        }
    })
}
