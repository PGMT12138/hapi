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
