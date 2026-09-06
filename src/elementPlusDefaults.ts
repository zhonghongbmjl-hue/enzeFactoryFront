import { ElInput, ElSelect } from 'element-plus'

type PropHost = { props?: Record<string, unknown> }

function enableClearableByDefault(component: PropHost): void {
  if (!component.props) return
  component.props.clearable = { type: Boolean, default: true }
}

export function applyElementPlusClearableDefaults(): void {
  enableClearableByDefault(ElInput as unknown as PropHost)
  enableClearableByDefault(ElSelect as unknown as PropHost)
}
