import type { SlashCommand } from '@/types/api'

const BUILTIN_COMMANDS: Record<string, SlashCommand[]> = {
    claude: [
        // Session management
        { name: 'help', description: 'List all available commands', source: 'builtin' },
        { name: 'init', description: 'Explore the codebase and generate a starter CLAUDE.md', source: 'builtin' },
        { name: 'clear', description: 'Clear conversation history and start fresh', source: 'builtin' },
        { name: 'compact', description: 'Summarize the conversation to free up context', source: 'builtin' },
        { name: 'btw', description: 'Ask a quick side question without affecting the main conversation', source: 'builtin' },
        { name: 'rewind', description: 'Roll the conversation and/or code back to an earlier checkpoint', source: 'builtin' },
        { name: 'resume', description: 'Reopen a previous session and continue where you left off', source: 'builtin' },
        { name: 'branch', description: 'Create a branch of the current conversation at this point', source: 'builtin' },
        { name: 'exit', description: 'Quit the CLI', source: 'builtin' },
        // Model & config
        { name: 'model', description: 'View or switch the active model', source: 'builtin' },
        { name: 'config', description: 'Open configuration settings', source: 'builtin' },
        { name: 'permissions', description: 'View or change which tools require approval', source: 'builtin' },
        { name: 'plan', description: 'Enter Plan Mode directly from the prompt', source: 'builtin' },
        { name: 'effort', description: 'Adjust response effort level', source: 'builtin' },
        { name: 'fast', description: 'Toggle fast mode', source: 'builtin' },
        { name: 'brief', description: 'Toggle brief output mode', source: 'builtin' },
        // Context & memory
        { name: 'context', description: 'Visualize what is loaded into the context window', source: 'builtin' },
        { name: 'memory', description: 'View or edit the CLAUDE.md files in scope', source: 'builtin' },
        { name: 'add-dir', description: 'Grant Claude file access to an additional directory', source: 'builtin' },
        // Git & code
        { name: 'diff', description: 'Open an interactive viewer of uncommitted changes', source: 'builtin' },
        { name: 'review', description: 'AI-powered code review of changes', source: 'builtin' },
        { name: 'security-review', description: 'Security-focused code review', source: 'builtin' },
        { name: 'commit', description: 'Create a git commit with an AI-generated message', source: 'builtin' },
        { name: 'commit-push-pr', description: 'Commit, push, and create a PR in one step', source: 'builtin' },
        // Diagnostics & info
        { name: 'status', description: 'Show account, model, working directory, and version', source: 'builtin' },
        { name: 'cost', description: 'Show token usage and spend for this session', source: 'builtin' },
        { name: 'usage', description: "Show your plan's usage limits and current rate-limit status", source: 'builtin' },
        { name: 'doctor', description: 'Diagnose install and environment issues', source: 'builtin' },
        { name: 'export', description: 'Save the current conversation to a file or clipboard', source: 'builtin' },
        { name: 'copy', description: 'Copy the last response to clipboard', source: 'builtin' },
        // Agents & tools
        { name: 'agents', description: 'List, create, or edit subagents', source: 'builtin' },
        { name: 'mcp', description: 'Manage MCP server connections and authentication', source: 'builtin' },
        { name: 'hooks', description: 'View hook configuration for tool events', source: 'builtin' },
        { name: 'skills', description: 'List the skills available in this session', source: 'builtin' },
        { name: 'tasks', description: 'Manage background tasks', source: 'builtin' },
        { name: 'schedule', description: 'Create, update, list, or run routines', source: 'builtin' },
        { name: 'loop', description: 'Run a prompt repeatedly on a schedule', source: 'builtin' },
        // Skills
        { name: 'simplify', description: 'Review changed files for reuse, quality, and efficiency', source: 'builtin' },
        { name: 'claude-api', description: 'Load Claude API reference material for your project', source: 'builtin' },
        // Auth & install
        { name: 'login', description: 'Authenticate with your Anthropic account', source: 'builtin' },
        { name: 'logout', description: 'Sign out of your Anthropic account', source: 'builtin' },
        { name: 'install', description: 'Install or update Claude Code', source: 'builtin' },
        { name: 'upgrade', description: 'Upgrade to the latest version', source: 'builtin' },
        { name: 'terminalSetup', description: 'Configure terminal integration', source: 'builtin' },
        { name: 'feedback', description: 'Report an issue to Anthropic', source: 'builtin' },
    ],
    codex: [
        { name: 'clear', description: 'Clear current Codex thread context', source: 'builtin' },
        { name: 'compact', description: 'Compact current Codex thread context', source: 'builtin' },
        { name: 'help', description: 'Show supported HAPI Codex slash commands', source: 'builtin' },
        { name: 'plan', description: 'Enable plan mode; use /plan off to return to default', source: 'builtin' },
        { name: 'default', description: 'Return Codex collaboration mode to default', source: 'builtin' },
        { name: 'execute', description: 'Return Codex collaboration mode to default', source: 'builtin' },
        { name: 'status', description: 'Show current Codex session config', source: 'builtin' },
        { name: 'model', description: 'Show or set Codex model, e.g. /model gpt-5.5', source: 'builtin' },
        { name: 'reasoning', description: 'Show or set reasoning effort', source: 'builtin' },
        { name: 'effort', description: 'Alias for /reasoning', source: 'builtin' },
        { name: 'permissions', description: 'Show or set permission mode', source: 'builtin' },
        { name: 'permission', description: 'Alias for /permissions', source: 'builtin' },
    ],
    gemini: [
        { name: 'about', description: 'Show version info', source: 'builtin' },
        { name: 'clear', description: 'Clear the screen and conversation history', source: 'builtin' },
        { name: 'compress', description: 'Compress the context by replacing it with a summary', source: 'builtin' },
        { name: 'stats', description: 'Check session stats', source: 'builtin' },
    ],
    opencode: [],
}

const UNSUPPORTED_CODEX_BUILTIN_COMMANDS = new Set([
    'review',
    'new',
    'compat',
    'undo',
    'diff',
])

export function getBuiltinSlashCommands(agentType: string): SlashCommand[] {
    return BUILTIN_COMMANDS[agentType] ?? BUILTIN_COMMANDS.claude ?? []
}

export function mergeSlashCommands(commands: readonly SlashCommand[]): SlashCommand[] {
    const commandMap = new Map<string, SlashCommand>()
    for (const command of commands) {
        const key = command.name.toLowerCase()
        if (commandMap.has(key)) {
            commandMap.delete(key)
        }
        commandMap.set(key, command)
    }
    return Array.from(commandMap.values())
}

export function findCodexCustomPromptExpansion(
    text: string,
    availableCommands: readonly SlashCommand[]
): string | null {
    const trimmed = text.trim()
    const match = /^\/([a-z0-9:_-]+)$/i.exec(trimmed)
    if (!match) {
        return null
    }

    const commandName = match[1]?.toLowerCase()
    if (!commandName) {
        return null
    }

    const command = availableCommands.find(
        candidate => candidate.source !== 'builtin'
            && candidate.name.toLowerCase() === commandName
            && typeof candidate.content === 'string'
            && candidate.content.length > 0
    )
    return command?.content ?? null
}

export function findUnsupportedCodexBuiltinSlashCommand(
    text: string,
    availableCommands: readonly SlashCommand[]
): string | null {
    const match = /^\s*\/([a-z0-9:_-]+)(?:\s|$)/i.exec(text)
    if (!match) {
        return null
    }

    const commandName = match[1]?.toLowerCase()
    if (!commandName || !UNSUPPORTED_CODEX_BUILTIN_COMMANDS.has(commandName)) {
        return null
    }

    const hasCustomCommand = availableCommands.some(
        command => command.source !== 'builtin' && command.name.toLowerCase() === commandName
    )

    return hasCustomCommand ? null : commandName
}
