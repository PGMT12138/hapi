import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { RpcHandlerManager } from '../../../api/rpc/RpcHandlerManager'
import { registerProjectSkillsHandlers } from './projectSkills'

async function writeSkill(skillDir: string, name: string, description: string): Promise<void> {
    await mkdir(skillDir, { recursive: true })
    await writeFile(join(skillDir, 'SKILL.md'), [
        '---',
        `name: ${name}`,
        `description: ${description}`,
        '---',
        '',
        `# ${name}`,
    ].join('\n'))
}

async function invoke<T>(rpc: RpcHandlerManager, method: string, params: unknown): Promise<T> {
    const raw = await rpc.handleRequest({
        method: `machine:${method}`,
        params: JSON.stringify(params)
    })
    return JSON.parse(raw) as T
}

describe('project skills RPC handlers', () => {
    const originalHome = process.env.HOME
    let sandboxDir: string
    let homeDir: string
    let projectDir: string
    let rpc: RpcHandlerManager

    beforeEach(async () => {
        sandboxDir = await mkdtemp(join(tmpdir(), 'hapi-project-skills-'))
        homeDir = join(sandboxDir, 'home')
        projectDir = join(sandboxDir, 'project')
        process.env.HOME = homeDir
        await mkdir(homeDir, { recursive: true })
        await mkdir(projectDir, { recursive: true })

        rpc = new RpcHandlerManager({ scopePrefix: 'machine' })
        registerProjectSkillsHandlers(rpc)
    })

    afterEach(async () => {
        if (originalHome === undefined) {
            delete process.env.HOME
        } else {
            process.env.HOME = originalHome
        }
        await rm(sandboxDir, { recursive: true, force: true })
    })

    it('lists skills with default state when no overrides set', async () => {
        await writeSkill(join(homeDir, '.claude', 'skills', 'alpha'), 'alpha', 'Alpha skill')

        const result = await invoke<{
            success: boolean
            skills?: Array<{ name: string; folderName: string; globalOverride: string | null; projectOverride: string | null; managedLocally: boolean; effectiveState: string | null }>
        }>(rpc, 'list-project-skills', { directory: projectDir })

        expect(result.success).toBe(true)
        expect(result.skills).toHaveLength(1)
        const skill = result.skills![0]
        expect(skill.name).toBe('alpha')
        expect(skill.globalOverride).toBeNull()
        expect(skill.projectOverride).toBeNull()
        expect(skill.managedLocally).toBe(false)
        expect(skill.effectiveState).toBeNull()
    })

    it('reflects global override when project has no override', async () => {
        await writeSkill(join(homeDir, '.claude', 'skills', 'alpha'), 'alpha', 'Alpha skill')
        await mkdir(join(homeDir, '.claude'), { recursive: true })
        await writeFile(
            join(homeDir, '.claude', 'settings.json'),
            JSON.stringify({ skillOverrides: { alpha: 'off' } }, null, 2)
        )

        const result = await invoke<{
            success: boolean
            skills?: Array<{ name: string; globalOverride: string | null; projectOverride: string | null; managedLocally: boolean; effectiveState: string | null }>
        }>(rpc, 'list-project-skills', { directory: projectDir })

        const skill = result.skills!.find(s => s.name === 'alpha')!
        expect(skill.globalOverride).toBe('off')
        expect(skill.projectOverride).toBeNull()
        expect(skill.managedLocally).toBe(false)
        expect(skill.effectiveState).toBe('off')
    })

    it('project override takes precedence over global', async () => {
        await writeSkill(join(homeDir, '.claude', 'skills', 'alpha'), 'alpha', 'Alpha skill')
        await writeFile(
            join(homeDir, '.claude', 'settings.json'),
            JSON.stringify({ skillOverrides: { alpha: 'off' } }, null, 2)
        )
        await mkdir(join(projectDir, '.claude'), { recursive: true })

        const result = await invoke<{
            success: boolean
            skills?: Array<{ name: string; globalOverride: string | null; projectOverride: string | null; managedLocally: boolean; effectiveState: string | null }>
        }>(rpc, 'list-project-skills', { directory: projectDir })

        const skill = result.skills!.find(s => s.name === 'alpha')!
        expect(skill.globalOverride).toBe('off')
        expect(skill.projectOverride).toBeNull()
        expect(skill.effectiveState).toBe('off')
    })

    it('update writes off state to settings.local.json', async () => {
        await writeSkill(join(homeDir, '.claude', 'skills', 'alpha'), 'alpha', 'Alpha skill')

        const updateResult = await invoke<{ success: boolean }>(
            rpc,
            'update-project-skill-override',
            { directory: projectDir, name: 'alpha', enabled: false }
        )
        expect(updateResult.success).toBe(true)

        const result = await invoke<{
            success: boolean
            skills?: Array<{ name: string; projectOverride: string | null; managedLocally: boolean; effectiveState: string | null }>
        }>(rpc, 'list-project-skills', { directory: projectDir })

        const skill = result.skills!.find(s => s.name === 'alpha')!
        expect(skill.projectOverride).toBe('off')
        expect(skill.managedLocally).toBe(true)
        expect(skill.effectiveState).toBe('off')
    })

    it('update with enabled removes the override entry when global is not off', async () => {
        await writeSkill(join(homeDir, '.claude', 'skills', 'alpha'), 'alpha', 'Alpha skill')
        await mkdir(join(projectDir, '.claude'), { recursive: true })
        await writeFile(
            join(projectDir, '.claude', 'settings.local.json'),
            JSON.stringify({ skillOverrides: { alpha: 'off' } }, null, 2)
        )

        const updateResult = await invoke<{ success: boolean }>(
            rpc,
            'update-project-skill-override',
            { directory: projectDir, name: 'alpha', enabled: true }
        )
        expect(updateResult.success).toBe(true)

        const result = await invoke<{
            success: boolean
            skills?: Array<{ name: string; projectOverride: string | null; managedLocally: boolean; effectiveState: string | null }>
        }>(rpc, 'list-project-skills', { directory: projectDir })

        const skill = result.skills!.find(s => s.name === 'alpha')!
        expect(skill.projectOverride).toBeNull()
        expect(skill.managedLocally).toBe(false)
        expect(skill.effectiveState).toBeNull()
    })

    it('update with enabled writes "on" when global is off to reverse-override', async () => {
        await writeSkill(join(homeDir, '.claude', 'skills', 'alpha'), 'alpha', 'Alpha skill')
        await mkdir(join(homeDir, '.claude'), { recursive: true })
        await writeFile(
            join(homeDir, '.claude', 'settings.json'),
            JSON.stringify({ skillOverrides: { alpha: 'off' } }, null, 2)
        )

        const updateResult = await invoke<{ success: boolean }>(
            rpc,
            'update-project-skill-override',
            { directory: projectDir, name: 'alpha', enabled: true }
        )
        expect(updateResult.success).toBe(true)

        const result = await invoke<{
            success: boolean
            skills?: Array<{ name: string; projectOverride: string | null; managedLocally: boolean; effectiveState: string | null }>
        }>(rpc, 'list-project-skills', { directory: projectDir })

        const skill = result.skills!.find(s => s.name === 'alpha')!
        expect(skill.managedLocally).toBe(true)
        expect(skill.effectiveState).toBeNull()

        const localSettings = JSON.parse(
            await readFile(join(projectDir, '.claude', 'settings.local.json'), 'utf-8')
        ) as { skillOverrides?: Record<string, string> }
        expect(localSettings.skillOverrides?.alpha).toBe('on')
    })

    it('lists project "on" override as enabled when global is off', async () => {
        await writeSkill(join(homeDir, '.claude', 'skills', 'alpha'), 'alpha', 'Alpha skill')
        await mkdir(join(homeDir, '.claude'), { recursive: true })
        await writeFile(
            join(homeDir, '.claude', 'settings.json'),
            JSON.stringify({ skillOverrides: { alpha: 'off' } }, null, 2)
        )
        await mkdir(join(projectDir, '.claude'), { recursive: true })
        await writeFile(
            join(projectDir, '.claude', 'settings.local.json'),
            JSON.stringify({ skillOverrides: { alpha: 'on' } }, null, 2)
        )

        const result = await invoke<{
            success: boolean
            skills?: Array<{ name: string; globalOverride: string | null; projectOverride: string | null; managedLocally: boolean; effectiveState: string | null }>
        }>(rpc, 'list-project-skills', { directory: projectDir })

        const skill = result.skills!.find(s => s.name === 'alpha')!
        expect(skill.globalOverride).toBe('off')
        expect(skill.managedLocally).toBe(true)
        expect(skill.effectiveState).toBeNull()
    })

    it('rejects request without directory', async () => {
        const result = await invoke<{ success: boolean; error?: string }>(
            rpc,
            'list-project-skills',
            { directory: '' }
        )
        expect(result.success).toBe(false)
        expect(result.error).toBeTruthy()
    })
})
