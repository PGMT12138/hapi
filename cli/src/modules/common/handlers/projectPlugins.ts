import { logger } from '@/ui/logger'
import { readFile, writeFile, mkdir, readdir } from 'fs/promises'
import { existsSync } from 'fs'
import { join, resolve } from 'path'
import { homedir } from 'os'
import type { RpcHandlerManager } from '@/api/rpc/RpcHandlerManager'
import { rpcError } from '../rpcResponses'
import type { ProjectPlugin } from '@hapi/protocol/types'

interface SettingsFile {
    enabledPlugins?: Record<string, boolean>
    skillOverrides?: Record<string, string>
    [key: string]: unknown
}

interface InstalledPluginsFile {
    version: number
    plugins: Record<string, Array<{
        scope: string
        installPath: string
        version: string
        installedAt?: string
        lastUpdated?: string
        gitCommitSha?: string
    }>>
}

interface PluginManifest {
    name?: string
    description?: string
    version?: string
    author?: string | { name?: string; email?: string }
    homepage?: string
    repository?: string
    [key: string]: unknown
}

interface ListProjectPluginsRequest {
    directory: string
}

interface ListProjectPluginsResponse {
    success: boolean
    plugins?: ProjectPlugin[]
    error?: string
}

interface UpdateProjectPluginStatusRequest {
    directory: string
    name: string
    enabled: boolean
}

interface ClearProjectPluginOverridesRequest {
    directory: string
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

function getInstalledPluginsPath(): string {
    const configDir = process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude')
    return join(configDir, 'plugins', 'installed_plugins.json')
}

async function readJsonFile<T>(filePath: string): Promise<T> {
    if (!existsSync(filePath)) return {} as T
    const content = await readFile(filePath, 'utf-8')
    return JSON.parse(content) as T
}

async function writeJsonFile(filePath: string, data: unknown): Promise<void> {
    await writeFile(filePath, JSON.stringify(data, null, 2))
}

async function readPluginManifest(installPath: string): Promise<PluginManifest | null> {
    const manifestPath = join(installPath, '.claude-plugin', 'plugin.json')
    if (!existsSync(manifestPath)) return null
    try {
        return await readJsonFile<PluginManifest>(manifestPath)
    } catch {
        return null
    }
}

function hasMcpConfig(installPath: string): boolean {
    return existsSync(join(installPath, '.mcp.json'))
}

async function countSkillsInDir(dir: string): Promise<number> {
    const skillsPath = join(dir, 'skills')
    if (!existsSync(skillsPath)) return 0
    try {
        const entries = await readdir(skillsPath, { withFileTypes: true })
        return entries.filter(e => (e.isDirectory() || e.isSymbolicLink()) && !e.name.startsWith('.')).length
    } catch {
        return 0
    }
}

async function findPluginKeyByName(installed: InstalledPluginsFile, name: string): Promise<string | null> {
    for (const [key, versions] of Object.entries(installed.plugins ?? {})) {
        const latest = versions[versions.length - 1]
        if (!latest) continue
        const manifest = await readPluginManifest(latest.installPath)
        const pluginName = manifest?.name || key.split('@')[0]
        if (pluginName === name) return key
    }
    return null
}

let settingsWriteLock: Promise<void> = Promise.resolve()

export function registerProjectPluginsHandlers(rpcHandlerManager: RpcHandlerManager): void {
    rpcHandlerManager.registerHandler<ListProjectPluginsRequest, ListProjectPluginsResponse>('list-project-plugins', async (data) => {
        try {
            if (!data.directory) {
                return rpcError('directory is required')
            }
            const installedPath = getInstalledPluginsPath()
            if (!existsSync(installedPath)) {
                return { success: true, plugins: [] }
            }
            const [installed, globalSettings, projectSettings] = await Promise.all([
                readJsonFile<InstalledPluginsFile>(installedPath),
                readJsonFile<SettingsFile>(getGlobalSettingsPath()),
                readJsonFile<SettingsFile>(getProjectSettingsPath(data.directory))
            ])
            const globalEnabledPlugins = globalSettings.enabledPlugins ?? {}
            const projectEnabledPlugins = projectSettings.enabledPlugins ?? {}

            const plugins: ProjectPlugin[] = []
            for (const [pluginKey, versions] of Object.entries(installed.plugins ?? {})) {
                const latest = versions[versions.length - 1]
                if (!latest) continue

                const manifest = await readPluginManifest(latest.installPath)
                const pluginName = manifest?.name || pluginKey.split('@')[0]
                const author = typeof manifest?.author === 'object' ? manifest.author.name : manifest?.author

                const globalEnabled = globalEnabledPlugins[pluginKey] !== false
                const projectRaw = projectEnabledPlugins[pluginKey]
                const managedLocally = projectRaw !== undefined
                const projectEnabled = managedLocally ? Boolean(projectRaw) : null
                const effectiveEnabled = managedLocally ? Boolean(projectRaw) : globalEnabled

                plugins.push({
                    name: pluginName,
                    pluginKey,
                    description: manifest?.description,
                    version: latest.version,
                    author,
                    homepage: manifest?.homepage || manifest?.repository,
                    hasMcp: hasMcpConfig(latest.installPath),
                    skillCount: await countSkillsInDir(latest.installPath),
                    globalEnabled,
                    projectEnabled,
                    managedLocally,
                    effectiveEnabled
                })
            }

            plugins.sort((a, b) => a.name.localeCompare(b.name))
            return { success: true, plugins }
        } catch (error) {
            logger.debug('Failed to list project plugins:', error)
            return rpcError('Failed to list project plugins')
        }
    })

    rpcHandlerManager.registerHandler<UpdateProjectPluginStatusRequest, UpdateResponse>('update-project-plugin-status', async (data) => {
        try {
            if (!data.directory) {
                return rpcError('directory is required')
            }
            if (!data.name) {
                return rpcError('name is required')
            }
            settingsWriteLock = settingsWriteLock.catch(() => {}).then(async () => {
                const installedPath = getInstalledPluginsPath()
                if (!existsSync(installedPath)) return
                const installed = await readJsonFile<InstalledPluginsFile>(installedPath)
                const pluginKey = await findPluginKeyByName(installed, data.name)
                if (!pluginKey) return

                const filePath = getProjectSettingsPath(data.directory)
                const claudeDir = join(filePath, '..')
                if (!existsSync(claudeDir)) {
                    await mkdir(claudeDir, { recursive: true })
                }
                const settings = await readJsonFile<SettingsFile>(filePath)
                if (!settings.enabledPlugins) settings.enabledPlugins = {}

                settings.enabledPlugins[pluginKey] = data.enabled
                await writeJsonFile(filePath, settings)
            })
            await settingsWriteLock
            return { success: true }
        } catch (error) {
            logger.debug('Failed to update project plugin status:', error)
            return rpcError('Failed to update project plugin status')
        }
    })

    rpcHandlerManager.registerHandler<ClearProjectPluginOverridesRequest, UpdateResponse>('clear-project-plugin-overrides', async (data) => {
        try {
            if (!data.directory) {
                return rpcError('directory is required')
            }
            settingsWriteLock = settingsWriteLock.catch(() => {}).then(async () => {
                const filePath = getProjectSettingsPath(data.directory)
                if (!existsSync(filePath)) return
                const settings = await readJsonFile<SettingsFile>(filePath)
                if (settings.enabledPlugins === undefined) return
                delete settings.enabledPlugins
                await writeJsonFile(filePath, settings)
            })
            await settingsWriteLock
            return { success: true }
        } catch (error) {
            logger.debug('Failed to clear project plugin overrides:', error)
            return rpcError('Failed to clear project plugin overrides')
        }
    })
}
