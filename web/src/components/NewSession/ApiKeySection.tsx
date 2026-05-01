import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from '@/lib/use-translation'
import type { ApiClient } from '@/api/client'

type ApiKeySectionProps = {
    api: ApiClient | null
    machineId: string | null
    directory: string
    agent: string
    isDisabled: boolean
}

export function ApiKeySection(props: ApiKeySectionProps) {
    const { api, machineId, directory, agent, isDisabled } = props
    const { t } = useTranslation()

    const [useGlobal, setUseGlobal] = useState(true)
    const [apiKey, setApiKey] = useState('')
    const [loadedKey, setLoadedKey] = useState<string | null>(null)
    const [isLoading, setIsLoading] = useState(false)
    const [isSaving, setIsSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const trimmedDirectory = directory.trim()

    useEffect(() => {
        if (!api || !machineId || !trimmedDirectory) {
            setLoadedKey(null)
            setApiKey('')
            setUseGlobal(true)
            return
        }

        let cancelled = false
        setIsLoading(true)
        setError(null)

        api.getProjectEnv(machineId, trimmedDirectory)
            .then((result) => {
                if (cancelled) return
                if (result.success && result.hasLocal && result.apiKey) {
                    setLoadedKey(result.apiKey)
                    setApiKey(result.apiKey)
                    setUseGlobal(false)
                } else {
                    setLoadedKey(null)
                    setApiKey('')
                    setUseGlobal(true)
                }
            })
            .catch(() => {
                if (cancelled) return
                setError('Failed to load config')
            })
            .finally(() => {
                if (!cancelled) setIsLoading(false)
            })

        return () => { cancelled = true }
    }, [api, machineId, trimmedDirectory])

    if (agent !== 'claude') return null

    const handleToggleGlobal = useCallback(() => {
        if (!useGlobal) {
            setUseGlobal(true)
            setApiKey('')
            if (api && machineId && trimmedDirectory) {
                setIsSaving(true)
                api.setProjectEnv(machineId, trimmedDirectory, null)
                    .then((result) => {
                        if (result.success) setLoadedKey(null)
                        else setError(result.error || 'Failed to clear')
                    })
                    .catch(() => setError('Failed to clear config'))
                    .finally(() => setIsSaving(false))
            }
        } else {
            setUseGlobal(false)
        }
    }, [useGlobal, api, machineId, trimmedDirectory])

    const handleSave = useCallback(() => {
        if (!api || !machineId || !trimmedDirectory) return
        setIsSaving(true)
        setError(null)
        const value = apiKey.trim() || null
        api.setProjectEnv(machineId, trimmedDirectory, value)
            .then((result) => {
                if (result.success) {
                    setLoadedKey(value)
                } else {
                    setError(result.error || 'Failed to save')
                }
            })
            .catch(() => setError('Failed to save'))
            .finally(() => setIsSaving(false))
    }, [api, machineId, trimmedDirectory, apiKey])

    const hasChanges = apiKey !== (loadedKey || '')

    return (
        <div className="flex flex-col gap-1.5 px-3 py-3">
            <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-[var(--app-hint)]">
                    API Key
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer text-xs text-[var(--app-hint)]">
                    <input
                        type="checkbox"
                        checked={useGlobal}
                        onChange={handleToggleGlobal}
                        disabled={isDisabled || isSaving}
                        className="accent-[var(--app-link)]"
                    />
                    {t('newSession.apiKey.useGlobal') || 'Use global'}
                </label>
            </div>

            {!useGlobal && (
                <div className="flex flex-col gap-1.5">
                    <div className="flex gap-2">
                        <input
                            type="password"
                            value={apiKey}
                            onChange={(e) => setApiKey(e.target.value)}
                            disabled={isDisabled || isSaving}
                            placeholder={isLoading ? 'Loading...' : 'sk-ant-...'}
                            className="flex-1 min-w-0 rounded-md border border-[var(--app-border)] bg-[var(--app-bg)] px-2.5 py-1.5 text-sm text-[var(--app-fg)] outline-none focus:border-[var(--app-link)]"
                        />
                        {hasChanges && (
                            <button
                                type="button"
                                onClick={handleSave}
                                disabled={isDisabled || isSaving}
                                className="shrink-0 rounded-md bg-[var(--app-button)] px-3 py-1.5 text-xs font-medium text-[var(--app-button-text)] disabled:opacity-50"
                            >
                                {isSaving ? '...' : t('newSession.apiKey.save') || 'Save'}
                            </button>
                        )}
                    </div>
                    {error && <div className="text-xs text-red-500">{error}</div>}
                </div>
            )}

            {useGlobal && (
                <div className="text-xs text-[var(--app-hint)]">
                    {t('newSession.apiKey.globalHint') || 'Using environment variable from CLI process'}
                </div>
            )}
        </div>
    )
}
