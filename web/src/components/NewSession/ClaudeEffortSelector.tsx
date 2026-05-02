import type { AgentType, ClaudeEffort } from './types'
import { useTranslation } from '@/lib/use-translation'
import { OptionPicker } from '@/components/ui/OptionPicker'

const EFFORT_OPTIONS: { value: ClaudeEffort; label: string; description: string }[] = [
    { value: 'auto', label: 'Auto', description: 'Automatically select based on task' },
    { value: 'medium', label: 'Medium', description: 'Balanced speed and reasoning' },
    { value: 'high', label: 'High', description: 'Deep thinking, slower responses' },
    { value: 'max', label: 'Max', description: 'Maximum reasoning capability' },
]

export function ClaudeEffortSelector(props: {
    agent: AgentType
    effort: ClaudeEffort
    isDisabled: boolean
    onEffortChange: (value: ClaudeEffort) => void
}) {
    const { t } = useTranslation()

    if (props.agent !== 'claude') {
        return null
    }

    return (
        <OptionPicker
            label={t('newSession.effort')}
            optional
            options={EFFORT_OPTIONS}
            value={props.effort}
            onChange={props.onEffortChange}
            disabled={props.isDisabled}
        />
    )
}
