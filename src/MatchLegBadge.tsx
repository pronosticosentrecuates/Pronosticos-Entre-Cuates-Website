import { getMatchLegLabel, type MatchLeg } from './data'

export function MatchLegBadge({ leg }: { leg?: MatchLeg | null }) {
  const label = getMatchLegLabel(leg)
  if (!label) return null

  return (
    <span className="match-leg-heading">
      <span className="match-leg-badge">{label}</span>
    </span>
  )
}
