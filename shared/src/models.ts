export const CLAUDE_MODEL_LABELS = {
    sonnet: 'Sonnet',
    'sonnet[1m]': 'Sonnet 1M',
    opus: 'Opus',
    'opus[1m]': 'Opus 1M'
} as const

export type ClaudeModelPreset = keyof typeof CLAUDE_MODEL_LABELS
export const CLAUDE_MODEL_PRESETS = Object.keys(CLAUDE_MODEL_LABELS) as ClaudeModelPreset[]

export const GEMINI_MODEL_LABELS = {
    'gemini-3.1-pro-preview': 'Gemini 3.1 Pro Preview',
    'gemini-3-flash-preview': 'Gemini 3 Flash Preview',
    'gemini-2.5-pro': 'Gemini 2.5 Pro',
    'gemini-2.5-flash': 'Gemini 2.5 Flash',
    'gemini-2.5-flash-lite': 'Gemini 2.5 Flash Lite',
} as const

export type GeminiModelPreset = keyof typeof GEMINI_MODEL_LABELS
export const GEMINI_MODEL_PRESETS = Object.keys(GEMINI_MODEL_LABELS) as GeminiModelPreset[]
export const DEFAULT_GEMINI_MODEL: GeminiModelPreset = 'gemini-2.5-pro'

export function isClaudeModelPreset(model: string | null | undefined): model is ClaudeModelPreset {
    return typeof model === 'string' && Object.hasOwn(CLAUDE_MODEL_LABELS, model)
}

export function getClaudeModelLabel(model: string): string | null {
    const trimmedModel = model.trim()
    if (!trimmedModel) {
        return null
    }

    return CLAUDE_MODEL_LABELS[trimmedModel as ClaudeModelPreset] ?? null
}

export function formatModelName(model: string | null | undefined): string | null {
    if (!model) return null
    const trimmed = model.trim()
    if (!trimmed) return null

    // Check known presets first (e.g., "sonnet", "opus")
    const presetLabel = CLAUDE_MODEL_LABELS[trimmed as ClaudeModelPreset]
    if (presetLabel) return presetLabel

    const lower = trimmed.toLowerCase()

    // Gemini models
    for (const [key, label] of Object.entries(GEMINI_MODEL_LABELS)) {
        if (lower.startsWith(key.toLowerCase())) return label
    }

    // Claude API model IDs: claude-sonnet-4-20250514, claude-opus-4-7, etc.
    if (lower.startsWith('claude-')) {
        const withoutPrefix = lower.slice('claude-'.length)
        // Extract family (sonnet, opus, haiku) and version
        const familyMatch = withoutPrefix.match(/^(sonnet|opus|haiku)-?(\d+(?:\.\d+)*)/)
        if (familyMatch) {
            const family = familyMatch[1]
            const version = familyMatch[2]
            const familyLabel = family.charAt(0).toUpperCase() + family.slice(1)
            return version ? `${familyLabel} ${version}` : familyLabel
        }
    }

    // Codex models
    if (lower.includes('codex')) {
        return trimmed.includes('mini') ? 'Codex Mini' : 'Codex'
    }

    // OpenAI models
    if (lower.startsWith('gpt-')) {
        return trimmed
    }

    // Fallback: return as-is, trimmed
    return trimmed
}
