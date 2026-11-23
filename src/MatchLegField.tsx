import type { MatchLeg } from './data'

export function MatchLegField({ value, onChange }: {
  value: MatchLeg | ''
  onChange: (value: MatchLeg | '') => void
}) {
  return (
    <label className="jornada-field">
      <span>Ida / Vuelta (opcional)</span>
      <select className="rp-input" value={value} onChange={(event) => onChange(event.target.value as MatchLeg | '')}>
        <option value="">Sin especificar</option>
        <option value="ida">Ida</option>
        <option value="vuelta">Vuelta</option>
      </select>
    </label>
  )
}
