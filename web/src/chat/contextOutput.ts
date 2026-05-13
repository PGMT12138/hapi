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

        // Assign delta to ALL assistant blocks in the range (both reasoning and text).
        // assistant-ui merges consecutive assistant messages, keeping the first block's ID.
        // By assigning to all blocks, the delta is found regardless of which ID survives.
        for (let j = lastUserIdx + 1; j < curr.index; j++) {
            const block = blocks[j]
            if (
                (block.kind === 'agent-text' || block.kind === 'agent-reasoning')
                && !(block.kind === 'agent-text' && CONTEXT_USAGE_HEADER.test(block.text))
            ) {
                deltas.set(block.id, delta)
            }
        }
    }

    return deltas
}
