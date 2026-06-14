import { useEffect, useState } from 'react'
import type { ApiClient } from '@/api/client'
import { useProjectPlugins } from '@/hooks/queries/useProjectPlugins'
import { useProjectPluginActions } from '@/hooks/mutations/useProjectPluginActions'
import { useTranslation } from '@/lib/use-translation'
import { PluginDetailModal } from './PluginDetailModal'

export function PluginsSection(props: {
    api: ApiClient
    machineId: string | null
    directory: string
    canShow: boolean
}) {
    const { t } = useTranslation()
    const [pluginsExpanded, setPluginsExpanded] = useState(false)
    const [detailPluginName, setDetailPluginName] = useState<string | null>(null)

    const { plugins: projectPlugins, isLoading: pluginsLoading, error: pluginsError } = useProjectPlugins(
        props.canShow ? props.api : null,
        props.canShow ? props.machineId : null,
        props.canShow ? props.directory : null
    )
    const { updatePluginStatus, clearAll, isPending: pluginPending } = useProjectPluginActions(
        props.canShow ? props.api : null,
        props.canShow ? props.machineId : null,
        props.directory
    )

    const useGlobalInferred = !projectPlugins.some(p => p.managedLocally)
    const [useGlobal, setUseGlobal] = useState(true)
    useEffect(() => {
        setUseGlobal(useGlobalInferred)
    }, [useGlobalInferred])

    if (!props.canShow) return null

    async function handlePluginToggle(name: string, currentlyEnabled: boolean) {
        try {
            await updatePluginStatus({ name, enabled: !currentlyEnabled })
        } catch {
            // 失败由 query 不更新反映；忽略
        }
    }

    async function handleUseGlobalToggle(nextUseGlobal: boolean) {
        if (nextUseGlobal) {
            setUseGlobal(true)
            try {
                await clearAll()
            } catch {
                // 失败由 query 不更新反映；忽略
            }
        } else {
            setUseGlobal(false)
        }
    }

    return (
        <div className="flex flex-col gap-1.5 px-3 py-3">
            <button
                type="button"
                onClick={() => setPluginsExpanded(v => !v)}
                className="flex items-center justify-between text-left"
            >
                <span className="text-xs font-medium text-[var(--app-hint)]">
                    {t('spawn.plugins.title')} ({projectPlugins.length})
                </span>
                <span className="text-xs text-[var(--app-hint)]">
                    {pluginsExpanded ? '−' : '+'}
                </span>
            </button>
            {pluginsExpanded && (
                <div className="mt-1 rounded-md border border-[var(--app-divider)]">
                    <div className="flex items-center justify-between gap-3 px-3 py-2 border-b border-[var(--app-divider)]">
                        <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium text-[var(--app-fg)]">{t('spawn.plugins.useGlobal')}</div>
                            <div className="text-xs text-[var(--app-hint)] mt-0.5">{t('spawn.plugins.useGlobalHint')}</div>
                        </div>
                        <button
                            type="button"
                            role="switch"
                            aria-checked={useGlobal}
                            disabled={pluginPending}
                            onClick={() => { void handleUseGlobalToggle(!useGlobal) }}
                            className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed ${useGlobal ? 'bg-[var(--app-link)]' : 'bg-[var(--app-divider)]'}`}
                        >
                            <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${useGlobal ? 'translate-x-4' : 'translate-x-0'}`} />
                        </button>
                    </div>

                    {pluginsLoading ? (
                        <div className="px-3 py-2 text-xs text-[var(--app-hint)]">{t('misc.loading')}</div>
                    ) : pluginsError ? (
                        <div className="px-3 py-2 text-xs text-red-500">{pluginsError}</div>
                    ) : projectPlugins.length === 0 ? (
                        <div className="px-3 py-2 text-xs text-[var(--app-hint)]">{t('spawn.plugins.empty')}</div>
                    ) : (
                        <>
                            {projectPlugins.map(plugin => (
                                <div key={plugin.pluginKey}
                                    className={`flex items-center justify-between gap-3 px-3 py-2 border-b border-[var(--app-divider)] last:border-b-0 ${!plugin.effectiveEnabled ? 'opacity-50' : ''}`}>
                                    <button
                                        type="button"
                                        onClick={() => setDetailPluginName(plugin.name)}
                                        className="min-w-0 flex-1 text-left hover:text-[var(--app-link)] transition-colors"
                                    >
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="text-sm font-medium text-[var(--app-fg)] truncate">{plugin.name}</span>
                                            {plugin.version && (
                                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--app-subtle-bg)] text-[var(--app-hint)]">v{plugin.version}</span>
                                            )}
                                            {plugin.hasMcp && (
                                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300">MCP</span>
                                            )}
                                            {plugin.skillCount > 0 && (
                                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300">{plugin.skillCount} Skills</span>
                                            )}
                                        </div>
                                        {plugin.description && (
                                            <div className="text-xs text-[var(--app-hint)] truncate mt-0.5">{plugin.description}</div>
                                        )}
                                        {plugin.author && (
                                            <div className="text-[10px] text-[var(--app-hint)] mt-0.5">by {plugin.author}</div>
                                        )}
                                    </button>
                                    <button
                                        type="button"
                                        role="switch"
                                        aria-checked={plugin.effectiveEnabled}
                                        disabled={pluginPending || useGlobal}
                                        onClick={() => { void handlePluginToggle(plugin.name, plugin.effectiveEnabled) }}
                                        className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed ${plugin.effectiveEnabled ? 'bg-[var(--app-link)]' : 'bg-[var(--app-divider)]'}`}
                                    >
                                        <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${plugin.effectiveEnabled ? 'translate-x-4' : 'translate-x-0'}`} />
                                    </button>
                                </div>
                            ))}
                            <div className="px-3 py-1.5 text-[10px] text-[var(--app-hint)]">
                                {t('spawn.plugins.hint')}
                            </div>
                        </>
                    )}
                </div>
            )}

            {detailPluginName && props.machineId && (
                <PluginDetailModal
                    name={detailPluginName}
                    machineId={props.machineId}
                    onClose={() => setDetailPluginName(null)}
                />
            )}
        </div>
    )
}
