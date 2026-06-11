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
