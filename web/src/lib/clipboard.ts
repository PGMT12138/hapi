function copyWithExecCommand(text: string): boolean {
    if (typeof document === 'undefined' || !document.body) {
        return false
    }

    // Find the best container: prefer the active element's root (e.g. inside a Dialog),
    // fall back to body. This avoids issues with Radix Dialog marking body as inert.
    const active = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const container = active?.closest('[role="dialog"]') ?? active?.parentElement ?? document.body

    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.setAttribute('readonly', 'true')
    textarea.style.position = 'fixed'
    textarea.style.top = '0'
    textarea.style.left = '0'
    textarea.style.width = '1px'
    textarea.style.height = '1px'
    textarea.style.padding = '0'
    textarea.style.border = '0'
    textarea.style.opacity = '0'

    const selection = document.getSelection()
    const previousRange = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null

    container.appendChild(textarea)
    textarea.focus()
    textarea.select()
    textarea.setSelectionRange(0, textarea.value.length)

    let copied = false
    try {
        copied = document.execCommand('copy')
    } catch {
        copied = false
    } finally {
        container.removeChild(textarea)
        if (selection) {
            selection.removeAllRanges()
            if (previousRange) {
                selection.addRange(previousRange)
            }
        }
        active?.focus()
    }

    return copied
}

export async function safeCopyToClipboard(text: string): Promise<void> {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        try {
            await navigator.clipboard.writeText(text)
            return
        } catch {
            // Fall through to legacy copy strategy.
        }
    }

    if (copyWithExecCommand(text)) {
        return
    }

    throw new Error('Copy to clipboard failed')
}
