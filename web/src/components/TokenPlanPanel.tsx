import type { TokenPlanLimit, TokenPlanUsageResponse } from '@/types/api'
import { useTranslation } from '@/lib/use-translation'
import { CloseIcon } from '@/components/icons'

interface TokenPlanPanelProps {
    data: TokenPlanUsageResponse | null
    onClose: () => void
    onRefresh?: () => void
    isLoading?: boolean
}

function ProgressBar({ percentage, colorFrom, colorTo }: { percentage: number; colorFrom: string; colorTo: string }) {
    const clamped = Math.max(0, Math.min(100, percentage))
    return (
        <div className="h-2.5 w-full rounded-full bg-[var(--app-subtle-bg)]">
            <div
                className={`h-full rounded-full bg-gradient-to-r ${colorFrom} ${colorTo} transition-all`}
                style={{ width: `${clamped}%` }}
            />
        </div>
    )
}

function getLimitBarColors(percentage: number): { colorFrom: string; colorTo: string; textColor: string } {
    if (percentage > 85) return { colorFrom: 'from-red-500', colorTo: 'to-red-400', textColor: 'text-red-500' }
    if (percentage > 70) return { colorFrom: 'from-amber-500', colorTo: 'to-amber-400', textColor: 'text-amber-500' }
    return { colorFrom: 'from-emerald-500', colorTo: 'to-emerald-400', textColor: 'text-emerald-500' }
}

function extractResetTime(limit: TokenPlanLimit): string | null {
    const candidates = ['nextResetTime', 'next_reset_time', 'resetAt', 'resetTime', 'reset_at', 'windowEnd', 'window_end', 'expiresAt', 'expires_at', 'expire', 'endTime', 'end_time']
    for (const key of candidates) {
        const v = limit[key]
        if (typeof v === 'string' && v.length > 0) return v
        if (typeof v === 'number' && v > 0) {
            const d = new Date(v)
            if (!isNaN(d.getTime())) return d.toISOString()
        }
    }
    return null
}

function formatTime(iso: string): string {
    const d = new Date(iso)
    if (isNaN(d.getTime())) return iso
    const now = new Date()
    const diffMs = d.getTime() - now.getTime()
    const pad = (n: number) => String(n).padStart(2, '0')
    const dateStr = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
    if (diffMs <= 0) return dateStr
    const diffMin = Math.floor(diffMs / 60000)
    if (diffMin < 60) return `${dateStr} (${diffMin}分钟后)`
    const diffHour = Math.floor(diffMin / 60)
    if (diffHour < 24) return `${dateStr} (${diffHour}小时后)`
    const diffDay = Math.floor(diffHour / 24)
    return `${dateStr} (${diffDay}天后)`
}

function LimitCard({ limit, label, t }: { limit: TokenPlanLimit; label: string; t: (key: string) => string }) {
    const percentage = typeof limit.percentage === 'number' ? limit.percentage : 0
    const { colorFrom, colorTo, textColor } = getLimitBarColors(percentage)
    const remaining = 100 - percentage
    const resetTime = extractResetTime(limit)
    const usageDetails = Array.isArray(limit.usageDetails) ? limit.usageDetails : []

    return (
        <div className="rounded-xl border border-[var(--app-border)] bg-[var(--app-subtle-bg)]/30 p-4">
            <div className="mb-2 flex items-center justify-between">
                <span className="text-[13px] font-semibold text-[var(--app-fg)]">{label}</span>
                <span className={`font-mono text-[13px] font-semibold ${textColor}`}>{percentage}%</span>
            </div>
            <div className="mb-2">
                <ProgressBar percentage={percentage} colorFrom={colorFrom} colorTo={colorTo} />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-[var(--app-hint)]">
                <span>{t('tokenPlan.consumed')} {percentage}%</span>
                <span>{t('tokenPlan.remaining')} {remaining}%</span>
            </div>
            {limit.currentValue != null && limit.usage != null && (
                <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 text-[11px] text-[var(--app-hint)]">
                    <span>{t('tokenPlan.usage')}: {limit.currentValue} / {limit.usage}</span>
                </div>
            )}
            {resetTime && (
                <div className="mt-1.5 flex items-center gap-1 text-[11px] text-[var(--app-hint)]">
                    <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10" />
                        <path d="M12 6v6l4 2" />
                    </svg>
                    <span>{t('tokenPlan.resetAt')}: {formatTime(resetTime)}</span>
                </div>
            )}
            {usageDetails.length > 0 && (
                <div className="mt-3 border-t border-[var(--app-border)] pt-3">
                    <div className="mb-1.5 text-[11px] font-medium text-[var(--app-hint)]">{t('tokenPlan.usageDetails')}</div>
                    <table className="w-full text-[12px]">
                        <thead>
                            <tr className="text-[10px] uppercase tracking-wide text-[var(--app-hint)]">
                                <th className="py-1 text-left font-medium">{t('tokenPlan.detailModel')}</th>
                                <th className="py-1 text-right font-medium">{t('tokenPlan.detailCount')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {usageDetails.map((detail, i) => (
                                <tr key={i} className="border-b border-[var(--app-border)] last:border-b-0">
                                    <td className="py-1.5 text-[var(--app-fg)] break-all">{detail.modelCode}</td>
                                    <td className="py-1.5 text-right font-mono text-[var(--app-hint)]">{detail.usage}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
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

export function TokenPlanPanel(props: TokenPlanPanelProps) {
    const { t } = useTranslation()

    const tokensLimit = props.data?.quota?.limits.find((l) => l.type === 'TOKENS_LIMIT' && l.unit === 3)
        ?? props.data?.quota?.limits.find((l) => l.type === 'TOKENS_LIMIT')
    const tokensWeekLimit = props.data?.quota?.limits.find((l) => l.type === 'TOKENS_LIMIT' && l.unit === 6)
    const timeLimit = props.data?.quota?.limits.find((l) => l.type === 'TIME_LIMIT')
    const tokensPct = typeof tokensLimit?.percentage === 'number' ? tokensLimit.percentage : 0

    const colors = getLimitBarColors(tokensPct)
    const summaryBorder = tokensPct > 85 ? 'border-red-500/20' : tokensPct > 70 ? 'border-amber-500/20' : 'border-emerald-500/20'
    const summaryBg = tokensPct > 85 ? 'from-red-500/8 to-red-500/2' : tokensPct > 70 ? 'from-amber-500/8 to-amber-500/2' : 'from-emerald-500/8 to-emerald-500/2'
    const summaryTextColor = colors.textColor

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={props.onClose}>
            <aside
                className="flex w-[90vw] max-w-[36rem] max-h-[80vh] flex-col rounded-xl border border-[var(--app-border)] bg-[var(--app-bg)] shadow-2xl"
                aria-label={t('tokenPlan.title')}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between border-b border-[var(--app-border)] px-4 py-3">
                    <div className="flex items-center gap-2.5">
                        <svg className="h-4 w-4 text-[var(--app-hint)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="10" />
                            <path d="M12 6v12M8 10h8M8 14h8" />
                        </svg>
                        <span className="text-[15px] font-semibold text-[var(--app-fg)]">{t('tokenPlan.title')}</span>
                        {props.data?.platform && (
                            <span className="rounded-full bg-[var(--app-subtle-bg)] px-2 py-0.5 text-[10px] font-medium text-[var(--app-hint)] uppercase">
                                {props.data.platform}
                            </span>
                        )}
                    </div>
                    <div className="flex items-center gap-2.5">
                        {props.onRefresh && (
                            <button
                                type="button"
                                onClick={props.onRefresh}
                                disabled={props.isLoading}
                                className="flex h-7 w-7 items-center justify-center rounded-lg border border-[var(--app-border)] bg-[var(--app-subtle-bg)] text-[var(--app-hint)] transition-colors hover:bg-[var(--app-secondary-bg)] hover:text-[var(--app-fg)] disabled:opacity-50"
                                aria-label="Refresh"
                                title="Refresh"
                            >
                                <RefreshIcon className={`h-3.5 w-3.5${props.isLoading ? ' animate-spin' : ''}`} />
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
                    {!props.data?.available ? (
                        <div className="py-8 text-center text-sm text-[var(--app-hint)]">
                            {props.data?.error ?? t('tokenPlan.noData')}
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {/* Summary Card */}
                            {tokensLimit && (
                                <div className={`rounded-xl border bg-gradient-to-br ${summaryBg} ${summaryBorder} p-5`}>
                                    <div className="mb-2 flex items-baseline justify-between">
                                        <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--app-hint)]">
                                            {t('tokenPlan.remaining')}
                                        </span>
                                        <div className="flex items-baseline gap-1">
                                            <span className={`font-mono text-[28px] font-bold ${summaryTextColor}`}>
                                                {100 - tokensPct}%
                                            </span>
                                        </div>
                                    </div>
                                    <ProgressBar
                                        percentage={tokensPct}
                                        colorFrom={colors.colorFrom}
                                        colorTo={colors.colorTo}
                                    />
                                    <div className="mt-1.5 flex justify-between">
                                        <span className="font-mono text-[11px] text-[var(--app-hint)]">0%</span>
                                        <span className={`text-[13px] font-semibold ${summaryTextColor}`}>{t('tokenPlan.consumed')} {tokensPct}%</span>
                                        <span className="font-mono text-[11px] text-[var(--app-hint)]">100%</span>
                                    </div>
                                </div>
                            )}

                            {/* Limit Cards */}
                            {tokensLimit && (
                                <LimitCard limit={tokensLimit} label={t('tokenPlan.limit.tokens')} t={t} />
                            )}
                            {tokensWeekLimit && (
                                <LimitCard limit={tokensWeekLimit} label={t('tokenPlan.limit.tokensWeek')} t={t} />
                            )}
                            {timeLimit && (
                                <LimitCard limit={timeLimit} label={t('tokenPlan.limit.time')} t={t} />
                            )}

                            {/* AutoRefresh Indicator */}
                            <div className="flex items-center justify-center gap-1.5 pt-1 text-[10px] text-[var(--app-hint)]">
                                <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                                    <circle cx="12" cy="12" r="10" />
                                    <path d="M12 6v6l4 2" />
                                </svg>
                                <span>{t('tokenPlan.autoRefresh')}</span>
                            </div>
                        </div>
                    )}
                </div>
            </aside>
        </div>
    )
}
