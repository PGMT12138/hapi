import { logger } from '@/ui/logger'
import { readFile, writeFile, mkdir } from 'fs/promises'
import { existsSync } from 'fs'
import { join, resolve } from 'path'
import { homedir } from 'os'
import type { RpcHandlerManager } from '@/api/rpc/RpcHandlerManager'
import { rpcError } from '../rpcResponses'
import { listClaudeCodeSkills, listSkills } from '../skills'
import type { ProjectSkill } from '@hapi/protocol/types'

interface SettingsFile {
    permissions?: {
        deny?: string[]
        [key: string]: unknown
    }
    skillOverrides?: Record<string, string>
    deniedMcpServers?: Array<{ serverName?: string; serverUrl?: string; serverCommand?: string[] }>
    enabledPlugins?: Record<string, boolean>
    env?: Record<string, string>
    [key: string]: unknown
}

interface ListProjectSkillsRequest {
    directory: string
}

interface ListProjectSkillsResponse {
    success: boolean
    skills?: ProjectSkill[]
    error?: string
}

interface UpdateProjectSkillOverrideRequest {
    directory: string
    name: string
    enabled: boolean
}

interface UpdateResponse {
    success: boolean
    error?: string
}

interface ClearProjectSkillOverridesRequest {
    directory: string
}

function getGlobalSettingsPath(): string {
    const configDir = process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude')
    return join(configDir, 'settings.json')
}

function getProjectSettingsPath(directory: string): string {
    return join(resolve(directory), '.claude', 'settings.local.json')
}

async function readJsonFile<T>(filePath: string): Promise<T> {
    if (!existsSync(filePath)) return {} as T
    const content = await readFile(filePath, 'utf-8')
    return JSON.parse(content) as T
}

async function writeJsonFile(filePath: string, data: unknown): Promise<void> {
    await writeFile(filePath, JSON.stringify(data, null, 2))
}

let settingsWriteLock: Promise<void> = Promise.resolve()

export function registerProjectSkillsHandlers(rpcHandlerManager: RpcHandlerManager): void {
    rpcHandlerManager.registerHandler<ListProjectSkillsRequest, ListProjectSkillsResponse>('list-project-skills', async (data) => {
        try {
            if (!data.directory) {
                return rpcError('directory is required')
            }
            const [skills, globalSettings, projectSettings] = await Promise.all([
                listClaudeCodeSkills(data.directory),
                readJsonFile<SettingsFile>(getGlobalSettingsPath()),
                readJsonFile<SettingsFile>(getProjectSettingsPath(data.directory))
            ])
            const globalOverrides = globalSettings.skillOverrides ?? {}
            const projectOverrides = projectSettings.skillOverrides ?? {}

            const result: ProjectSkill[] = skills.map(skill => {
                const globalIsOff = globalOverrides[skill.folderName] === 'off'
                const projectRaw = projectOverrides[skill.folderName]
                const managedLocally = projectRaw !== undefined
                const projectIsOff = projectRaw === 'off'
                // 合并：项目级显式（managedLocally）覆盖全局
                const effectiveOff = managedLocally ? projectIsOff : globalIsOff
                return {
                    name: skill.name,
                    folderName: skill.folderName,
                    description: skill.description,
                    scope: skill.scope,
                    projectPath: skill.projectPath,
                    globalOverride: globalIsOff ? 'off' as const : null,
                    projectOverride: projectIsOff ? 'off' as const : null,
                    managedLocally,
                    effectiveState: effectiveOff ? 'off' as const : null
                }
            })
            return { success: true, skills: result }
        } catch (error) {
            logger.debug('Failed to list project skills:', error)
            return rpcError('Failed to list project skills')
        }
    })

    rpcHandlerManager.registerHandler<UpdateProjectSkillOverrideRequest, UpdateResponse>('update-project-skill-override', async (data) => {
        try {
            if (!data.directory) {
                return rpcError('directory is required')
            }
            if (!data.name) {
                return rpcError('name is required')
            }
            settingsWriteLock = settingsWriteLock.catch(() => {}).then(async () => {
                const skills = await listSkills(data.directory)
                const skill = skills.find(s => s.name === data.name)
                const overrideKey = skill?.folderName || data.name

                const filePath = getProjectSettingsPath(data.directory)
                const claudeDir = join(filePath, '..')
                if (!existsSync(claudeDir)) {
                    await mkdir(claudeDir, { recursive: true })
                }
                const settings = await readJsonFile<SettingsFile>(filePath)
                if (!settings.skillOverrides) settings.skillOverrides = {}

                if (!data.enabled) {
                    settings.skillOverrides[overrideKey] = 'off'
                } else {
                    // 启用：若全局禁用则项目级写 'on' 反向启用，否则删除条目
                    const globalSettings = await readJsonFile<SettingsFile>(getGlobalSettingsPath())
                    const globalIsOff = globalSettings.skillOverrides?.[overrideKey] === 'off'
                    if (globalIsOff) {
                        settings.skillOverrides[overrideKey] = 'on'
                    } else {
                        delete settings.skillOverrides[overrideKey]
                        if (Object.keys(settings.skillOverrides).length === 0) {
                            delete settings.skillOverrides
                        }
                    }
                }
                await writeJsonFile(filePath, settings)
            })
            await settingsWriteLock
            return { success: true }
        } catch (error) {
            logger.debug('Failed to update project skill override:', error)
            return rpcError('Failed to update project skill override')
        }
    })

    rpcHandlerManager.registerHandler<ClearProjectSkillOverridesRequest, UpdateResponse>('clear-project-skill-overrides', async (data) => {
        try {
            if (!data.directory) {
                return rpcError('directory is required')
            }
            settingsWriteLock = settingsWriteLock.catch(() => {}).then(async () => {
                const filePath = getProjectSettingsPath(data.directory)
                if (!existsSync(filePath)) return
                const settings = await readJsonFile<SettingsFile>(filePath)
                if (settings.skillOverrides === undefined) return
                delete settings.skillOverrides
                await writeJsonFile(filePath, settings)
            })
            await settingsWriteLock
            return { success: true }
        } catch (error) {
            logger.debug('Failed to clear project skill overrides:', error)
            return rpcError('Failed to clear project skill overrides')
        }
    })
}
