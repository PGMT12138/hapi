import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Suggestion } from '@/hooks/useActiveSuggestions'
import { useTranslation } from '@/lib/use-translation'

interface AutocompleteProps {
    suggestions: readonly Suggestion[]
    selectedIndex: number
    onSelect: (index: number) => void
    query?: string
}

interface SuggestionGroup {
    key: string
    label: string
    suggestions: Suggestion[]
    startIndex: number
}

function getSuggestionCategory(suggestion: Suggestion): string {
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

function groupSuggestions(suggestions: readonly Suggestion[], getCategoryLabel: (key: string) => string): SuggestionGroup[] {
    const groupMap = new Map<string, Suggestion[]>()
    const groupOrder: string[] = []

    for (const suggestion of suggestions) {
        const category = getSuggestionCategory(suggestion)
        if (!groupMap.has(category)) {
            groupMap.set(category, [])
            groupOrder.push(category)
        }
        groupMap.get(category)!.push(suggestion)
    }

    // Sort: builtin first, then alphabetically
    groupOrder.sort((a, b) => {
        if (a === 'builtin') return -1
        if (b === 'builtin') return 1
        return a.localeCompare(b)
    })

    let flatIndex = 0
    return groupOrder.map(key => {
        const items = groupMap.get(key)!
        const start = flatIndex
        flatIndex += items.length
        return {
            key,
            label: getCategoryLabel(key),
            suggestions: items,
            startIndex: start,
        }
    })
}

function ChevronIcon({ collapsed }: { collapsed: boolean }) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`transition-transform duration-200 shrink-0 ${collapsed ? '' : 'rotate-90'}`}
        >
            <polyline points="9 18 15 12 9 6" />
        </svg>
    )
}

export const Autocomplete = memo(function Autocomplete(props: AutocompleteProps) {
    const { suggestions, selectedIndex, onSelect, query } = props
    const { t } = useTranslation()
    const listRef = useRef<HTMLDivElement>(null)

    const getCategoryLabel = useCallback((key: string): string => {
        if (key === 'builtin') return t('slash.group.builtin')
        if (key === 'user') return t('slash.group.user')
        if (key === 'project') return t('slash.group.project')
        return key
    }, [t])

    const groups = useMemo(
        () => groupSuggestions(suggestions, getCategoryLabel),
        [suggestions, getCategoryLabel]
    )

    const isSearching = typeof query === 'string' && query.length > 1

    const [collapsed, setCollapsed] = useState<Map<string, boolean>>(() => {
        // Default: builtin expanded, others collapsed
        const initial = new Map<string, boolean>()
        initial.set('builtin', false)
        return initial
    })

    const toggleGroup = useCallback((groupKey: string) => {
        setCollapsed(prev => {
            const next = new Map(prev)
            next.set(groupKey, !prev.get(groupKey))
            return next
        })
    }, [])

    const isCollapsed = useCallback((groupKey: string): boolean => {
        if (isSearching) return false
        return collapsed.get(groupKey) ?? true
    }, [isSearching, collapsed])

    // Auto-expand group containing the selected item (only when index changes)
    const prevSelectedIndex = useRef(selectedIndex)
    useEffect(() => {
        if (prevSelectedIndex.current === selectedIndex) return
        prevSelectedIndex.current = selectedIndex
        if (selectedIndex < 0 || isSearching) return
        for (const group of groups) {
            if (selectedIndex >= group.startIndex && selectedIndex < group.startIndex + group.suggestions.length) {
                if (collapsed.get(group.key) ?? true) {
                    toggleGroup(group.key)
                }
                break
            }
        }
    }, [selectedIndex, groups, isSearching, collapsed, toggleGroup])

    // Scroll selected item into view
    useEffect(() => {
        if (selectedIndex < 0 || selectedIndex >= suggestions.length) return
        const listEl = listRef.current
        if (!listEl) return
        const selectedEl = listEl.querySelector<HTMLButtonElement>(
            `[data-suggestion-index="${selectedIndex}"]`
        )
        selectedEl?.scrollIntoView({ block: 'nearest' })
    }, [selectedIndex, suggestions])

    if (suggestions.length === 0) {
        return null
    }

    return (
        <div className="py-1" ref={listRef}>
            {groups.map(group => {
                const collapsed_ = isCollapsed(group.key)
                const expanded = !collapsed_ || isSearching
                const containsSelection = selectedIndex >= group.startIndex
                    && selectedIndex < group.startIndex + group.suggestions.length

                return (
                    <div key={group.key}>
                        <div
                            className="sticky top-0 z-10 flex items-center gap-1.5 px-3 py-2 bg-[var(--app-bg)] text-sm font-bold text-[var(--app-hint)] cursor-pointer select-none hover:bg-[var(--app-secondary-bg)] transition-colors"
                            onClick={() => toggleGroup(group.key)}
                            onMouseDown={(e) => e.preventDefault()}
                        >
                            <ChevronIcon collapsed={collapsed_} />
                            <span>{group.label}</span>
                            <span className="ml-auto tabular-nums">({group.suggestions.length})</span>
                        </div>

                        <div className="collapsible-panel" data-open={expanded ? true : undefined}>
                            <div className="collapsible-inner">
                                {group.suggestions.map((suggestion, groupLocalIndex) => {
                                    const flatIndex = group.startIndex + groupLocalIndex
                                    return (
                                        <button
                                            key={suggestion.key}
                                            type="button"
                                            data-suggestion-index={flatIndex}
                                            className={`flex w-full cursor-pointer flex-col items-start gap-0.5 px-3 py-2 text-left text-sm transition-colors ${
                                                flatIndex === selectedIndex
                                                    ? 'bg-[var(--app-button)] text-[var(--app-button-text)]'
                                                    : 'text-[var(--app-fg)] hover:bg-[var(--app-secondary-bg)]'
                                            }`}
                                            onClick={() => onSelect(flatIndex)}
                                            onMouseDown={(e) => e.preventDefault()}
                                        >
                                            <span className="w-full font-medium">{suggestion.label}</span>
                                            {suggestion.description && (
                                                <span className={`w-full min-h-[2.25rem] text-xs leading-snug line-clamp-2 ${
                                                    flatIndex === selectedIndex
                                                        ? 'opacity-80'
                                                        : 'text-[var(--app-hint)]'
                                                }`}>
                                                    {suggestion.description}
                                                </span>
                                            )}
                                        </button>
                                    )
                                })}
                            </div>
                        </div>
                    </div>
                )
            })}
        </div>
    )
})
