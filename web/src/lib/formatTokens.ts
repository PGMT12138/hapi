export function formatTokens(tokens: number): string {
    if (tokens >= 1_000_000) {
        const m = tokens / 1_000_000
        return `${m.toFixed(1).replace(/\.0$/, '')}m`
    }
    if (tokens >= 1000) {
        const k = tokens / 1000
        return k >= 100 ? `${Math.round(k)}k` : `${k.toFixed(1).replace(/\.0$/, '')}k`
    }
    return String(tokens)
}
