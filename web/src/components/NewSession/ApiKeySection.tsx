import { useState, useEffect, useCallback } from 'react'
import type { ApiClient } from '@/api/client'
import { useModelConfigPresets } from '@/hooks/queries/useModelConfigPresets'
import { useModelConfigPresetActions } from '@/hooks/mutations/useModelConfigPresetActions'
import { OptionPicker } from '@/components/ui/OptionPicker'

const ENV_FIELDS = [
    { key: 'ANTHROPIC_AUTH_TOKEN', label: 'Auth Token', span: 2 },
    { key: 'ANTHROPIC_BASE_URL', label: 'Base URL', span: 2 },
    { key: 'ANTHROPIC_MODEL', label: 'Model', span: 1 },
    { key: 'ANTHROPIC_REASONING_MODEL', label: 'Reasoning Model', span: 1 },
    { key: 'ANTHROPIC_DEFAULT_SONNET_MODEL', label: 'Sonnet', span: 1 },
    { key: 'ANTHROPIC_DEFAULT_HAIKU_MODEL', label: 'Haiku', span: 1 },
    { key: 'ANTHROPIC_DEFAULT_OPUS_MODEL', label: 'Opus', span: 1 },
] as const

export type PendingEnvAction = {
    needsWrite: boolean
    env: Record<string, string> | null
    isValid: boolean
}

type EnvSectionProps = {
    api: ApiClient | null
    machineId: string | null
    directory: string
    agent: string
    isDisabled: boolean
    onEnvChange?: (pending: PendingEnvAction) => void
}

function envEqual(a: Record<string, string>, b: Record<string, string>): boolean {
    const keysA = Object.keys(a).filter((k) => a[k])
    const keysB = Object.keys(b).filter((k) => b[k])
    if (keysA.length !== keysB.length) return false
    return keysA.every((k) => a[k] === b[k])
}

export function ApiKeySection(props: EnvSectionProps) {
    const { api, machineId, directory, agent, isDisabled, onEnvChange } = props

    const [values, setValues] = useState<Record<string, string>>({})
    const [loadedValues, setLoadedValues] = useState<Record<string, string>>({})
    const [hasLocal, setHasLocal] = useState(false)
    const [useGlobal, setUseGlobal] = useState(true)
    const [isLoading, setIsLoading] = useState(false)
    const [showJsonModal, setShowJsonModal] = useState(false)
    const [jsonInput, setJsonInput] = useState('')
    const [jsonError, setJsonError] = useState<string | null>(null)
    const [selectedPresetId, setSelectedPresetId] = useState<string>('')
    const [showSaveInput, setShowSaveInput] = useState(false)
    const [saveName, setSaveName] = useState('')

    const { presets } = useModelConfigPresets(api)
    const { createPreset, deletePreset } = useModelConfigPresetActions(api)

    const trimmedDirectory = directory.trim()

    useEffect(() => {
        if (!api || !machineId || !trimmedDirectory) {
            setLoadedValues({})
            setValues({})
            setHasLocal(false)
            setUseGlobal(true)
            onEnvChange?.({ needsWrite: false, env: null, isValid: true })
            return
        }

        let cancelled = false
        setIsLoading(true)

        api.getProjectEnv(machineId, trimmedDirectory)
            .then((result) => {
                if (cancelled) return
                if (result.success && result.hasLocal && result.env) {
                    setLoadedValues(result.env)
                    setValues(result.env)
                    setHasLocal(true)
                    setUseGlobal(false)
                    onEnvChange?.({ needsWrite: false, env: null, isValid: true })
                } else {
                    setLoadedValues({})
                    setValues({})
                    setHasLocal(false)
                    setUseGlobal(true)
                    onEnvChange?.({ needsWrite: false, env: null, isValid: true })
                }
            })
            .catch(() => {
                if (cancelled) return
                setLoadedValues({})
                setValues({})
                setHasLocal(false)
                setUseGlobal(true)
                onEnvChange?.({ needsWrite: false, env: null, isValid: true })
            })
            .finally(() => {
                if (!cancelled) setIsLoading(false)
            })

        return () => { cancelled = true }
    }, [api, machineId, trimmedDirectory])

    // Report pending action to parent
    useEffect(() => {
        if (!onEnvChange) return

        if (useGlobal) {
            onEnvChange({ needsWrite: hasLocal, env: null, isValid: true })
        } else {
            const env: Record<string, string> = {}
            for (const [k, v] of Object.entries(values)) {
                if (v) env[k] = v
            }
            const allFilled = ENV_FIELDS.every((f) => env[f.key])
            if (envEqual(env, loadedValues)) {
                onEnvChange({ needsWrite: false, env: null, isValid: allFilled })
            } else {
                onEnvChange({ needsWrite: true, env: Object.keys(env).length > 0 ? env : null, isValid: allFilled })
            }
        }
    }, [useGlobal, values, loadedValues, hasLocal, onEnvChange])

    if (agent !== 'claude') return null

    const handleToggle = useCallback(() => {
        setUseGlobal((prev) => !prev)
    }, [])

    const handleValueChange = useCallback((key: string, value: string) => {
        setValues((prev) => {
            const next = { ...prev }
            if (value) {
                next[key] = value
            } else {
                delete next[key]
            }
            return next
        })
    }, [])

    const handleOpenJson = useCallback(() => {
        setJsonInput('')
        setJsonError(null)
        setShowJsonModal(true)
    }, [])

    const handleSelectPreset = useCallback((presetId: string) => {
        setSelectedPresetId(presetId)
        if (!presetId) return
        const preset = presets.find((p) => p.id === presetId)
        if (preset) setValues(preset.env)
    }, [presets])

    const handleSavePreset = useCallback(async () => {
        if (!saveName.trim()) return
        const env: Record<string, string> = {}
        for (const [k, v] of Object.entries(values)) {
            if (v) env[k] = v
        }
        await createPreset({ name: saveName.trim(), env })
        setSaveName('')
        setShowSaveInput(false)
    }, [saveName, values, createPreset])

    const handleDeletePreset = useCallback(async () => {
        if (!selectedPresetId) return
        await deletePreset(selectedPresetId)
        setSelectedPresetId('')
    }, [selectedPresetId, deletePreset])

    const handleApplyJson = useCallback(() => {
        try {
            const parsed = JSON.parse(jsonInput)
            if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
                setJsonError('JSON 必须是一个对象')
                return
            }
            const next: Record<string, string> = {}
            for (const [k, v] of Object.entries(parsed)) {
                if (typeof v === 'string') next[k] = v
            }
            setValues(next)
            setShowJsonModal(false)
            setJsonInput('')
            setJsonError(null)
        } catch {
            setJsonError('JSON 格式不正确')
        }
    }, [jsonInput])

    const inputClass = "w-full px-3 py-2 text-sm rounded-lg border border-[var(--app-divider)] bg-[var(--app-bg)] text-[var(--app-text)] focus:outline-none focus:ring-2 focus:ring-[var(--app-link)] disabled:opacity-50"

    return (
        <div className="flex flex-col gap-2 px-3 py-3">
            <label className="text-xs font-medium text-[var(--app-hint)]">
                模型配置
            </label>

            <div className="flex items-center justify-between gap-3">
                <div className="flex flex-col">
                    <span className="text-sm text-[var(--app-fg)]">
                        使用全局配置
                    </span>
                    <span className="text-xs text-[var(--app-hint)]">
                        {useGlobal ? '使用 CLI 进程的环境变量' : '使用当前项目的自定义配置'}
                    </span>
                </div>
                <label className="relative inline-flex h-5 w-9 items-center">
                    <input
                        type="checkbox"
                        checked={useGlobal}
                        onChange={handleToggle}
                        disabled={isDisabled}
                        className="peer sr-only"
                    />
                    <span className="absolute inset-0 rounded-full bg-[var(--app-border)] transition-colors peer-checked:bg-[var(--app-link)] peer-disabled:opacity-50" />
                    <span className="absolute left-0.5 h-4 w-4 rounded-full bg-[var(--app-bg)] transition-transform peer-checked:translate-x-4 peer-disabled:opacity-50" />
                </label>
            </div>

            {!useGlobal && (
                <div className="flex flex-col gap-2 pt-1">
                    <OptionPicker
                        value={selectedPresetId}
                        onChange={handleSelectPreset}
                        disabled={isDisabled}
                        options={[
                            { value: '', label: '-- 选择预设 --' },
                            ...presets.map((p) => ({ value: p.id, label: p.name })),
                        ]}
                        className="!px-0 !py-0"
                    />
                    <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                        {ENV_FIELDS.map((field) => (
                            <div key={field.key} className={`${field.span === 2 ? 'col-span-2' : 'col-span-1'} flex flex-col gap-0.5`}>
                                <label className="text-xs text-[var(--app-hint)]" title={field.key}>
                                    {field.label}
                                </label>
                                <input
                                    type="text"
                                    value={values[field.key] ?? ''}
                                    onChange={(e) => handleValueChange(field.key, e.target.value)}
                                    disabled={isDisabled}
                                    placeholder={isLoading ? 'Loading...' : ''}
                                    className={inputClass}
                                />
                            </div>
                        ))}
                    </div>
                    {showSaveInput ? (
                        <div className="flex items-center gap-2">
                            <input
                                type="text"
                                value={saveName}
                                onChange={(e) => setSaveName(e.target.value)}
                                disabled={isDisabled}
                                placeholder="预设名称"
                                className="flex-1 min-w-0 px-3 py-1.5 text-sm rounded-lg border border-[var(--app-divider)] bg-[var(--app-bg)] text-[var(--app-text)] focus:outline-none focus:ring-2 focus:ring-[var(--app-link)] disabled:opacity-50"
                            />
                            <button
                                type="button"
                                onClick={handleSavePreset}
                                disabled={isDisabled || !saveName.trim()}
                                className="shrink-0 rounded-lg bg-[var(--app-button)] px-3 py-1.5 text-xs font-medium text-[var(--app-button-text)] disabled:opacity-50"
                            >
                                保存
                            </button>
                            <button
                                type="button"
                                onClick={() => { setShowSaveInput(false); setSaveName('') }}
                                className="shrink-0 text-xs text-[var(--app-hint)] hover:text-[var(--app-fg)]"
                            >
                                取消
                            </button>
                        </div>
                    ) : null}
                    <div className="flex items-center gap-2">
                        {!showSaveInput && (
                            <button
                                type="button"
                                onClick={() => setShowSaveInput(true)}
                                disabled={isDisabled}
                                className="shrink-0 rounded-lg border border-[var(--app-divider)] bg-[var(--app-secondary-bg)] px-3 py-1.5 text-xs font-medium text-[var(--app-fg)] hover:bg-[var(--app-subtle-bg)] disabled:opacity-50"
                            >
                                保存为预设
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={handleOpenJson}
                            disabled={isDisabled}
                            className="shrink-0 rounded-lg border border-[var(--app-divider)] bg-[var(--app-secondary-bg)] px-3 py-1.5 text-xs font-medium text-[var(--app-fg)] hover:bg-[var(--app-subtle-bg)] disabled:opacity-50"
                        >
                            JSON 导入
                        </button>
                    </div>
                </div>
            )}

            {showJsonModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowJsonModal(false)}>
                    <div className="mx-4 w-full max-w-md rounded-xl bg-[var(--app-secondary-bg)] p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
                        <div className="mb-3 text-sm font-medium text-[var(--app-fg)]">JSON 导入</div>
                        <textarea
                            value={jsonInput}
                            onChange={(e) => { setJsonInput(e.target.value); setJsonError(null) }}
                            autoFocus
                            rows={8}
                            placeholder='{"ANTHROPIC_MODEL": "GLM-5.1", "ANTHROPIC_BASE_URL": "..."}'
                            className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-[var(--app-divider)] bg-[var(--app-bg)] text-[var(--app-text)] focus:outline-none focus:ring-2 focus:ring-[var(--app-link)] resize-none"
                        />
                        {jsonError && <div className="mt-1.5 text-xs text-red-500">{jsonError}</div>}
                        <div className="mt-3 flex justify-end gap-2">
                            <button
                                type="button"
                                onClick={() => setShowJsonModal(false)}
                                className="rounded-lg px-3 py-1.5 text-xs text-[var(--app-hint)] hover:text-[var(--app-fg)]"
                            >
                                取消
                            </button>
                            <button
                                type="button"
                                onClick={handleApplyJson}
                                className="rounded-lg bg-[var(--app-button)] px-4 py-1.5 text-xs font-medium text-[var(--app-button-text)]"
                            >
                                解析
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
