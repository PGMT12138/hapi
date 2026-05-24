import { useState, useMemo, useCallback } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from '@/lib/use-translation'
import { useAppGoBack } from '@/hooks/useAppGoBack'
import { useAppContext } from '@/lib/app-context'
import { useMachines } from '@/hooks/queries/useMachines'
import { useHiddenSessions } from '@/hooks/queries/useHiddenSessions'
import { queryKeys } from '@/lib/query-keys'
import { isTelegramApp } from '@/hooks/useTelegram'
import { getSessionTitle } from '@/components/SessionList'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { OptionPicker } from '@/components/ui/OptionPicker'
import type { SessionSummary } from '@/types/api'
import type { Machine } from '@/types/api'
import type { ApiClient } from '@/api/client'

function BackIcon() {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24"
            fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
        </svg>
    )
}

function SearchIcon(props: { className?: string }) {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"
            fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            className={props.className}>
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
        </svg>
    )
}

function XIcon(props: { className?: string }) {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"
            fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            className={props.className}>
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
        </svg>
    )
}

const FLAVOR_BADGES: Record<string, { label: string; colors: string }> = {
    claude: { label: 'Cl', colors: 'bg-[#d97706] text-white' },
    codex: { label: 'Cx', colors: 'bg-[#111827] text-white' },
    cursor: { label: 'Cu', colors: 'bg-[#0f766e] text-white' },
    gemini: { label: 'Ge', colors: 'bg-[#4338ca] text-white' },
    opencode: { label: 'Oc', colors: 'bg-[#7c3aed] text-white' },
}

function FlavorBadge({ flavor, className }: { flavor?: string | null; className?: string }) {
    const badge = FLAVOR_BADGES[(flavor ?? 'claude').trim().toLowerCase()] ?? FLAVOR_BADGES.claude
    return (
        <span
            aria-hidden="true"
            className={`inline-flex items-center justify-center rounded-sm text-[8px] font-semibold leading-none ${badge.colors} ${className ?? 'h-4 w-4'}`}
        >
            {badge.label}
        </span>
    )
}

const FLAVOR_LABELS: Record<string, string> = {
    claude: 'Claude',
    codex: 'Codex',
    cursor: 'Cursor',
    gemini: 'Gemini',
    opencode: 'OpenCode',
}

function getMachineLabel(machine: Machine): string {
    if (machine.metadata?.displayName) return machine.metadata.displayName
    if (machine.metadata?.host) return machine.metadata.host
    return machine.id.slice(0, 8)
}

function getAgentLabel(flavor: string | null | undefined): string {
    if (!flavor) return 'Claude'
    return FLAVOR_LABELS[flavor.trim().toLowerCase()] ?? flavor
}

function normalizeSearch(value: string): string {
    return value.trim().toLowerCase()
}

function formatAbsoluteTime(value: number): string {
    const ms = value < 1_000_000_000_000 ? value * 1000 : value
    if (!Number.isFinite(ms)) return ''
    return new Date(ms).toLocaleString()
}

function MachineIcon() {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24"
            fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect width="20" height="14" x="2" y="3" rx="2" />
            <line x1="8" x2="16" y1="21" y2="21" />
            <line x1="12" x2="12" y1="17" y2="21" />
        </svg>
    )
}

function FolderIcon() {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24"
            fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
        </svg>
    )
}

function ClockIcon() {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24"
            fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
        </svg>
    )
}

function EyeOnIcon() {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"
            fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
            <circle cx="12" cy="12" r="3" />
        </svg>
    )
}

function TrashIconSmall() {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"
            fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 6h18" />
            <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
            <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
        </svg>
    )
}

function HiddenSessionCard(props: {
    session: SessionSummary
    api: ApiClient
    machineLabel: string
    onSelect: (sessionId: string) => void
    onActionComplete: () => void
}) {
    const { t } = useTranslation()
    const { session, api, machineLabel, onSelect, onActionComplete } = props
    const [deleteOpen, setDeleteOpen] = useState(false)
    const [isUnhiding, setIsUnhiding] = useState(false)
    const [isDeleting, setIsDeleting] = useState(false)

    const sessionName = getSessionTitle(session)
    const projectPath = session.metadata?.path ?? session.id
    const agentName = getAgentLabel(session.metadata?.flavor)

    const handleUnhide = useCallback(async () => {
        setIsUnhiding(true)
        try {
            await api.unhideSession(session.id)
            onActionComplete()
        } finally {
            setIsUnhiding(false)
        }
    }, [api, session.id, onActionComplete])

    const handleDelete = useCallback(async () => {
        setIsDeleting(true)
        try {
            await api.deleteSession(session.id)
            onActionComplete()
        } finally {
            setIsDeleting(false)
        }
    }, [api, session.id, onActionComplete])

    return (
        <>
            <div
                className="rounded-xl border border-[var(--app-border)] overflow-hidden transition-colors hover:border-[var(--app-link)]/30 cursor-pointer"
                onClick={() => onSelect(session.id)}
            >
                <div className="px-3 py-2.5">
                    <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                            <FlavorBadge flavor={session.metadata?.flavor} className="h-4 w-4 shrink-0" />
                            <div className="truncate text-sm font-medium text-[var(--app-session-name)]">
                                {sessionName}
                            </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                            <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); handleUnhide() }}
                                disabled={isUnhiding}
                                className="p-1.5 rounded-md text-[var(--app-hint)] transition-colors hover:text-[var(--app-link)] hover:bg-[var(--app-subtle-bg)] disabled:opacity-50"
                                title={t('hiddenSessions.unhide')}
                            >
                                {isUnhiding ? '...' : <EyeOnIcon />}
                            </button>
                            <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); setDeleteOpen(true) }}
                                disabled={isDeleting}
                                className="p-1.5 rounded-md text-[var(--app-hint)] transition-colors hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-50"
                                title={t('hiddenSessions.delete')}
                            >
                                <TrashIconSmall />
                            </button>
                        </div>
                    </div>
                    <div className="mt-1 inline-flex items-center gap-1 truncate max-w-full text-xs text-[var(--app-hint)]" title={projectPath}>
                        <FolderIcon /><span className="truncate">{projectPath}</span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--app-hint)]">
                        <span className="inline-flex items-center gap-1">
                            <ClockIcon /><span>{formatAbsoluteTime(session.updatedAt)}</span>
                        </span>
                        <span className="inline-flex items-center gap-1" title={machineLabel}>
                            <MachineIcon />{machineLabel}
                        </span>
                    </div>
                </div>
            </div>

            <ConfirmDialog
                isOpen={deleteOpen}
                onClose={() => setDeleteOpen(false)}
                title={t('hiddenSessions.delete.title')}
                description={t('hiddenSessions.delete.description', { name: sessionName })}
                confirmLabel={t('dialog.delete.confirm')}
                confirmingLabel={t('dialog.delete.confirming')}
                onConfirm={handleDelete}
                isPending={isDeleting}
                destructive
            />
        </>
    )
}

function HiddenSessionsEmptyState() {
    const { t } = useTranslation()
    return (
        <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
            <svg
                xmlns="http://www.w3.org/2000/svg"
                width="44"
                height="44"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-[var(--app-hint)] opacity-60"
            >
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                <line x1="1" y1="1" x2="23" y2="23" />
            </svg>
            <div className="text-sm text-[var(--app-hint)]">
                {t('hiddenSessions.empty')}
            </div>
        </div>
    )
}

export default function HiddenSessionsPage() {
    const { api } = useAppContext()
    const goBack = useAppGoBack()
    const { t } = useTranslation()
    const navigate = useNavigate()
    const queryClient = useQueryClient()
    const { sessions, isLoading, error } = useHiddenSessions(api)
    const { machines } = useMachines(api, true)

    const [searchQuery, setSearchQuery] = useState('')
    const [machineFilter, setMachineFilter] = useState<string>('all')

    const machineLabelsById = useMemo(() => {
        const labels: Record<string, string> = {}
        for (const machine of machines) {
            labels[machine.id] = getMachineLabel(machine)
        }
        return labels
    }, [machines])

    const resolveMachineLabel = useCallback((machineId: string | null | undefined): string => {
        if (!machineId) return t('machine.unknown')
        return machineLabelsById[machineId] ?? machineId.slice(0, 8)
    }, [machineLabelsById, t])

    const typedSessions = sessions

    const uniqueMachines = useMemo(() => {
        const machineIds = new Set<string>()
        for (const session of typedSessions) {
            const machineId = session.metadata?.machineId
            if (machineId) machineIds.add(machineId)
        }
        return Array.from(machineIds).map(id => ({
            id,
            label: resolveMachineLabel(id),
        }))
    }, [typedSessions, resolveMachineLabel])

    const normalizedQuery = normalizeSearch(searchQuery)

    const filteredSessions = useMemo(() => {
        let result = typedSessions

        if (machineFilter !== 'all') {
            result = result.filter(s => s.metadata?.machineId === machineFilter)
        }

        if (normalizedQuery) {
            result = result.filter(s => {
                const title = getSessionTitle(s).toLowerCase()
                const path = (s.metadata?.path ?? '').toLowerCase()
                const agent = (s.metadata?.flavor ?? '').toLowerCase()
                const machine = resolveMachineLabel(s.metadata?.machineId).toLowerCase()
                const searchable = `${title}\n${path}\n${agent}\n${machine}`
                return searchable.includes(normalizedQuery)
            })
        }

        return result
    }, [typedSessions, machineFilter, normalizedQuery, resolveMachineLabel])

    const handleActionComplete = useCallback(() => {
        void queryClient.invalidateQueries({ queryKey: queryKeys.hiddenSessions })
        void queryClient.invalidateQueries({ queryKey: queryKeys.sessions })
    }, [queryClient])

    const handleSelectSession = useCallback((sessionId: string) => {
        navigate({ to: `/sessions/${sessionId}` })
    }, [navigate])

    return (
        <div className="flex h-full min-h-0 flex-col">
            <div className="bg-[var(--app-bg)] pt-[env(safe-area-inset-top)]">
                <div className="mx-auto w-full max-w-content flex items-center gap-2 p-3 border-b border-[var(--app-border)]">
                    {!isTelegramApp() && (
                        <button
                            type="button"
                            onClick={goBack}
                            className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--app-hint)] transition-colors hover:bg-[var(--app-secondary-bg)] hover:text-[var(--app-fg)]"
                        >
                            <BackIcon />
                        </button>
                    )}
                    <div className="flex-1 font-semibold">{t('hiddenSessions.title')}</div>
                </div>
            </div>

            <div className="app-scroll-y flex-1 min-h-0">
                <div className="mx-auto w-full max-w-content p-3">
                    {error ? (
                        <div className="px-4 py-8 text-center text-sm text-red-600">{error}</div>
                    ) : isLoading ? (
                        <div className="px-4 py-8 text-center text-sm text-[var(--app-hint)]">{t('misc.loading')}</div>
                    ) : typedSessions.length === 0 ? (
                        <HiddenSessionsEmptyState />
                    ) : (
                        <>
                            <div className="flex flex-col gap-2 pb-3">
                                <div className="relative">
                                    <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--app-hint)]" />
                                    <input
                                        type="search"
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        placeholder={t('hiddenSessions.search.placeholder')}
                                        className="w-full rounded-lg border border-[var(--app-border)] bg-[var(--app-bg)] py-1.5 pl-8 pr-8 text-sm text-[var(--app-fg)] outline-none transition-colors placeholder:text-[var(--app-hint)] focus:border-[var(--app-link)]"
                                    />
                                    {searchQuery ? (
                                        <button
                                            type="button"
                                            onClick={() => setSearchQuery('')}
                                            className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-[var(--app-hint)] hover:bg-[var(--app-subtle-bg)] hover:text-[var(--app-fg)]"
                                            title={t('hiddenSessions.search.clear')}
                                        >
                                            <XIcon className="h-3.5 w-3.5" />
                                        </button>
                                    ) : null}
                                </div>

                                {uniqueMachines.length > 1 && (
                                    <OptionPicker
                                        label={t('hiddenSessions.machine.all')}
                                        value={machineFilter}
                                        onChange={setMachineFilter}
                                        options={[
                                            { value: 'all' as string, label: t('hiddenSessions.machine.all') },
                                            ...uniqueMachines.map(m => ({
                                                value: m.id as string,
                                                label: m.label,
                                            })),
                                        ]}
                                        className="!px-0 !py-0"
                                    />
                                )}
                            </div>

                            {filteredSessions.length === 0 ? (
                                <div className="px-4 py-8 text-center text-sm text-[var(--app-hint)]">
                                    {t('hiddenSessions.search.noResults')}
                                </div>
                            ) : (
                                <div className="flex flex-col gap-2">
                                    {filteredSessions.map(session => (
                                        <HiddenSessionCard
                                            key={session.id}
                                            session={session}
                                            api={api}
                                            machineLabel={resolveMachineLabel(session.metadata?.machineId)}
                                            onSelect={handleSelectSession}
                                            onActionComplete={handleActionComplete}
                                        />
                                    ))}
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    )
}
