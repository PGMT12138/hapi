import type { ChatBlock } from '@/chat/types'

const CONTEXT_USAGE_HEADER = /^## Context Usage/m

export type TableRow = readonly string[]

export type ContextSection = {
    title: string
    headers: readonly string[]
    rows: readonly TableRow[]
}

export type ParsedContextData = {
    model: string
    tokensUsed: string
    tokensTotal: string
    tokensPercentage: number
    sections: readonly ContextSection[]
}

export type ContextCommandOutput = {
    rawText: string
    createdAt: number
    parsed: ParsedContextData | null
}

const MODEL_REGEX = /\*\*Model:\*\*\s*(.+)/
const TOKENS_REGEX = /\*\*Tokens:\*\*\s*([\d.]+[km]?)\s*\/\s*([\d.]+[km]?)\s*\((\d+)%\)/
const SECTION_HEADER_REGEX = /^### (.+)$/m

function parseMarkdownTable(text: string): { headers: string[]; rows: string[][] } | null {
    const lines = text.split('\n').filter((line) => line.trim().startsWith('|'))
    if (lines.length < 2) return null

    const headers = lines[0].split('|').map((c) => c.trim()).filter(Boolean)
    // Skip separator line (line with ---)
    const rows = lines.slice(2).map((line) =>
        line.split('|').map((c) => c.trim()).filter(Boolean)
    )
    return { headers, rows }
}

function parseSections(text: string): ContextSection[] {
    const sections: ContextSection[] = []
    const headerMatches = [...text.matchAll(new RegExp(SECTION_HEADER_REGEX.source, 'gm'))]

    for (let i = 0; i < headerMatches.length; i++) {
        const match = headerMatches[i]
        const title = match[1]
        const start = match.index! + match[0].length
        const end = i + 1 < headerMatches.length ? headerMatches[i + 1].index! : text.length
        const sectionText = text.slice(start, end)

        const table = parseMarkdownTable(sectionText)
        if (table) {
            sections.push({ title, headers: table.headers, rows: table.rows })
        }
    }

    return sections
}

export function parseTokenValue(s: string): number {
    if (s.endsWith('m')) return Math.round(parseFloat(s) * 1_000_000)
    if (s.endsWith('k')) return Math.round(parseFloat(s) * 1000)
    return parseInt(s, 10)
}

function parseContextText(text: string): ParsedContextData | null {
    const modelMatch = MODEL_REGEX.exec(text)
    const tokensMatch = TOKENS_REGEX.exec(text)

    if (!tokensMatch) return null

    return {
        model: modelMatch?.[1]?.trim() ?? 'Unknown',
        tokensUsed: tokensMatch[1],
        tokensTotal: tokensMatch[2],
        tokensPercentage: parseInt(tokensMatch[3], 10),
        sections: parseSections(text)
    }
}

export function extractContextCommandOutput(
    blocks: readonly ChatBlock[]
): ContextCommandOutput | null {
    for (let i = blocks.length - 1; i >= 0; i--) {
        const block = blocks[i]
        if (block.kind !== 'agent-text') continue
        if (!CONTEXT_USAGE_HEADER.test(block.text)) continue

        const rawText = block.text.trim()
        return {
            rawText,
            createdAt: block.createdAt,
            parsed: parseContextText(rawText)
        }
    }
    return null
}

export type CategoryGrowth = {
    tokenDelta: number
    percentageDelta: number
}

export type ContextGrowth = {
    tokenDelta: number
    percentageDelta: number
    categories: Record<string, CategoryGrowth>
}

function extractCategoryMap(parsed: ParsedContextData): Map<string, { tokens: number; pct: number }> {
    const map = new Map<string, { tokens: number; pct: number }>()
    const categorySection = parsed.sections.find(s => s.title === 'Estimated usage by category')
    if (!categorySection) return map
    for (const row of categorySection.rows) {
        if (row.length < 3) continue
        map.set(row[0], {
            tokens: parseTokenValue(row[1]),
            pct: parseFloat(row[2]),
        })
    }
    return map
}

export function computeContextGrowth(
    blocks: readonly ChatBlock[]
): ContextGrowth | null {
    const outputs: { tokensUsed: number; percentage: number; categories: Map<string, { tokens: number; pct: number }> }[] = []
    for (let i = 0; i < blocks.length; i++) {
        const block = blocks[i]
        if (block.kind !== 'agent-text') continue
        if (!CONTEXT_USAGE_HEADER.test(block.text)) continue
        const parsed = parseContextText(block.text)
        if (!parsed) continue
        outputs.push({
            tokensUsed: parseTokenValue(parsed.tokensUsed),
            percentage: parsed.tokensPercentage,
            categories: extractCategoryMap(parsed),
        })
    }
    if (outputs.length < 2) return null
    const prev = outputs[outputs.length - 2]
    const curr = outputs[outputs.length - 1]

    const categories: Record<string, CategoryGrowth> = {}
    for (const [name, currVal] of curr.categories) {
        const prevVal = prev.categories.get(name)
        if (!prevVal) continue
        const td = currVal.tokens - prevVal.tokens
        const pd = Math.round((currVal.pct - prevVal.pct) * 10) / 10
        if (td === 0 && pd === 0) continue
        categories[name] = { tokenDelta: td, percentageDelta: pd }
    }

    return {
        tokenDelta: curr.tokensUsed - prev.tokensUsed,
        percentageDelta: curr.percentage - prev.percentage,
        categories,
    }
}

export function computeModelNamesFromHistory(
    blocks: readonly ChatBlock[]
): Map<string, string> {
    const modelNames = new Map<string, string>()

    for (let i = 0; i < blocks.length; i++) {
        const block = blocks[i]
        if (block.kind !== 'agent-text') continue
        if (!CONTEXT_USAGE_HEADER.test(block.text)) continue
        const parsed = parseContextText(block.text)
        if (!parsed) continue

        // Find the last user message before this context output
        let lastUserIdx = -1
        for (let j = i - 1; j >= 0; j--) {
            if (blocks[j].kind === 'user-text') {
                lastUserIdx = j
                break
            }
        }
        if (lastUserIdx < 0) continue

        // Assign model name to ALL assistant blocks in the range.
        // assistant-ui merges consecutive assistant messages, keeping the first block's ID.
        // By assigning to all blocks, the model name is found regardless of which ID survives.
        for (let j = lastUserIdx + 1; j < i; j++) {
            const b = blocks[j]
            if (
                (b.kind === 'agent-text' || b.kind === 'agent-reasoning' || b.kind === 'tool-call')
                && !(b.kind === 'agent-text' && CONTEXT_USAGE_HEADER.test(b.text))
            ) {
                modelNames.set(b.id, parsed.model)
            }
        }
    }

    return modelNames
}

export function computeTokenDeltasFromHistory(
    blocks: readonly ChatBlock[]
): Map<string, number> {
    const deltas = new Map<string, number>()

    // Collect all context output blocks with their token counts
    const contextOutputs: { index: number; tokensUsed: number }[] = []
    for (let i = 0; i < blocks.length; i++) {
        const block = blocks[i]
        if (block.kind !== 'agent-text') continue
        if (!CONTEXT_USAGE_HEADER.test(block.text)) continue
        const parsed = parseContextText(block.text)
        if (!parsed) continue
        contextOutputs.push({ index: i, tokensUsed: parseTokenValue(parsed.tokensUsed) })
    }

    if (contextOutputs.length < 2) return deltas

    // Compute delta from each consecutive pair of context outputs
    for (let ci = 1; ci < contextOutputs.length; ci++) {
        const prev = contextOutputs[ci - 1]
        const curr = contextOutputs[ci]
        const delta = curr.tokensUsed - prev.tokensUsed
        if (delta <= 0) continue

        // Find the last user message before the current context output
        let lastUserIdx = -1
        for (let j = curr.index - 1; j >= 0; j--) {
            if (blocks[j].kind === 'user-text') {
                lastUserIdx = j
                break
            }
        }
        if (lastUserIdx < 0) continue

        // Assign delta to ALL assistant blocks in the range (reasoning, text, and tool-call).
        // assistant-ui merges consecutive assistant messages, keeping the first block's ID.
        // By assigning to all blocks, the delta is found regardless of which ID survives.
        for (let j = lastUserIdx + 1; j < curr.index; j++) {
            const block = blocks[j]
            if (
                (block.kind === 'agent-text' || block.kind === 'agent-reasoning' || block.kind === 'tool-call')
                && !(block.kind === 'agent-text' && CONTEXT_USAGE_HEADER.test(block.text))
            ) {
                deltas.set(block.id, delta)
            }
        }
    }

    return deltas
}

export function computeDurationFromHistory(
    blocks: readonly ChatBlock[]
): Map<string, number> {
    const durations = new Map<string, number>()
    let lastUserCreatedAt: number | undefined

    for (const block of blocks) {
        if (block.kind === 'user-text') {
            lastUserCreatedAt = block.createdAt
        } else if (
            (block.kind === 'agent-text' || block.kind === 'agent-reasoning' || block.kind === 'tool-call')
            && !(block.kind === 'agent-text' && CONTEXT_USAGE_HEADER.test(block.text))
        ) {
            if (lastUserCreatedAt != null) {
                durations.set(block.id, block.createdAt - lastUserCreatedAt)
            }
        }
    }

    return durations
}

export function computePendingTokenBlocks(
    blocks: readonly ChatBlock[]
): Set<string> {
    const pending = new Set<string>()

    // Find the index of the last context output block
    let lastContextIdx = -1
    for (let i = blocks.length - 1; i >= 0; i--) {
        const block = blocks[i]
        if (block.kind === 'agent-text' && CONTEXT_USAGE_HEADER.test(block.text)) {
            lastContextIdx = i
            break
        }
    }

    // Find the last user message after the last context output
    let lastUserIdx = -1
    const start = lastContextIdx + 1
    for (let i = blocks.length - 1; i >= start; i--) {
        if (blocks[i].kind === 'user-text') {
            lastUserIdx = i
            break
        }
    }
    if (lastUserIdx < 0) return pending

    // All assistant blocks after the last user message are "pending" context output
    for (let j = lastUserIdx + 1; j < blocks.length; j++) {
        const block = blocks[j]
        if (
            (block.kind === 'agent-text' || block.kind === 'agent-reasoning')
            && !(block.kind === 'agent-text' && CONTEXT_USAGE_HEADER.test(block.text))
        ) {
            pending.add(block.id)
        }
    }

    return pending
}
