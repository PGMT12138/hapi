import { useState, useRef, useEffect } from 'react'

interface Option<T extends string> {
    value: T
    label: string
    description?: string
}

interface OptionPickerProps<T extends string> {
    label?: string
    optional?: boolean
    options: Option<T>[]
    value: T
    onChange: (value: T) => void
    disabled?: boolean
    loading?: boolean
    emptyMessage?: string
    className?: string
}

export function OptionPicker<T extends string>({
    label,
    optional,
    options,
    value,
    onChange,
    disabled,
    loading,
    emptyMessage,
    className = '',
}: OptionPickerProps<T>) {
    const [open, setOpen] = useState(false)
    const ref = useRef<HTMLDivElement>(null)

    const selected = options.find((o) => o.value === value)

    useEffect(() => {
        if (!open) return
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) {
                setOpen(false)
            }
        }
        document.addEventListener('mousedown', handler)
        return () => document.removeEventListener('mousedown', handler)
    }, [open])

    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setOpen(false)
        }
        document.addEventListener('keydown', handler)
        return () => document.removeEventListener('keydown', handler)
    }, [])

    const triggerClass = `
        w-full flex items-center justify-between gap-2
        rounded-lg border border-[var(--app-border)] bg-[var(--app-bg)]
        px-3 py-2 text-sm text-[var(--app-fg)]
        transition-colors duration-100
        focus:outline-none focus:ring-2 focus:ring-[var(--app-link)]
        ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer active:bg-[var(--app-subtle-bg)]'}
    `

    const dropdownClass = `
        absolute left-0 right-0 z-50 mt-1
        rounded-lg border border-[var(--app-border)] bg-[var(--app-bg)]
        shadow-lg overflow-hidden
        animate-in fade-in-0 zoom-in-95
    `

    return (
        <div className={`flex flex-col gap-1.5 px-3 py-3 ${className}`}>
            {label && (
                <div className="text-xs font-medium text-[var(--app-hint)]">
                    {label}
                    {optional && <span className="font-normal"> (optional)</span>}
                </div>
            )}
            {loading ? (
                <div className="rounded-lg border border-[var(--app-border)] px-3 py-2 text-sm text-[var(--app-hint)] animate-pulse">
                    Loading...
                </div>
            ) : options.length === 0 && emptyMessage ? (
                <div className="rounded-lg border border-[var(--app-border)] px-3 py-2 text-sm text-[var(--app-hint)]">
                    {emptyMessage}
                </div>
            ) : (
                <div ref={ref} className="relative">
                    <button
                        type="button"
                        disabled={disabled}
                        className={triggerClass}
                        onClick={() => !disabled && setOpen(!open)}
                    >
                        <div className="min-w-0 flex-1">
                            <div className="truncate">{selected?.label ?? value}</div>
                            {selected?.description && !open && (
                                <div className="text-xs text-[var(--app-hint)] truncate mt-0.5">{selected.description}</div>
                            )}
                        </div>
                        <svg
                            className={`w-4 h-4 shrink-0 text-[var(--app-hint)] transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
                            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                        >
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                        </svg>
                    </button>
                    {open && (
                        <div className={dropdownClass}>
                            <div className="max-h-60 overflow-y-auto">
                                {options.map((option) => {
                                    const isSelected = value === option.value
                                    return (
                                        <button
                                            key={option.value}
                                            type="button"
                                            className={`
                                                w-full text-left px-3 py-2.5 flex items-center justify-between gap-2
                                                transition-colors duration-75
                                                ${isSelected ? 'bg-[var(--app-subtle-bg)]' : ''}
                                                hover:bg-[var(--app-subtle-bg)]
                                                active:bg-[var(--app-secondary-bg)]
                                            `}
                                            onClick={() => {
                                                onChange(option.value)
                                                setOpen(false)
                                            }}
                                        >
                                            <div className="min-w-0 flex-1">
                                                <div className="text-sm text-[var(--app-fg)] truncate">{option.label}</div>
                                                {option.description && (
                                                    <div className="text-xs text-[var(--app-hint)] truncate mt-0.5">{option.description}</div>
                                                )}
                                            </div>
                                            {isSelected && (
                                                <svg className="w-4 h-4 shrink-0 text-[var(--app-link)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                                </svg>
                                            )}
                                        </button>
                                    )
                                })}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}
