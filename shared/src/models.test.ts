import { describe, expect, test } from 'bun:test'
import {
    CLAUDE_MODEL_PRESETS,
    CLAUDE_MODEL_LABELS,
    DEFAULT_GEMINI_MODEL,
    GEMINI_MODEL_LABELS,
    GEMINI_MODEL_PRESETS,
    formatModelName,
    getClaudeModelLabel,
    isClaudeModelPreset,
} from './models'

describe('isClaudeModelPreset', () => {
    test('accepts valid presets', () => {
        for (const preset of CLAUDE_MODEL_PRESETS) {
            expect(isClaudeModelPreset(preset)).toBe(true)
        }
    })

    test('rejects unknown model string', () => {
        expect(isClaudeModelPreset('haiku')).toBe(false)
    })

    test('rejects null and undefined', () => {
        expect(isClaudeModelPreset(null)).toBe(false)
        expect(isClaudeModelPreset(undefined)).toBe(false)
    })
})

describe('getClaudeModelLabel', () => {
    test('returns label for known presets', () => {
        expect(getClaudeModelLabel('sonnet')).toBe('Sonnet')
        expect(getClaudeModelLabel('opus')).toBe('Opus')
        expect(getClaudeModelLabel('opus[1m]')).toBe('Opus 1M')
    })

    test('trims whitespace before lookup', () => {
        expect(getClaudeModelLabel('  sonnet  ')).toBe('Sonnet')
    })

    test('returns null for unknown model', () => {
        expect(getClaudeModelLabel('haiku')).toBeNull()
    })

    test('returns null for empty/whitespace-only string', () => {
        expect(getClaudeModelLabel('')).toBeNull()
        expect(getClaudeModelLabel('   ')).toBeNull()
    })
})

describe('model constants consistency', () => {
    test('every CLAUDE_MODEL_PRESET has a label', () => {
        for (const preset of CLAUDE_MODEL_PRESETS) {
            expect(CLAUDE_MODEL_LABELS[preset]).toBeDefined()
        }
    })

    test('every GEMINI_MODEL_PRESET has a label', () => {
        for (const preset of GEMINI_MODEL_PRESETS) {
            expect(GEMINI_MODEL_LABELS[preset]).toBeDefined()
        }
    })

    test('DEFAULT_GEMINI_MODEL is a valid preset', () => {
        expect(GEMINI_MODEL_PRESETS).toContain(DEFAULT_GEMINI_MODEL)
    })
})

describe('formatModelName', () => {
    test('returns null for null/undefined/empty', () => {
        expect(formatModelName(null)).toBeNull()
        expect(formatModelName(undefined)).toBeNull()
        expect(formatModelName('')).toBeNull()
        expect(formatModelName('   ')).toBeNull()
    })

    test('resolves Claude presets', () => {
        expect(formatModelName('sonnet')).toBe('Sonnet')
        expect(formatModelName('opus')).toBe('Opus')
        expect(formatModelName('sonnet[1m]')).toBe('Sonnet 1M')
        expect(formatModelName('opus[1m]')).toBe('Opus 1M')
    })

    test('parses Claude API model IDs', () => {
        expect(formatModelName('claude-sonnet-4-20250514')).toBe('Sonnet 4')
        expect(formatModelName('claude-opus-4-20250514')).toBe('Opus 4')
        expect(formatModelName('claude-haiku-3.5')).toBe('Haiku 3.5')
        expect(formatModelName('claude-sonnet-4')).toBe('Sonnet 4')
    })

    test('resolves Gemini model IDs', () => {
        expect(formatModelName('gemini-2.5-pro')).toBe('Gemini 2.5 Pro')
        expect(formatModelName('gemini-2.5-flash')).toBe('Gemini 2.5 Flash')
        expect(formatModelName('gemini-3.1-pro-preview')).toBe('Gemini 3.1 Pro Preview')
    })

    test('handles Codex models', () => {
        expect(formatModelName('codex-mini')).toBe('Codex Mini')
        expect(formatModelName('codex')).toBe('Codex')
    })

    test('passes through GPT model IDs', () => {
        expect(formatModelName('gpt-4o')).toBe('gpt-4o')
    })

    test('passes through unknown models as-is', () => {
        expect(formatModelName('my-custom-model')).toBe('my-custom-model')
    })
})
