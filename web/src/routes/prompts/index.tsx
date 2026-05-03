import { useState } from 'react'
import { useTranslation } from '@/lib/use-translation'
import { useAppGoBack } from '@/hooks/useAppGoBack'
import { useAppContext } from '@/lib/app-context'
import { usePrompts } from '@/hooks/queries/usePrompts'
import { usePromptActions } from '@/hooks/mutations/usePromptActions'

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

function PromptCard({
    prompt,
    expanded,
    onToggle,
    onSave,
    onDelete,
    isPending,
    mode,
}: {
    prompt?: { id: string; name: string; content: string }
    expanded?: boolean
    onToggle?: () => void
    onSave: (name: string, content: string) => Promise<void>
    onDelete?: () => Promise<void>
    isPending?: boolean
    mode?: 'create' | 'edit'
}) {
    const { t } = useTranslation()
    const [name, setName] = useState(prompt?.name ?? '')
    const [content, setContent] = useState(prompt?.content ?? '')
    const isCreate = mode === 'create'

    if (isCreate || expanded) {
        return (
            <div className="rounded-xl border border-[var(--app-divider)] bg-[var(--app-secondary-bg)] p-4">
                <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={t('prompts.namePlaceholder')}
                    className={`${inputClass} mb-3`}
                />
                <textarea
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    placeholder={t('prompts.contentPlaceholder')}
                    rows={4}
                    className={`${inputClass} mb-3 resize-none`}
                />
                <div className="flex items-center justify-between">
                    {onDelete && (
                        <button
                            onClick={async () => {
                                await onDelete()
                            }}
                            disabled={isPending}
                            className="rounded-lg px-3 py-1.5 text-sm text-red-400 hover:bg-red-500/10 disabled:opacity-50"
                        >
                            {t('prompts.delete')}
                        </button>
                    )}
                    <div className="flex gap-2 ml-auto">
                        <button
                            onClick={() => {
                                onToggle?.()
                            }}
                            className="rounded-lg px-3 py-1.5 text-sm text-[var(--app-hint)] hover:bg-[var(--app-hover)]"
                        >
                            {t('prompts.cancel')}
                        </button>
                        <button
                            onClick={() => onSave(name, content)}
                            disabled={!name.trim() || !content.trim() || isPending}
                            className="rounded-lg bg-[var(--app-button)] px-3 py-1.5 text-sm font-medium text-[var(--app-button-text)] disabled:opacity-50"
                        >
                            {isCreate ? t('prompts.add') : t('prompts.save')}
                        </button>
                    </div>
                </div>
            </div>
        )
    }

    return (
        <button
            onClick={onToggle}
            className="w-full rounded-xl border border-[var(--app-divider)] bg-[var(--app-secondary-bg)] p-4 text-left"
        >
            <div className="flex items-center justify-between">
                <span className="font-medium">{prompt!.name}</span>
                <ChevronIcon open={false} />
            </div>
            <p className="mt-1 line-clamp-2 text-sm text-[var(--app-hint)]">{prompt!.content}</p>
        </button>
    )
}

export default function PromptsPage() {
    const goBack = useAppGoBack()
    const { api } = useAppContext()
    const { prompts, isLoading } = usePrompts(api)
    const actions = usePromptActions(api)
    const { t } = useTranslation()
    const [expandedId, setExpandedId] = useState<string | null>(null)
    const [addingNew, setAddingNew] = useState(false)

    return (
        <div className="flex h-full flex-col">
            {/* Header */}
            <div className="flex items-center gap-3 border-b border-[var(--app-divider)] px-4 py-3">
                <button
                    onClick={goBack}
                    className="rounded-lg p-1.5 hover:bg-[var(--app-hover)]"
                >
                    <BackIcon />
                </button>
                <h1 className="text-lg font-semibold">{t('prompts.title')}</h1>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4">
                {isLoading ? (
                    <div className="flex items-center justify-center py-12 text-[var(--app-hint)]">
                        {t('prompts.loading')}
                    </div>
                ) : prompts.length === 0 && !addingNew ? (
                    <div className="flex flex-col items-center justify-center py-12 text-[var(--app-hint)]">
                        <p>{t('prompts.empty')}</p>
                        <p className="mt-1 text-sm">{t('prompts.add')}</p>
                    </div>
                ) : (
                    <div className="mx-auto flex max-w-content flex-col gap-3">
                        {addingNew && (
                            <PromptCard
                                mode="create"
                                onSave={async (name, content) => {
                                    await actions.createPrompt({ name, content })
                                    setAddingNew(false)
                                }}
                                onToggle={() => setAddingNew(false)}
                            />
                        )}
                        {prompts.map((prompt) => (
                            <PromptCard
                                key={prompt.id}
                                prompt={prompt}
                                expanded={expandedId === prompt.id}
                                onToggle={() => setExpandedId(expandedId === prompt.id ? null : prompt.id)}
                                onSave={async (name, content) => {
                                    await actions.updatePrompt({ id: prompt.id, name, content })
                                    setExpandedId(null)
                                }}
                                onDelete={async () => {
                                    await actions.deletePrompt(prompt.id)
                                    setExpandedId(null)
                                }}
                                isPending={actions.isPending}
                            />
                        ))}
                    </div>
                )}
            </div>

            {/* FAB */}
            {!addingNew && (
                <button
                    onClick={() => setAddingNew(true)}
                    className="fixed bottom-6 right-6 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--app-button)] text-[var(--app-button-text)] shadow-lg active:scale-95"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"
                        fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 5v14M5 12h14" />
                    </svg>
                </button>
            )}
        </div>
    )
}
