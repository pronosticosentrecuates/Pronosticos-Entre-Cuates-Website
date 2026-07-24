export type PickOption = 'L' | 'E' | 'V'

export type Modalidad = '3 dobles' | '5 dobles'

export interface Match {
  id: number
  jornadaId?: number
  local: string
  visitante: string
  time: string
  timeClass: string
  localImg: string
  visitanteImg: string
  localScore?: number | null
  visitanteScore?: number | null
}

export interface MatchSelection {
  partidoId: number
  seleccion: PickOption[]
}

export interface QuinielaData {
  jornadaId?: number
  nombre: string
  celular: string
  modalidad: Modalidad
  costo: number
  doblesUsados: number
  selecciones: MatchSelection[]
  combinaciones: PickOption[][]
  fechaRegistro: string
}

export const MATCHES: Match[] = [
  { id: 1, local: 'Pumas', visitante: 'Cruz Azul', time: 'DOM 8:00 PM', timeClass: 'dom', localImg: '⚽', visitanteImg: '⚽' },
  { id: 2, local: 'Minnesota', visitante: 'Real Salt', time: 'SAB 2:30 PM', timeClass: '', localImg: '⚽', visitanteImg: '⚽' },
  { id: 3, local: 'Colorado', visitante: 'FC Dallas', time: 'SAB 7:30 PM', timeClass: '', localImg: '⚽', visitanteImg: '⚽' },
  { id: 4, local: 'Cincinnati', visitante: 'Orlando C.', time: 'SAB 5:30 PM', timeClass: '', localImg: '⚽', visitanteImg: '⚽' },
  { id: 5, local: 'Girona', visitante: 'Elche', time: 'SAB 1:00 PM', timeClass: '', localImg: '⚽', visitanteImg: '⚽' },
  { id: 6, local: 'Corinthians', visitante: 'Atl. Mineiro', time: 'DOM 3:30 PM', timeClass: 'dom', localImg: '⚽', visitanteImg: '⚽' },
  { id: 7, local: 'Sunderland FC', visitante: 'Chelsea', time: 'DOM 9:00 AM', timeClass: 'dom', localImg: '⚽', visitanteImg: '⚽' },
  { id: 8, local: 'Columbus C.', visitante: 'Atlanta', time: 'DOM 3:00 PM', timeClass: 'dom', localImg: '⚽', visitanteImg: '⚽' },
  { id: 9, local: 'Villarreal', visitante: 'Atl. Madrid', time: 'DOM 1:00 PM', timeClass: 'dom', localImg: '⚽', visitanteImg: '⚽' },
]

const PICK_OPTIONS: PickOption[] = ['L', 'E', 'V']

export type ToggleSelectionResult = {
  selecciones: MatchSelection[]
  blocked?: string
}

export function createEmptySelections(matches: Match[] = MATCHES): MatchSelection[] {
  return matches.map((match) => ({ partidoId: match.id, seleccion: [] }))
}

export function getMaxDobles(modalidad: Modalidad): number {
  return modalidad === '3 dobles' ? 3 : 5
}

export function getCosto(modalidad: Modalidad): number {
  return modalidad === '3 dobles' ? 30 : 50
}

export function countDobles(selecciones: MatchSelection[]): number {
  return selecciones.filter((item) => item.seleccion.length === 2).length
}

export function validateQuinielaCompleta(selecciones: MatchSelection[], matches: Match[] = MATCHES): boolean {
  return matches.every((match) => {
    const selection = selecciones.find((item) => item.partidoId === match.id)
    return Boolean(selection && selection.seleccion.length >= 1 && selection.seleccion.length <= 2)
  })
}

export function generateCombinations(selecciones: MatchSelection[]): PickOption[][] {
  if (selecciones.length === 0) {
    return [[]]
  }

  if (selecciones.some((item) => item.seleccion.length === 0)) {
    return []
  }

  let combinations: PickOption[][] = [[]]

  for (const matchSelection of selecciones) {
    const nextCombinations: PickOption[][] = []

    for (const combination of combinations) {
      for (const option of matchSelection.seleccion) {
        nextCombinations.push([...combination, option])
      }
    }

    combinations = nextCombinations
  }

  return combinations
}

export function generateRandomSelections(modalidad: Modalidad, matches: Match[] = MATCHES): MatchSelection[] {
  const maxDobles = getMaxDobles(modalidad)
  const targetDobles = Math.floor(Math.random() * (Math.min(maxDobles, matches.length) + 1))
  const doubleIndices = new Set<number>()

  while (doubleIndices.size < targetDobles) {
    doubleIndices.add(Math.floor(Math.random() * matches.length))
  }

  return matches.map((match, index) => {
    const firstOption = PICK_OPTIONS[Math.floor(Math.random() * PICK_OPTIONS.length)]
    const seleccion: PickOption[] = [firstOption]

    if (doubleIndices.has(index)) {
      const alternatives = PICK_OPTIONS.filter((option) => option !== firstOption)
      const secondOption = alternatives[Math.floor(Math.random() * alternatives.length)]
      seleccion.push(secondOption)
    }

    return { partidoId: match.id, seleccion }
  })
}

export function toggleSelection(
  selecciones: MatchSelection[],
  partidoId: number,
  option: PickOption,
  modalidad: Modalidad,
): ToggleSelectionResult {
  const matchIndex = selecciones.findIndex((item) => item.partidoId === partidoId)

  if (matchIndex === -1) {
    return { selecciones, blocked: 'No se encontró el partido seleccionado.' }
  }

  const currentSelection = selecciones[matchIndex]
  const alreadySelected = currentSelection.seleccion.includes(option)

  if (!alreadySelected && currentSelection.seleccion.length >= 2) {
    return { selecciones, blocked: 'Cada partido permite como máximo 2 selecciones.' }
  }

  const nextSelections = selecciones.map((item, index) => {
    if (index !== matchIndex) {
      return item
    }

    if (alreadySelected) {
      return { ...item, seleccion: item.seleccion.filter((current) => current !== option) }
    }

    return { ...item, seleccion: [...item.seleccion, option] }
  })

  if (!alreadySelected && countDobles(nextSelections) > getMaxDobles(modalidad)) {
    return {
      selecciones,
      blocked: `La modalidad ${modalidad} solo permite ${getMaxDobles(modalidad)} dobles.`,
    }
  }

  return { selecciones: nextSelections }
}
