import { useEffect, useState } from 'react'
import type { ApiClient } from '@/api/client'
import { useProjectSkills } from '@/hooks/queries/useProjectSkills'
import { useProjectSkillActions } from '@/hooks/mutations/useProjectSkillActions'
import { useTranslation } from '@/lib/use-translation'
import { SkillDetailModal } from './SkillDetailModal'

export function SkillsSection(props: {
    api: ApiClient
    machineId: string | null
    directory: string
    canShow: boolean
}) {
    const { t } = useTranslation()
    const [skillsExpanded, setSkillsExpanded] = useState(false)
    const [detailSkillName, setDetailSkillName] = useState<string | null>(null)

    const { skills: projectSkills, isLoading: skillsLoading, error: skillsError } = useProjectSkills(
        props.canShow ? props.api : null,
        props.canShow ? props.machineId : null,
        props.canShow ? props.directory : null
    )
    const { updateSkillOverride: updateProjectSkill, clearAll, isPending: skillUpdatePending } = useProjectSkillActions(
        props.canShow ? props.api : null,
        props.canShow ? props.machineId : null,
        props.directory
    )

    const useGlobalInferred = !projectSkills.some(s => s.managedLocally)
    const [useGlobal, setUseGlobal] = useState(true)
    useEffect(() => {
        setUseGlobal(useGlobalInferred)
    }, [useGlobalInferred])

    if (!props.canShow) return null

    async function handleSkillToggle(name: string, currentlyEnabled: boolean) {
        try {
            await updateProjectSkill({ name, enabled: !currentlyEnabled })
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
                onClick={() => setSkillsExpanded(v => !v)}
                className="flex items-center justify-between text-left"
            >
                <span className="text-xs font-medium text-[var(--app-hint)]">
                    {t('spawn.skills.title')} ({projectSkills.length})
                </span>
                <span className="text-xs text-[var(--app-hint)]">
                    {skillsExpanded ? '−' : '+'}
                </span>
            </button>
            {skillsExpanded && (
                <div className="mt-1 rounded-md border border-[var(--app-divider)]">
                    <div className="flex items-center justify-between gap-3 px-3 py-2 border-b border-[var(--app-divider)]">
                        <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium text-[var(--app-fg)]">{t('spawn.skills.useGlobal')}</div>
                            <div className="text-xs text-[var(--app-hint)] mt-0.5">{t('spawn.skills.useGlobalHint')}</div>
                        </div>
                        <button
                            type="button"
                            role="switch"
                            aria-checked={useGlobal}
                            disabled={skillUpdatePending}
                            onClick={() => { void handleUseGlobalToggle(!useGlobal) }}
                            className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed ${useGlobal ? 'bg-[var(--app-link)]' : 'bg-[var(--app-divider)]'}`}
                        >
                            <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${useGlobal ? 'translate-x-4' : 'translate-x-0'}`} />
                        </button>
                    </div>

                    {skillsLoading ? (
                        <div className="px-3 py-2 text-xs text-[var(--app-hint)]">{t('misc.loading')}</div>
                    ) : skillsError ? (
                        <div className="px-3 py-2 text-xs text-red-500">{skillsError}</div>
                    ) : projectSkills.length === 0 ? (
                        <div className="px-3 py-2 text-xs text-[var(--app-hint)]">{t('spawn.skills.empty')}</div>
                    ) : (
                        <>
                            {projectSkills.map(skill => {
                                const enabled = skill.effectiveState !== 'off'
                                return (
                                    <div key={skill.name}
                                        className="flex items-center justify-between gap-3 px-3 py-2 border-b border-[var(--app-divider)] last:border-b-0">
                                        <button
                                            type="button"
                                            onClick={() => setDetailSkillName(skill.name)}
                                            className="min-w-0 flex-1 text-left hover:text-[var(--app-link)] transition-colors"
                                        >
                                            <div className="text-sm font-medium text-[var(--app-fg)] truncate">{skill.name}</div>
                                            {skill.description && (
                                                <div className="text-xs text-[var(--app-hint)] truncate mt-0.5">{skill.description}</div>
                                            )}
                                        </button>
                                        <button
                                            type="button"
                                            role="switch"
                                            aria-checked={enabled}
                                            disabled={skillUpdatePending || useGlobal}
                                            onClick={() => { void handleSkillToggle(skill.name, enabled) }}
                                            className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed ${enabled ? 'bg-[var(--app-link)]' : 'bg-[var(--app-divider)]'}`}
                                        >
                                            <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${enabled ? 'translate-x-4' : 'translate-x-0'}`} />
                                        </button>
                                    </div>
                                )
                            })}
                            <div className="px-3 py-1.5 text-[10px] text-[var(--app-hint)]">
                                {t('spawn.skills.hint')}
                            </div>
                        </>
                    )}
                </div>
            )}

            {detailSkillName && props.machineId && (
                <SkillDetailModal
                    name={detailSkillName}
                    machineId={props.machineId}
                    onClose={() => setDetailSkillName(null)}
                />
            )}
        </div>
    )
}
