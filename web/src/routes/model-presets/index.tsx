import { useState, useCallback } from 'react'
import { useTranslation } from '@/lib/use-translation'
import { useAppGoBack } from '@/hooks/useAppGoBack'
import { useAppContext } from '@/lib/app-context'
import { useMachines } from '@/hooks/queries/useMachines'
import { OptionPicker } from '@/components/ui/OptionPicker'
import { useModelConfigPresets } from '@/hooks/queries/useModelConfigPresets'
import { useGlobalEnv } from '@/hooks/queries/useGlobalEnv'
import { useModelConfigPresetActions } from '@/hooks/mutations/useModelConfigPresetActions'
import { useGlobalEnvActions } from '@/hooks/mutations/useGlobalEnvActions'
import type { ModelConfigPreset } from '@/types/api'

const ENV_FIELDS = [
    { key: 'ANTHROPIC_AUTH_TOKEN', label: 'Auth Token', span: 2 },
    { key: 'ANTHROPIC_BASE_URL', label: 'Base URL', span: 2 },
    { key: 'ANTHROPIC_MODEL', label: 'Model', span: 1 },
    { key: 'ANTHROPIC_REASONING_MODEL', label: 'Reasoning Model', span: 1 },
    { key: 'ANTHROPIC_DEFAULT_SONNET_MODEL', label: 'Sonnet', span: 1 },
    { key: 'ANTHROPIC_DEFAULT_HAIKU_MODEL', label: 'Haiku', span: 1 },
    { key: 'ANTHROPIC_DEFAULT_OPUS_MODEL', label: 'Opus', span: 1 },
] as const

function BackIcon() {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24"
            fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
        </svg>
    )
}

function ChevronIcon({ open }: { open: boolean }) {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"
            fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            className={`transition-transform ${open ? 'rotate-180' : ''}`}>
            <polyline points="6 9 12 15 18 9" />
        </svg>
    )
}

const inputClass = "w-full px-3 py-2 text-sm rounded-lg border border-[var(--app-divider)] bg-[var(--app-bg)] text-[var(--app-text)] focus:outline-none focus:ring-2 focus:ring-[var(--app-link)] disabled:opacity-50"

function GlobalConfigCard({
    env,
    onUpdate,
    isPending,
    isLoading,
}: {
    env: Record<string, string>
    onUpdate: (env: Record<string, string>) => Promise<void>
    isPending: boolean
    isLoading: boolean
}) {
    const { t } = useTranslation()
    const [expanded, setExpanded] = useState(false)
    const [editing, setEditing] = useState(false)
    const [editEnv, setEditEnv] = useState<Record<string, string>>(env)

    const handleToggleExpand = useCallback(() => {
        setExpanded((prev) => !prev)
        setEditing(false)
    }, [])

    const handleStartEdit = useCallback(() => {
        setEditEnv(env)
        setEditing(true)
    }, [env])

    const handleSaveEdit = useCallback(async () => {
        const result: Record<string, string> = {}
        for (const [k, v] of Object.entries(editEnv)) {
            if (v) result[k] = v
        }
        await onUpdate(result)
        setEditing(false)
    }, [editEnv, onUpdate])

    const handleCancelEdit = useCallback(() => {
        setEditing(false)
        setEditEnv(env)
    }, [env])

    const handleEnvChange = useCallback((key: string, value: string) => {
        setEditEnv((prev) => {
            const next = { ...prev }
            if (value) next[key] = value
            else delete next[key]
            return next
        })
    }, [])

    return (
        <div className="border border-[var(--app-divider)] rounded-xl overflow-hidden">
            <button
                type="button"
                onClick={handleToggleExpand}
                className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-[var(--app-subtle-bg)]"
            >
                <div className="flex flex-col min-w-0">
                    <span className="font-medium text-[var(--app-fg)] truncate">{t('modelPresets.globalConfig')}</span>
                    <span className="text-xs text-[var(--app-hint)]">{t('modelPresets.globalConfigDesc')}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-2">
                    <span className="text-xs text-[var(--app-hint)]">
                        {Object.keys(env).length} keys
                    </span>
                    <ChevronIcon open={expanded} />
                </div>
            </button>

            {expanded && (
                <div className="border-t border-[var(--app-divider)] px-4 py-3">
                    {isLoading ? (
                        <div className="text-sm text-[var(--app-hint)]">{t('misc.loading')}</div>
                    ) : editing ? (
                        <div className="flex flex-col gap-3">
                            <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                                {ENV_FIELDS.map((field) => (
                                    <div key={field.key} className={`${field.span === 2 ? 'col-span-2' : 'col-span-1'} flex flex-col gap-0.5`}>
                                        <label className="text-xs text-[var(--app-hint)]" title={field.key}>{field.label}</label>
                                        <input type="text" value={editEnv[field.key] ?? ''} onChange={(e) => handleEnvChange(field.key, e.target.value)} disabled={isPending} className={inputClass} />
                                    </div>
                                ))}
                            </div>
                            <div className="flex justify-end gap-2 pt-1">
                                <button type="button" onClick={handleCancelEdit} disabled={isPending}
                                    className="rounded-lg px-3 py-1.5 text-xs text-[var(--app-hint)] hover:text-[var(--app-fg)] disabled:opacity-50">
                                    {t('button.cancel')}
                                </button>
                                <button type="button" onClick={handleSaveEdit} disabled={isPending}
                                    className="rounded-lg bg-[var(--app-button)] px-3 py-1.5 text-xs font-medium text-[var(--app-button-text)] disabled:opacity-50">
                                    {t('button.save')}
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="flex flex-col gap-2">
                            <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                                {Object.entries(env).map(([k, v]) => (
                                    <div key={k} className="flex flex-col min-w-0">
                                        <span className="text-xs text-[var(--app-hint)] truncate">{k}</span>
                                        <span className="text-sm text-[var(--app-fg)] truncate font-mono">{v}</span>
                                    </div>
                                ))}
                                {Object.keys(env).length === 0 && (
                                    <span className="text-xs text-[var(--app-hint)]">Empty</span>
                                )}
                            </div>
                            <div className="flex justify-end pt-2">
                                <button type="button" onClick={handleStartEdit} disabled={isPending}
                                    className="rounded-lg bg-[var(--app-button)] px-3 py-1.5 text-xs font-medium text-[var(--app-button-text)] disabled:opacity-50">
                                    {t('modelPresets.edit')}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}

function PresetCard({
    preset,
    onUpdate,
    onDelete,
    isPending,
}: {
    preset: ModelConfigPreset
    onUpdate: (id: string, data: { name?: string; env?: Record<string, string> }) => Promise<void>
    onDelete: (id: string) => Promise<void>
    isPending: boolean
}) {
    const { t } = useTranslation()
    const [expanded, setExpanded] = useState(false)
    const [editing, setEditing] = useState(false)
    const [editName, setEditName] = useState(preset.name)
    const [editEnv, setEditEnv] = useState<Record<string, string>>(preset.env)
    const [confirmDelete, setConfirmDelete] = useState(false)

    const handleToggleExpand = useCallback(() => {
        setExpanded((prev) => !prev)
        setEditing(false)
        setConfirmDelete(false)
    }, [])

    const handleStartEdit = useCallback(() => {
        setEditName(preset.name)
        setEditEnv(preset.env)
        setEditing(true)
        setConfirmDelete(false)
    }, [preset.name, preset.env])

    const handleSaveEdit = useCallback(async () => {
        const env: Record<string, string> = {}
        for (const [k, v] of Object.entries(editEnv)) {
            if (v) env[k] = v
        }
        await onUpdate(preset.id, { name: editName.trim() || undefined, env })
        setEditing(false)
    }, [preset.id, editName, editEnv, onUpdate])

    const handleCancelEdit = useCallback(() => {
        setEditing(false)
        setEditName(preset.name)
        setEditEnv(preset.env)
    }, [preset.name, preset.env])

    const handleDelete = useCallback(async () => {
        if (!confirmDelete) {
            setConfirmDelete(true)
            return
        }
        await onDelete(preset.id)
    }, [confirmDelete, preset.id, onDelete])

    const handleEnvChange = useCallback((key: string, value: string) => {
        setEditEnv((prev) => {
            const next = { ...prev }
            if (value) next[key] = value
            else delete next[key]
            return next
        })
    }, [])

    return (
        <div className="border border-[var(--app-divider)] rounded-xl overflow-hidden">
            <button
                type="button"
                onClick={handleToggleExpand}
                className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-[var(--app-subtle-bg)]"
            >
                <span className="font-medium text-[var(--app-fg)] truncate">{preset.name}</span>
                <div className="flex items-center gap-2 shrink-0 ml-2">
                    <span className="text-xs text-[var(--app-hint)]">
                        {Object.keys(preset.env).length} keys
                    </span>
                    <ChevronIcon open={expanded} />
                </div>
            </button>

            {expanded && (
                <div className="border-t border-[var(--app-divider)] px-4 py-3">
                    {editing ? (
                        <div className="flex flex-col gap-3">
                            <div className="flex flex-col gap-1">
                                <label className="text-xs text-[var(--app-hint)]">{t('modelPresets.name')}</label>
                                <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)} className={inputClass} />
                            </div>
                            <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                                {ENV_FIELDS.map((field) => (
                                    <div key={field.key} className={`${field.span === 2 ? 'col-span-2' : 'col-span-1'} flex flex-col gap-0.5`}>
                                        <label className="text-xs text-[var(--app-hint)]" title={field.key}>{field.label}</label>
                                        <input type="text" value={editEnv[field.key] ?? ''} onChange={(e) => handleEnvChange(field.key, e.target.value)} disabled={isPending} className={inputClass} />
                                    </div>
                                ))}
                            </div>
                            <div className="flex justify-end gap-2 pt-1">
                                <button type="button" onClick={handleCancelEdit} disabled={isPending}
                                    className="rounded-lg px-3 py-1.5 text-xs text-[var(--app-hint)] hover:text-[var(--app-fg)] disabled:opacity-50">
                                    {t('button.cancel')}
                                </button>
                                <button type="button" onClick={handleSaveEdit} disabled={isPending || !editName.trim()}
                                    className="rounded-lg bg-[var(--app-button)] px-3 py-1.5 text-xs font-medium text-[var(--app-button-text)] disabled:opacity-50">
                                    {t('button.save')}
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="flex flex-col gap-2">
                            <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                                {Object.entries(preset.env).map(([k, v]) => (
                                    <div key={k} className="flex flex-col min-w-0">
                                        <span className="text-xs text-[var(--app-hint)] truncate">{k}</span>
                                        <span className="text-sm text-[var(--app-fg)] truncate font-mono">{v}</span>
                                    </div>
                                ))}
                                {Object.keys(preset.env).length === 0 && (
                                    <span className="text-xs text-[var(--app-hint)]">Empty</span>
                                )}
                            </div>
                            <div className="flex justify-end gap-2 pt-2">
                                <button type="button" onClick={handleDelete} disabled={isPending}
                                    className={`rounded-lg border px-3 py-1.5 text-xs font-medium disabled:opacity-50 ${confirmDelete ? 'border-red-600 bg-red-600 text-white' : 'border-red-300 text-red-500 bg-red-50 hover:bg-red-100 dark:border-red-800 dark:bg-red-950 dark:hover:bg-red-900'}`}>
                                    {confirmDelete ? t('button.confirm') : t('modelPresets.delete')}
                                </button>
                                <button type="button" onClick={handleStartEdit} disabled={isPending}
                                    className="rounded-lg bg-[var(--app-button)] px-3 py-1.5 text-xs font-medium text-[var(--app-button-text)] disabled:opacity-50">
                                    {t('modelPresets.edit')}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}

export default function ModelPresetsPage() {
    const { t } = useTranslation()
    const goBack = useAppGoBack()
    const { api } = useAppContext()
    const { presets, isLoading } = useModelConfigPresets(api)
    const { createPreset, updatePreset, deletePreset, isPending } = useModelConfigPresetActions(api)
    const { machines } = useMachines(api, true)
    const [selectedMachineId, setSelectedMachineId] = useState<string>('')
    const activeMachineId = selectedMachineId || (machines.length > 0 ? machines[0].id : null)
    const { env: globalEnv, isLoading: globalEnvLoading } = useGlobalEnv(api, activeMachineId)
    const { updateGlobalEnv, isPending: globalEnvPending } = useGlobalEnvActions(api, activeMachineId)

    const [showAdd, setShowAdd] = useState(false)
    const [addName, setAddName] = useState('')
    const [addEnv, setAddEnv] = useState<Record<string, string>>({})
    const [showJsonModal, setShowJsonModal] = useState(false)
    const [jsonInput, setJsonInput] = useState('')
    const [jsonError, setJsonError] = useState<string | null>(null)

    const handleAdd = useCallback(async () => {
        if (!addName.trim()) return
        const env: Record<string, string> = {}
        for (const [k, v] of Object.entries(addEnv)) {
            if (v) env[k] = v
        }
        await createPreset({ name: addName.trim(), env })
        setAddName('')
        setAddEnv({})
        setShowAdd(false)
    }, [addName, addEnv, createPreset])

    const handleUpdate = useCallback(async (id: string, data: { name?: string; env?: Record<string, string> }) => {
        await updatePreset({ id, ...data })
    }, [updatePreset])

    const handleDelete = useCallback(async (id: string) => {
        await deletePreset(id)
    }, [deletePreset])

    const handleUpdateGlobalEnv = useCallback(async (env: Record<string, string>) => {
        if (!activeMachineId) return
        await updateGlobalEnv(env)
    }, [updateGlobalEnv, activeMachineId])

    const handleEnvChange = useCallback((key: string, value: string) => {
        setAddEnv((prev) => {
            const next = { ...prev }
            if (value) next[key] = value
            else delete next[key]
            return next
        })
    }, [])

    const handleApplyJson = useCallback(() => {
        try {
            const parsed = JSON.parse(jsonInput)
            if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
                setJsonError(t('modelPresets.jsonError'))
                return
            }
            const next: Record<string, string> = {}
            for (const [k, v] of Object.entries(parsed)) {
                if (typeof v === 'string') next[k] = v
            }
            setAddEnv(next)
            setShowJsonModal(false)
            setJsonInput('')
            setJsonError(null)
        } catch {
            setJsonError(t('modelPresets.jsonError'))
        }
    }, [jsonInput, t])

    const anyPending = isPending || globalEnvPending

    return (
        <div className="flex h-full min-h-0 flex-col">
            <div className="bg-[var(--app-bg)] pt-[env(safe-area-inset-top)]">
                <div className="mx-auto w-full max-w-content flex items-center gap-2 p-3 border-b border-[var(--app-border)]">
                    <button type="button" onClick={goBack}
                        className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--app-hint)] transition-colors hover:bg-[var(--app-secondary-bg)] hover:text-[var(--app-fg)]">
                        <BackIcon />
                    </button>
                    <div className="flex-1 font-semibold">{t('modelPresets.title')}</div>
                </div>
            </div>

            <div className="app-scroll-y flex-1 min-h-0">
                <div className="mx-auto w-full max-w-content p-3">
                    {isLoading ? (
                        <div className="text-sm text-[var(--app-hint)]">{t('misc.loading')}</div>
                    ) : (
                        <div className="flex flex-col gap-3">
                            {machines.length > 0 && (
                                <>
                                    <OptionPicker
                                        label={t('modelPresets.selectMachine')}
                                        value={activeMachineId ?? ''}
                                        onChange={setSelectedMachineId}
                                        options={machines.map((m) => ({
                                            value: m.id,
                                            label: m.metadata?.displayName || m.metadata?.host || m.id.slice(0, 8),
                                            description: m.metadata?.platform,
                                        }))}
                                        className="!px-0 !py-0"
                                    />
                                    <GlobalConfigCard
                                    env={globalEnv}
                                    onUpdate={handleUpdateGlobalEnv}
                                    isPending={globalEnvPending}
                                    isLoading={globalEnvLoading}
                                />
                                </>
                            )}

                            <div className="flex items-center gap-3 pt-2">
                                <div className="h-px flex-1 bg-[var(--app-divider)]" />
                                <span className="text-xs font-medium text-[var(--app-hint)]">{t('modelPresets.presetSection')}</span>
                                <div className="h-px flex-1 bg-[var(--app-divider)]" />
                            </div>

                            {presets.length === 0 && !showAdd ? (
                                <div className="flex flex-col items-center gap-3 py-4">
                                    <span className="text-sm text-[var(--app-hint)]">{t('modelPresets.empty')}</span>
                                </div>
                            ) : (
                                presets.map((preset) => (
                                    <PresetCard key={preset.id} preset={preset} onUpdate={handleUpdate} onDelete={handleDelete} isPending={anyPending} />
                                ))
                            )}

                            {showAdd ? (
                                <div className="border border-[var(--app-link)] rounded-xl p-4">
                                    <div className="flex flex-col gap-3">
                                        <div className="flex items-end gap-2">
                                            <div className="flex flex-1 flex-col gap-1">
                                                <label className="text-xs text-[var(--app-hint)]">{t('modelPresets.name')}</label>
                                                <input type="text" value={addName} onChange={(e) => setAddName(e.target.value)}
                                                    placeholder={t('modelPresets.namePlaceholder')} className={inputClass} autoFocus />
                                            </div>
                                            <button type="button" onClick={() => { setShowJsonModal(true); setJsonInput(''); setJsonError(null) }}
                                                className="shrink-0 rounded-lg border border-[var(--app-divider)] bg-[var(--app-secondary-bg)] px-3 py-2 text-xs font-medium text-[var(--app-fg)] hover:bg-[var(--app-subtle-bg)]">
                                                {t('modelPresets.jsonImport')}
                                            </button>
                                        </div>
                                        <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                                            {ENV_FIELDS.map((field) => (
                                                <div key={field.key} className={`${field.span === 2 ? 'col-span-2' : 'col-span-1'} flex flex-col gap-0.5`}>
                                                    <label className="text-xs text-[var(--app-hint)]" title={field.key}>{field.label}</label>
                                                    <input type="text" value={addEnv[field.key] ?? ''} onChange={(e) => handleEnvChange(field.key, e.target.value)} className={inputClass} />
                                                </div>
                                            ))}
                                        </div>
                                        <div className="flex justify-end gap-2 pt-1">
                                            <button type="button" onClick={() => { setShowAdd(false); setAddName(''); setAddEnv({}) }}
                                                className="rounded-lg px-3 py-1.5 text-xs text-[var(--app-hint)] hover:text-[var(--app-fg)]">
                                                {t('button.cancel')}
                                            </button>
                                            <button type="button" onClick={handleAdd} disabled={anyPending || !addName.trim()}
                                                className="rounded-lg bg-[var(--app-button)] px-3 py-1.5 text-xs font-medium text-[var(--app-button-text)] disabled:opacity-50">
                                                {t('button.save')}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <button type="button" onClick={() => setShowAdd(true)}
                                    className="w-full rounded-xl border border-dashed border-[var(--app-divider)] py-3 text-sm text-[var(--app-hint)] hover:text-[var(--app-fg)] hover:border-[var(--app-fg)] transition-colors">
                                    + {t('modelPresets.add')}
                                </button>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {showJsonModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowJsonModal(false)}>
                    <div className="mx-4 w-full max-w-md rounded-xl bg-[var(--app-secondary-bg)] p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
                        <div className="mb-3 text-sm font-medium text-[var(--app-fg)]">{t('modelPresets.jsonImport')}</div>
                        <textarea value={jsonInput} onChange={(e) => { setJsonInput(e.target.value); setJsonError(null) }}
                            autoFocus rows={8}
                            placeholder='{"ANTHROPIC_MODEL": "claude-sonnet-4-20250514", "ANTHROPIC_BASE_URL": "..."}'
                            className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-[var(--app-divider)] bg-[var(--app-bg)] text-[var(--app-text)] focus:outline-none focus:ring-2 focus:ring-[var(--app-link)] resize-none" />
                        {jsonError && <div className="mt-1.5 text-xs text-red-500">{jsonError}</div>}
                        <div className="mt-3 flex justify-end gap-2">
                            <button type="button" onClick={() => setShowJsonModal(false)}
                                className="rounded-lg px-3 py-1.5 text-xs text-[var(--app-hint)] hover:text-[var(--app-fg)]">
                                {t('button.cancel')}
                            </button>
                            <button type="button" onClick={handleApplyJson}
                                className="rounded-lg bg-[var(--app-button)] px-4 py-1.5 text-xs font-medium text-[var(--app-button-text)]">
                                {t('modelPresets.jsonParse')}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
