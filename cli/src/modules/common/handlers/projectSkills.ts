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
                const globalOverride = globalOverrides[skill.folderName] === 'off'
                    ? 'off' as const
                    : null
                const projectOverride = projectOverrides[skill.folderName] === 'off'
                    ? 'off' as const
                    : null
                const managedLocally = projectOverrides[skill.folderName] !== undefined
                return {
                    name: skill.name,
                    folderName: skill.folderName,
                    description: skill.description,
                    scope: skill.scope,
                    projectPath: skill.projectPath,
                    globalOverride,
                    projectOverride,
                    managedLocally,
                    effectiveState: projectOverride ?? globalOverride
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
                    delete settings.skillOverrides[overrideKey]
                    if (Object.keys(settings.skillOverrides).length === 0) {
                        delete settings.skillOverrides
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
}
