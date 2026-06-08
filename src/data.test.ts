import { describe, expect, it } from 'vitest'
import {
  countDobles,
  createEmptySelections,
  generateCombinations,
  getCosto,
  getMaxDobles,
  toggleSelection,
  validateQuinielaCompleta,
  type Match,
} from './data'

const matches: Match[] = [
  { id: 1, local: 'A', visitante: 'B', time: '', timeClass: '', localImg: '', visitanteImg: '' },
  { id: 2, local: 'C', visitante: 'D', time: '', timeClass: '', localImg: '', visitanteImg: '' },
]

describe('quiniela rules', () => {
  it('calculates modality limits and costs', () => {
    expect(getMaxDobles('3 dobles')).toBe(3)
    expect(getMaxDobles('5 dobles')).toBe(5)
    expect(getCosto('3 dobles')).toBe(30)
    expect(getCosto('5 dobles')).toBe(50)
  })

  it('generates every combination from selected outcomes', () => {
    const combinations = generateCombinations([
      { partidoId: 1, seleccion: ['L', 'E'] },
      { partidoId: 2, seleccion: ['V'] },
    ])

    expect(combinations).toEqual([
      ['L', 'V'],
      ['E', 'V'],
    ])
  })

  it('requires every match to have a selection', () => {
    const selections = createEmptySelections(matches)
    expect(validateQuinielaCompleta(selections, matches)).toBe(false)

    selections[0].seleccion = ['L']
    selections[1].seleccion = ['V']
    expect(validateQuinielaCompleta(selections, matches)).toBe(true)
  })

  it('blocks doubles above the selected modality limit', () => {
    const fiveMatches = Array.from({ length: 5 }, (_, index) => ({
      id: index + 1,
      local: `L${index}`,
      visitante: `V${index}`,
      time: '',
      timeClass: '',
      localImg: '',
      visitanteImg: '',
    }))
    let selections = createEmptySelections(fiveMatches)

    for (const match of fiveMatches.slice(0, 3)) {
      selections = toggleSelection(selections, match.id, 'L', '3 dobles').selecciones
      selections = toggleSelection(selections, match.id, 'E', '3 dobles').selecciones
    }

    const fourthSingle = toggleSelection(selections, 4, 'L', '3 dobles').selecciones
    const blocked = toggleSelection(fourthSingle, 4, 'E', '3 dobles')

    expect(countDobles(selections)).toBe(3)
    expect(blocked.blocked).toContain('solo permite 3 dobles')
    expect(countDobles(blocked.selecciones)).toBe(3)
  })

  it('does not allow triples because modalities are based on doubles', () => {
    let selections = createEmptySelections(matches)
    selections = toggleSelection(selections, 1, 'L', '3 dobles').selecciones
    selections = toggleSelection(selections, 1, 'E', '3 dobles').selecciones

    const blocked = toggleSelection(selections, 1, 'V', '3 dobles')

    expect(blocked.blocked).toContain('máximo 2 selecciones')
    expect(blocked.selecciones[0].seleccion).toEqual(['L', 'E'])
  })
})
