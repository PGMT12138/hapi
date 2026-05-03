import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { useAppContext } from '@/lib/app-context'
import { usePrompts } from '@/hooks/queries/usePrompts'
import { useTranslation } from '@/lib/use-translation'

type Props = {
    open: boolean
    onOpenChange: (open: boolean) => void
    onSelect: (content: string) => void
}

export function PromptPickerDialog({ open, onOpenChange, onSelect }: Props) {
    const { api } = useAppContext()
    const { prompts, isLoading } = usePrompts(api)
    const { t } = useTranslation()

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{t('prompts.selectTitle')}</DialogTitle>
                    <DialogDescription>{t('prompts.selectDescription')}</DialogDescription>
                </DialogHeader>
                <div className="mt-3 max-h-[50vh] overflow-y-auto">
                    {isLoading ? (
                        <div className="py-6 text-center text-sm text-[var(--app-hint)]">{t('prompts.loading')}</div>
                    ) : prompts.length === 0 ? (
                        <div className="py-6 text-center text-sm text-[var(--app-hint)]">
                            {t('prompts.emptyList')}
                        </div>
                    ) : (
                        <div className="flex flex-col gap-2">
                            {prompts.map((prompt) => (
                                <button
                                    key={prompt.id}
                                    onClick={() => {
                                        onSelect(prompt.content)
                                        onOpenChange(false)
                                    }}
                                    className="w-full rounded-lg border border-[var(--app-divider)] p-3 text-left hover:bg-[var(--app-hover)]"
                                >
                                    <div className="font-medium">{prompt.name}</div>
                                    <div className="mt-1 line-clamp-2 text-sm text-[var(--app-hint)]">
                                        {prompt.content}
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    )
}
