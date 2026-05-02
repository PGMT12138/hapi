import type { AgentType, CodexReasoningEffort } from './types'
import { useTranslation } from '@/lib/use-translation'
import { OptionPicker } from '@/components/ui/OptionPicker'

const REASONING_OPTIONS: { value: CodexReasoningEffort; label: string; description: string }[] = [
    { value: 'default', label: 'Default', description: 'Standard reasoning' },
    { value: 'low', label: 'Low', description: 'Faster, less reasoning' },
    { value: 'medium', label: 'Medium', description: 'Balanced reasoning effort' },
    { value: 'high', label: 'High', description: 'More thorough reasoning' },
    { value: 'xhigh', label: 'XHigh', description: 'Maximum reasoning effort' },
]

export function ReasoningEffortSelector(props: {
    agent: AgentType
    value: CodexReasoningEffort
    isDisabled: boolean
    onChange: (value: CodexReasoningEffort) => void
}) {
    const { t } = useTranslation()

    if (props.agent !== 'codex') {
        return null
    }

    return (
        <OptionPicker
            label={t('newSession.reasoningEffort')}
            optional
            options={REASONING_OPTIONS}
            value={props.value}
            onChange={props.onChange}
            disabled={props.isDisabled}
        />
    )
}
