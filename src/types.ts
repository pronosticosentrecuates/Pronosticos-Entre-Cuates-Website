import type { QuinielaData } from './data'

export type QuinielaStatus = 'pending' | 'accepted' | 'cancelled'
export type PaymentStatus = 'pending' | 'paid' | 'refunded'
export type JornadaStatus = 'draft' | 'open' | 'closed' | 'finished'
export type TournamentStatus = 'draft' | 'active' | 'finished'

export type Tournament = {
  id: number
  nombre: string
  liga: string
  temporada: string
  status: TournamentStatus
  createdAt: string
  finishedAt: string | null
}

export type Jornada = {
  id: number
  tournamentId: number | null
  nombre: string
  numero: number | null
  status: JornadaStatus
  openAt: string | null
  closeAt: string | null
  firstPrize: number
  secondPrize: number
  notes: string
  createdAt: string
  finishedAt: string | null
}

export type SavedQuiniela = QuinielaData & {
  id: number
  jornadaId?: number
  folio?: string
  status: QuinielaStatus
  paymentStatus?: PaymentStatus
  paymentReference?: string
  paidAt?: string | null
  adminNotes?: string
  prizeAmount?: number
  prizePaidAt?: string | null
}

export type PublicRankingEntry = {
  id: number
  folio: string
  nombre: string
  modalidad: QuinielaData['modalidad']
  doblesUsados: number
  aciertos: number
}

export type PublicStats = {
  registered: number
  accepted: number
  pool: number
}
