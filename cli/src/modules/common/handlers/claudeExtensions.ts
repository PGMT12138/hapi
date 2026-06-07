import { logger } from '@/ui/logger'
import { readFile, writeFile } from 'fs/promises'
import { existsSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import type { RpcHandlerManager } from '@/api/rpc/RpcHandlerManager'
import { rpcError } from '../rpcResponses'
import { listClaudeCodeSkills, listSkills, getSkillDetail } from '../skills'
import type { CcSkill, CcMcpServer } from '@hapi/protocol/types'

interface SettingsFile {
    permissions?: {
        deny?: string[]
        [key: string]: unknown
    }
    skillOverrides?: Record<string, string>
    deniedMcpServers?: Array<{ serverName?: string; serverUrl?: string; serverCommand?: string[] }>
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

async function fetchMcpToolsHttp(url: string): Promise<McpTool[]> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 10_000)
    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: 1,
                method: 'tools/list',
                params: {},
            }),
            signal: controller.signal,
        })
        const json = await res.json() as { result?: { tools?: Array<{ name?: string; description?: string }> }; error?: unknown }
        if (json.error) return []
        return (json.result?.tools ?? [])
            .filter(t => typeof t.name === 'string')
            .map(t => ({ name: t.name!, description: t.description }))
    } catch {
        return []
    } finally {
        clearTimeout(timer)
    }
}

async function fetchMcpToolsStdio(command: string, args: string[]): Promise<McpTool[]> {
    const { spawn } = await import('child_process')
    return new Promise((resolve) => {
        const proc = spawn(command, args, { stdio: ['pipe', 'pipe', 'pipe'] })
        let stdout = ''
        let settled = false
        const timer = setTimeout(() => {
            if (!settled) { settled = true; proc.kill(); resolve([]) }
        }, 10_000)

        proc.stdout.on('data', (chunk: Buffer) => {
            stdout += chunk.toString()
            if (!settled && stdout.includes('"id":1')) {
                settled = true
                clearTimeout(timer)
                try {
                    const json = JSON.parse(stdout.split('\n').find(l => l.includes('"id":1')) || '{}') as { result?: { tools?: Array<{ name?: string; description?: string }> } }
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
        proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }) + '\n')
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
            const { type: _type, url: _url, command: _cmd, args: _args, ...rest } = cfg

            let tools: McpTool[] = []
            try {
                if (normalizedType === 'http' || normalizedType === 'sse') {
                    tools = await fetchMcpToolsHttp(cfg.url ?? '')
                } else if (cfg.command) {
                    tools = await fetchMcpToolsStdio(cfg.command, cfg.args ?? [])
                }
            } catch {
                // tools fetch is best-effort
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
}
