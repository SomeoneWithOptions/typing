interface ProgressMeterProps {
  label: string
  value: number
  text: string
}

export function ProgressMeter({ label, value, text }: ProgressMeterProps) {
  return (
    <div className="progress-meter">
      <div className="progress-meter__header">
        <span>{label}</span>
        <span>{text}</span>
      </div>
      <div className="progress-meter__track" aria-hidden="true">
        <div className="progress-meter__value" style={{ width: `${Math.max(0, Math.min(100, value * 100))}%` }} />
      </div>
    </div>
  )
}
