import { describe, expect, it } from 'vitest'
import {
  applyMatchOrder,
  countDobles,
  createEmptySelections,
  generateCombinations,
  generateRandomSelections,
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

  it('generates the exact number of doubles required by each modality', () => {
    const sixMatches = Array.from({ length: 6 }, (_, index) => ({
      id: index + 1,
      local: `L${index}`,
      visitante: `V${index}`,
      time: '',
      timeClass: '',
      localImg: '',
      visitanteImg: '',
    }))

    expect(countDobles(generateRandomSelections('3 dobles', sixMatches))).toBe(3)
    expect(countDobles(generateRandomSelections('5 dobles', sixMatches))).toBe(5)
  })

  it('does not allow triples because modalities are based on doubles', () => {
    let selections = createEmptySelections(matches)
    selections = toggleSelection(selections, 1, 'L', '3 dobles').selecciones
    selections = toggleSelection(selections, 1, 'E', '3 dobles').selecciones

    const blocked = toggleSelection(selections, 1, 'V', '3 dobles')

    expect(blocked.blocked).toContain('máximo 2 selecciones')
    expect(blocked.selecciones[0].seleccion).toEqual(['L', 'E'])
  })

  it('reorders only the matches from the selected jornada', () => {
    const jornadaMatches: Match[] = [
      { ...matches[0], jornadaId: 10, sortOrder: 1 },
      { ...matches[1], jornadaId: 10, sortOrder: 2 },
      { id: 3, jornadaId: 20, sortOrder: 1, local: 'E', visitante: 'F', time: '', timeClass: '', localImg: '', visitanteImg: '' },
    ]

    const reordered = applyMatchOrder(jornadaMatches, 10, [2, 1])

    expect(reordered.map((match) => match.id)).toEqual([2, 1, 3])
    expect(reordered.map((match) => match.sortOrder)).toEqual([1, 2, 1])
  })

})
