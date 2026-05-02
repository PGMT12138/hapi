import type { Machine } from '@/types/api'
import { useTranslation } from '@/lib/use-translation'
import { OptionPicker } from '@/components/ui/OptionPicker'

function getMachineTitle(machine: Machine): string {
    if (machine.metadata?.displayName) return machine.metadata.displayName
    if (machine.metadata?.host) return machine.metadata.host
    return machine.id.slice(0, 8)
}

export function MachineSelector(props: {
    machines: Machine[]
    machineId: string | null
    isLoading?: boolean
    isDisabled: boolean
    onChange: (machineId: string) => void
}) {
    const { t } = useTranslation()

    const options = props.machines.map(m => ({
        value: m.id,
        label: getMachineTitle(m),
        description: m.metadata?.platform || undefined,
    }))

    return (
        <OptionPicker
            label={t('newSession.machine')}
            options={options}
            value={props.machineId ?? ''}
            onChange={props.onChange}
            disabled={props.isDisabled}
            loading={props.isLoading}
            emptyMessage={props.machines.length === 0 ? t('misc.noMachines') : undefined}
        />
    )
}
