import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { RpcHandlerManager } from '../../../api/rpc/RpcHandlerManager'
import { registerProjectPluginsHandlers } from './projectPlugins'

async function writePlugin(pluginsRoot: string, pluginKey: string, name: string, description: string, version: string): Promise<void> {
    const installPath = join(pluginsRoot, pluginKey, version)
    const manifestDir = join(installPath, '.claude-plugin')
    await mkdir(manifestDir, { recursive: true })
    await writeFile(join(manifestDir, 'plugin.json'), JSON.stringify({
        name,
        description,
        version,
        author: 'tester'
    }, null, 2))
}

async function writeInstalledJson(pluginsRoot: string, plugins: Record<string, Array<{ scope: string; installPath: string; version: string }>>): Promise<void> {
    await mkdir(pluginsRoot, { recursive: true })
    await writeFile(join(pluginsRoot, 'installed_plugins.json'), JSON.stringify({ version: 1, plugins }, null, 2))
}

async function invoke<T>(rpc: RpcHandlerManager, method: string, params: unknown): Promise<T> {
    const raw = await rpc.handleRequest({
        method: `machine:${method}`,
        params: JSON.stringify(params)
    })
    return JSON.parse(raw) as T
}

describe('project plugins RPC handlers', () => {
    const originalHome = process.env.HOME
    let sandboxDir: string
    let homeDir: string
    let projectDir: string
    let pluginsRoot: string
    let rpc: RpcHandlerManager

    beforeEach(async () => {
        sandboxDir = await mkdtemp(join(tmpdir(), 'hapi-project-plugins-'))
        homeDir = join(sandboxDir, 'home')
        projectDir = join(sandboxDir, 'project')
        pluginsRoot = join(homeDir, '.claude', 'plugins')
        process.env.HOME = homeDir
        await mkdir(homeDir, { recursive: true })
        await mkdir(projectDir, { recursive: true })

        rpc = new RpcHandlerManager({ scopePrefix: 'machine' })
        registerProjectPluginsHandlers(rpc)
    })

    afterEach(async () => {
        if (originalHome === undefined) {
            delete process.env.HOME
        } else {
            process.env.HOME = originalHome
        }
        await rm(sandboxDir, { recursive: true, force: true })
    })

    it('lists plugins with default enabled state when no overrides set', async () => {
        await writePlugin(pluginsRoot, 'foo@1.0.0', 'foo', 'Foo plugin', '1.0.0')
        await writeInstalledJson(pluginsRoot, {
            'foo@1.0.0': [{ scope: 'user', installPath: join(pluginsRoot, 'foo@1.0.0', '1.0.0'), version: '1.0.0' }]
        })

        const result = await invoke<{
            success: boolean
            plugins?: Array<{ name: string; globalEnabled: boolean; projectEnabled: boolean | null; managedLocally: boolean; effectiveEnabled: boolean }>
        }>(rpc, 'list-project-plugins', { directory: projectDir })

        expect(result.success).toBe(true)
        expect(result.plugins).toHaveLength(1)
        const plugin = result.plugins![0]
        expect(plugin.name).toBe('foo')
        expect(plugin.globalEnabled).toBe(true)
        expect(plugin.projectEnabled).toBeNull()
        expect(plugin.managedLocally).toBe(false)
        expect(plugin.effectiveEnabled).toBe(true)
    })

    it('reflects global disabled state when project has no override', async () => {
        await writePlugin(pluginsRoot, 'foo@1.0.0', 'foo', 'Foo plugin', '1.0.0')
        await writeInstalledJson(pluginsRoot, {
            'foo@1.0.0': [{ scope: 'user', installPath: join(pluginsRoot, 'foo@1.0.0', '1.0.0'), version: '1.0.0' }]
        })
        await mkdir(join(homeDir, '.claude'), { recursive: true })
        await writeFile(
            join(homeDir, '.claude', 'settings.json'),
            JSON.stringify({ enabledPlugins: { 'foo@1.0.0': false } }, null, 2)
        )

        const result = await invoke<{
            success: boolean
            plugins?: Array<{ name: string; globalEnabled: boolean; projectEnabled: boolean | null; managedLocally: boolean; effectiveEnabled: boolean }>
        }>(rpc, 'list-project-plugins', { directory: projectDir })

        const plugin = result.plugins!.find(p => p.name === 'foo')!
        expect(plugin.globalEnabled).toBe(false)
        expect(plugin.projectEnabled).toBeNull()
        expect(plugin.managedLocally).toBe(false)
        expect(plugin.effectiveEnabled).toBe(false)
    })

    it('project override takes precedence over global', async () => {
        await writePlugin(pluginsRoot, 'foo@1.0.0', 'foo', 'Foo plugin', '1.0.0')
        await writeInstalledJson(pluginsRoot, {
            'foo@1.0.0': [{ scope: 'user', installPath: join(pluginsRoot, 'foo@1.0.0', '1.0.0'), version: '1.0.0' }]
        })
        await mkdir(join(homeDir, '.claude'), { recursive: true })
        await writeFile(
            join(homeDir, '.claude', 'settings.json'),
            JSON.stringify({ enabledPlugins: { 'foo@1.0.0': false } }, null, 2)
        )
        await mkdir(join(projectDir, '.claude'), { recursive: true })
        await writeFile(
            join(projectDir, '.claude', 'settings.local.json'),
            JSON.stringify({ enabledPlugins: { 'foo@1.0.0': true } }, null, 2)
        )

        const result = await invoke<{
            success: boolean
            plugins?: Array<{ name: string; globalEnabled: boolean; projectEnabled: boolean | null; managedLocally: boolean; effectiveEnabled: boolean }>
        }>(rpc, 'list-project-plugins', { directory: projectDir })

        const plugin = result.plugins!.find(p => p.name === 'foo')!
        expect(plugin.globalEnabled).toBe(false)
        expect(plugin.projectEnabled).toBe(true)
        expect(plugin.managedLocally).toBe(true)
        expect(plugin.effectiveEnabled).toBe(true)
    })

    it('update writes enabled state to settings.local.json', async () => {
        await writePlugin(pluginsRoot, 'foo@1.0.0', 'foo', 'Foo plugin', '1.0.0')
        await writeInstalledJson(pluginsRoot, {
            'foo@1.0.0': [{ scope: 'user', installPath: join(pluginsRoot, 'foo@1.0.0', '1.0.0'), version: '1.0.0' }]
        })

        const updateResult = await invoke<{ success: boolean }>(
            rpc,
            'update-project-plugin-status',
            { directory: projectDir, name: 'foo', enabled: false }
        )
        expect(updateResult.success).toBe(true)

        const localSettings = JSON.parse(
            await readFile(join(projectDir, '.claude', 'settings.local.json'), 'utf-8')
        ) as { enabledPlugins?: Record<string, boolean> }
        expect(localSettings.enabledPlugins?.['foo@1.0.0']).toBe(false)
    })

    it('clear removes enabledPlugins field from settings.local.json', async () => {
        await writePlugin(pluginsRoot, 'foo@1.0.0', 'foo', 'Foo plugin', '1.0.0')
        await writeInstalledJson(pluginsRoot, {
            'foo@1.0.0': [{ scope: 'user', installPath: join(pluginsRoot, 'foo@1.0.0', '1.0.0'), version: '1.0.0' }]
        })
        await mkdir(join(projectDir, '.claude'), { recursive: true })
        await writeFile(
            join(projectDir, '.claude', 'settings.local.json'),
            JSON.stringify({ enabledPlugins: { 'foo@1.0.0': false } }, null, 2)
        )

        const clearResult = await invoke<{ success: boolean }>(
            rpc,
            'clear-project-plugin-overrides',
            { directory: projectDir }
        )
        expect(clearResult.success).toBe(true)

        const localSettings = JSON.parse(
            await readFile(join(projectDir, '.claude', 'settings.local.json'), 'utf-8')
        ) as { enabledPlugins?: Record<string, boolean> }
        expect(localSettings.enabledPlugins).toBeUndefined()
    })

    it('returns empty list when installed_plugins.json does not exist', async () => {
        const result = await invoke<{
            success: boolean
            plugins?: Array<{ name: string }>
        }>(rpc, 'list-project-plugins', { directory: projectDir })

        expect(result.success).toBe(true)
        expect(result.plugins).toEqual([])
    })

    it('rejects request without directory', async () => {
        const result = await invoke<{ success: boolean; error?: string }>(
            rpc,
            'list-project-plugins',
            { directory: '' }
        )
        expect(result.success).toBe(false)
        expect(result.error).toBeTruthy()
    })
})
