import { useState } from 'react'
import type { CategoryGrowth, ContextCommandOutput, ContextGrowth, ContextSection } from '@/chat/contextOutput'
import { useTranslation } from '@/lib/use-translation'
import { CloseIcon } from '@/components/icons'
import { formatTimestamp } from '@/chat/presentation'
import { formatTokens } from '@/lib/formatTokens'

interface ContextPanelProps {
    contextCommandOutput: ContextCommandOutput | null
    contextGrowth: ContextGrowth | null
    onClose: () => void
    onRefresh?: () => void
}

const SECTION_TITLE_MAP: Record<string, string> = {
    'Estimated usage by category': 'session.context.category',
    'MCP Tools': 'session.context.mcpTools',
    'Custom Agents': 'session.context.customAgents',
    'Memory Files': 'session.context.memoryFiles',
    'Skills': 'session.context.skills'
}

// Map category row names to color classes
const CATEGORY_COLORS: Record<string, string> = {
    'Free space': 'bg-emerald-500',
    'Autocompact buffer': 'bg-amber-500',
    'System tools': 'bg-blue-500',
    'Memory files': 'bg-violet-500',
    'MCP tools': 'bg-blue-500',
    'System prompt': 'bg-blue-500',
    'Messages': 'bg-blue-500',
    'Skills': 'bg-blue-500',
}

function ProgressBar({ percentage }: { percentage: number }) {
    const clamped = Math.max(0, Math.min(100, percentage))
    const color = clamped > 80 ? 'from-red-500 to-red-400'
        : clamped > 60 ? 'from-amber-500 to-amber-400'
        : 'from-emerald-500 to-emerald-400'
    return (
        <div className="h-2.5 w-full rounded-full bg-[var(--app-subtle-bg)]">
            <div className={`h-full rounded-full bg-gradient-to-r ${color} transition-all`} style={{ width: `${clamped}%` }} />
        </div>
    )
}

function CategoryBar({ name, tokens, percentage, growth }: { name: string; tokens: string; percentage: string; growth?: CategoryGrowth }) {
    const { t } = useTranslation()
    const translated = t(`session.context.row.${name}`)
    const description = translated === `session.context.row.${name}` ? '' : translated
    const barColor = CATEGORY_COLORS[name] ?? 'bg-blue-500'
    const pctValue = parseFloat(percentage)

    return (
        <div>
            <div className="mb-1 flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <div className="text-[13px] font-medium text-[var(--app-fg)]">{name}</div>
                    {description && (
                        <div className="text-[10px] leading-tight text-[var(--app-hint)]">{description}</div>
                    )}
                </div>
                <span className="shrink-0 font-mono text-[12px] text-[var(--app-hint)]">
                    {tokens}
                    {growth && growth.tokenDelta !== 0 && (
                        <span className={`text-[10px] font-medium ${growth.tokenDelta > 0 ? 'text-amber-500' : 'text-emerald-500'}`}>
                            {' '}{growth.tokenDelta > 0 ? '+' : '-'}{formatTokens(Math.abs(growth.tokenDelta))}
                        </span>
                    )}
                    <span className="text-[var(--app-subtle-fg)]"> · {percentage}</span>
                </span>
            </div>
            <div className="h-[5px] rounded-full bg-[var(--app-subtle-bg)]">
                <div
                    className={`h-full rounded-full ${barColor} transition-all`}
                    style={{ width: `${Math.max(pctValue, 1)}%`, minWidth: pctValue > 0 ? '4px' : undefined }}
                />
            </div>
        </div>
    )
}

function RefreshIcon({ className }: { className?: string }) {
    return (
        <svg className={className ?? 'h-3.5 w-3.5'} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 2v6h-6" />
            <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
            <path d="M3 22v-6h6" />
            <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
        </svg>
    )
}

function SectionTable(props: { section: ContextSection; translationKey: string; defaultOpen: boolean }) {
    const { t } = useTranslation()
    const [open, setOpen] = useState(props.defaultOpen)
    const title = t(props.translationKey)
    // Split title into CN name and EN subtitle (format: "中文 — English subtitle")
    const titleParts = title.split(' — ')
    const titleCN = titleParts[0]
    const titleEN = titleParts.length > 1 ? titleParts.slice(1).join(' — ') : null

    const translateRowName = (name: string): string => {
        const key = `session.context.row.${name}`
        const translated = t(key)
        return translated === key ? name : translated
    }

    return (
        <div className="rounded-xl border border-[var(--app-border)] bg-[var(--app-subtle-bg)]/30">
            <button
                type="button"
                onClick={() => setOpen(!open)}
                className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-[var(--app-subtle-bg)]"
            >
                <div>
                    <div className="text-[13px] font-semibold text-[var(--app-fg)]">{titleCN}</div>
                    {titleEN && (
                        <div className="text-[10px] text-[var(--app-hint)]">{titleEN}</div>
                    )}
                </div>
                <span className="flex items-center gap-2 text-[11px] text-[var(--app-hint)]">
                    <span className="rounded-full bg-[var(--app-subtle-bg)] px-2.5 py-0.5">
                        {t('session.context.itemCount', { count: props.section.rows.length })}
                    </span>
                    <span className="text-[10px]">{open ? '▲' : '▼'}</span>
                </span>
            </button>
            {open && props.section.rows.length > 0 && (
                <div className="border-t border-[var(--app-border)]">
                    <table className="w-full text-[12px]">
                        <tbody>
                            {props.section.rows.map((row, ri) => (
                                <tr key={ri} className="border-b border-[var(--app-border)] last:border-b-0">
                                    {row.map((cell, ci) => {
                                        const isLast = ci === row.length - 1
                                        const isFirst = ci === 0
                                        const isMiddle = !isFirst && !isLast
                                        const hasLongMiddle = props.section.title === 'Memory Files'
                                        return (
                                            <td key={ci} className={`px-4 py-2 text-[var(--app-fg)] ${isFirst ? (hasLongMiddle ? 'whitespace-nowrap w-16' : 'break-all') : ''} ${isMiddle ? (hasLongMiddle ? 'break-all min-w-0' : 'whitespace-nowrap') : ''} ${isLast ? 'whitespace-nowrap w-16 text-right' : ''}`}>
                                                <div className={isFirst ? 'text-[12px] font-medium' : 'font-mono text-[11px] text-[var(--app-hint)]'}>
                                                    {isFirst ? translateRowName(cell) : cell}
                                                </div>
                                            </td>
                                        )
                                    })}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    )
}

function ParsedContext({ output, contextGrowth, onRefresh }: { output: ContextCommandOutput; contextGrowth: ContextGrowth | null; onRefresh?: () => void }) {
    const { t } = useTranslation()
    const parsed = output.parsed

    if (!parsed) {
        return (
            <div className="space-y-3">
                <div className="text-[11px] text-[var(--app-hint)]">{formatTimestamp(output.createdAt)}</div>
                <div className="text-xs text-amber-600">{t('session.context.noParsedData')}</div>
                <pre className="app-scroll-y overflow-x-auto whitespace-pre-wrap rounded-xl bg-[var(--app-subtle-bg)] p-4 text-xs text-[var(--app-fg)]">
                    {output.rawText}
                </pre>
            </div>
        )
    }

    const clamped = Math.max(0, Math.min(100, parsed.tokensPercentage))
    const summaryBorder = clamped > 80 ? 'border-red-500/20'
        : clamped > 60 ? 'border-amber-500/20'
        : 'border-emerald-500/20'
    const summaryBg = clamped > 80 ? 'from-red-500/8 to-red-500/2'
        : clamped > 60 ? 'from-amber-500/8 to-amber-500/2'
        : 'from-emerald-500/8 to-emerald-500/2'
    const tokenColor = clamped > 80 ? 'text-red-500'
        : clamped > 60 ? 'text-amber-500'
        : 'text-emerald-500'

    // Find the "Estimated usage by category" section
    const categorySection = parsed.sections.find(s => s.title === 'Estimated usage by category')
    const otherSections = parsed.sections.filter(s => s.title !== 'Estimated usage by category')

    // Sort category rows by percentage descending
    const sortedCategoryRows = categorySection?.rows
        ? [...categorySection.rows].sort((a, b) => {
            const pctA = parseFloat(a[2] ?? '0')
            const pctB = parseFloat(b[2] ?? '0')
            return pctB - pctA
        })
        : []

    // Format time from createdAt
    const timeStr = new Date(output.createdAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })

    return (
        <div className="space-y-3">
            {/* Summary Card */}
            <div className={`rounded-xl border bg-gradient-to-br ${summaryBg} ${summaryBorder} p-5`}>
                <div className="mb-3 flex items-center justify-between">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--app-hint)]">
                        {t('session.context.model')}
                    </span>
                    <span className="font-mono text-[14px] font-semibold text-[var(--app-fg)]">{parsed.model}</span>
                </div>
                <div className="mb-2 flex items-baseline justify-between">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--app-hint)]">
                        {t('session.context.used')}
                    </span>
                    <div className="flex items-baseline gap-1">
                        <span className={`font-mono text-[22px] font-bold ${tokenColor}`}>{parsed.tokensUsed}</span>
                        {contextGrowth && contextGrowth.tokenDelta !== 0 && (
                            <span className={`font-mono text-[12px] font-medium ${contextGrowth.tokenDelta > 0 ? 'text-amber-500' : 'text-emerald-500'}`}>
                                {contextGrowth.tokenDelta > 0 ? '+' : '-'}{formatTokens(Math.abs(contextGrowth.tokenDelta))}
                            </span>
                        )}
                        <span className="font-mono text-[13px] text-[var(--app-hint)]"> / {parsed.tokensTotal}</span>
                    </div>
                </div>
                <ProgressBar percentage={parsed.tokensPercentage} />
                <div className="mt-1.5 flex justify-between">
                    <span className="font-mono text-[11px] text-[var(--app-hint)]">0</span>
                    <div className="flex items-center gap-1.5">
                        <span className={`text-[13px] font-semibold ${tokenColor}`}>{parsed.tokensPercentage}%</span>
                        {contextGrowth && contextGrowth.percentageDelta !== 0 && (
                            <span className={`font-mono text-[11px] font-medium ${contextGrowth.percentageDelta > 0 ? 'text-amber-500' : 'text-emerald-500'}`}>
                                {contextGrowth.percentageDelta > 0 ? '+' : ''}{contextGrowth.percentageDelta}%
                            </span>
                        )}
                    </div>
                    <span className="font-mono text-[11px] text-[var(--app-hint)]">{parsed.tokensTotal}</span>
                </div>
            </div>

            {/* Category Bar Chart Section */}
            {categorySection && (
                <div className="rounded-xl border border-[var(--app-border)] bg-[var(--app-subtle-bg)]/30 p-4">
                    <div className="mb-4 flex items-center justify-between">
                        <div>
                            <div className="text-[14px] font-semibold text-[var(--app-fg)]">{t('session.context.categoryCN')}</div>
                            <div className="text-[11px] text-[var(--app-hint)]">{t('session.context.categoryEN')}</div>
                        </div>
                        <span className="rounded-full bg-[var(--app-subtle-bg)] px-2.5 py-0.5 text-[11px] text-[var(--app-hint)]">
                            {t('session.context.itemCount', { count: sortedCategoryRows.length })}
                        </span>
                    </div>
                    <div className="flex flex-col gap-3">
                        {sortedCategoryRows.map((row, i) => (
                            <CategoryBar key={i} name={row[0]} tokens={row[1] ?? ''} percentage={row[2] ?? '0%'} growth={contextGrowth?.categories[row[0]]} />
                        ))}
                    </div>
                </div>
            )}

            {/* Other Sections */}
            {otherSections.map((section, i) => {
                const translationKey = SECTION_TITLE_MAP[section.title] ?? section.title
                return (
                    <SectionTable
                        key={i}
                        section={section}
                        translationKey={translationKey}
                        defaultOpen={false}
                    />
                )
            })}
        </div>
    )
}

export function ContextPanel(props: ContextPanelProps) {
    const { t } = useTranslation()

    const timeStr = props.contextCommandOutput
        ? new Date(props.contextCommandOutput.createdAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
        : null

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={props.onClose}>
            <aside
                className="flex w-[90vw] max-w-[40rem] max-h-[80vh] flex-col rounded-xl border border-[var(--app-border)] bg-[var(--app-bg)] shadow-2xl"
                aria-label={t('session.context.title')}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between border-b border-[var(--app-border)] px-4 py-3">
                    <div className="flex items-center gap-2.5">
                        <svg className="h-4 w-4 text-[var(--app-hint)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="10" />
                            <path d="M12 6v6l4 2" />
                        </svg>
                        <span className="text-[15px] font-semibold text-[var(--app-fg)]">{t('session.context.title')}</span>
                    </div>
                    <div className="flex items-center gap-2.5">
                        {timeStr && (
                            <span className="text-[11px] text-[var(--app-hint)]">Updated at {timeStr}</span>
                        )}
                        {props.onRefresh && (
                            <button
                                type="button"
                                onClick={props.onRefresh}
                                className="flex h-7 w-7 items-center justify-center rounded-lg border border-[var(--app-border)] bg-[var(--app-subtle-bg)] text-[var(--app-hint)] transition-colors hover:bg-[var(--app-secondary-bg)] hover:text-[var(--app-fg)]"
                                aria-label="Refresh"
                                title="Refresh"
                            >
                                <RefreshIcon className="h-3.5 w-3.5" />
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={props.onClose}
                            className="flex h-7 w-7 items-center justify-center rounded-lg border border-[var(--app-border)] bg-[var(--app-subtle-bg)] text-[var(--app-hint)] transition-colors hover:bg-[var(--app-secondary-bg)] hover:text-[var(--app-fg)]"
                            aria-label={t('button.close')}
                            title={t('button.close')}
                        >
                            <CloseIcon className="h-3.5 w-3.5" />
                        </button>
                    </div>
                </div>

                {/* Body */}
                <div className="app-scroll-y min-h-0 flex-1 p-4">
                    {!props.contextCommandOutput ? (
                        <div className="py-8 text-center text-sm text-[var(--app-hint)]">
                            {t('session.context.noData')}
                        </div>
                    ) : (
                        <ParsedContext output={props.contextCommandOutput} contextGrowth={props.contextGrowth} onRefresh={props.onRefresh} />
                    )}
                </div>
            </aside>
        </div>
    )
}
