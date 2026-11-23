import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Match } from '../data'

const { getSupabaseMock } = vi.hoisted(() => ({ getSupabaseMock: vi.fn() }))
vi.mock('../../utils/supabase', () => ({ getSupabase: getSupabaseMock }))

import { insertMatch, loadMatches, loadPublicDashboard, updateMatch } from './quinielas'

const match: Match = {
  id: 4, jornadaId: 7, local: 'América', visitante: 'Toluca',
  time: '2026-11-25T20:00', timeClass: '', localImg: '', visitanteImg: '',
  localScore: null, visitanteScore: null,
}

function makeClient(rows: Record<string, unknown>[] = [], error: { code: string; message: string } | null = null) {
  const response = Promise.resolve({ data: rows, error })
  const builder = {
    select: vi.fn(() => builder),
    order: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    limit: vi.fn(() => builder),
    maybeSingle: vi.fn().mockResolvedValue({ data: { id: 3, sort_order: 2 }, error: null }),
    single: vi.fn().mockResolvedValue({ data: { jornada_id: 7 }, error: null }),
    insert: vi.fn((payload: Record<string, unknown>) => Promise.resolve({ data: payload, error })),
    update: vi.fn((payload: Record<string, unknown>) => ({
      eq: vi.fn(() => Promise.resolve({ data: payload, error })),
    })),
    then: response.then.bind(response),
  }
  const client = {
    from: vi.fn(() => builder),
    rpc: vi.fn().mockResolvedValue({ data: { matches: rows }, error }),
  }
  getSupabaseMock.mockReturnValue(client)
  return { client, builder }
}

describe('Ida y Vuelta en partidos', () => {
  beforeEach(() => getSupabaseMock.mockReset())

  it.each(['ida', 'vuelta'] as const)('guarda y devuelve la etiqueta %s al crear', async (leg) => {
    const { builder } = makeClient()
    const created = await insertMatch({ ...match, leg }, 7)
    expect(builder.insert).toHaveBeenCalledWith(expect.objectContaining({ leg, jornada_id: 7 }))
    expect(created.leg).toBe(leg)
  })

  it('permite cambiar de Ida a Vuelta y después quitar la etiqueta', async () => {
    const { builder } = makeClient()
    await updateMatch({ ...match, leg: 'vuelta' })
    expect(builder.update).toHaveBeenLastCalledWith(expect.objectContaining({ leg: 'vuelta' }))
    await updateMatch({ ...match, leg: null })
    expect(builder.update).toHaveBeenLastCalledWith(expect.objectContaining({ leg: null }))
  })

  it('conserva las etiquetas al leer desde administración y el panel público', async () => {
    makeClient([
      { id: 1, local: 'América', visitante: 'Toluca', leg: 'ida' },
      { id: 2, local: 'Toluca', visitante: 'América', leg: 'vuelta' },
      { id: 3, local: 'Atlas', visitante: 'Chivas', leg: null },
      { id: 4, local: 'Pumas', visitante: 'Tigres' },
    ])
    expect((await loadMatches()).map((item) => item.leg)).toEqual(['ida', 'vuelta', null, undefined])
    expect((await loadPublicDashboard()).matches.map((item) => item.leg)).toEqual(['ida', 'vuelta', null, undefined])
  })

  it('mantiene las escrituras antiguas sin etiqueta compatibles con el esquema anterior', async () => {
    const { builder } = makeClient()
    await insertMatch(match, 7)
    await updateMatch(match)
    expect(builder.insert.mock.calls[0]?.[0]).not.toHaveProperty('leg')
    expect(builder.update.mock.calls[0]?.[0]).not.toHaveProperty('leg')
  })

  it('avisa si falta la migración en lugar de perder la etiqueta solicitada', async () => {
    makeClient([], { code: 'PGRST204', message: "Could not find the 'leg' column of 'matches' in the schema cache" })
    await expect(insertMatch({ ...match, leg: 'ida' }, 7)).rejects.toThrow('20261123000000_match_leg.sql')
    await expect(updateMatch({ ...match, leg: 'vuelta' })).rejects.toThrow('20261123000000_match_leg.sql')
  })
})
