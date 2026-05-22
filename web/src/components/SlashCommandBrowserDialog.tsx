import { useState, useMemo, useCallback } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { Suggestion } from '@/hooks/useActiveSuggestions'

type Props = {
    open: boolean
    onOpenChange: (open: boolean) => void
    allCommands: Suggestion[]
    favoriteNames: Set<string>
    onToggleFavorite: (commandName: string, favorited: boolean) => Promise<void>
    onSelect: (commandText: string) => void
}

function getCategoryLabel(key: string): string {
    switch (key) {
        case 'builtin': return 'Built-in'
        case 'plugin': return 'Plugin'
        case 'user': return 'User'
        case 'project': return 'Project'
        default: return key
    }
}

function getCategory(suggestion: Suggestion): string {
    if (suggestion.source === 'builtin') return 'builtin'
    if (suggestion.source === 'plugin') {
        const name = suggestion.text.startsWith('/')
            ? suggestion.text.slice(1)
            : suggestion.text
        const colonIndex = name.indexOf(':')
        if (colonIndex > 0) return name.substring(0, colonIndex)
        return 'plugin'
    }
    if (suggestion.source === 'user') return 'user'
    if (suggestion.source === 'project') return 'project'
    return 'other'
}

export function SlashCommandBrowserDialog({
    open,
    onOpenChange,
    allCommands,
    favoriteNames,
    onToggleFavorite,
    onSelect,
}: Props) {
    const [search, setSearch] = useState('')

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase()
        if (!q) return allCommands
        return allCommands.filter(
            (cmd) =>
                cmd.text.toLowerCase().includes(q) ||
                (cmd.description?.toLowerCase().includes(q) ?? false)
        )
    }, [allCommands, search])

    const grouped = useMemo(() => {
        const groupMap = new Map<string, Suggestion[]>()
        const groupOrder: string[] = []

        for (const cmd of filtered) {
            const cat = getCategory(cmd)
            if (!groupMap.has(cat)) {
                groupMap.set(cat, [])
                groupOrder.push(cat)
            }
            groupMap.get(cat)!.push(cmd)
        }

        groupOrder.sort((a, b) => {
            if (a === 'builtin') return -1
            if (b === 'builtin') return 1
            return a.localeCompare(b)
        })

        return groupOrder.map((key) => ({
            key,
            label: getCategoryLabel(key),
            commands: groupMap.get(key)!,
        }))
    }, [filtered])

    const handleToggle = useCallback(async (e: React.MouseEvent, commandName: string) => {
        e.stopPropagation()
        const favorited = favoriteNames.has(commandName)
        await onToggleFavorite(commandName, favorited)
    }, [favoriteNames, onToggleFavorite])

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent onOpenAutoFocus={(e) => e.preventDefault()} className="max-w-lg">
                <DialogHeader>
                    <DialogTitle>命令大全</DialogTitle>
                </DialogHeader>
                <div className="mt-2">
                    <input
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="搜索命令..."
                        className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--app-divider)] bg-[var(--app-bg)] text-[var(--app-text)] focus:outline-none focus:ring-2 focus:ring-[var(--app-link)]"
                    />
                </div>
                <div className="mt-2 max-h-[50vh] overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                    {filtered.length === 0 ? (
                        <div className="py-6 text-center text-sm text-[var(--app-hint)]">
                            没有匹配的命令
                        </div>
                    ) : (
                        grouped.map((group) => (
                            <div key={group.key} className="mb-3">
                                <div className="sticky top-0 z-10 bg-[var(--app-secondary-bg)] px-1 py-1 text-xs font-medium uppercase tracking-wider text-[var(--app-hint)]">
                                    {group.label}
                                </div>
                                {group.commands.map((cmd) => {
                                    const commandName = cmd.text.startsWith('/') ? cmd.text.slice(1) : cmd.text
                                    const isFavorited = favoriteNames.has(commandName)
                                    return (
                                        <div
                                            key={cmd.key}
                                            className="flex items-center gap-2 rounded-lg px-2 py-2 cursor-pointer hover:bg-[var(--app-hover)] group"
                                            onClick={() => {
                                                onSelect(cmd.text)
                                                onOpenChange(false)
                                            }}
                                        >
                                            <div className="flex-1 min-w-0">
                                                <span className="text-sm font-medium text-[var(--app-link)]">
                                                    {cmd.text}
                                                </span>
                                                {cmd.description && (
                                                    <span className="ml-2 text-sm text-[var(--app-hint)]">
                                                        {cmd.description}
                                                    </span>
                                                )}
                                            </div>
                                            <button
                                                onClick={(e) => handleToggle(e, commandName)}
                                                title={isFavorited ? '取消收藏' : '收藏'}
                                                className={`shrink-0 rounded-lg p-1.5 transition-colors ${isFavorited ? 'text-yellow-500' : 'text-[var(--app-hint)]'}`}
                                            >
                                                <svg
                                                    xmlns="http://www.w3.org/2000/svg"
                                                    width="16"
                                                    height="16"
                                                    viewBox="0 0 24 24"
                                                    fill={isFavorited ? 'currentColor' : 'none'}
                                                    stroke="currentColor"
                                                    strokeWidth="2"
                                                    strokeLinecap="round"
                                                    strokeLinejoin="round"
                                                >
                                                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                                                </svg>
                                            </button>
                                        </div>
                                    )
                                })}
                            </div>
                        ))
                    )}
                </div>
            </DialogContent>
        </Dialog>
    )
}
