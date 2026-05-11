import { useState } from 'react'
import type { ContextCommandOutput, ContextSection } from '@/chat/contextOutput'
import { useTranslation } from '@/lib/use-translation'
import { CloseIcon } from '@/components/icons'
import { formatTimestamp } from '@/chat/presentation'

interface ContextPanelProps {
    contextCommandOutput: ContextCommandOutput | null
    onClose: () => void
}

const SECTION_TITLE_MAP: Record<string, string> = {
    'Estimated usage by category': 'session.context.category',
    'MCP Tools': 'session.context.mcpTools',
    'Custom Agents': 'session.context.customAgents',
    'Memory Files': 'session.context.memoryFiles',
    'Skills': 'session.context.skills'
}

function ProgressBar({ percentage }: { percentage: number }) {
    const clamped = Math.max(0, Math.min(100, percentage))
    const color = clamped > 80 ? 'bg-red-500' : clamped > 60 ? 'bg-amber-500' : 'bg-emerald-500'
    return (
        <div className="h-2 w-full rounded-full bg-[var(--app-subtle-bg)]">
            <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${clamped}%` }} />
        </div>
    )
}

function SectionTable(props: { section: ContextSection; translationKey: string; defaultOpen: boolean }) {
    const { t } = useTranslation()
    const [open, setOpen] = useState(props.defaultOpen)
    const title = t(props.translationKey)

    return (
        <div className="rounded-md border border-[var(--app-border)]">
            <button
                type="button"
                onClick={() => setOpen(!open)}
                className="flex w-full items-center justify-between px-3 py-2 text-left text-xs font-medium text-[var(--app-fg)] transition-colors hover:bg-[var(--app-subtle-bg)]"
            >
                <span>{title}</span>
                <span className="text-[10px] text-[var(--app-hint)]">
                    {props.section.rows.length} 项
                    <span className="ml-1">{open ? '▲' : '▼'}</span>
                </span>
            </button>
            {open && props.section.rows.length > 0 && (
                <div className="border-t border-[var(--app-border)]">
                    <table className="w-full text-[11px]">
                        <thead>
                            <tr className="border-b border-[var(--app-border)] bg-[var(--app-subtle-bg)]">
                                {props.section.headers.map((h, i) => (
                                    <th key={h} className={`px-3 py-1.5 text-left font-medium text-[var(--app-hint)] ${i > 0 ? 'w-24' : ''}`}>
                                        {h}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {props.section.rows.map((row, ri) => (
                                <tr key={ri} className="border-b border-[var(--app-border)] last:border-b-0">
                                    {row.map((cell, ci) => (
                                        <td key={ci} className={`px-3 py-1.5 text-[var(--app-fg)] ${ci === 0 ? 'font-mono text-[10px] truncate max-w-[180px]' : 'text-[var(--app-hint)]'}`}>
                                            {cell}
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    )
}

function ParsedContext({ output }: { output: ContextCommandOutput }) {
    const { t } = useTranslation()
    const parsed = output.parsed

    if (!parsed) {
        return (
            <div className="space-y-2">
                <div className="text-[10px] text-[var(--app-hint)]">{formatTimestamp(output.createdAt)}</div>
                <div className="text-xs text-amber-600">{t('session.context.noParsedData')}</div>
                <pre className="app-scroll-y overflow-x-auto whitespace-pre-wrap rounded-md bg-[var(--app-subtle-bg)] p-3 text-xs text-[var(--app-fg)]">
                    {output.rawText}
                </pre>
            </div>
        )
    }

    return (
        <div className="space-y-3">
            <div className="text-[10px] text-[var(--app-hint)]">{formatTimestamp(output.createdAt)}</div>

            {/* Summary */}
            <div className="rounded-md border border-[var(--app-border)] p-3 space-y-2">
                <div className="flex items-center justify-between text-xs">
                    <span className="text-[var(--app-hint)]">{t('session.context.model')}</span>
                    <span className="font-mono font-medium text-[var(--app-fg)]">{parsed.model}</span>
                </div>
                <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                        <span className="text-[var(--app-hint)]">{t('session.context.tokens')}</span>
                        <span className="font-mono text-[var(--app-fg)]">
                            {parsed.tokensUsed} / {parsed.tokensTotal}
                        </span>
                    </div>
                    <ProgressBar percentage={parsed.tokensPercentage} />
                    <div className="text-right text-[11px] text-[var(--app-hint)]">
                        {parsed.tokensPercentage}%
                    </div>
                </div>
            </div>

            {/* Sections */}
            {parsed.sections.map((section, i) => {
                const translationKey = SECTION_TITLE_MAP[section.title] ?? section.title
                return (
                    <SectionTable
                        key={i}
                        section={section}
                        translationKey={translationKey}
                        defaultOpen={i === 0}
                    />
                )
            })}
        </div>
    )
}

export function ContextPanel(props: ContextPanelProps) {
    const { t } = useTranslation()

    return (
        <aside
            className="absolute inset-y-0 right-0 z-30 flex w-full max-w-[24rem] flex-col border-l border-[var(--app-border)] bg-[var(--app-bg)] shadow-2xl sm:w-[24rem]"
            aria-label={t('session.context.title')}
        >
            <div className="flex items-start gap-3 border-b border-[var(--app-border)] p-3">
                <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold">{t('session.context.title')}</div>
                </div>
                <button
                    type="button"
                    onClick={props.onClose}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[var(--app-hint)] transition-colors hover:bg-[var(--app-secondary-bg)] hover:text-[var(--app-fg)]"
                    aria-label={t('button.close')}
                    title={t('button.close')}
                >
                    <CloseIcon className="h-4 w-4" />
                </button>
            </div>

            <div className="app-scroll-y min-h-0 flex-1 p-3">
                {!props.contextCommandOutput ? (
                    <div className="py-8 text-center text-sm text-[var(--app-hint)]">
                        {t('session.context.noData')}
                    </div>
                ) : (
                    <ParsedContext output={props.contextCommandOutput} />
                )}
            </div>
        </aside>
    )
}
