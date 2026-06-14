import { useState } from 'react'
import { useAppContext } from '@/lib/app-context'
import { useCcSkillDetail } from '@/hooks/queries/useCcExtensionDetails'
import { useTranslation } from '@/lib/use-translation'

interface TreeNodeData {
    name: string
    children: TreeNodeData[]
    isFile: boolean
}

function buildTree(paths: string[]): TreeNodeData[] {
    const root: TreeNodeData[] = []
    for (const path of paths) {
        const parts = path.split('/')
        let current = root
        for (let i = 0; i < parts.length; i++) {
            const part = parts[i]
            const isFile = i === parts.length - 1
            let existing = current.find(n => n.name === part)
            if (!existing) {
                existing = { name: part, children: [], isFile }
                current.push(existing)
            }
            current = existing.children
        }
    }
    const sortNodes = (nodes: TreeNodeData[]) => {
        nodes.sort((a, b) => {
            if (a.isFile !== b.isFile) return a.isFile ? 1 : -1
            return a.name.localeCompare(b.name)
        })
        for (const n of nodes) sortNodes(n.children)
    }
    sortNodes(root)
    return root
}

function TreeNode({ node, depth, defaultExpanded }: { node: TreeNodeData; depth: number; defaultExpanded?: boolean }) {
    const [expanded, setExpanded] = useState(defaultExpanded ?? depth < 1)
    const pl = depth * 16
    if (node.isFile) {
        return (
            <div className="py-0.5 text-[var(--app-fg)]" style={{ paddingLeft: pl }}>
                {node.name}
            </div>
        )
    }
    return (
        <div>
            <button
                type="button"
                onClick={() => setExpanded(v => !v)}
                className="flex items-center gap-1 py-0.5 text-[var(--app-fg)] hover:text-[var(--app-link)] w-full text-left"
                style={{ paddingLeft: pl }}
            >
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24"
                    fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                    className={`shrink-0 transition-transform ${expanded ? 'rotate-90' : ''}`}>
                    <polyline points="9 18 15 12 9 6" />
                </svg>
                {node.name}
            </button>
            {expanded && node.children.map(child => (
                <TreeNode key={child.name} node={child} depth={depth + 1} />
            ))}
        </div>
    )
}

function FileTree({ files, rootName }: { files: string[]; rootName: string }) {
    const tree = buildTree(files)
    return (
        <div className="text-xs font-mono bg-[var(--app-subtle-bg)] rounded-lg p-2 max-h-60 overflow-auto">
            <TreeNode node={{ name: rootName, children: tree, isFile: false }} depth={0} defaultExpanded />
        </div>
    )
}

export function SkillDetailModal({ name, machineId, onClose }: {
    name: string
    machineId: string
    onClose: () => void
}) {
    const { t } = useTranslation()
    const { api } = useAppContext()
    const { detail, isLoading, error } = useCcSkillDetail(api, machineId, name)

    return (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50" onClick={onClose}>
            <div className="w-full sm:mx-4 sm:max-w-lg bg-[var(--app-secondary-bg)] rounded-t-2xl sm:rounded-xl shadow-xl max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--app-divider)]">
                    <span className="text-sm font-semibold text-[var(--app-fg)] truncate">{name}</span>
                    <button type="button" onClick={onClose}
                        className="flex h-7 w-7 items-center justify-center rounded-full text-[var(--app-hint)] hover:bg-[var(--app-subtle-bg)] hover:text-[var(--app-fg)]">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"
                            fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                    </button>
                </div>
                <div className="app-scroll-y flex-1 min-h-0 p-4">
                    {isLoading ? (
                        <div className="text-sm text-[var(--app-hint)]">{t('misc.loading')}</div>
                    ) : error ? (
                        <div className="text-sm text-red-500">{error}</div>
                    ) : !detail ? (
                        <div className="text-sm text-[var(--app-hint)]">{t('extensions.noSkills')}</div>
                    ) : (
                        <div className="flex flex-col gap-4">
                            {detail.description && (
                                <div>
                                    <div className="text-xs font-medium text-[var(--app-hint)] uppercase tracking-wide mb-1">{t('extensions.detail.description')}</div>
                                    <div className="text-sm text-[var(--app-fg)]">{detail.description}</div>
                                </div>
                            )}
                            <div>
                                <div className="text-xs font-medium text-[var(--app-hint)] uppercase tracking-wide mb-1">{t('extensions.detail.path')}</div>
                                <div className="text-xs font-mono text-[var(--app-fg)] break-all">{detail.path}</div>
                            </div>
                            {detail.files.length > 0 && (
                                <div>
                                    <div className="text-xs font-medium text-[var(--app-hint)] uppercase tracking-wide mb-1">
                                        {t('extensions.detail.files')} ({detail.files.length})
                                    </div>
                                    <FileTree files={detail.files} rootName={detail.path.split('/').pop() || detail.path} />
                                </div>
                            )}
                            <div>
                                <div className="text-xs font-medium text-[var(--app-hint)] uppercase tracking-wide mb-1">{t('extensions.detail.content')}</div>
                                <pre className="text-xs font-mono text-[var(--app-fg)] whitespace-pre-wrap break-words bg-[var(--app-subtle-bg)] rounded-lg p-3 max-h-64 overflow-auto">{detail.content}</pre>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
