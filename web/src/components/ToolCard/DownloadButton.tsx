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

    const filename = filePath.split(/[/\\]/).pop() ?? 'file'

    const handleClick = async (e: React.MouseEvent) => {
        e.stopPropagation()
        if (downloading) return

        setDownloading(true)
        try {
            await api.downloadFile(sessionId, filePath, filename)
        } catch {
            // 下载失败时短暂显示错误状态
        } finally {
            setDownloading(false)
        }
    }

    return (
        <button
            type="button"
            onClick={handleClick}
            disabled={downloading}
            className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs text-[var(--app-hint)] hover:text-[var(--app-fg)] hover:bg-[var(--app-secondary-bg)] transition-colors ${className ?? ''}`}
            title={`下载 ${filename}`}
        >
            <DownloadIcon className={downloading ? 'animate-pulse' : ''} />
            <span>{downloading ? '下载中…' : filename}</span>
        </button>
    )
}
