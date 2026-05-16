import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { useAppContext } from '@/lib/app-context'
import { usePrompts } from '@/hooks/queries/usePrompts'
import { usePromptActions } from '@/hooks/mutations/usePromptActions'
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard'
import { useTranslation } from '@/lib/use-translation'

type Props = {
    open: boolean
    onOpenChange: (open: boolean) => void
    onSelect: (content: string) => void
}

function PromptDetailDialog({
    prompt,
    onUse,
    onClose,
}: {
    prompt: { name: string; content: string }
    onUse: () => void
    onClose: () => void
}) {
    const { t } = useTranslation()
    const { copied, copy } = useCopyToClipboard()
    return (
        <Dialog open={true} onOpenChange={onClose}>
            <DialogContent className="max-w-xl">
                <DialogHeader>
                    <DialogTitle>{prompt.name}</DialogTitle>
                </DialogHeader>
                <div className="mt-3">
                    <textarea
                        readOnly
                        value={prompt.content}
                        rows={18}
                        className="w-full resize-y rounded-lg border border-[var(--app-divider)] bg-[var(--app-bg)] px-3 py-2 text-sm text-[var(--app-text)] focus:outline-none"
                    />
                </div>
                <div className="mt-3 flex justify-end gap-2">
                    <button
                        onClick={onClose}
                        className="rounded-lg px-3 py-1.5 text-sm text-[var(--app-hint)] hover:bg-[var(--app-hover)]"
                    >
                        {t('prompts.cancel')}
                    </button>
                    <button
                        onClick={() => copy(prompt.content)}
                        className="rounded-lg border border-[var(--app-divider)] px-3 py-1.5 text-sm text-[var(--app-hint)] hover:bg-[var(--app-hover)]"
                    >
                        {copied ? '✓' : t('prompts.copy')}
                    </button>
                    <button
                        onClick={onUse}
                        className="rounded-lg bg-[var(--app-button)] px-3 py-1.5 text-sm font-medium text-[var(--app-button-text)]"
                    >
                        {t('prompts.use')}
                    </button>
                </div>
            </DialogContent>
        </Dialog>
    )
}

const inputClass = "w-full px-3 py-2 text-sm rounded-lg border border-[var(--app-divider)] bg-[var(--app-bg)] text-[var(--app-text)] focus:outline-none focus:ring-2 focus:ring-[var(--app-link)] disabled:opacity-50"

function CreatePromptDialog({
    open,
    onOpenChange,
}: {
    open: boolean
    onOpenChange: (open: boolean) => void
}) {
    const { api } = useAppContext()
    const actions = usePromptActions(api)
    const { t } = useTranslation()
    const [name, setName] = useState('')
    const [content, setContent] = useState('')

    const handleSave = async () => {
        if (!name.trim() || !content.trim() || actions.isPending) return
        await actions.createPrompt({ name: name.trim(), content: content.trim() })
        setName('')
        setContent('')
        onOpenChange(false)
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-xl">
                <DialogHeader>
                    <DialogTitle>{t('prompts.add')}</DialogTitle>
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
                    <div className="flex justify-end gap-2">
                        <button
                            onClick={() => onOpenChange(false)}
                            className="rounded-lg px-3 py-1.5 text-sm text-[var(--app-hint)] hover:bg-[var(--app-hover)]"
                        >
                            {t('prompts.cancel')}
                        </button>
                        <button
                            onClick={handleSave}
                            disabled={!name.trim() || !content.trim() || actions.isPending}
                            className="rounded-lg bg-[var(--app-button)] px-3 py-1.5 text-sm font-medium text-[var(--app-button-text)] disabled:opacity-50"
                        >
                            {t('prompts.add')}
                        </button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    )
}

export function PromptPickerDialog({ open, onOpenChange, onSelect }: Props) {
    const { api } = useAppContext()
    const { prompts, isLoading } = usePrompts(api)
    const { t } = useTranslation()
    const { copy } = useCopyToClipboard()
    const [detailPrompt, setDetailPrompt] = useState<{ name: string; content: string } | null>(null)
    const [search, setSearch] = useState('')
    const [creating, setCreating] = useState(false)

    const filtered = search.trim()
        ? prompts.filter((p) => p.name.toLowerCase().includes(search.trim().toLowerCase()))
        : prompts

    return (
        <>
            <Dialog open={open && !detailPrompt && !creating} onOpenChange={onOpenChange}>
                <DialogContent onOpenAutoFocus={(e) => e.preventDefault()}>
                    <DialogHeader>
                        <DialogTitle>{t('prompts.selectTitle')}</DialogTitle>
                        <DialogDescription>{t('prompts.selectDescription')}</DialogDescription>
                    </DialogHeader>
                    <div className="mt-3 flex items-center gap-2">
                        <input
                            type="text"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder={t('prompts.searchPlaceholder')}
                            className={inputClass}
                        />
                        <button
                            onClick={() => setCreating(true)}
                            title={t('prompts.add')}
                            className="shrink-0 rounded-lg border border-[var(--app-divider)] px-2.5 py-2 text-[var(--app-link)] hover:bg-[var(--app-hover)] active:scale-95"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"
                                fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M12 5v14M5 12h14" />
                            </svg>
                        </button>
                    </div>
                    <div className="mt-2 max-h-[50vh] overflow-y-auto">
                        {isLoading ? (
                            <div className="py-6 text-center text-sm text-[var(--app-hint)]">{t('prompts.loading')}</div>
                        ) : filtered.length === 0 ? (
                            <div className="py-6 text-center text-sm text-[var(--app-hint)]">
                                {t('prompts.emptyList')}
                            </div>
                        ) : (
                            <div className="flex flex-col gap-2">
                                {filtered.map((prompt) => (
                                    <div
                                        key={prompt.id}
                                        className="flex items-start gap-2 rounded-lg bg-[var(--app-bg)] p-3 cursor-pointer hover:opacity-90"
                                        onClick={() => setDetailPrompt(prompt)}
                                    >
                                        <div className="flex-1 min-w-0">
                                            <div className="font-medium">{prompt.name}</div>
                                            <div className="mt-1 line-clamp-2 text-sm text-[var(--app-hint)]">
                                                {prompt.content}
                                            </div>
                                        </div>
                                        <div className="flex shrink-0 items-center gap-1">
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation()
                                                    copy(prompt.content)
                                                }}
                                                title={t('prompts.copy')}
                                                className="rounded-lg p-1.5 text-[var(--app-hint)] hover:bg-[var(--app-hover)] active:scale-95"
                                            >
                                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"
                                                    fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                                                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                                                </svg>
                                            </button>
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation()
                                                    onSelect(prompt.content)
                                                    onOpenChange(false)
                                                }}
                                                title={t('prompts.use')}
                                                className="rounded-lg p-1.5 text-[var(--app-link)] hover:bg-[var(--app-hover)] active:scale-95"
                                            >
                                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"
                                                    fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                    <line x1="12" y1="19" x2="12" y2="5" />
                                                    <polyline points="5 12 12 5 19 12" />
                                                </svg>
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </DialogContent>
            </Dialog>

            {detailPrompt && (
                <PromptDetailDialog
                    key={detailPrompt.name}
                    prompt={detailPrompt}
                    onUse={() => {
                        onSelect(detailPrompt.content)
                        setDetailPrompt(null)
                        onOpenChange(false)
                    }}
                    onClose={() => setDetailPrompt(null)}
                />
            )}

            <CreatePromptDialog
                open={creating}
                onOpenChange={setCreating}
            />
        </>
    )
}
