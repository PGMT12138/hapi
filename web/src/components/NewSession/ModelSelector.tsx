import type { AgentType } from './types'
import { MODEL_OPTIONS } from './types'
import { useTranslation } from '@/lib/use-translation'
import { OptionPicker } from '@/components/ui/OptionPicker'

export function ModelSelector(props: {
    agent: AgentType
    model: string
    options?: Array<{ value: string; label: string }>
    isDisabled: boolean
    isLoading?: boolean
    error?: string | null
    onModelChange: (value: string) => void
}) {
    const { t } = useTranslation()
    const options = props.options ?? MODEL_OPTIONS[props.agent]
    if (options.length === 0) {
        return null
    }

    return (
        <>
            <OptionPicker
                label={t('newSession.model')}
                optional
                options={options}
                value={props.model}
                onChange={props.onModelChange}
                disabled={props.isDisabled || props.isLoading}
                loading={props.isLoading}
            />
            {props.error ? (
                <div className="px-3 text-xs text-red-600">
                    {props.error}
                </div>
            ) : null}
        </>
    )
}
