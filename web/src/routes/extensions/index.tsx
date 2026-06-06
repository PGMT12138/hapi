import { useState, useCallback } from 'react'
import { useTranslation } from '@/lib/use-translation'
import { useAppGoBack } from '@/hooks/useAppGoBack'
import { useAppContext } from '@/lib/app-context'
import { useMachines } from '@/hooks/queries/useMachines'
import { useCcSkills } from '@/hooks/queries/useCcSkills'
import { useCcMcpServers } from '@/hooks/queries/useCcMcpServers'
import { useCcExtensionActions } from '@/hooks/mutations/useCcExtensionActions'
import { OptionPicker } from '@/components/ui/OptionPicker'

function BackIcon() {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24"
            fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
        </svg>
    )
}

function ToggleSwitch({ checked, disabled, onChange }: {
    checked: boolean
    disabled?: boolean
    onChange: () => void
}) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            disabled={disabled}
            onClick={onChange}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-[var(--app-link)] focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed ${checked ? 'bg-[var(--app-link)]' : 'bg-[var(--app-divider)]'}`}
        >
            <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${checked ? 'translate-x-5' : 'translate-x-0'}`} />
        </button>
    )
}

type TabType = 'skills' | 'mcp'

export default function ExtensionsPage() {
    const { t } = useTranslation()
    const goBack = useAppGoBack()
    const { api } = useAppContext()
    const { machines, isLoading: machinesLoading } = useMachines(api, true)
    const [selectedMachineId, setSelectedMachineId] = useState<string>('')
    const [activeTab, setActiveTab] = useState<TabType>('skills')

    const { skills, isLoading: skillsLoading, error: skillsError } = useCcSkills(api, selectedMachineId || null)
    const { servers, isLoading: serversLoading, error: serversError } = useCcMcpServers(api, selectedMachineId || null)
    const { updateSkillOverride, updateMcpServerStatus, isPending } = useCcExtensionActions(api, selectedMachineId || null)

    const handleSkillToggle = useCallback(async (name: string, currentState: string | null) => {
        try {
            const enabled = currentState !== 'off'
            await updateSkillOverride({ name, enabled: !enabled })
        } catch {
            // Mutation failed, query invalidation won't happen, UI stays consistent
        }
    }, [updateSkillOverride])

    const handleMcpToggle = useCallback(async (name: string, enabled: boolean) => {
        try {
            await updateMcpServerStatus({ name, enabled: !enabled })
        } catch {
            // Mutation failed
        }
    }, [updateMcpServerStatus])

    const machineOptions = machines.map(m => ({
        value: m.id,
        label: m.metadata?.displayName || m.metadata?.host || m.id,
        description: m.metadata?.platform || '',
    }))

    const activeMachine = machines.find(m => m.id === selectedMachineId)
    const isOnline = activeMachine?.active ?? false

    return (
        <div className="flex h-full min-h-0 flex-col">
            <div className="bg-[var(--app-bg)] pt-[env(safe-area-inset-top)]">
                <div className="mx-auto w-full max-w-content flex items-center gap-2 p-3 border-b border-[var(--app-border)]">
                    <button type="button" onClick={goBack}
                        className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--app-hint)] transition-colors hover:bg-[var(--app-secondary-bg)] hover:text-[var(--app-fg)]">
                        <BackIcon />
                    </button>
                    <div className="flex-1 font-semibold">{t('extensions.title')}</div>
                </div>
            </div>

            <div className="app-scroll-y flex-1 min-h-0">
                <div className="mx-auto w-full max-w-content p-3">
                    {machinesLoading ? (
                        <div className="text-sm text-[var(--app-hint)]">{t('misc.loading')}</div>
                    ) : machines.length === 0 ? (
                        <div className="text-sm text-[var(--app-hint)]">{t('extensions.noMachines')}</div>
                    ) : (
                        <div className="flex flex-col gap-4">
                            <OptionPicker
                                label={t('extensions.selectMachine')}
                                value={selectedMachineId}
                                options={machineOptions}
                                onChange={setSelectedMachineId}
                            />

                            {selectedMachineId && !isOnline && (
                                <div className="text-sm text-[var(--app-hint)]">{t('extensions.machineOffline')}</div>
                            )}

                            {selectedMachineId && isOnline && (
                                <>
                                    <div className="flex border-b border-[var(--app-divider)]">
                                        <button
                                            type="button"
                                            onClick={() => setActiveTab('skills')}
                                            className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${activeTab === 'skills' ? 'text-[var(--app-link)] border-b-2 border-[var(--app-link)]' : 'text-[var(--app-hint)] hover:text-[var(--app-fg)]'}`}
                                        >
                                            {t('extensions.skillsTab')}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setActiveTab('mcp')}
                                            className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${activeTab === 'mcp' ? 'text-[var(--app-link)] border-b-2 border-[var(--app-link)]' : 'text-[var(--app-hint)] hover:text-[var(--app-fg)]'}`}
                                        >
                                            {t('extensions.mcpTab')}
                                        </button>
                                    </div>

                                    {activeTab === 'skills' && (
                                        <div className="flex flex-col gap-1">
                                            {skillsLoading ? (
                                                <div className="text-sm text-[var(--app-hint)]">{t('misc.loading')}</div>
                                            ) : skillsError ? (
                                                <div className="text-sm text-red-500">{skillsError}</div>
                                            ) : skills.length === 0 ? (
                                                <div className="text-sm text-[var(--app-hint)]">{t('extensions.noSkills')}</div>
                                            ) : skills.map(skill => (
                                                <div key={skill.name}
                                                    className="flex items-center justify-between gap-3 px-3 py-3 border-b border-[var(--app-divider)] last:border-b-0">
                                                    <div className="min-w-0 flex-1">
                                                        <div className="text-sm font-medium text-[var(--app-fg)] truncate">{skill.name}</div>
                                                        {skill.description && (
                                                            <div className="text-xs text-[var(--app-hint)] truncate mt-0.5">{skill.description}</div>
                                                        )}
                                                    </div>
                                                    <ToggleSwitch
                                                        checked={skill.overrideState !== 'off'}
                                                        disabled={isPending}
                                                        onChange={() => { void handleSkillToggle(skill.name, skill.overrideState) }}
                                                    />
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {activeTab === 'mcp' && (
                                        <div className="flex flex-col gap-1">
                                            {serversLoading ? (
                                                <div className="text-sm text-[var(--app-hint)]">{t('misc.loading')}</div>
                                            ) : serversError ? (
                                                <div className="text-sm text-red-500">{serversError}</div>
                                            ) : servers.length === 0 ? (
                                                <div className="text-sm text-[var(--app-hint)]">{t('extensions.noMcpServers')}</div>
                                            ) : servers.map(server => (
                                                <div key={server.name}
                                                    className="flex items-center justify-between gap-3 px-3 py-3 border-b border-[var(--app-divider)] last:border-b-0">
                                                    <div className="min-w-0 flex-1">
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-sm font-medium text-[var(--app-fg)] truncate">{server.name}</span>
                                                            <span className="text-xs px-1.5 py-0.5 rounded bg-[var(--app-subtle-bg)] text-[var(--app-hint)] uppercase">{server.type}</span>
                                                        </div>
                                                        {(server.url || server.command) && (
                                                            <div className="text-xs text-[var(--app-hint)] truncate mt-0.5">{server.url || server.command}</div>
                                                        )}
                                                    </div>
                                                    <ToggleSwitch
                                                        checked={server.enabled}
                                                        disabled={isPending}
                                                        onChange={() => { void handleMcpToggle(server.name, server.enabled) }}
                                                    />
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
