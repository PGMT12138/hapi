import type { AgentType } from './types'
import { useTranslation } from '@/lib/use-translation'
import { OptionPicker } from '@/components/ui/OptionPicker'

const AGENT_OPTIONS: { value: AgentType; label: string; description: string }[] = [
    { value: 'claude', label: 'Claude', description: 'Anthropic Claude Code' },
    { value: 'codex', label: 'Codex', description: 'OpenAI Codex CLI' },
    { value: 'gemini', label: 'Gemini', description: 'Google Gemini CLI' },
    { value: 'cursor', label: 'Cursor', description: 'Cursor Agent' },
    { value: 'opencode', label: 'OpenCode', description: 'OpenCode Agent' },
]

export function AgentSelector(props: {
    agent: AgentType
    isDisabled: boolean
    onAgentChange: (value: AgentType) => void
}) {
    const { t } = useTranslation()

    return (
        <OptionPicker
            label={t('newSession.agent')}
            options={AGENT_OPTIONS}
            value={props.agent}
            onChange={props.onAgentChange}
            disabled={props.isDisabled}
        />
    )
}
