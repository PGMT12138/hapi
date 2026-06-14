import { useAppContext } from '@/lib/app-context'
import { useCcPluginDetail } from '@/hooks/queries/useCcPluginDetails'
import { useTranslation } from '@/lib/use-translation'

export function PluginDetailModal({ name, machineId, onClose }: {
    name: string
    machineId: string
    onClose: () => void
}) {
    const { t } = useTranslation()
    const { api } = useAppContext()
    const { detail, isLoading, error } = useCcPluginDetail(api, machineId, name)

    return (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50" onClick={onClose}>
            <div className="w-full sm:mx-4 sm:max-w-lg bg-[var(--app-secondary-bg)] rounded-t-2xl sm:rounded-xl shadow-xl max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--app-divider)]">
                    <span className="text-sm font-semibold text-[var(--app-fg)] truncate">{name}</span>
                    <button type="button" onClick={onClose}
                        className="flex h-7 w-7 items-center justify-center rounded-full text-[var(--app-hint)] hover:bg-[var(--app-subtle-bg)] hover:text-[var(--app-fg)]">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"
                            fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                    </button>
                </div>
                <div className="app-scroll-y flex-1 min-h-0 p-4">
                    {isLoading ? (
                        <div className="text-sm text-[var(--app-hint)]">{t('misc.loading')}</div>
                    ) : error ? (
                        <div className="text-sm text-red-500">{error}</div>
                    ) : !detail ? (
                        <div className="text-sm text-[var(--app-hint)]">{t('extensions.noPlugins')}</div>
                    ) : (
                        <div className="flex flex-col gap-3">
                            <div className="flex items-center gap-2 flex-wrap">
                                {detail.version && (
                                    <span className="text-xs px-1.5 py-0.5 rounded bg-[var(--app-subtle-bg)] text-[var(--app-hint)]">v{detail.version}</span>
                                )}
                                {detail.hasMcp && (
                                    <span className="text-xs px-1.5 py-0.5 rounded bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300">MCP</span>
                                )}
                                {detail.skills.length > 0 && (
                                    <span className="text-xs px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300">{detail.skills.length} Skills</span>
                                )}
                            </div>
                            {detail.description && (
                                <div>
                                    <div className="text-xs font-medium text-[var(--app-hint)] uppercase tracking-wide mb-1">{t('extensions.detail.description')}</div>
                                    <div className="text-sm text-[var(--app-fg)]">{detail.description}</div>
                                </div>
                            )}
                            {detail.author && (
                                <div>
                                    <div className="text-xs font-medium text-[var(--app-hint)] uppercase tracking-wide mb-1">{t('extensions.detail.author')}</div>
                                    <div className="text-sm text-[var(--app-fg)]">{detail.author}</div>
                                </div>
                            )}
                            {detail.homepage && (
                                <div>
                                    <div className="text-xs font-medium text-[var(--app-hint)] uppercase tracking-wide mb-1">{t('extensions.detail.homepage')}</div>
                                    <div className="text-xs font-mono text-[var(--app-link)] break-all">{detail.homepage}</div>
                                </div>
                            )}
                            <div>
                                <div className="text-xs font-medium text-[var(--app-hint)] uppercase tracking-wide mb-1">{t('extensions.detail.path')}</div>
                                <div className="text-xs font-mono text-[var(--app-fg)] break-all">{detail.installPath}</div>
                            </div>
                            {detail.installedAt && (
                                <div>
                                    <div className="text-xs font-medium text-[var(--app-hint)] uppercase tracking-wide mb-1">{t('extensions.detail.installedAt')}</div>
                                    <div className="text-xs text-[var(--app-fg)]">{new Date(detail.installedAt).toLocaleString()}</div>
                                </div>
                            )}
                            {detail.skills.length > 0 && (
                                <div>
                                    <div className="text-xs font-medium text-[var(--app-hint)] uppercase tracking-wide mb-1">
                                        {t('extensions.detail.skills')} ({detail.skills.length})
                                    </div>
                                    <div className="flex flex-col gap-1">
                                        {detail.skills.map(skill => (
                                            <div key={skill.name} className="flex flex-col px-2.5 py-1.5 rounded-lg bg-[var(--app-subtle-bg)]">
                                                <span className="text-xs font-mono font-medium text-[var(--app-fg)]">{skill.name}</span>
                                                {skill.description && (
                                                    <span className="text-xs text-[var(--app-hint)] mt-0.5 line-clamp-2">{skill.description}</span>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
