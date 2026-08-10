import { describe, expect, it } from 'vitest'
import type { Match } from './data'
import { getPdfMatchHeader, getPdfTeamLabel, sortPdfRowsByPoints } from './pdf'

const match: Match = {
  id: 1,
  local: 'Chivas',
  visitante: 'Atlas',
  time: '',
  timeClass: '',
  localImg: '',
  visitanteImg: '',
}

describe('encabezados de partidos en PDF', () => {
  it('abrevia los nombres de los equipos', () => {
    expect(getPdfTeamLabel('Atl\u00e9tico de San Luis')).toBe('ATL')
  })

  it('conserva nombres y marcadores como respaldo cuando falta un escudo', () => {
    expect(getPdfMatchHeader({ ...match, localScore: 2, visitanteScore: 1 })).toBe('CHI 2\nvs\nATL 1')
  })

  it('muestra un guion mientras no hay marcador', () => {
    expect(getPdfMatchHeader(match)).toBe('CHI -\nvs\nATL -')
  })

  it('ordena las filas de mayor a menor puntaje y desempata por folio', () => {
    const rows = [
      { id: 3, folio: 'Q1-000003', points: 0 },
      { id: 4, folio: 'Q1-000004', points: 7 },
      { id: 1, folio: 'Q1-000001', points: 3 },
      { id: 2, folio: 'Q1-000002', points: 7 },
    ]

    expect(sortPdfRowsByPoints(rows, (row) => row.points).map((row) => row.id)).toEqual([2, 4, 1, 3])
  })
})
