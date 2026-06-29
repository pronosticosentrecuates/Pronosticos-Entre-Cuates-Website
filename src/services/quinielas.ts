import type { SupabaseClient } from '@supabase/supabase-js'
import type { Match, MatchSelection, Modalidad, PickOption, QuinielaData } from '../data'
import type { Jornada, JornadaStatus, PaymentStatus, PublicRankingEntry, PublicStats, QuinielaStatus, SavedQuiniela, Tournament, TournamentStatus } from '../types'
import { getSupabase } from '../../utils/supabase'

type MatchRow = {
  id: number
  jornada_id?: number
  local: string
  visitante: string
  time: string | null
  time_class: string | null
  local_img: string | null
  visitante_img: string | null
  local_score: number | null
  visitante_score: number | null
}

type JornadaRow = {
  id: number
  tournament_id: number | null
  nombre: string
  numero: number | null
  status: JornadaStatus
  open_at: string | null
  close_at: string | null
  first_prize: number | string
  second_prize: number | string
  notes: string
  created_at: string
  finished_at: string | null
}

type TournamentRow = {
  id: number
  nombre: string
  liga: string | null
  temporada: string | null
  status: TournamentStatus
  created_at: string
  finished_at: string | null
}

type SelectionRow = { partido_id: number; seleccion: PickOption[] }
type CombinationRow = { combination: PickOption[] }

type QuinielaRow = {
  id: number
  jornada_id: number
  folio: string
  nombre: string
  celular: string | null
  modalidad: Modalidad
  costo: number | string
  dobles_usados: number
  fecha_registro: string
  status: QuinielaStatus
  payment_status: PaymentStatus
  payment_reference: string | null
  paid_at: string | null
  admin_notes: string | null
  prize_amount: number | string
  prize_paid_at: string | null
  selections?: SelectionRow[]
  combinations?: CombinationRow[]
}

export type PublicDashboard = {
  jornada: Jornada | null
  matches: Match[]
  stats: PublicStats
  ranking: PublicRankingEntry[]
}

function requireSupabase(): SupabaseClient {
  const supabase = getSupabase()
  if (!supabase) throw new Error('Supabase no está configurado.')
  return supabase
}

function mapMatch(row: MatchRow): Match {
  return {
    id: row.id,
    jornadaId: row.jornada_id,
    local: row.local,
    visitante: row.visitante,
    time: row.time ?? '',
    timeClass: row.time_class ?? '',
    localImg: row.local_img ?? '',
    visitanteImg: row.visitante_img ?? '',
    localScore: row.local_score,
    visitanteScore: row.visitante_score,
  }
}

function mapJornada(row: JornadaRow | null | undefined): Jornada | null {
  if (!row) return null
  return {
    id: row.id,
    tournamentId: row.tournament_id ?? null,
    nombre: row.nombre,
    numero: row.numero ?? null,
    status: row.status,
    openAt: row.open_at,
    closeAt: row.close_at,
    firstPrize: Number(row.first_prize ?? 0),
    secondPrize: Number(row.second_prize ?? 0),
    notes: row.notes ?? '',
    createdAt: row.created_at,
    finishedAt: row.finished_at,
  }
}

function mapTournament(row: TournamentRow): Tournament {
  return {
    id: row.id,
    nombre: row.nombre,
    liga: row.liga ?? '',
    temporada: row.temporada ?? '',
    status: row.status,
    createdAt: row.created_at,
    finishedAt: row.finished_at,
  }
}

function mapQuiniela(row: QuinielaRow): SavedQuiniela {
  return {
    id: row.id,
    jornadaId: row.jornada_id,
    folio: row.folio,
    nombre: row.nombre || 'Sin nombre',
    celular: row.celular ?? '',
    modalidad: row.modalidad === '5 dobles' ? '5 dobles' : '3 dobles',
    costo: Number(row.costo ?? 0),
    doblesUsados: Number(row.dobles_usados ?? 0),
    selecciones: (row.selections ?? []).map((selection) => ({ partidoId: selection.partido_id, seleccion: selection.seleccion })),
    combinaciones: (row.combinations ?? []).map((combination) => combination.combination),
    fechaRegistro: row.fecha_registro,
    status: row.status,
    paymentStatus: row.payment_status,
    paymentReference: row.payment_reference ?? '',
    paidAt: row.paid_at,
    adminNotes: row.admin_notes ?? '',
    prizeAmount: Number(row.prize_amount ?? 0),
    prizePaidAt: row.prize_paid_at,
  }
}

export async function getSessionUser() {
  const supabase = getSupabase()
  if (!supabase) return null
  const { data, error } = await supabase.auth.getUser()
  if (error) {
    await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined)
    return null
  }
  return data.user
}

export async function signInAdmin(email: string, password: string) {
  const supabase = requireSupabase()
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error
  if (data.user?.app_metadata?.role !== 'admin') {
    await supabase.auth.signOut()
    throw new Error('La cuenta no tiene permisos de administrador.')
  }
  return data.user
}

export async function signOutAdmin() {
  const supabase = getSupabase()
  if (supabase) await supabase.auth.signOut()
}

export async function loadPublicDashboard(jornadaId?: number): Promise<PublicDashboard> {
  const supabase = requireSupabase()
  const { data, error } = await supabase.rpc('get_public_dashboard', { p_jornada_id: jornadaId ?? null })
  if (error) throw error
  const payload = data as {
    jornada?: JornadaRow
    matches?: MatchRow[]
    stats?: { registered?: number | string; accepted?: number | string; pool?: number | string }
    ranking?: Array<{ id: number; folio: string; nombre: string; modalidad: Modalidad; dobles_usados: number; aciertos: number }>
  } | null
  return {
    jornada: mapJornada(payload?.jornada),
    matches: (payload?.matches ?? []).map(mapMatch),
    stats: {
      registered: Number(payload?.stats?.registered ?? 0),
      accepted: Number(payload?.stats?.accepted ?? 0),
      pool: Number(payload?.stats?.pool ?? 0),
    },
    ranking: (payload?.ranking ?? []).map((row) => ({
      id: row.id,
      folio: row.folio,
      nombre: row.nombre,
      modalidad: row.modalidad,
      doblesUsados: row.dobles_usados,
      aciertos: row.aciertos,
    })),
  }
}

export async function lookupQuiniela(folio: string, phone: string, nombre: string): Promise<SavedQuiniela[]> {
  const supabase = requireSupabase()
  const { data, error } = await supabase.rpc('lookup_quiniela', { p_folio: folio, p_phone: phone, p_nombre: nombre })
  if (error) throw error
  if (!data) return []
  const rows = Array.isArray(data) ? data : [data]
  return (rows as QuinielaRow[]).map((row) => mapQuiniela({ ...row, combinations: [], selections: row.selections ?? [] }))
}

export async function loadApprovedQuinielas(jornadaId?: number): Promise<SavedQuiniela[]> {
  const supabase = requireSupabase()
  const { data, error } = await supabase.rpc('get_public_approved_quinielas', { p_jornada_id: jornadaId ?? null })

  if (!error) {
    return ((data ?? []) as QuinielaRow[]).map(mapQuiniela)
  }

  if (error.code !== 'PGRST202') {
    throw error
  }

  let query = supabase
    .from('quinielas')
    .select('*, selections(partido_id, seleccion), combinations(combination)')
    .eq('status', 'accepted')
    .order('id', { ascending: true })

  if (jornadaId) query = query.eq('jornada_id', jornadaId)

  const { data: rows, error: fallbackError } = await query
  if (fallbackError) throw fallbackError
  return ((rows ?? []) as QuinielaRow[]).map(mapQuiniela)
}

export async function loadMatches(jornadaId?: number): Promise<Match[]> {
  const supabase = requireSupabase()
  let query = supabase.from('matches').select('*').order('id', { ascending: true })
  if (jornadaId) query = query.eq('jornada_id', jornadaId)
  const { data, error } = await query
  if (error) throw error
  return ((data ?? []) as MatchRow[]).map(mapMatch)
}

export async function loadJornadas(): Promise<Jornada[]> {
  const supabase = requireSupabase()
  const { data, error } = await supabase.from('jornadas').select('*').order('id', { ascending: false })
  if (error) throw error
  return ((data ?? []) as JornadaRow[]).map((row) => mapJornada(row)!)
}

export async function loadTournaments(): Promise<Tournament[]> {
  const supabase = requireSupabase()
  const { data, error } = await supabase.from('tournaments').select('*').order('id', { ascending: false })
  if (error) {
    if (error.code === '42P01' || error.code === '42703') return []
    throw error
  }
  return ((data ?? []) as TournamentRow[]).map(mapTournament)
}

export async function loadQuinielas(jornadaId?: number): Promise<SavedQuiniela[]> {
  const supabase = requireSupabase()
  let query = supabase.from('quinielas').select('*, selections(partido_id, seleccion), combinations(combination)').order('id', { ascending: true })
  if (jornadaId) query = query.eq('jornada_id', jornadaId)
  const { data, error } = await query
  if (error) throw error
  return ((data ?? []) as QuinielaRow[]).map(mapQuiniela)
}

export async function registerQuiniela(quiniela: QuinielaData, status: QuinielaStatus = 'pending'): Promise<string> {
  const supabase = requireSupabase()
  const { data, error } = await supabase.rpc('register_quiniela', {
    p_payload: {
      jornada_id: quiniela.jornadaId,
      nombre: quiniela.nombre,
      celular: quiniela.celular,
      modalidad: quiniela.modalidad,
      selecciones: quiniela.selecciones,
    },
    p_status: status,
  })
  if (error?.code === 'PGRST202') throw new Error('Falta instalar la migración de jornadas y privacidad en Supabase.')
  if (error) throw error
  return String(data)
}

export async function createTournament(input: { nombre: string; liga: string; temporada: string; status?: TournamentStatus }) {
  const supabase = requireSupabase()
  const { error } = await supabase.from('tournaments').insert({
    nombre: input.nombre,
    liga: input.liga,
    temporada: input.temporada,
    status: input.status ?? 'active',
  })
  if (error) throw error
}

export async function updateTournament(id: number, patch: Partial<{ nombre: string; liga: string; temporada: string; status: TournamentStatus }>) {
  const supabase = requireSupabase()
  const payload: Record<string, unknown> = {}
  if (patch.nombre !== undefined) payload.nombre = patch.nombre
  if (patch.liga !== undefined) payload.liga = patch.liga
  if (patch.temporada !== undefined) payload.temporada = patch.temporada
  if (patch.status !== undefined) payload.status = patch.status
  if (patch.status === 'finished') payload.finished_at = new Date().toISOString()
  const { error } = await supabase.from('tournaments').update(payload).eq('id', id)
  if (error) throw error
}

export async function deleteTournamentById(id: number) {
  const supabase = requireSupabase()
  const { error } = await supabase.from('tournaments').delete().eq('id', id)
  if (error) throw error
}

export async function createJornada(input: { tournamentId: number | null; nombre: string; numero: number | null; openAt: string | null; closeAt: string | null; firstPrize: number; secondPrize: number }) {
  const supabase = requireSupabase()
  const { error } = await supabase.from('jornadas').insert({
    tournament_id: input.tournamentId,
    nombre: input.nombre,
    numero: input.numero,
    open_at: input.openAt,
    close_at: input.closeAt,
    first_prize: input.firstPrize,
    second_prize: input.secondPrize,
    status: 'draft',
  })
  if (error) throw error
}

export async function updateJornada(id: number, patch: Partial<{ tournamentId: number | null; nombre: string; numero: number | null; status: JornadaStatus; openAt: string | null; closeAt: string | null; firstPrize: number; secondPrize: number; notes: string }>) {
  const supabase = requireSupabase()
  if (patch.status === 'open') {
    const { error: closeError } = await supabase.from('jornadas').update({ status: 'closed' }).eq('status', 'open').neq('id', id)
    if (closeError) throw closeError
  }
  const payload: Record<string, unknown> = {}
  if (patch.tournamentId !== undefined) payload.tournament_id = patch.tournamentId
  if (patch.nombre !== undefined) payload.nombre = patch.nombre
  if (patch.numero !== undefined) payload.numero = patch.numero
  if (patch.status !== undefined) payload.status = patch.status
  if (patch.openAt !== undefined) payload.open_at = patch.openAt
  if (patch.closeAt !== undefined) payload.close_at = patch.closeAt
  if (patch.firstPrize !== undefined) payload.first_prize = patch.firstPrize
  if (patch.secondPrize !== undefined) payload.second_prize = patch.secondPrize
  if (patch.notes !== undefined) payload.notes = patch.notes
  if (patch.status === 'finished') payload.finished_at = new Date().toISOString()
  const { error } = await supabase.from('jornadas').update(payload).eq('id', id)
  if (error) throw error
}

export async function deleteJornadaById(id: number) {
  const supabase = requireSupabase()

  const { data: jornadaQuinielas, error: quinielasLookupError } = await supabase
    .from('quinielas')
    .select('id')
    .eq('jornada_id', id)
  if (quinielasLookupError) throw quinielasLookupError

  const quinielaIds = (jornadaQuinielas ?? []).map((row) => Number(row.id))

  if (quinielaIds.length > 0) {
    const { error: combinationsError } = await supabase
      .from('combinations')
      .delete()
      .in('quiniela_id', quinielaIds)
    if (combinationsError) throw combinationsError

    const { error: selectionsError } = await supabase
      .from('selections')
      .delete()
      .in('quiniela_id', quinielaIds)
    if (selectionsError) throw selectionsError

    const { error: quinielasError } = await supabase
      .from('quinielas')
      .delete()
      .in('id', quinielaIds)
    if (quinielasError) throw quinielasError
  }

  const { data: jornadaMatches, error: matchesLookupError } = await supabase
    .from('matches')
    .select('id')
    .eq('jornada_id', id)
  if (matchesLookupError) throw matchesLookupError

  const matchIds = (jornadaMatches ?? []).map((row) => Number(row.id))

  if (matchIds.length > 0) {
    const { error: selectionsError } = await supabase
      .from('selections')
      .delete()
      .in('partido_id', matchIds)
    if (selectionsError) throw selectionsError

    const { error: matchesError } = await supabase
      .from('matches')
      .delete()
      .eq('jornada_id', id)
    if (matchesError) throw matchesError
  }

  const { error } = await supabase.from('jornadas').delete().eq('id', id)
  if (error?.code === '23503') {
    throw new Error('No se puede eliminar esta jornada porque tiene informacion relacionada.')
  }
  if (error) throw error
}

export async function updateQuinielaStatus(id: number, status: QuinielaStatus) {
  const supabase = requireSupabase()
  const { error } = await supabase.from('quinielas').update({ status }).eq('id', id)
  if (error) throw error
}

export async function updateQuinielaPayment(id: number, paymentStatus: PaymentStatus, reference: string) {
  const supabase = requireSupabase()
  const { error } = await supabase.from('quinielas').update({
    payment_status: paymentStatus,
    payment_reference: reference,
    paid_at: paymentStatus === 'paid' ? new Date().toISOString() : null,
  }).eq('id', id)
  if (error) throw error
}

export async function updateQuinielaPrize(id: number, amount: number, paid: boolean) {
  const supabase = requireSupabase()
  const { error } = await supabase.from('quinielas').update({
    prize_amount: amount,
    prize_paid_at: paid ? new Date().toISOString() : null,
  }).eq('id', id)
  if (error) throw error
}

export async function updateQuinielaDetails(id: number, quiniela: QuinielaData) {
  const supabase = requireSupabase()
  const { error: quinielaError } = await supabase.from('quinielas').update({
    jornada_id: quiniela.jornadaId,
    nombre: quiniela.nombre.trim(),
    celular: quiniela.celular,
    modalidad: quiniela.modalidad,
    costo: quiniela.costo,
    dobles_usados: quiniela.doblesUsados,
  }).eq('id', id)
  if (quinielaError) throw quinielaError

  const { error: deleteSelectionsError } = await supabase.from('selections').delete().eq('quiniela_id', id)
  if (deleteSelectionsError) throw deleteSelectionsError

  const { error: deleteCombinationsError } = await supabase.from('combinations').delete().eq('quiniela_id', id)
  if (deleteCombinationsError) throw deleteCombinationsError

  const selectionsPayload = quiniela.selecciones.map((selection) => ({
    quiniela_id: id,
    partido_id: selection.partidoId,
    seleccion: selection.seleccion,
  }))
  const combinationsPayload = quiniela.combinaciones.map((combination) => ({
    quiniela_id: id,
    combination,
  }))

  if (selectionsPayload.length > 0) {
    const { error } = await supabase.from('selections').insert(selectionsPayload)
    if (error) throw error
  }

  if (combinationsPayload.length > 0) {
    const { error } = await supabase.from('combinations').insert(combinationsPayload)
    if (error) throw error
  }
}

export async function distributeJornadaPrizes(jornadaId: number) {
  const supabase = requireSupabase()
  const { error } = await supabase.rpc('distribute_jornada_prizes', { p_jornada_id: jornadaId })
  if (error) throw error
}

export async function deleteQuinielaById(id: number) {
  const supabase = requireSupabase()
  const { error } = await supabase.from('quinielas').delete().eq('id', id)
  if (error) throw error
}

export async function insertMatch(match: Omit<Match, 'id'>, jornadaId: number): Promise<Match> {
  const supabase = requireSupabase()
  const { data: lastMatch, error: lastMatchError } = await supabase
    .from('matches')
    .select('id')
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (lastMatchError) throw lastMatchError

  const id = Number(lastMatch?.id ?? 0) + 1
  const { error } = await supabase.from('matches').insert({
    id, jornada_id: jornadaId, local: match.local, visitante: match.visitante, time: match.time,
    time_class: match.timeClass, local_img: match.localImg, visitante_img: match.visitanteImg,
    local_score: match.localScore, visitante_score: match.visitanteScore,
  })
  if (error) throw error
  return { ...match, id, jornadaId }
}

export async function updateMatch(match: Match) {
  const supabase = requireSupabase()
  const payload: Record<string, unknown> = {
    local: match.local, visitante: match.visitante, time: match.time, time_class: match.timeClass,
    local_img: match.localImg, visitante_img: match.visitanteImg, local_score: match.localScore, visitante_score: match.visitanteScore,
  }
  if (match.jornadaId !== undefined) payload.jornada_id = match.jornadaId
  const { error } = await supabase.from('matches').update(payload).eq('id', match.id)
  if (error) throw error
}

export async function deleteMatchById(id: number) {
  const supabase = requireSupabase()

  const { count, error: selectionsError } = await supabase
    .from('selections')
    .select('id', { count: 'exact', head: true })
    .eq('partido_id', id)
  if (selectionsError) throw selectionsError

  if ((count ?? 0) > 0) {
    throw new Error('No se puede eliminar este partido porque ya tiene quinielas registradas. Puedes editarlo o cancelar las quinielas relacionadas antes de borrarlo.')
  }

  const { error } = await supabase.from('matches').delete().eq('id', id)
  if (error?.code === '23503') {
    throw new Error('No se puede eliminar este partido porque ya tiene quinielas registradas. Puedes editarlo o cancelar las quinielas relacionadas antes de borrarlo.')
  }
  if (error) throw error
}

export function cloneSelections(selections: MatchSelection[]): MatchSelection[] {
  return selections.map((selection) => ({ partidoId: selection.partidoId, seleccion: [...selection.seleccion] }))
}
