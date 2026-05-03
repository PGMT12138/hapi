import { useState } from 'react'
import { useTranslation } from '@/lib/use-translation'
import { useAppGoBack } from '@/hooks/useAppGoBack'
import { useAppContext } from '@/lib/app-context'
import { usePrompts } from '@/hooks/queries/usePrompts'
import { usePromptActions } from '@/hooks/mutations/usePromptActions'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'

function BackIcon() {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24"
            fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
        </svg>
    )
}

const inputClass = "w-full px-3 py-2 text-sm rounded-lg border border-[var(--app-divider)] bg-[var(--app-bg)] text-[var(--app-text)] focus:outline-none focus:ring-2 focus:ring-[var(--app-link)] disabled:opacity-50"

function PromptEditDialog({
    open,
    onOpenChange,
    initialName,
    initialContent,
    onSave,
    onDelete,
    isPending,
    mode,
}: {
    open: boolean
    onOpenChange: (open: boolean) => void
    initialName?: string
    initialContent?: string
    onSave: (name: string, content: string) => Promise<void>
    onDelete?: () => Promise<void>
    isPending?: boolean
    mode: 'create' | 'edit'
}) {
    const { t } = useTranslation()
    const [name, setName] = useState(initialName ?? '')
    const [content, setContent] = useState(initialContent ?? '')

    const handleSave = async () => {
        if (!name.trim() || !content.trim() || isPending) return
        await onSave(name, content)
        onOpenChange(false)
    }

    const handleDelete = async () => {
        if (!onDelete || isPending) return
        await onDelete()
        onOpenChange(false)
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-xl">
                <DialogHeader>
                    <DialogTitle>{mode === 'create' ? t('prompts.add') : t('prompts.save')}</DialogTitle>
                </DialogHeader>
                <div className="mt-3 flex flex-col gap-3">
                    <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder={t('prompts.namePlaceholder')}
                        className={inputClass}
                    />
                    <textarea
                        value={content}
                        onChange={(e) => setContent(e.target.value)}
                        placeholder={t('prompts.contentPlaceholder')}
                        rows={12}
                        className={`${inputClass} resize-y`}
                    />
                    <div className="flex items-center justify-between">
                        {onDelete && (
                            <button
                                onClick={handleDelete}
                                disabled={isPending}
                                className="rounded-lg px-3 py-1.5 text-sm text-red-400 hover:bg-red-500/10 disabled:opacity-50"
                            >
                                {t('prompts.delete')}
                            </button>
                        )}
                        <div className="flex gap-2 ml-auto">
                            <button
                                onClick={() => onOpenChange(false)}
                                className="rounded-lg px-3 py-1.5 text-sm text-[var(--app-hint)] hover:bg-[var(--app-hover)]"
                            >
                                {t('prompts.cancel')}
                            </button>
                            <button
                                onClick={handleSave}
                                disabled={!name.trim() || !content.trim() || isPending}
                                className="rounded-lg bg-[var(--app-button)] px-3 py-1.5 text-sm font-medium text-[var(--app-button-text)] disabled:opacity-50"
                            >
                                {mode === 'create' ? t('prompts.add') : t('prompts.save')}
                            </button>
                        </div>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    )
}

export default function PromptsPage() {
    const goBack = useAppGoBack()
    const { api } = useAppContext()
    const { prompts, isLoading } = usePrompts(api)
    const actions = usePromptActions(api)
    const { t } = useTranslation()
    const [editTarget, setEditTarget] = useState<{ id?: string; name: string; content: string } | null>(null)

    const isCreating = editTarget?.id === undefined && editTarget !== null
    const isEditing = editTarget?.id !== undefined && editTarget !== null

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
                ) : prompts.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-[var(--app-hint)]">
                        <p>{t('prompts.empty')}</p>
                        <p className="mt-1 text-sm">{t('prompts.add')}</p>
                    </div>
                ) : (
                    <div className="mx-auto flex max-w-content flex-col gap-3">
                        {prompts.map((prompt) => (
                            <button
                                key={prompt.id}
                                onClick={() => setEditTarget({ id: prompt.id, name: prompt.name, content: prompt.content })}
                                className="w-full rounded-xl border border-[var(--app-divider)] bg-[var(--app-secondary-bg)] p-4 text-left"
                            >
                                <div className="flex items-center justify-between">
                                    <span className="font-medium">{prompt.name}</span>
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"
                                        fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                                        className="text-[var(--app-hint)]">
                                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                                    </svg>
                                </div>
                                <p className="mt-1 line-clamp-2 text-sm text-[var(--app-hint)]">{prompt.content}</p>
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {/* FAB */}
            <button
                onClick={() => setEditTarget({ name: '', content: '' })}
                className="fixed bottom-6 right-6 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--app-button)] text-[var(--app-button-text)] shadow-lg active:scale-95"
            >
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"
                    fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 5v14M5 12h14" />
                </svg>
            </button>

            {/* Edit/Create Dialog */}
            {editTarget && (
                <PromptEditDialog
                    key={editTarget.id ?? '__new__'}
                    open={true}
                    onOpenChange={(open) => { if (!open) setEditTarget(null) }}
                    initialName={editTarget.name}
                    initialContent={editTarget.content}
                    mode={isCreating ? 'create' : 'edit'}
                    onSave={async (name, content) => {
                        if (isCreating) {
                            await actions.createPrompt({ name, content })
                        } else if (editTarget.id) {
                            await actions.updatePrompt({ id: editTarget.id, name, content })
                        }
                        setEditTarget(null)
                    }}
                    onDelete={editTarget.id ? async () => {
                        await actions.deletePrompt(editTarget.id!)
                        setEditTarget(null)
                    } : undefined}
                    isPending={actions.isPending}
                />
            )}
        </div>
    )
}
