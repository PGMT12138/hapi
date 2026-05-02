import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { logger } from '@/ui/logger'

const SCRIPT_NAME = 'statusline-context.sh'

const SCRIPT_CONTENT = `#!/bin/bash
input=$(cat)
[ -z "$HAPI_SESSION_ID" ] && exit 0
curl -sf -X POST "\${HAPI_HUB_URL:-http://127.0.0.1:3006}/api/sessions/context" \\
  -H "Content-Type: application/json" \\
  -d "{\\"sid\\":\\"$HAPI_SESSION_ID\\",\\"data\\":$input}" >/dev/null 2>&1
`

export function ensureStatusLineScript(): string | null {
    const hapiDir = join(homedir(), '.hapi')
    try {
        if (!existsSync(hapiDir)) {
            mkdirSync(hapiDir, { recursive: true, mode: 0o700 })
        }
        const scriptPath = join(hapiDir, SCRIPT_NAME)
        if (!existsSync(scriptPath)) {
            writeFileSync(scriptPath, SCRIPT_CONTENT, { mode: 0o755 })
            chmodSync(scriptPath, 0o755)
            logger.debug(`[statusLine] Created ${scriptPath}`)
        }
        return scriptPath
    } catch (error) {
        logger.debug(`[statusLine] Failed to create statusLine script: ${error}`)
        return null
    }
}

export function injectStatusLineSettings(workingDirectory: string, scriptPath: string): void {
    const claudeDir = join(workingDirectory, '.claude')
    const settingsPath = join(claudeDir, 'settings.local.json')

    try {
        let settings: Record<string, unknown> = {}
        if (existsSync(settingsPath)) {
            const raw = readFileSync(settingsPath, 'utf-8')
            try {
                settings = JSON.parse(raw)
            } catch {
                settings = {}
            }
        }

        // Don't overwrite user's existing statusLine config
        if (settings.statusLine !== undefined) return

        settings.statusLine = { type: 'command', command: scriptPath }

        if (!existsSync(claudeDir)) {
            mkdirSync(claudeDir, { recursive: true })
        }
        writeFileSync(settingsPath, JSON.stringify(settings, null, 2))
        logger.debug(`[statusLine] Injected statusLine into ${settingsPath}`)
    } catch (error) {
        logger.debug(`[statusLine] Failed to inject statusLine settings: ${error}`)
    }
}
