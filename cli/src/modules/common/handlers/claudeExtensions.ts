import { logger } from '@/ui/logger'
import { readFile, writeFile, readdir } from 'fs/promises'
import { existsSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import type { RpcHandlerManager } from '@/api/rpc/RpcHandlerManager'
import { rpcError } from '../rpcResponses'
import { listClaudeCodeSkills, listSkills, getSkillDetail } from '../skills'
import type { CcSkill, CcMcpServer, CcPlugin } from '@hapi/protocol/types'

interface SettingsFile {
    permissions?: {
        deny?: string[]
        [key: string]: unknown
    }
    skillOverrides?: Record<string, string>
    deniedMcpServers?: Array<{ serverName?: string; serverUrl?: string; serverCommand?: string[] }>
    enabledPlugins?: Record<string, boolean>
    [key: string]: unknown
}

interface ClaudeConfigFile {
    mcpServers?: Record<string, McpServerConfig>
    [key: string]: unknown
}

interface McpServerConfig {
    type?: string
    url?: string
    command?: string
    args?: string[]
    [key: string]: unknown
}

interface ListCcSkillsResponse {
    success: boolean
    skills?: CcSkill[]
    error?: string
}

interface UpdateSkillOverrideRequest {
    name: string
    enabled: boolean
}

interface UpdateResponse {
    success: boolean
    error?: string
}

interface ListCcMcpServersResponse {
    success: boolean
    servers?: CcMcpServer[]
    error?: string
}

interface UpdateMcpServerStatusRequest {
    name: string
    enabled: boolean
}

interface GetSkillDetailRequest {
    name: string
}

interface SkillDetailResponse {
    success: boolean
    detail?: {
        name: string
        description?: string
        content: string
        files: string[]
        path: string
    }
    error?: string
}

interface GetMcpServerDetailRequest {
    name: string
}

interface McpServerDetailResponse {
    success: boolean
    detail?: {
        name: string
        type: string
        url?: string
        command?: string
        args?: string[]
        enabled: boolean
        config: Record<string, unknown>
        tools?: Array<{ name: string; description?: string }>
    }
    error?: string
}

interface McpTool {
    name: string
    description?: string
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
    license?: string
    [key: string]: unknown
}

interface ListCcPluginsResponse {
    success: boolean
    plugins?: CcPlugin[]
    error?: string
}

interface GetPluginDetailRequest {
    name: string
}

interface UpdatePluginStatusRequest {
    name: string
    enabled: boolean
}

interface PluginDetailResponse {
    success: boolean
    detail?: {
        name: string
        description?: string
        version?: string
        author?: string
        homepage?: string
        license?: string
        installedAt?: string
        lastUpdated?: string
        installPath: string
        hasMcp: boolean
        mcpConfig?: Record<string, unknown>
        skills: Array<{ name: string; description?: string }>
        files: string[]
    }
    error?: string
}

interface UpdateResponse {
    success: boolean
    error?: string
}

const mcpToolsCache = new Map<string, { tools: McpTool[]; expiresAt: number }>()
const MCP_TOOLS_CACHE_TTL = 5 * 60 * 1000

function getCachedMcpTools(key: string): McpTool[] | undefined {
    const entry = mcpToolsCache.get(key)
    if (!entry) return undefined
    if (Date.now() > entry.expiresAt) {
        mcpToolsCache.delete(key)
        return undefined
    }
    return entry.tools
}

function setCachedMcpTools(key: string, tools: McpTool[]): void {
    mcpToolsCache.set(key, { tools, expiresAt: Date.now() + MCP_TOOLS_CACHE_TTL })
}

function parseJsonOrSse(text: string, targetId: number): { result?: { tools?: Array<{ name?: string; description?: string }> }; error?: unknown } | null {
    // Try plain JSON first
    try {
        const json = JSON.parse(text) as { id?: number; error?: unknown }
        if (json.id === targetId) return json
        return null
    } catch {}
    // Parse SSE: extract data lines and match on JSON-RPC id inside data payload
    let currentData = ''
    for (const line of text.split('\n')) {
        if (line.startsWith('data:')) {
            currentData = line.slice(5).trim()
        } else if (line === '' && currentData) {
            try {
                const json = JSON.parse(currentData) as { id?: number; error?: unknown }
                if (json.id === targetId) return json
            } catch {}
            currentData = ''
        }
    }
    if (currentData) {
        try {
            const json = JSON.parse(currentData) as { id?: number; error?: unknown }
            if (json.id === targetId) return json
        } catch {}
    }
    return null
}

async function fetchMcpToolsHttp(url: string, extraHeaders?: Record<string, string>): Promise<McpTool[]> {
    const headers = {
        'content-type': 'application/json',
        'accept': 'application/json, text/event-stream',
        ...extraHeaders,
    }
    const timeout = 10_000

    try {
        // Step 1: initialize
        const initController = new AbortController()
        const initTimer = setTimeout(() => initController.abort(), timeout)
        const initRes = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: 1,
                method: 'initialize',
                params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'hapi', version: '1.0.0' } },
            }),
            signal: initController.signal,
        })
        clearTimeout(initTimer)
        const initText = await initRes.text()
        const initJson = parseJsonOrSse(initText, 1)
        if (!initJson || initJson.error) return []

        // Step 2: notifications/initialized (no id, no response expected)
        const notifController = new AbortController()
        const notifTimer = setTimeout(() => notifController.abort(), timeout)
        await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }),
            signal: notifController.signal,
        }).catch(() => {})
        clearTimeout(notifTimer)

        // Step 3: tools/list
        const toolsController = new AbortController()
        const toolsTimer = setTimeout(() => toolsController.abort(), timeout)
        const toolsRes = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: 2,
                method: 'tools/list',
                params: {},
            }),
            signal: toolsController.signal,
        })
        clearTimeout(toolsTimer)
        const toolsText = await toolsRes.text()
        const toolsJson = parseJsonOrSse(toolsText, 2)
        if (!toolsJson || toolsJson.error) return []
        return (toolsJson.result?.tools ?? [])
            .filter(t => typeof t.name === 'string')
            .map(t => ({ name: t.name!, description: t.description }))
    } catch {
        return []
    }
}

async function fetchMcpToolsStdio(command: string, args: string[], env?: Record<string, string>): Promise<McpTool[]> {
    const { spawn } = await import('child_process')
    return new Promise((resolve) => {
        const procEnv = env ? { ...process.env, ...env } : process.env
        const proc = spawn(command, args, { stdio: ['pipe', 'pipe', 'pipe'], env: procEnv })
        let settled = false
        const timer = setTimeout(() => {
            if (!settled) { settled = true; proc.kill(); resolve([]) }
        }, 10_000)

        const lines: string[] = []
        proc.stdout.on('data', (chunk: Buffer) => {
            if (settled) return
            lines.push(...chunk.toString().split('\n'))
            const toolsLine = lines.find(l => l.includes('"id":2') && l.includes('"tools"'))
            if (toolsLine) {
                settled = true
                clearTimeout(timer)
                try {
                    const json = JSON.parse(toolsLine) as { result?: { tools?: Array<{ name?: string; description?: string }> } }
                    resolve((json.result?.tools ?? []).filter(t => typeof t.name === 'string').map(t => ({ name: t.name!, description: t.description })))
                } catch {
                    resolve([])
                }
                proc.kill()
            }
        })
        proc.stderr?.on('data', () => {})
        proc.on('error', () => { if (!settled) { settled = true; clearTimeout(timer); resolve([]) } })
        proc.on('close', () => { if (!settled) { settled = true; clearTimeout(timer); resolve([]) } })

        proc.stdin.write(JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'initialize',
            params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'hapi', version: '1.0.0' } },
        }) + '\n')
        proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n')
        proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }) + '\n')
    })
}

function getGlobalSettingsPath(): string {
    const configDir = process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude')
    return join(configDir, 'settings.json')
}

function getClaudeConfigPath(): string {
    return join(homedir(), '.claude.json')
}

async function readJsonFile<T>(filePath: string): Promise<T> {
    if (!existsSync(filePath)) return {} as T
    const content = await readFile(filePath, 'utf-8')
    return JSON.parse(content) as T
}

async function writeJsonFile(filePath: string, data: unknown): Promise<void> {
    await writeFile(filePath, JSON.stringify(data, null, 2))
}

function isDeniedByServerName(denied: SettingsFile['deniedMcpServers'], serverName: string): boolean {
    if (!denied) return false
    return denied.some(entry => entry.serverName === serverName)
}

function isSkillDisabled(skillOverrides: Record<string, string> | undefined, skillName: string): boolean {
    if (!skillOverrides) return false
    return skillOverrides[skillName] === 'off'
}

function getPluginsBasePath(): string {
    const configDir = process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude')
    return join(configDir, 'plugins')
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

function hasMcpConfig(installPath: string): boolean {
    return existsSync(join(installPath, '.mcp.json'))
}

async function listFilesRecursive(dir: string, basePath: string): Promise<string[]> {
    const results: string[] = []
    try {
        const entries = await readdir(dir, { withFileTypes: true })
        for (const entry of entries) {
            if (entry.name.startsWith('.') || entry.name === 'node_modules') continue
            const fullPath = join(dir, entry.name)
            const relativePath = fullPath.replace(basePath + '/', '').replace(basePath + '\\', '').replace(/[/\\]/g, '/')
            if (entry.isDirectory() || entry.isSymbolicLink()) {
                results.push(...await listFilesRecursive(fullPath, basePath))
            } else {
                results.push(relativePath)
            }
        }
    } catch {
        // skip unreadable dirs
    }
    return results
}

let settingsWriteLock: Promise<void> = Promise.resolve()

export function registerClaudeExtensionHandlers(rpcHandlerManager: RpcHandlerManager): void {
    rpcHandlerManager.registerHandler<void, ListCcSkillsResponse>('list-cc-skills', async () => {
        try {
            const [skills, settings] = await Promise.all([
                listClaudeCodeSkills(process.cwd()),
                readJsonFile<SettingsFile>(getGlobalSettingsPath())
            ])
            const overrides = settings.skillOverrides
            const result: CcSkill[] = skills.map(skill => ({
                name: skill.name,
                description: skill.description,
                overrideState: isSkillDisabled(overrides, skill.folderName) ? 'off' as const : null,
                scope: skill.scope,
                projectPath: skill.projectPath,
            }))
            return { success: true, skills: result }
        } catch (error) {
            logger.debug('Failed to list CC skills:', error)
            return rpcError('Failed to list CC skills')
        }
    })

    rpcHandlerManager.registerHandler<UpdateSkillOverrideRequest, UpdateResponse>('update-skill-override', async (data) => {
        try {
            settingsWriteLock = settingsWriteLock.catch(() => {}).then(async () => {
                const skills = await listSkills(undefined)
                const skill = skills.find(s => s.name === data.name)
                const overrideKey = skill?.folderName || data.name

                const filePath = getGlobalSettingsPath()
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
            logger.debug('Failed to update skill override:', error)
            return rpcError('Failed to update skill override')
        }
    })

    rpcHandlerManager.registerHandler<void, ListCcMcpServersResponse>('list-cc-mcp-servers', async () => {
        try {
            const [config, settings] = await Promise.all([
                readJsonFile<ClaudeConfigFile>(getClaudeConfigPath()),
                readJsonFile<SettingsFile>(getGlobalSettingsPath())
            ])
            const mcpServers = config.mcpServers ?? {}
            const denied = settings.deniedMcpServers
            const servers: CcMcpServer[] = Object.entries(mcpServers).map(([name, cfg]) => {
                const serverType = (cfg.type === 'streamable-http' ? 'http' : cfg.type ?? 'stdio') as CcMcpServer['type']
                return {
                    name,
                    type: ['http', 'sse', 'ws'].includes(serverType) ? serverType : 'stdio',
                    url: cfg.url,
                    command: cfg.command
                        ? [cfg.command, ...(cfg.args ?? [])].join(' ')
                        : undefined,
                    enabled: !isDeniedByServerName(denied, name)
                }
            })
            return { success: true, servers }
        } catch (error) {
            logger.debug('Failed to list CC MCP servers:', error)
            return rpcError('Failed to list CC MCP servers')
        }
    })

    rpcHandlerManager.registerHandler<UpdateMcpServerStatusRequest, UpdateResponse>('update-mcp-server-status', async (data) => {
        try {
            settingsWriteLock = settingsWriteLock.catch(() => {}).then(async () => {
                const filePath = getGlobalSettingsPath()
                const settings = await readJsonFile<SettingsFile>(filePath)
                if (!settings.deniedMcpServers) {
                    settings.deniedMcpServers = []
                }
                if (!data.enabled) {
                    if (!isDeniedByServerName(settings.deniedMcpServers, data.name)) {
                        settings.deniedMcpServers.push({ serverName: data.name })
                    }
                } else {
                    settings.deniedMcpServers = settings.deniedMcpServers.filter(
                        entry => entry.serverName !== data.name
                    )
                }
                await writeJsonFile(filePath, settings)
            })
            await settingsWriteLock
            return { success: true }
        } catch (error) {
            logger.debug('Failed to update MCP server status:', error)
            return rpcError('Failed to update MCP server status')
        }
    })

    rpcHandlerManager.registerHandler<GetSkillDetailRequest, SkillDetailResponse>('get-cc-skill-detail', async (data) => {
        try {
            const detail = await getSkillDetail(data.name)
            if (!detail) {
                return rpcError('Skill not found')
            }
            return { success: true, detail }
        } catch (error) {
            logger.debug('Failed to get skill detail:', error)
            return rpcError('Failed to get skill detail')
        }
    })

    rpcHandlerManager.registerHandler<GetMcpServerDetailRequest, McpServerDetailResponse>('get-cc-mcp-server-detail', async (data) => {
        try {
            const [config, settings] = await Promise.all([
                readJsonFile<ClaudeConfigFile>(getClaudeConfigPath()),
                readJsonFile<SettingsFile>(getGlobalSettingsPath())
            ])
            const cfg = config.mcpServers?.[data.name]
            if (!cfg) {
                return rpcError('MCP server not found')
            }
            const serverType = (cfg.type === 'streamable-http' ? 'http' : cfg.type ?? 'stdio') as string
            const normalizedType = ['http', 'sse', 'ws'].includes(serverType) ? serverType : 'stdio'
            const { type: _type, url: _url, command: _cmd, args: _args, headers: _headers, env: _env, ...rest } = cfg

            const cacheKey = `${data.name}:${cfg.command ?? ''}:${cfg.url ?? ''}:${(cfg.args ?? []).join(',')}`
            let tools = getCachedMcpTools(cacheKey)
            if (!tools) {
                tools = []
                try {
                    if (normalizedType === 'http' || normalizedType === 'sse') {
                        const mcpHeaders = typeof cfg.headers === 'object' && cfg.headers !== null
                            ? Object.fromEntries(Object.entries(cfg.headers).filter(([, v]) => typeof v === 'string')) as Record<string, string>
                            : undefined
                        tools = await fetchMcpToolsHttp(cfg.url ?? '', mcpHeaders)
                    } else if (cfg.command) {
                        const mcpEnv = typeof cfg.env === 'object' && cfg.env !== null
                            ? Object.fromEntries(Object.entries(cfg.env).filter(([, v]) => typeof v === 'string')) as Record<string, string>
                            : undefined
                        tools = await fetchMcpToolsStdio(cfg.command, cfg.args ?? [], mcpEnv)
                    }
                    if (tools.length > 0) setCachedMcpTools(cacheKey, tools)
                } catch {
                    // tools fetch is best-effort
                }
            }

            return {
                success: true,
                detail: {
                    name: data.name,
                    type: normalizedType,
                    url: cfg.url,
                    command: cfg.command,
                    args: cfg.args,
                    enabled: !isDeniedByServerName(settings.deniedMcpServers, data.name),
                    config: rest,
                    tools,
                }
            }
        } catch (error) {
            logger.debug('Failed to get MCP server detail:', error)
            return rpcError('Failed to get MCP server detail')
        }
    })

    rpcHandlerManager.registerHandler<void, ListCcPluginsResponse>('list-cc-plugins', async () => {
        try {
            const pluginsPath = getPluginsBasePath()
            const installedPath = join(pluginsPath, 'installed_plugins.json')
            if (!existsSync(installedPath)) {
                return { success: true, plugins: [] }
            }
            const [installed, settings] = await Promise.all([
                readJsonFile<InstalledPluginsFile>(installedPath),
                readJsonFile<SettingsFile>(getGlobalSettingsPath())
            ])
            const enabledPlugins = settings.enabledPlugins ?? {}
            const plugins: CcPlugin[] = []

            for (const [pluginKey, versions] of Object.entries(installed.plugins ?? {})) {
                const latest = versions[versions.length - 1]
                if (!latest) continue

                const manifest = await readPluginManifest(latest.installPath)
                const pluginName = manifest?.name || pluginKey.split('@')[0]
                const author = typeof manifest?.author === 'object' ? manifest.author.name : manifest?.author

                plugins.push({
                    name: pluginName,
                    description: manifest?.description,
                    version: latest.version,
                    author,
                    homepage: manifest?.homepage || manifest?.repository,
                    installedAt: latest.installedAt,
                    lastUpdated: latest.lastUpdated,
                    installPath: latest.installPath,
                    hasMcp: hasMcpConfig(latest.installPath),
                    skillCount: await countSkillsInDir(latest.installPath),
                    enabled: enabledPlugins[pluginKey] !== false,
                })
            }

            plugins.sort((a, b) => a.name.localeCompare(b.name))
            return { success: true, plugins }
        } catch (error) {
            logger.debug('Failed to list CC plugins:', error)
            return rpcError('Failed to list CC plugins')
        }
    })

    rpcHandlerManager.registerHandler<GetPluginDetailRequest, PluginDetailResponse>('get-cc-plugin-detail', async (data) => {
        try {
            const pluginsPath = getPluginsBasePath()
            const installedPath = join(pluginsPath, 'installed_plugins.json')
            if (!existsSync(installedPath)) {
                return rpcError('Plugin not found')
            }
            const installed = await readJsonFile<InstalledPluginsFile>(installedPath)

            let targetEntry: { installPath: string; installedAt?: string; lastUpdated?: string; version: string } | undefined
            for (const versions of Object.values(installed.plugins ?? {})) {
                const latest = versions[versions.length - 1]
                if (!latest) continue
                const manifest = await readPluginManifest(latest.installPath)
                const name = manifest?.name || ''
                if (name === data.name) {
                    targetEntry = latest
                    break
                }
            }

            if (!targetEntry) {
                return rpcError('Plugin not found')
            }

            const manifest = await readPluginManifest(targetEntry.installPath)
            const author = typeof manifest?.author === 'object' ? manifest.author.name : manifest?.author

            let mcpConfig: Record<string, unknown> | undefined
            if (hasMcpConfig(targetEntry.installPath)) {
                try {
                    mcpConfig = await readJsonFile<Record<string, unknown>>(join(targetEntry.installPath, '.mcp.json'))
                } catch {
                    // skip
                }
            }

            const skillsDir = join(targetEntry.installPath, 'skills')
            const skills: Array<{ name: string; description?: string }> = []
            if (existsSync(skillsDir)) {
                try {
                    const entries = await readdir(skillsDir, { withFileTypes: true })
                    for (const entry of entries) {
                        if ((!entry.isDirectory() && !entry.isSymbolicLink()) || entry.name.startsWith('.')) continue
                        const skillMd = join(skillsDir, entry.name, 'SKILL.md')
                        if (existsSync(skillMd)) {
                            const content = await readFile(skillMd, 'utf-8')
                            const descMatch = content.match(/^---\r?\n[\s\S]*?\r?\n---/)?.[0]
                            let description: string | undefined
                            if (descMatch) {
                                const descLine = descMatch.match(/description:\s*['"]?(.+?)['"]?\s*$/m)
                                if (descLine) description = descLine[1]
                            }
                            skills.push({ name: entry.name, description })
                        }
                    }
                } catch {
                    // skip
                }
            }

            const files = await listFilesRecursive(targetEntry.installPath, targetEntry.installPath)

            return {
                success: true,
                detail: {
                    name: manifest?.name || data.name,
                    description: manifest?.description,
                    version: targetEntry.version,
                    author,
                    homepage: manifest?.homepage || manifest?.repository,
                    license: manifest?.license,
                    installedAt: targetEntry.installedAt,
                    lastUpdated: targetEntry.lastUpdated,
                    installPath: targetEntry.installPath,
                    hasMcp: hasMcpConfig(targetEntry.installPath),
                    mcpConfig,
                    skills,
                    files,
                },
            }
        } catch (error) {
            logger.debug('Failed to get plugin detail:', error)
            return rpcError('Failed to get plugin detail')
        }
    })

    rpcHandlerManager.registerHandler<UpdatePluginStatusRequest, UpdateResponse>('update-cc-plugin-status', async (data) => {
        try {
            settingsWriteLock = settingsWriteLock.catch(() => {}).then(async () => {
                const pluginsPath = getPluginsBasePath()
                const installedPath = join(pluginsPath, 'installed_plugins.json')
                if (!existsSync(installedPath)) return

                const installed = await readJsonFile<InstalledPluginsFile>(installedPath)
                let pluginKey: string | null = null
                for (const [key, versions] of Object.entries(installed.plugins ?? {})) {
                    const latest = versions[versions.length - 1]
                    if (!latest) continue
                    const manifest = await readPluginManifest(latest.installPath)
                    if ((manifest?.name || key.split('@')[0]) === data.name) {
                        pluginKey = key
                        break
                    }
                }
                if (!pluginKey) return

                const filePath = getGlobalSettingsPath()
                const settings = await readJsonFile<SettingsFile>(filePath)
                if (!settings.enabledPlugins) settings.enabledPlugins = {}

                settings.enabledPlugins[pluginKey] = data.enabled
                await writeJsonFile(filePath, settings)
            })
            await settingsWriteLock
            return { success: true }
        } catch (error) {
            logger.debug('Failed to update plugin status:', error)
            return rpcError('Failed to update plugin status')
        }
    })
}
