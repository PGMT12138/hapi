import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useTranslation } from '@/lib/use-translation'

export type PendingSchedule =
    | { type: 'preset'; preset: '+5m' | '+30m' | '+1h' | '+4h' }
    | { type: 'absolute'; ms: number }

const PRESET_DELAYS: Record<string, number> = {
    '+5m': 5 * 60 * 1000,
    '+30m': 30 * 60 * 1000,
    '+1h': 60 * 60 * 1000,
    '+4h': 4 * 60 * 60 * 1000,
}

const MAX_DAYS = 7
const PAST_TOLERANCE_MS = 30 * 1000

export function resolvePendingSchedule(pending: PendingSchedule | null): number | null {
    if (pending == null) return null
    if (pending.type === 'absolute') return pending.ms
    return parsePreset(pending.preset, Date.now())
}

export function parsePreset(preset: string, now: number): number {
    const delay = PRESET_DELAYS[preset]
    if (delay == null) throw new Error(`Unknown preset: ${preset}`)
    return now + delay
}

export function clampToMaxDays(value: number, now: number, maxDays: number): number {
    const max = now + maxDays * 24 * 60 * 60 * 1000
    return Math.min(value, max)
}

export function validateSpecificDatetime(value: number, now: number): 'scheduleErrorPast' | 'scheduleErrorTooFar' | null {
    if (value < now - PAST_TOLERANCE_MS) return 'scheduleErrorPast'
    if (value > now + MAX_DAYS * 24 * 60 * 60 * 1000) return 'scheduleErrorTooFar'
    return null
}

function toLocalIsoString(ms: number): string {
    const d = new Date(ms)
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

interface ScheduleTimePickerProps {
    onSchedule: (pending: PendingSchedule) => void
    onClose: () => void
    anchorRef: React.RefObject<HTMLButtonElement | null>
    pendingSchedule?: PendingSchedule | null
}

const PRESETS: Array<{ key: '+5m' | '+30m' | '+1h' | '+4h'; i18nKey: string }> = [
    { key: '+5m', i18nKey: 'composer.schedulePreset.5m' },
    { key: '+30m', i18nKey: 'composer.schedulePreset.30m' },
    { key: '+1h', i18nKey: 'composer.schedulePreset.1h' },
    { key: '+4h', i18nKey: 'composer.schedulePreset.4h' },
]

export function ScheduleTimePicker({ onSchedule, onClose, anchorRef, pendingSchedule }: ScheduleTimePickerProps) {
    const { t } = useTranslation()
    const panelRef = useRef<HTMLDivElement>(null)
    const [tab, setTab] = useState<'relative' | 'specific'>(() =>
        pendingSchedule?.type === 'absolute' ? 'specific' : 'relative'
    )
    const [specificValue, setSpecificValue] = useState<string>(() => {
        if (pendingSchedule?.type === 'absolute') return toLocalIsoString(pendingSchedule.ms)
        return ''
    })
    const [error, setError] = useState<'scheduleErrorPast' | 'scheduleErrorTooFar' | null>(null)
    const [position, setPosition] = useState<{ top: number; left: number }>({ top: 0, left: 0 })

    useLayoutEffect(() => {
        const anchor = anchorRef.current
        const panel = panelRef.current
        if (!anchor || !panel) return
        const anchorRect = anchor.getBoundingClientRect()
        const panelHeight = panel.offsetHeight
        const topAbove = anchorRect.top - panelHeight - 8
        const topBelow = anchorRect.bottom + 8
        const fitsAbove = topAbove >= 8
        setPosition({
            top: fitsAbove ? topAbove : topBelow,
            left: Math.max(8, Math.min(anchorRect.left, window.innerWidth - panel.offsetWidth - 8)),
        })
    }, [anchorRef])

    useEffect(() => {
        const handlePointerDown = (e: PointerEvent) => {
            const target = e.target as Node
            if (anchorRef.current?.contains(target)) return
            if (panelRef.current?.contains(target)) return
            onClose()
        }
        document.addEventListener('pointerdown', handlePointerDown)
        return () => document.removeEventListener('pointerdown', handlePointerDown)
    }, [anchorRef, onClose])

    const handlePresetClick = (preset: '+5m' | '+30m' | '+1h' | '+4h') => {
        onSchedule({ type: 'preset', preset })
        onClose()
    }

    const handleSpecificChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setSpecificValue(e.target.value)
        setError(null)
    }

    const handleSpecificSubmit = () => {
        if (!specificValue) return
        const ms = new Date(specificValue).getTime()
        if (isNaN(ms)) return
        const now = Date.now()
        const validationError = validateSpecificDatetime(ms, now)
        if (validationError) {
            setError(validationError)
            return
        }
        const clamped = clampToMaxDays(ms, now, MAX_DAYS)
        onSchedule({ type: 'absolute', ms: clamped })
        onClose()
    }

    const minDatetime = toLocalIsoString(Date.now() + 60 * 1000)
    const maxDatetime = toLocalIsoString(Date.now() + MAX_DAYS * 24 * 60 * 60 * 1000)
    const activePreset = pendingSchedule?.type === 'preset' ? pendingSchedule.preset : null

    return (
        <div
            ref={panelRef}
            style={{ position: 'fixed', top: position.top, left: position.left, zIndex: 50 }}
            className="w-72 overflow-hidden rounded-xl border border-[var(--app-border)] bg-[var(--app-bg)] shadow-lg"
        >
            <div className="px-3 pt-3 pb-2 text-xs font-semibold text-[var(--app-hint)]">
                {t('composer.schedule')}
            </div>

            <div className="flex border-b border-[var(--app-border)]">
                <button
                    type="button"
                    className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
                        tab === 'relative'
                            ? 'text-[var(--app-link)] border-b-2 border-[var(--app-link)]'
                            : 'text-[var(--app-hint)] hover:text-[var(--app-fg)]'
                    }`}
                    onClick={() => setTab('relative')}
                >
                    {t('composer.scheduleRelativeTab')}
                </button>
                <button
                    type="button"
                    className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
                        tab === 'specific'
                            ? 'text-[var(--app-link)] border-b-2 border-[var(--app-link)]'
                            : 'text-[var(--app-hint)] hover:text-[var(--app-fg)]'
                    }`}
                    onClick={() => setTab('specific')}
                >
                    {t('composer.scheduleSpecificTab')}
                </button>
            </div>

            <div className="p-3">
                {tab === 'relative' ? (
                    <div className="grid grid-cols-2 gap-2">
                        {PRESETS.map(({ key, i18nKey }) => (
                            <button
                                key={key}
                                type="button"
                                className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                                    activePreset === key
                                        ? 'bg-blue-500 text-white'
                                        : 'bg-[var(--app-secondary-bg)] text-[var(--app-fg)] hover:bg-[var(--app-border)]'
                                }`}
                                onClick={() => handlePresetClick(key)}
                            >
                                {t(i18nKey)}
                            </button>
                        ))}
                    </div>
                ) : (
                    <div className="flex flex-col gap-2">
                        <input
                            type="datetime-local"
                            value={specificValue}
                            min={minDatetime}
                            max={maxDatetime}
                            onChange={handleSpecificChange}
                            className="w-full rounded-lg border border-[var(--app-border)] bg-[var(--app-secondary-bg)] px-3 py-2 text-sm text-[var(--app-fg)] focus:outline-none focus:ring-1 focus:ring-[var(--app-link)]"
                        />
                        <div className="flex items-center justify-between">
                            <span className="text-xs text-[var(--app-hint)]">
                                {t('composer.scheduleSpecificHint')}
                            </span>
                            <button
                                type="button"
                                disabled={!specificValue}
                                className="rounded-lg bg-blue-500 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
                                onClick={handleSpecificSubmit}
                            >
                                {t('composer.scheduleSubmit')}
                            </button>
                        </div>
                        {error ? (
                            <div className="text-xs text-red-500">
                                {t(`composer.${error}`)}
                            </div>
                        ) : null}
                    </div>
                )}
            </div>
        </div>
    )
}
