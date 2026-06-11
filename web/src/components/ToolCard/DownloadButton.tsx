import { useState } from 'react'
import { useHappyChatContext } from '@/components/AssistantChat/context'
import { DownloadIcon } from '@/components/icons'

interface DownloadButtonProps {
    filePath: string
    className?: string
}

export function DownloadButton({ filePath, className }: DownloadButtonProps) {
    const { api, sessionId } = useHappyChatContext()
    const [downloading, setDownloading] = useState(false)
    const [error, setError] = useState(false)

    const filename = filePath.split(/[/\\]/).pop() ?? 'file'

    const handleClick = async (e: React.MouseEvent) => {
        e.stopPropagation()
        if (downloading) return

        setDownloading(true)
        setError(false)
        try {
            await api.downloadFile(sessionId, filePath, filename)
        } catch {
            setError(true)
            setTimeout(() => setError(false), 2000)
        } finally {
            setDownloading(false)
        }
    }

    return (
        <button
            type="button"
            onClick={handleClick}
            disabled={downloading}
            className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs transition-colors ${
                error
                    ? 'text-red-500'
                    : 'text-[var(--app-hint)] hover:text-[var(--app-fg)] hover:bg-[var(--app-secondary-bg)]'
            } ${className ?? ''}`}
            title={`下载 ${filename}`}
        >
            <DownloadIcon className={downloading ? 'animate-pulse' : ''} />
            <span>{error ? '下载失败' : downloading ? '下载中…' : filename}</span>
        </button>
    )
}

export function ResultDownloadChip({ filePath, className }: DownloadButtonProps) {
    const { api, sessionId } = useHappyChatContext()
    const [downloading, setDownloading] = useState(false)
    const [error, setError] = useState(false)

    const filename = filePath.split(/[/\\]/).pop() ?? 'file'

    const handleClick = async (e: React.MouseEvent) => {
        e.stopPropagation()
        if (downloading) return

        setDownloading(true)
        setError(false)
        try {
            await api.downloadFile(sessionId, filePath, filename)
        } catch {
            setError(true)
            setTimeout(() => setError(false), 2000)
        } finally {
            setDownloading(false)
        }
    }

    return (
        <button
            type="button"
            onClick={handleClick}
            disabled={downloading}
            className={`inline-flex items-center gap-1.5 rounded-md border border-[var(--app-border)] px-2 py-0.5 text-xs font-mono transition-colors ${
                error
                    ? 'text-red-500 border-red-500/30'
                    : downloading
                        ? 'text-[var(--app-hint)] bg-[var(--app-secondary-bg)]'
                        : 'text-[var(--app-hint)] hover:text-[var(--app-fg)] hover:bg-[var(--app-secondary-bg)]'
            } ${className ?? ''}`}
            title={`下载 ${filePath}`}
        >
            <DownloadIcon className={`h-3 w-3 shrink-0 ${downloading ? 'animate-pulse' : ''}`} />
            <span className="break-all">{error ? '失败' : downloading ? '下载中…' : filePath}</span>
        </button>
    )
}
