import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getSupabaseMock } = vi.hoisted(() => ({
  getSupabaseMock: vi.fn(),
}))

vi.mock('../../utils/supabase', () => ({
  getSupabase: getSupabaseMock,
}))

import { loadQuinielas } from './quinielas'

function makeRow(id: number, jornadaId = 18) {
  return {
    id,
    jornada_id: jornadaId,
    folio: `Q18-${String(id).padStart(6, '0')}`,
    nombre: `Participante ${id}`,
    celular: '3921234567',
    modalidad: '3 dobles',
    costo: 30,
    dobles_usados: 3,
    fecha_registro: '2026-08-28T12:00:00.000Z',
    status: 'accepted',
    payment_status: 'pending',
    payment_reference: null,
    paid_at: null,
    admin_notes: null,
    prize_amount: 0,
    prize_paid_at: null,
    selections: [],
    combinations: [],
  }
}

function createSupabaseStub(sourceRows: ReturnType<typeof makeRow>[], serverCap = Number.POSITIVE_INFINITY) {
  const from = vi.fn(() => {
    let lastId: number | null = null
    let jornadaId: number | null = null
    let limit = 100

    const builder = {
      select: vi.fn(() => builder),
      order: vi.fn(() => builder),
      limit: vi.fn((value: number) => {
        limit = value
        return builder
      }),
      eq: vi.fn((_column: string, value: number) => {
        jornadaId = value
        return builder
      }),
      gt: vi.fn((_column: string, value: number) => {
        lastId = value
        return builder
      }),
      then: <TResult1 = unknown, TResult2 = never>(
        onfulfilled?: ((value: { data: ReturnType<typeof makeRow>[]; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
        onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
      ) => {
        const data = sourceRows
          .filter((row) => (lastId === null || row.id > lastId) && (jornadaId === null || row.jornada_id === jornadaId))
          .slice(0, Math.min(limit, serverCap))
        return Promise.resolve({ data, error: null }).then(onfulfilled, onrejected)
      },
    }

    return builder
  })

  return { from }
}

describe('loadQuinielas', () => {
  beforeEach(() => {
    getSupabaseMock.mockReset()
  })

  it('loads every page instead of stopping at the first 100 rows', async () => {
    const rows = Array.from({ length: 205 }, (_, index) => makeRow(index + 1))
    const supabase = createSupabaseStub(rows, 99)
    getSupabaseMock.mockReturnValue(supabase)

    const result = await loadQuinielas()

    expect(result).toHaveLength(205)
    expect(result[0].id).toBe(1)
    expect(result[204].id).toBe(205)
    expect(supabase.from).toHaveBeenCalledTimes(4)
  })

  it('keeps the jornada filter while paginating', async () => {
    const rows = [
      ...Array.from({ length: 125 }, (_, index) => makeRow(index + 1, 18)),
      ...Array.from({ length: 20 }, (_, index) => makeRow(index + 126, 19)),
    ]
    const supabase = createSupabaseStub(rows)
    getSupabaseMock.mockReturnValue(supabase)

    const result = await loadQuinielas(18)

    expect(result).toHaveLength(125)
    expect(result.every((quiniela) => quiniela.jornadaId === 18)).toBe(true)
    expect(supabase.from).toHaveBeenCalledTimes(3)
  })
})
