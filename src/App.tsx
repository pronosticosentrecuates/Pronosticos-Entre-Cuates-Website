import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import {
  countDobles,
  createEmptySelections,
  generateCombinations,
  generateRandomSelections,
  getCosto,
  getMaxDobles,
  toggleSelection,
  validateQuinielaCompleta,
  type Match,
  type MatchSelection,
  type Modalidad,
  type PickOption,
} from './data'
import { APP_CONFIG, INTERNATIONAL_TEAM_NAMES, LIGA_MX_TEAM_NAMES, TEAM_LOGOS } from './config'
import {
  deleteJornadaById,
  deleteMatchById,
  deleteQuinielaById,
  deleteTournamentById,
  createJornada,
  createTournament,
  distributeJornadaPrizes,
  getSessionUser,
  insertMatch,
  loadApprovedQuinielas,
  loadJornadas,
  loadMatches,
  loadPublicDashboard,
  loadQuinielas,
  loadTournaments,
  lookupQuiniela,
  registerQuiniela,
  signInAdmin,
  signOutAdmin,
  updateJornada,
  updateMatch,
  updateTournament,
  updateQuinielaDetails,
  updateQuinielaPayment,
  updateQuinielaPrize,
  updateQuinielaStatus,
} from './services/quinielas'
import type { Jornada, JornadaStatus, PaymentStatus, QuinielaStatus, SavedQuiniela, Tournament, TournamentStatus } from './types'
import { getSupabase } from '../utils/supabase'

type AppView = 'home' | 'registro' | 'admin'
type AdminTab = 'quinielas' | 'create' | 'jornadas'

type ToastKind = 'success' | 'error' | 'info'

type ToastState = {
  message: string
  kind: ToastKind
} | null

type ConfirmAction = {
  type: 'accept' | 'cancel' | 'delete'
  id: number
} | null

type AdminDeleteConfirm = {
  type: 'tournament' | 'jornada'
  id: number
  name: string
} | null

type TeamCatalog = 'liga-mx' | 'internacional'

type ImportedMatch = Omit<Match, 'id'> & {
  sourceId: string
  round: string
}

type SportsDbEvent = {
  idEvent?: string
  strHomeTeam?: string
  strAwayTeam?: string
  dateEvent?: string
  strTime?: string
  strTimestamp?: string
  intRound?: string | null
  intHomeScore?: string | null
  intAwayScore?: string | null
}

const MODALIDADES: Modalidad[] = ['3 dobles', '5 dobles']
const QUINIELAS_STORAGE_KEY = 'rrad-quinielas'
const QUINIELAS_REFRESH_STORAGE_KEY = 'rrad-quinielas-refresh'
const LIGA_MX_LEAGUE_ID = '4350'
const LIGA_MX_DEFAULT_SEASON = '2026-2027'
const SPORTSDB_KEY = import.meta.env.VITE_THESPORTSDB_KEY || '123'
const MEXICO_TIME_ZONE = 'America/Mexico_City'
const WHATSAPP_DESTINATION_URL = 'https://chat.whatsapp.com/EjZzQ5lQI1c7oRSpSlUsjT?s=cl&p=i&ilr=4'
const FACEBOOK_PROFILE_URL = 'https://www.facebook.com/profile.php?id=61587124175139'
const LIGA_MX_TEAM_ALIASES: Record<string, string> = {
  'Club America': 'América',
  America: 'América',
  'Atlas FC': 'Atlas',
  'Atletico San Luis': 'Atletico de San Luis',
  'Atl. San Luis': 'Atletico de San Luis',
  'CD Guadalajara': 'CD Guadalajara',
  Chivas: 'CD Guadalajara',
  'FC Juarez': 'Juárez',
  'Club Leon': 'León',
  Leon: 'León',
  'Mazatlan FC': 'Mazatlán',
  Monterrey: 'Monterrey',
  Necaxa: 'Necaxa',
  Pachuca: 'Pachuca',
  Puebla: 'Puebla',
  Pumas: 'Pumas',
  'Pumas UNAM': 'Pumas',
  'UNAM Pumas': 'Pumas',
  'U.N.A.M.': 'Pumas',
  'Club Universidad Nacional': 'Pumas',
  Queretaro: 'Querétaro',
  'Santos Laguna': 'Santos Laguna',
  Tigres: 'Tigres',
  'Tigres UANL': 'Tigres',
  'UANL Tigres': 'Tigres',
  'Club Tigres': 'Tigres',
  'Tigres de la UANL': 'Tigres',
  'Club Tijuana': 'Tijuana',
  Tijuana: 'Tijuana',
  Toluca: 'Toluca',
}

const LIGA_MX_MATCH_TIME_OVERRIDES: Record<string, string> = {
  '2026-2027|8|Toluca|Atlas': '2026-09-12T00:00',
}

// Note: quinielas and matches will be loaded from Supabase on mount.

function normalizePhone(value: string) {
  return value.replace(/\D/g, '')
}

function normalizeLigaMxTeamName(teamName: string) {
  return LIGA_MX_TEAM_ALIASES[teamName] ?? teamName
}

function getLigaMxMatchTimeOverride(season: string, round: string, homeTeam: string, awayTeam: string) {
  return LIGA_MX_MATCH_TIME_OVERRIDES[`${season}|${round}|${normalizeLigaMxTeamName(homeTeam)}|${normalizeLigaMxTeamName(awayTeam)}`]
}

function getMexicoDateTimeParts(dateEvent?: string | null, strTime?: string | null, strTimestamp?: string | null) {
  if (!dateEvent && !strTimestamp) {
    return { value: 'TBD', timeClass: '' }
  }

  const time = strTime && /^\d{2}:\d{2}/.test(strTime) ? strTime.slice(0, 5) : '00:00'
  const timestamp = strTimestamp && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(strTimestamp)
    ? strTimestamp
    : `${dateEvent}T${time}:00`
  const utcDate = new Date(`${timestamp.replace(/\.\d+$/, '').replace(/Z$/, '')}Z`)
  if (Number.isNaN(utcDate.getTime())) {
    return { value: 'TBD', timeClass: '' }
  }

  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: MEXICO_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short',
    hourCycle: 'h23',
  }).formatToParts(utcDate)
  const pick = (type: string) => parts.find((part) => part.type === type)?.value ?? ''

  return {
    value: `${pick('year')}-${pick('month')}-${pick('day')}T${pick('hour')}:${pick('minute')}`,
    timeClass: pick('weekday').toLowerCase().startsWith('sun') ? 'dom' : '',
  }
}

function isValidPhone(value: string) {
  return normalizePhone(value).length === 10
}

function isValidName(value: string) {
  return value.trim().length >= 2
}

function formatSelection(selection: MatchSelection) {
  return selection.seleccion.length > 0 ? selection.seleccion.join('/') : '—'
}

function getStatusLabel(status: QuinielaStatus) {
  if (status === 'accepted') return 'Aceptada'
  if (status === 'cancelled') return 'Rechazada'
  return 'Pendiente'
}

function getPaymentLabel(status?: PaymentStatus) {
  if (status === 'paid') return 'Pagada'
  if (status === 'refunded') return 'Reembolsada'
  return 'Pendiente'
}

function getSelectionChipClass(selection: MatchSelection) {
  return selection.seleccion.length >= 2 ? 'multi' : selection.seleccion[0] || 'empty'
}

function getTeamLogoSource(teamName: string) {
  const normalizedTeamName = teamName.trim().toLowerCase()
  return TEAM_LOGOS[teamName] ?? Object.entries(TEAM_LOGOS).find(([name]) => name.trim().toLowerCase() === normalizedTeamName)?.[1]
}

function TeamLogo({ teamName, fallback, className }: { teamName: string; fallback: string; className: string }) {
  const [failed, setFailed] = useState(false)
  const logoSource = getTeamLogoSource(teamName)

  if (failed || !logoSource) {
    return <span className={`team-logo-emoji ${className}`}>{fallback}</span>
  }

  return (
    <img
      alt=""
      aria-hidden="true"
      className={className}
      onError={() => setFailed(true)}
      src={logoSource}
    />
  )
}

function formatSelectionRow(selecciones: MatchSelection[]) {
  return selecciones.map((selection) => selection.seleccion.join('') || '—').join(' | ')
}

function getMatchOutcome(localScore: number | null, visitanteScore: number | null): PickOption | null {
  if (localScore === null || visitanteScore === null) {
    return null
  }

  if (localScore > visitanteScore) {
    return 'L'
  }

  if (localScore < visitanteScore) {
    return 'V'
  }

  return 'E'
}

function countQuinielaPoints(quiniela: SavedQuiniela, matches: Match[]) {
  const matchesById = new Map(matches.map((match) => [match.id, match]))

  return quiniela.selecciones.reduce((points, selection) => {
    const match = matchesById.get(selection.partidoId)
    const outcome = match ? getMatchOutcome(match.localScore ?? null, match.visitanteScore ?? null) : null

    return outcome && selection.seleccion.includes(outcome) ? points + 1 : points
  }, 0)
}

function parseScoreInput(value: string) {
  if (value.trim() === '') {
    return null
  }

  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
}

function buildMatchTime(date: string, time: string, fallback = '') {
  if (date) {
    return `${date}T${time || '00:00'}`
  }

  return time || fallback
}

function formatDatetimeLocal(value: string | null) {
  if (!value) return ''

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''

  const offsetMs = date.getTimezoneOffset() * 60000
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16)
}

function parseMatchTime(value: string) {
  const localDateTime = value.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/)
  if (localDateTime) {
    return { date: localDateTime[1], time: localDateTime[2] }
  }

  const twelveHourTime = value.match(/(\d{1,2}):(\d{2})\s*(a\.?\s*m\.?|p\.?\s*m\.?)/i)
  if (twelveHourTime) {
    const period = twelveHourTime[3].toLowerCase().startsWith('p') ? 'pm' : 'am'
    let hour = Number.parseInt(twelveHourTime[1], 10)
    if (period === 'pm' && hour < 12) hour += 12
    if (period === 'am' && hour === 12) hour = 0
    return { date: '', time: `${hour.toString().padStart(2, '0')}:${twelveHourTime[2]}` }
  }

  const twentyFourHourTime = value.match(/\b(\d{2}):(\d{2})\b/)
  return { date: '', time: twentyFourHourTime ? `${twentyFourHourTime[1]}:${twentyFourHourTime[2]}` : '' }
}

function formatMatchTime(value: string) {
  const { date, time } = parseMatchTime(value)
  if (!date) {
    return value
  }

  const parsed = new Date(`${date}T${time || '00:00'}`)
  return parsed.toLocaleString('es-MX', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatPrizeLabel(amount: number | null | undefined, fallback: string) {
  if (!amount || amount <= 0) {
    return fallback
  }

  return `$${amount.toLocaleString('es-MX', {
    maximumFractionDigits: 2,
    minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
  })}`
}

function App() {
  const [matches, setMatches] = useState<Match[]>([])
  const [adminMatches, setAdminMatches] = useState<Match[]>([])
  const [selecciones, setSelecciones] = useState<MatchSelection[]>([])
  const [quinielas, setQuinielas] = useState<SavedQuiniela[]>([])
  const [jornada, setJornada] = useState<Jornada | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [tournaments, setTournaments] = useState<Tournament[]>([])
  const [jornadas, setJornadas] = useState<Jornada[]>([])
  const [publicApprovedQuinielas, setPublicApprovedQuinielas] = useState<SavedQuiniela[]>([])
  const [draftQuinielas, setDraftQuinielas] = useState<SavedQuiniela[]>([])
  const [dataLoading, setDataLoading] = useState(true)
  const [dataError, setDataError] = useState('')
  const [sending, setSending] = useState(false)
  const [activeView, setActiveView] = useState<AppView>('home')
  const [nombre, setNombre] = useState('')
  const [celular, setCelular] = useState('')
  const [modalidad, setModalidad] = useState<Modalidad>('3 dobles')
  const [navOpen, setNavOpen] = useState(false)
  const [adminAuthenticated, setAdminAuthenticated] = useState(false)
  const [adminEmail, setAdminEmail] = useState('')
  const [adminLoginEmail, setAdminLoginEmail] = useState('')
  const [adminLoginPassword, setAdminLoginPassword] = useState('')
  const [adminLoginError, setAdminLoginError] = useState('')
  const [adminTab, setAdminTab] = useState<AdminTab>('quinielas')
  const [adminSearch, setAdminSearch] = useState('')
  const [adminStatusFilter, setAdminStatusFilter] = useState<'all' | QuinielaStatus>('all')
  const [adminModalFilter, setAdminModalFilter] = useState<'all' | Modalidad>('all')
  const [adminPaymentFilter, setAdminPaymentFilter] = useState<'all' | PaymentStatus>('all')
  const [adminEditQuinielaId, setAdminEditQuinielaId] = useState<number | null>(null)
  const [adminQuinielaNombre, setAdminQuinielaNombre] = useState('')
  const [adminQuinielaCelular, setAdminQuinielaCelular] = useState('')
  const [adminQuinielaModalidad, setAdminQuinielaModalidad] = useState<Modalidad>('3 dobles')
  const [adminQuinielaSelections, setAdminQuinielaSelections] = useState<MatchSelection[]>([])
  const [adminQuinielaJornadaId, setAdminQuinielaJornadaId] = useState<number | null>(null)
  const [savingAdminQuiniela, setSavingAdminQuiniela] = useState(false)
  const [showAdminQuinielaModal, setShowAdminQuinielaModal] = useState(false)
  const [showTournamentModal, setShowTournamentModal] = useState(false)
  const [showJornadaModal, setShowJornadaModal] = useState(false)
  const [showAddMatchModal, setShowAddMatchModal] = useState(false)
  const [showLigaMxImportModal, setShowLigaMxImportModal] = useState(false)
  const [rankingModalFilter, setRankingModalFilter] = useState<'all' | Modalidad>('all')
  const [rankingSortOrder, setRankingSortOrder] = useState<'desc' | 'asc'>('desc')
  const [lookupFolio, setLookupFolio] = useState('')
  const [lookupPhone, setLookupPhone] = useState('')
  const [lookupName, setLookupName] = useState('')
  const [lookupResults, setLookupResults] = useState<SavedQuiniela[]>([])
  const [lookupHasSearched, setLookupHasSearched] = useState(false)
  const [lookupMessage, setLookupMessage] = useState('')
  const [newTournamentName, setNewTournamentName] = useState('')
  const [newTournamentLeague, setNewTournamentLeague] = useState('Liga MX')
  const [newTournamentSeason, setNewTournamentSeason] = useState(LIGA_MX_DEFAULT_SEASON)
  const [editingTournamentId, setEditingTournamentId] = useState<number | null>(null)
  const [editTournamentName, setEditTournamentName] = useState('')
  const [editTournamentLeague, setEditTournamentLeague] = useState('')
  const [editTournamentSeason, setEditTournamentSeason] = useState('')
  const [editTournamentStatus, setEditTournamentStatus] = useState<TournamentStatus>('active')
  const [newJornadaName, setNewJornadaName] = useState('')
  const [newJornadaTournamentId, setNewJornadaTournamentId] = useState('')
  const [newJornadaNumber, setNewJornadaNumber] = useState('')
  const [newJornadaOpen, setNewJornadaOpen] = useState('')
  const [newJornadaClose, setNewJornadaClose] = useState('')
  const [newJornadaFirstPrize, setNewJornadaFirstPrize] = useState('')
  const [newJornadaSecondPrize, setNewJornadaSecondPrize] = useState('')
  const [newMatchLocal, setNewMatchLocal] = useState('')
  const [newMatchVisitante, setNewMatchVisitante] = useState('')
  const [newMatchDate, setNewMatchDate] = useState('')
  const [newMatchTime, setNewMatchTime] = useState('')
  const [newMatchJornadaId, setNewMatchJornadaId] = useState('')
  const [ligaMxSeason, setLigaMxSeason] = useState(LIGA_MX_DEFAULT_SEASON)
  const [ligaMxRound, setLigaMxRound] = useState('')
  const [ligaMxImportMatches, setLigaMxImportMatches] = useState<ImportedMatch[]>([])
  const [loadingLigaMxMatches, setLoadingLigaMxMatches] = useState(false)
  const [savingLigaMxMatches, setSavingLigaMxMatches] = useState(false)
  const [ligaMxImportMessage, setLigaMxImportMessage] = useState('')
  const [matchJornadaFilter, setMatchJornadaFilter] = useState('all')
  const [editingMatchId, setEditingMatchId] = useState<number | null>(null)
  const [editLocal, setEditLocal] = useState('')
  const [editVisitante, setEditVisitante] = useState('')
  const [editDate, setEditDate] = useState('')
  const [editTime, setEditTime] = useState('')
  const [editLocalScore, setEditLocalScore] = useState('')
  const [editVisitanteScore, setEditVisitanteScore] = useState('')
  const [editMatchJornadaId, setEditMatchJornadaId] = useState('')
  const [editingJornadaId, setEditingJornadaId] = useState<number | null>(null)
  const [editJornadaName, setEditJornadaName] = useState('')
  const [editJornadaTournamentId, setEditJornadaTournamentId] = useState('')
  const [editJornadaNumber, setEditJornadaNumber] = useState('')
  const [editJornadaOpen, setEditJornadaOpen] = useState('')
  const [editJornadaClose, setEditJornadaClose] = useState('')
  const [editJornadaFirstPrize, setEditJornadaFirstPrize] = useState('')
  const [editJornadaSecondPrize, setEditJornadaSecondPrize] = useState('')
  const [editJornadaNotes, setEditJornadaNotes] = useState('')
  const [showNewLocalSuggestions, setShowNewLocalSuggestions] = useState(false)
  const [showNewVisitanteSuggestions, setShowNewVisitanteSuggestions] = useState(false)
  const [showEditLocalSuggestions, setShowEditLocalSuggestions] = useState(false)
  const [showEditVisitanteSuggestions, setShowEditVisitanteSuggestions] = useState(false)
  const [teamCatalog, setTeamCatalog] = useState<TeamCatalog>('liga-mx')

  const TEAM_NAMES = teamCatalog === 'liga-mx' ? LIGA_MX_TEAM_NAMES : INTERNATIONAL_TEAM_NAMES
  const filterTeams = (q: string) => {
    const v = q.trim().toLowerCase()
    if (!v) return TEAM_NAMES
    return TEAM_NAMES.filter((t) => t.toLowerCase().includes(v))
  }
  const renderTeamCatalogToggle = () => (
    <div className="team-catalog-toggle" aria-label="Filtro de equipos">
      <button className={teamCatalog === 'liga-mx' ? 'active' : ''} onClick={() => setTeamCatalog('liga-mx')} type="button">Liga MX</button>
      <button className={teamCatalog === 'internacional' ? 'active' : ''} onClick={() => setTeamCatalog('internacional')} type="button">Internacional</button>
    </div>
  )
  const [toast, setToast] = useState<ToastState>(null)
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null)
  const [adminDeleteConfirm, setAdminDeleteConfirm] = useState<AdminDeleteConfirm>(null)
  const [paymentModalQuiniela, setPaymentModalQuiniela] = useState<SavedQuiniela | null>(null)
  const [paymentReferenceInput, setPaymentReferenceInput] = useState('')
  const [prizeModalQuiniela, setPrizeModalQuiniela] = useState<SavedQuiniela | null>(null)
  const [prizeAmountInput, setPrizeAmountInput] = useState('')
  const nextId = useRef(1)
  const isJornadaOpenBySchedule = useCallback((item: Jornada | null | undefined) => {
    if (!item) return false
    const closedByDate = item.closeAt !== null && now >= new Date(item.closeAt).getTime()

    return item.status === 'open' && !closedByDate
  }, [now])
  const activeTournaments = useMemo(() => tournaments.filter((item) => item.status !== 'finished'), [tournaments])
  const defaultTournament = activeTournaments[0] ?? tournaments[0] ?? null
  const openJornadas = useMemo(() => jornadas.filter((item) => item.status === 'open' || item.status === 'draft'), [jornadas])
  const adminMatchSource = adminMatches
  const filteredAdminMatches = matchJornadaFilter === 'all'
    ? adminMatchSource
    : adminMatchSource.filter((match) => String(match.jornadaId ?? '') === matchJornadaFilter)
  const getJornadaMatches = (jornadaId: number) => {
    return adminMatchSource.filter((match) => match.jornadaId === jornadaId || (!match.jornadaId && jornada?.id === jornadaId))
  }

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    const highestId = quinielas.reduce((maxId, quiniela) => Math.max(maxId, quiniela.id), 0)
    nextId.current = Math.max(nextId.current, highestId + 1)
  }, [quinielas])

  // Load matches and quinielas from Supabase on mount
  useEffect(() => {
    async function loadFromDb() {
      try {
        const dashboard = await loadPublicDashboard()
        setMatches(dashboard.matches)
        setJornada(dashboard.jornada)
        const dashboardJornadaId = dashboard.jornada?.id ?? null
        setPublicApprovedQuinielas(dashboardJornadaId ? await loadApprovedQuinielas(dashboardJornadaId).catch((error) => {
          console.error('Error cargando quinielas aprobadas publicas:', error)
          return [] as SavedQuiniela[]
        }) : [])
        setDataError('')
        return

        const supabase = getSupabase()!
        if (!supabase) return

        const { data: dbMatches, error: matchesError } = await supabase.from('matches').select('*').order('id', { ascending: true })
        if (!matchesError && Array.isArray(dbMatches)) {
          // Map DB rows to Match type
          setMatches(
            dbMatches!.map((m: any) => ({
              id: m.id,
              local: m.local,
              visitante: m.visitante,
              time: m.time ?? '',
              timeClass: m.time_class ?? '',
              localImg: m.local_img ?? '',
              visitanteImg: m.visitante_img ?? '',
              localScore: m.local_score ?? null,
              visitanteScore: m.visitante_score ?? null,
            })),
          )
        }

        // Load quinielas from DB (include pending — these are valid saved submissions)
        const { data: dbQuinielas, error: qError } = await supabase.from('quinielas').select('*').order('id', { ascending: true })
        if (!qError && Array.isArray(dbQuinielas)) {
          console.debug('[loadFromDb] quinielas loaded from DB:', dbQuinielas!.length)
          const loaded: SavedQuiniela[] = []

          for (const q of dbQuinielas!) {
            const { data: selData } = await supabase.from('selections').select('*').eq('quiniela_id', q.id).order('id', { ascending: true })
            const { data: combData } = await supabase.from('combinations').select('*').eq('quiniela_id', q.id).order('id', { ascending: true })

            const seleccionesMapped: MatchSelection[] = Array.isArray(selData)
              ? selData!.map((s: any) => ({ partidoId: s.partido_id, seleccion: s.seleccion }))
              : []

            const combinacionesMapped: PickOption[][] = Array.isArray(combData)
              ? combData!.map((c: any) => c.combination as PickOption[])
              : []

            loaded.push({
              id: q.id,
              nombre: q.nombre ?? 'Sin nombre',
              celular: q.celular ?? '',
              modalidad: q.modalidad === '5 dobles' ? '5 dobles' : '3 dobles',
              costo: Number(q.costo ?? 0),
              doblesUsados: Number(q.dobles_usados ?? 0),
              selecciones: seleccionesMapped,
              combinaciones: combinacionesMapped,
              fechaRegistro: q.fecha_registro ?? new Date().toISOString(),
              status: q.status === 'accepted' || q.status === 'cancelled' ? q.status : 'pending',
            })
          }

          setQuinielas(loaded)
        }
      } catch (err) {
        console.error(err)
        setMatches([])
        setDataError('No se pudo conectar con Supabase. No hay partidos locales de respaldo.')
      } finally {
        setDataLoading(false)
      }
    }

    loadFromDb()
  }, [])

  // Reload quinielas from DB into local state
  const refreshQuinielas = useCallback(async () => {
    try {
      const dashboard = await loadPublicDashboard()
      setMatches(dashboard.matches)
      setJornada(dashboard.jornada)
      const dashboardJornadaId = dashboard.jornada?.id ?? null
      const approvedQuinielas = dashboardJornadaId ? await loadApprovedQuinielas(dashboardJornadaId).catch((error) => {
        console.error('Error cargando quinielas aprobadas publicas:', error)
        return [] as SavedQuiniela[]
      }) : []
      setPublicApprovedQuinielas(approvedQuinielas)

      const user = await getSessionUser()
      if (user?.app_metadata?.role === 'admin') {
        const [loaded, loadedJornadas, loadedMatches, loadedTournaments] = await Promise.all([loadQuinielas(), loadJornadas(), loadMatches(), loadTournaments()])
        setQuinielas(loaded)
        if (approvedQuinielas.length === 0) {
          setPublicApprovedQuinielas(dashboardJornadaId ? loaded.filter((quiniela) => quiniela.status === 'accepted' && quiniela.jornadaId === dashboardJornadaId) : [])
        }
        setTournaments(loadedTournaments)
        setJornadas(loadedJornadas)
        setAdminMatches(loadedMatches)
      }
    } catch (err) {
      console.error('Error cargando quinielas desde DB:', err)
    }
  }, [])

  // Keep selections in sync with the current Supabase match ids.
  useEffect(() => {
    setSelecciones((current) => {
      const byMatchId = new Map(current.map((selection) => [selection.partidoId, selection]))
      return matches.map((match) => byMatchId.get(match.id) ?? { partidoId: match.id, seleccion: [] })
    })
  }, [matches])

  useEffect(() => {
    setAdminQuinielaSelections((current) => {
      const byMatchId = new Map(current.map((selection) => [selection.partidoId, selection]))
      return matches.map((match) => byMatchId.get(match.id) ?? { partidoId: match.id, seleccion: [] })
    })
  }, [matches])

  useEffect(() => {
    if (newMatchJornadaId && openJornadas.some((item) => String(item.id) === newMatchJornadaId)) {
      return
    }

    const defaultJornada = openJornadas.find((item) => item.id === jornada?.id) ?? openJornadas[0]
    setNewMatchJornadaId(defaultJornada ? String(defaultJornada.id) : '')
  }, [jornada?.id, newMatchJornadaId, openJornadas])

  useEffect(() => {
    if (newJornadaTournamentId && tournaments.some((item) => String(item.id) === newJornadaTournamentId)) {
      return
    }

    setNewJornadaTournamentId(defaultTournament ? String(defaultTournament.id) : '')
  }, [defaultTournament, newJornadaTournamentId, tournaments])

  useEffect(() => {
    // Drafts belong only to the current home session. Remove data saved by older versions.
    window.localStorage.removeItem(QUINIELAS_STORAGE_KEY)
  }, [])

  useEffect(() => {
    void getSessionUser().then((user) => {
      if (user?.app_metadata?.role === 'admin') {
        setAdminAuthenticated(true)
        setAdminEmail(user.email ?? '')
        setAdminLoginEmail(user.email ?? '')
        void refreshQuinielas()
      }
    })
  }, [refreshQuinielas])

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key === QUINIELAS_REFRESH_STORAGE_KEY) {
        void refreshQuinielas()
      }
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void refreshQuinielas()
      }
    }

    window.addEventListener('storage', handleStorage)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      window.removeEventListener('storage', handleStorage)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [refreshQuinielas])

  useEffect(() => {
    const supabase = getSupabase()
    if (!supabase) return

    const channel = supabase
      .channel('quinielas-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'matches' }, () => void refreshQuinielas())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'jornadas' }, () => void refreshQuinielas())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'quinielas' }, () => void refreshQuinielas())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'selections' }, () => void refreshQuinielas())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'combinations' }, () => void refreshQuinielas())
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [refreshQuinielas])

  useEffect(() => {
    if (!toast) {
      return
    }

    const timer = window.setTimeout(() => setToast(null), 3000)

    return () => window.clearTimeout(timer)
  }, [toast])

  const costoActual = getCosto(modalidad)
  const maxDobles = getMaxDobles(modalidad)
  const visibleQuinielas = draftQuinielas
  const publicMatches = matches.filter((match) => match.localScore === null || match.visitanteScore === null)
  const publicMatchIds = new Set(publicMatches.map((match) => match.id))
  const publicSelections = selecciones.filter((selection) => publicMatchIds.has(selection.partidoId))
  const doblesUsados = countDobles(publicSelections)
  const combinaciones = generateCombinations(publicSelections)
  const partidosCompletos = publicSelections.filter((selection) => selection.seleccion.length > 0).length
  const progresoCompleto = publicMatches.length > 0 && partidosCompletos === publicMatches.length
  const progresoPorcentaje = publicMatches.length > 0 ? (partidosCompletos / publicMatches.length) * 100 : 0
  const progresoRatio = publicMatches.length > 0 ? partidosCompletos / publicMatches.length : 0
  const progresoStyle = { '--progress-value': `${progresoPorcentaje}%`, '--progress-ratio': `${progresoRatio}` } as CSSProperties
  const nombreValido = isValidName(nombre)
  const celularValido = isValidPhone(celular)
  const jornadaAbiertaPorFecha = isJornadaOpenBySchedule(jornada)
  const jornadaPendientePorFecha = Boolean(jornada?.openAt && now < new Date(jornada.openAt).getTime() && jornada.status === 'draft')
  const jornadaCerradaPorFecha = Boolean(jornada?.closeAt && now >= new Date(jornada.closeAt).getTime())
  const registrosAbiertos = jornadaAbiertaPorFecha
  const puedeAgregar = registrosAbiertos && progresoCompleto && nombreValido && celularValido && doblesUsados <= maxDobles
  const totalGuardado = draftQuinielas.reduce((sum, quiniela) => sum + quiniela.costo, 0)
  const jornadaTitle = jornada?.nombre ?? APP_CONFIG.edition
  const firstPrizeLabel = formatPrizeLabel(jornada?.firstPrize, APP_CONFIG.firstPrize)
  const secondPrizeLabel = formatPrizeLabel(jornada?.secondPrize, APP_CONFIG.secondPrize)
  const openJornadaId = registrosAbiertos ? jornada?.id ?? null : null
  const registroJornadaId = jornada?.status !== 'finished' ? jornada?.id ?? null : null
  const registroMatches = useMemo(
    () => registroJornadaId ? matches.filter((match) => match.jornadaId === registroJornadaId || (!match.jornadaId && jornada?.id === registroJornadaId)) : [],
    [jornada?.id, matches, registroJornadaId],
  )
  const registroQuinielas = useMemo(
    () => registroJornadaId ? publicApprovedQuinielas.filter((quiniela) => quiniela.jornadaId === registroJornadaId) : [],
    [publicApprovedQuinielas, registroJornadaId],
  )
  const registroPointTotals = registroQuinielas.map((quiniela) => countQuinielaPoints(quiniela, registroMatches))
  const registroMaxPoints = registroPointTotals.length > 0 ? Math.max(...registroPointTotals) : 0
  const registroFirstPlaceCount = registroPointTotals.filter((points) => points === registroMaxPoints).length
  const registroZeroPointsCount = registroPointTotals.filter((points) => points === 0).length
  const registroRankingRows = useMemo(() => {
    return registroQuinielas
      .map((quiniela) => ({
        quiniela,
        puntos: countQuinielaPoints(quiniela, registroMatches),
      }))
      .filter(({ quiniela }) => {
        const matchesModal = rankingModalFilter === 'all' || quiniela.modalidad === rankingModalFilter

        return matchesModal
      })
      .sort((a, b) => {
        const pointsOrder = rankingSortOrder === 'desc' ? b.puntos - a.puntos : a.puntos - b.puntos
        return pointsOrder || a.quiniela.nombre.localeCompare(b.quiniela.nombre) || a.quiniela.id - b.quiniela.id
      })
      .map(({ quiniela }) => quiniela)
  }, [registroMatches, registroQuinielas, rankingModalFilter, rankingSortOrder])
  const adminAcceptedTotal = quinielas.filter((quiniela) => quiniela.status === 'accepted').reduce((sum, quiniela) => sum + quiniela.costo, 0)
  const adminAcceptedTotalVisible = adminAcceptedTotal * 0.7
  const adminAcceptedCount = quinielas.filter((quiniela) => quiniela.status === 'accepted').length
  const adminPendingCount = quinielas.filter((quiniela) => quiniela.status === 'pending').length
  const adminQuinielaCosto = getCosto(adminQuinielaModalidad)
  const adminQuinielaMaxDobles = getMaxDobles(adminQuinielaModalidad)
  const adminQuinielaTargetJornadaId = adminQuinielaJornadaId ?? (isJornadaOpenBySchedule(jornada) ? jornada?.id ?? null : null)
  const adminQuinielaMatches = adminQuinielaTargetJornadaId
    ? adminMatchSource.filter((match) => match.jornadaId === adminQuinielaTargetJornadaId || (!match.jornadaId && jornada?.id === adminQuinielaTargetJornadaId))
    : []
  const adminQuinielaMatchIds = new Set(adminQuinielaMatches.map((match) => match.id))
  const adminVisibleQuinielaSelections = adminQuinielaSelections.filter((selection) => adminQuinielaMatchIds.has(selection.partidoId))
  const adminQuinielaDobles = countDobles(adminVisibleQuinielaSelections)
  const adminQuinielaCombinaciones = generateCombinations(adminVisibleQuinielaSelections)
  const adminQuinielaCompleta = adminQuinielaMatches.length > 0 && validateQuinielaCompleta(adminVisibleQuinielaSelections, adminQuinielaMatches)
  const adminQuinielaNombreValido = isValidName(adminQuinielaNombre)
  const adminQuinielaCelularValido = isValidPhone(adminQuinielaCelular)
  const filteredAdminQuinielas = quinielas.filter((quiniela) => {
    const q = adminSearch.toLowerCase()
    const matchSearch = !q || quiniela.nombre.toLowerCase().includes(q) || quiniela.celular.includes(q)
    const matchStatus = adminStatusFilter === 'all' || quiniela.status === adminStatusFilter
    const matchModal = adminModalFilter === 'all' || quiniela.modalidad === adminModalFilter
    const matchPayment = adminPaymentFilter === 'all' || quiniela.paymentStatus === adminPaymentFilter

    return matchSearch && matchStatus && matchModal && matchPayment
  })
  const confirmQuiniela = confirmAction ? quinielas.find((quiniela) => quiniela.id === confirmAction.id) : null

  const renderTeamLogo = (teamName: string, fallback: string, className: string) => {
    return <TeamLogo className={className} fallback={fallback} teamName={teamName} />
  }

  const handleSelection = (partidoId: number, option: PickOption) => {
    const result = toggleSelection(selecciones, partidoId, option, modalidad)

    if (result.blocked) {
      window.alert(result.blocked)
      return
    }

    setSelecciones(result.selecciones)
  }

  const handleModalidadChange = (nextModalidad: Modalidad) => {
    const nextMaxDobles = getMaxDobles(nextModalidad)

    if (doblesUsados > nextMaxDobles) {
      window.alert(`Tienes ${doblesUsados} dobles seleccionados. La modalidad ${nextModalidad} solo permite ${nextMaxDobles}. Reduce tus selecciones antes de cambiar.`)
      return
    }

    setModalidad(nextModalidad)
  }

  const limpiar = () => {
    setSelecciones((current) => current.map((selection) => (publicMatchIds.has(selection.partidoId) ? { ...selection, seleccion: [] } : selection)))
    setNombre('')
    setCelular('')
    setModalidad('3 dobles')
  }

  const aleatorio = () => {
    const randomSelections = generateRandomSelections(modalidad, publicMatches)
    const randomById = new Map(randomSelections.map((selection) => [selection.partidoId, selection]))

    setSelecciones((current) =>
      current.map((selection) => (publicMatchIds.has(selection.partidoId) ? randomById.get(selection.partidoId) ?? selection : selection)),
    )
  }

  const clearAdminQuinielaForm = () => {
    const targetJornadaId = isJornadaOpenBySchedule(jornada) ? jornada?.id ?? null : null
    const targetMatches = targetJornadaId
      ? adminMatchSource.filter((match) => match.jornadaId === targetJornadaId || (!match.jornadaId && jornada?.id === targetJornadaId))
      : []

    setAdminEditQuinielaId(null)
    setAdminQuinielaJornadaId(targetJornadaId)
    setAdminQuinielaNombre('')
    setAdminQuinielaCelular('')
    setAdminQuinielaModalidad('3 dobles')
    setAdminQuinielaSelections(createEmptySelections(targetMatches))
  }

  const closeAdminQuinielaModal = () => {
    clearAdminQuinielaForm()
    setShowAdminQuinielaModal(false)
  }

  const openNewAdminQuiniela = () => {
    clearAdminQuinielaForm()
    setShowAdminQuinielaModal(true)
  }

  const closeTournamentModal = () => {
    setNewTournamentName('')
    setNewTournamentLeague('Liga MX')
    setNewTournamentSeason(LIGA_MX_DEFAULT_SEASON)
    setShowTournamentModal(false)
  }

  const closeEditTournamentModal = () => {
    setEditingTournamentId(null)
    setEditTournamentName('')
    setEditTournamentLeague('')
    setEditTournamentSeason('')
    setEditTournamentStatus('active')
  }

  const closeJornadaModal = () => {
    setNewJornadaName('')
    setNewJornadaNumber('')
    setNewJornadaOpen('')
    setNewJornadaClose('')
    setNewJornadaFirstPrize('')
    setNewJornadaSecondPrize('')
    setNewJornadaTournamentId(defaultTournament ? String(defaultTournament.id) : '')
    setShowJornadaModal(false)
  }

  const handleAdminQuinielaModalidad = (nextModalidad: Modalidad) => {
    const nextMaxDobles = getMaxDobles(nextModalidad)

    if (adminQuinielaDobles > nextMaxDobles) {
      window.alert(`Esta quiniela tiene ${adminQuinielaDobles} dobles. La modalidad ${nextModalidad} solo permite ${nextMaxDobles}.`)
      return
    }

    setAdminQuinielaModalidad(nextModalidad)
  }

  const handleAdminQuinielaSelection = (partidoId: number, option: PickOption) => {
    const result = toggleSelection(adminQuinielaSelections, partidoId, option, adminQuinielaModalidad)

    if (result.blocked) {
      window.alert(result.blocked)
      return
    }

    setAdminQuinielaSelections(result.selecciones)
  }

  const randomAdminQuiniela = () => {
    setAdminQuinielaSelections(generateRandomSelections(adminQuinielaModalidad, adminQuinielaMatches))
  }

  const startEditAdminQuiniela = (quiniela: SavedQuiniela) => {
    const byMatchId = new Map(quiniela.selecciones.map((selection) => [selection.partidoId, selection]))
    const editJornadaId = quiniela.jornadaId ?? jornada?.id ?? null
    const editMatches = editJornadaId
      ? adminMatchSource.filter((match) => match.jornadaId === editJornadaId || (!match.jornadaId && jornada?.id === editJornadaId))
      : []
    setAdminEditQuinielaId(quiniela.id)
    setAdminQuinielaJornadaId(editJornadaId)
    setAdminQuinielaNombre(quiniela.nombre)
    setAdminQuinielaCelular(quiniela.celular)
    setAdminQuinielaModalidad(quiniela.modalidad)
    setAdminQuinielaSelections(editMatches.map((match) => {
      const current = byMatchId.get(match.id)
      return { partidoId: match.id, seleccion: current ? [...current.seleccion] : [] }
    }))
    setAdminTab('quinielas')
    setShowAdminQuinielaModal(true)
  }

  const saveAdminQuiniela = async () => {
    const cleanNombre = adminQuinielaNombre.trim()
    const cleanCelular = normalizePhone(adminQuinielaCelular)

    if (!isValidName(cleanNombre)) {
      window.alert('Ingresa el nombre completo de la quiniela.')
      return
    }

    if (!isValidPhone(cleanCelular)) {
      window.alert('Ingresa un celular valido de 10 digitos.')
      return
    }

    if (!validateQuinielaCompleta(adminVisibleQuinielaSelections, adminQuinielaMatches)) {
      window.alert('Completa todos los partidos antes de guardar.')
      return
    }

    if (adminQuinielaDobles > adminQuinielaMaxDobles) {
      window.alert(`La modalidad ${adminQuinielaModalidad} solo permite ${adminQuinielaMaxDobles} dobles.`)
      return
    }

    const payload = {
      jornadaId: adminQuinielaTargetJornadaId ?? undefined,
      nombre: cleanNombre,
      celular: cleanCelular,
      modalidad: adminQuinielaModalidad,
      costo: adminQuinielaCosto,
      doblesUsados: adminQuinielaDobles,
      selecciones: adminVisibleQuinielaSelections.map((selection) => ({ partidoId: selection.partidoId, seleccion: [...selection.seleccion] })),
      combinaciones: adminQuinielaCombinaciones.map((combination) => [...combination]),
      fechaRegistro: new Date().toISOString(),
    }

    setSavingAdminQuiniela(true)
    try {
      if (adminEditQuinielaId) {
        await updateQuinielaDetails(adminEditQuinielaId, payload)
        setToast({ message: 'Quiniela actualizada.', kind: 'success' })
      } else {
        await registerQuiniela(payload, 'accepted')
        setToast({ message: 'Quiniela creada y aceptada.', kind: 'success' })
      }

      closeAdminQuinielaModal()
      await refreshQuinielas()
    } catch (error) {
      console.error(error)
      const message = error instanceof Error ? error.message : 'No se pudo guardar la quiniela.'
      setToast({ message, kind: 'error' })
    } finally {
      setSavingAdminQuiniela(false)
    }
  }

  const agregarQuiniela = () => {
    const cleanNombre = nombre.trim()
    const cleanCelular = normalizePhone(celular)

    if (!registrosAbiertos) {
      window.alert('Esta jornada esta cerrada')
      return
    }

    if (!cleanNombre) {
      window.alert('Por favor ingresa tu nombre.')
      return
    }

    if (!isValidPhone(celular)) {
      window.alert('Por favor ingresa un celular válido de 10 dígitos.')
      return
    }

    if (!validateQuinielaCompleta(publicSelections, publicMatches)) {
      window.alert('Debes seleccionar al menos una opción en todos los partidos.')
      return
    }

    if (doblesUsados > maxDobles) {
      window.alert(`La modalidad ${modalidad} solo permite ${maxDobles} dobles.`)
      return
    }

    const quiniela: SavedQuiniela = {
      id: nextId.current,
      jornadaId: jornada?.id,
      nombre: cleanNombre,
      celular: cleanCelular,
      modalidad,
      costo: costoActual,
      doblesUsados,
      selecciones: publicSelections.map((selection) => ({
        partidoId: selection.partidoId,
        seleccion: [...selection.seleccion],
      })),
      combinaciones: combinaciones.map((combination) => [...combination]),
      fechaRegistro: new Date().toISOString(),
      status: 'pending',
    }

    nextId.current += 1
    setDraftQuinielas((current) => [...current, quiniela])
    setSelecciones(createEmptySelections(matches))
  }

  const removeQuiniela = (id: number) => {
    setDraftQuinielas((current) => current.filter((quiniela) => quiniela.id !== id))
  }

  const openView = (view: AppView) => {
    setActiveView(view)
    setNavOpen(false)

    if (view === 'admin') {
      void refreshQuinielas()
    }
  }

  const handleAdminLogin = async () => {
    const email = adminLoginEmail.trim()

    try {
      const user = await signInAdmin(email, adminLoginPassword)
      setAdminAuthenticated(true)
      setAdminEmail(user.email ?? email)
      setAdminLoginError('')
      setAdminLoginPassword('')
      setActiveView('admin')
      setAdminTab('quinielas')
      await refreshQuinielas()
      // WhatsApp will open in the current tab after the quinielas are registered.
    } catch (error) {
      console.error(error)
    }

    setAdminLoginError('Correo o contraseña incorrectos')
    setAdminLoginPassword('')
  }

  const handleAdminLogout = async () => {
    await signOutAdmin()
    setAdminAuthenticated(false)
    setAdminEmail('')
    setAdminLoginPassword('')
    setAdminLoginError('')
    setActiveView('home')
    setAdminTab('quinielas')
    setNavOpen(false)
  }

  const addMatch = async () => {
    const local = newMatchLocal.trim()
    const visitante = newMatchVisitante.trim()
    const selectedJornadaId = Number(newMatchJornadaId)

    if (!local || !visitante) {
      setToast({ message: 'Ingresa local y visitante.', kind: 'error' })
      return
    }

    if (!selectedJornadaId || !openJornadas.some((item) => item.id === selectedJornadaId)) {
      setToast({ message: 'Selecciona una jornada abierta.', kind: 'error' })
      return
    }

    let timeClass = ''

    if (newMatchDate) {
      const d = new Date(`${newMatchDate}T${newMatchTime || '00:00'}`)
      if (!Number.isNaN(d.getTime())) {
        timeClass = d.getDay() === 0 ? 'dom' : ''
      }
    }

    const newMatch: Omit<Match, 'id'> = {
      jornadaId: selectedJornadaId,
      local,
      visitante,
      time: buildMatchTime(newMatchDate, newMatchTime, 'TBD'),
      timeClass,
      localImg: '',
      visitanteImg: '',
      localScore: null,
      visitanteScore: null,
    }

    try {
      const createdMatch = await insertMatch(newMatch, selectedJornadaId)
      if (createdMatch.jornadaId === jornada?.id) {
        setMatches((curr) => [...curr, createdMatch])
      }
      setNewMatchLocal('')
      setNewMatchVisitante('')
      setNewMatchDate('')
      setNewMatchTime('')
      await refreshQuinielas()
      setShowAddMatchModal(false)
      const selectedJornada = openJornadas.find((item) => item.id === selectedJornadaId)
      setToast({ message: `Partido agregado a ${selectedJornada?.nombre ?? 'la jornada seleccionada'}.`, kind: 'success' })
    } catch (error) {
      console.error(error)
      setToast({ message: 'No se pudo agregar el partido.', kind: 'error' })
    }
  }

  const fetchLigaMxMatches = async () => {
    setLoadingLigaMxMatches(true)
    setLigaMxImportMessage('')

    try {
      let leagueId = LIGA_MX_LEAGUE_ID
      const leaguesResponse = await fetch(`https://www.thesportsdb.com/api/v1/json/${SPORTSDB_KEY}/search_all_leagues.php?c=Mexico&s=Soccer`)
      if (leaguesResponse.ok) {
        const leaguesPayload = await leaguesResponse.json() as {
          countries?: Array<{ idLeague?: string; strLeague?: string }> | null
        }
        const ligaMx = (leaguesPayload.countries ?? []).find((league) => {
          const name = (league.strLeague ?? '').toLowerCase()
          return name.includes('liga mx') || name.includes('mexican primera')
        })
        leagueId = ligaMx?.idLeague ?? leagueId
      }

      const season = ligaMxSeason.trim() || LIGA_MX_DEFAULT_SEASON
      const roundFilter = ligaMxRound.trim()
      const endpoint = roundFilter
        ? `eventsround.php?id=${leagueId}&r=${encodeURIComponent(roundFilter)}&s=${encodeURIComponent(season)}`
        : `eventsseason.php?id=${leagueId}&s=${encodeURIComponent(season)}`
      const response = await fetch(`https://www.thesportsdb.com/api/v1/json/${SPORTSDB_KEY}/${endpoint}`)
      if (!response.ok) {
        throw new Error(`TheSportsDB respondio con ${response.status}`)
      }

      const payload = await response.json() as {
        events?: SportsDbEvent[] | null
      }
      const imported = (payload.events ?? [])
        .filter((event) => event.strHomeTeam && event.strAwayTeam)
        .filter((event) => !roundFilter || String(event.intRound ?? '').trim() === roundFilter)
        .map((event): ImportedMatch => {
          const rawRound = String(event.intRound ?? '')
          const localImg = ''
          const visitanteImg = ''
          const overrideTime = getLigaMxMatchTimeOverride(season, rawRound, event.strHomeTeam ?? '', event.strAwayTeam ?? '')
          const { value, timeClass } = getMexicoDateTimeParts(event.dateEvent, event.strTime, event.strTimestamp)
          const matchTime = overrideTime ?? value
          const matchDate = overrideTime ? new Date(overrideTime) : null

          return {
            sourceId: event.idEvent ?? `${event.strHomeTeam}-${event.strAwayTeam}-${event.dateEvent ?? ''}`,
            round: rawRound,
            jornadaId: Number(newMatchJornadaId) || undefined,
            local: normalizeLigaMxTeamName(event.strHomeTeam ?? ''),
            visitante: normalizeLigaMxTeamName(event.strAwayTeam ?? ''),
            time: matchTime,
            timeClass: matchDate ? (matchDate.getDay() === 0 ? 'dom' : '') : timeClass,
            localImg,
            visitanteImg,
            localScore: parseScoreInput(event.intHomeScore ?? ''),
            visitanteScore: parseScoreInput(event.intAwayScore ?? ''),
          }
        })
        .sort((a, b) => a.time.localeCompare(b.time) || a.local.localeCompare(b.local))

      setLigaMxImportMatches(imported)
      setLigaMxImportMessage(imported.length > 0
        ? `${imported.length} partidos encontrados de Liga MX ${season}${roundFilter ? `, jornada ${roundFilter}` : ''}.`
        : `No se encontraron partidos de Liga MX ${season}${roundFilter ? ` para la jornada ${roundFilter}` : ''}.`)
    } catch (error) {
      console.error(error)
      setLigaMxImportMatches([])
      setLigaMxImportMessage('No se pudieron cargar los partidos de Liga MX.')
    } finally {
      setLoadingLigaMxMatches(false)
    }
  }

  const saveLigaMxImportMatches = async () => {
    const selectedJornadaId = Number(newMatchJornadaId)

    if (!selectedJornadaId || !openJornadas.some((item) => item.id === selectedJornadaId)) {
      setToast({ message: 'Selecciona una jornada abierta.', kind: 'error' })
      return
    }

    if (ligaMxImportMatches.length === 0) {
      setToast({ message: 'Primero carga partidos de Liga MX.', kind: 'error' })
      return
    }

    const existingKeys = new Set(
      adminMatchSource
        .filter((match) => match.jornadaId === selectedJornadaId)
        .map((match) => `${match.local.trim().toLowerCase()}|${match.visitante.trim().toLowerCase()}|${match.time}`),
    )
    const matchesToSave = ligaMxImportMatches.filter((match) => {
      const key = `${match.local.trim().toLowerCase()}|${match.visitante.trim().toLowerCase()}|${match.time}`
      return !existingKeys.has(key)
    })

    if (matchesToSave.length === 0) {
      setToast({ message: 'Los partidos cargados ya existen en esta jornada.', kind: 'info' })
      return
    }

    setSavingLigaMxMatches(true)
    try {
      for (const match of matchesToSave) {
        await insertMatch({ ...match, jornadaId: selectedJornadaId }, selectedJornadaId)
      }

      await refreshQuinielas()
      setLigaMxImportMatches([])
      setLigaMxImportMessage('')
      setShowLigaMxImportModal(false)
      setToast({ message: `${matchesToSave.length} partidos de Liga MX guardados.`, kind: 'success' })
    } catch (error) {
      console.error(error)
      setToast({ message: 'No se pudieron guardar los partidos importados.', kind: 'error' })
    } finally {
      setSavingLigaMxMatches(false)
    }
  }

  const openConfirm = (type: 'accept' | 'cancel' | 'delete', id: number) => {
    setConfirmAction({ type, id })
  }

  const closeConfirm = () => {
    setConfirmAction(null)
  }

  const runConfirmAction = async () => {
    if (!confirmAction) {
      return
    }

    const { type, id } = confirmAction

    try {
      if (type === 'delete') {
        await deleteQuinielaById(id)
        await refreshQuinielas()
        setToast({ message: 'Quiniela eliminada.', kind: 'info' })
      } else {
        const status = type === 'accept' ? 'accepted' : 'cancelled'
        await updateQuinielaStatus(id, status)
        await refreshQuinielas()
        setToast({ message: type === 'accept' ? 'Quiniela aceptada.' : 'Quiniela rechazada.', kind: type === 'accept' ? 'success' : 'info' })
      }
    } catch (error) {
      console.error(error)
      setToast({ message: 'No se pudo completar la operación.', kind: 'error' })
    } finally {
      setConfirmAction(null)
    }
    return

    if (type === 'accept') {
      ;(async () => {
        try {
          const supabase = getSupabase()!
          if (supabase) {
            const { error } = await supabase.from('quinielas').update({ status: 'accepted' }).eq('id', id)
            if (error) console.error(error)
          }
        } catch (err) {
          console.error(err)
        }
      })()

      setQuinielas((current) => current.map((quiniela) => (quiniela.id === id ? { ...quiniela, status: 'accepted' } : quiniela)))
      setToast({ message: 'Quiniela aceptada.', kind: 'success' })
    }

    if (type === 'cancel') {
      ;(async () => {
        try {
          const supabase = getSupabase()!
          if (supabase) {
            const { error } = await supabase.from('quinielas').update({ status: 'cancelled' }).eq('id', id)
            if (error) console.error(error)
          }
        } catch (err) {
          console.error(err)
        }
      })()

      setQuinielas((current) => current.map((quiniela) => (quiniela.id === id ? { ...quiniela, status: 'cancelled' } : quiniela)))
      setToast({ message: 'Quiniela rechazada.', kind: 'info' })
    }

    if (type === 'delete') {
      ;(async () => {
        try {
          const supabase = getSupabase()!
          if (supabase) {
            const { error } = await supabase.from('quinielas').delete().eq('id', id)
            if (error) console.error(error)
          }
        } catch (err) {
          console.error(err)
        }
      })()

      setQuinielas((current) => current.filter((quiniela) => quiniela.id !== id))
      setToast({ message: 'Quiniela eliminada.', kind: 'error' })
    }

    setConfirmAction(null)
  }

  const sendWhatsApp = async () => {
    if (!registrosAbiertos) {
      window.alert('Esta jornada esta cerrada')
      return
    }

    if (draftQuinielas.length === 0 || sending) {
      window.alert('Agrega al menos una quiniela antes de enviar.')
      return
    }

    let message = `QUINIELA ${APP_CONFIG.edition.toUpperCase()}\n\n`

    draftQuinielas.forEach((quiniela, index) => {
      message += `${index + 1}. ${quiniela.nombre}${quiniela.celular ? ` (${quiniela.celular})` : ''}\n`
      message += `Modalidad: ${quiniela.modalidad} | Dobles: ${quiniela.doblesUsados} | Combinaciones: ${quiniela.combinaciones.length}\n`
      message += `Resultados: ${formatSelectionRow(quiniela.selecciones)}\n`
      message += quiniela.selecciones
        .map((selection) => {
          const match = matches.find((item) => item.id === selection.partidoId)
          return `${match?.local ?? 'Partido'} vs ${match?.visitante ?? 'Partido'}: ${formatSelection(selection)}`
        })
        .join('\n')
      message += `\nCosto: $${quiniela.costo}\n\n`
    })

    message += `TOTAL: $${totalGuardado.toFixed(2)}`

    const whatsappWindow = window.open('', '_blank')
    const navigateToWhatsApp = (url: string) => {
      if (whatsappWindow && !whatsappWindow.closed) {
        whatsappWindow.location.href = url
      } else {
        window.location.href = url
      }
    }
    if (!whatsappWindow) {
      window.alert('Permite las ventanas emergentes para abrir WhatsApp en otra pestaña.')
      // WhatsApp will open in the current tab after the quinielas are registered.
    }
    if (whatsappWindow) {
      whatsappWindow.opener = null
      whatsappWindow.document.write('<p style="font-family:sans-serif;padding:24px">Registrando quinielas y preparando WhatsApp...</p>')
    }

    setSending(true)
    try {
      const registeredFolios: string[] = []

      for (const quiniela of draftQuinielas) {
        registeredFolios.push(await registerQuiniela(quiniela, 'pending'))
      }

      message += `\nFOLIOS: ${registeredFolios.join(', ')}\nConsulta cada quiniela con su folio, celular completo y nombre registrado.`
      await refreshQuinielas()
      window.localStorage.setItem(QUINIELAS_REFRESH_STORAGE_KEY, JSON.stringify(registeredFolios))
      setDraftQuinielas([])
      navigateToWhatsApp(`https://wa.me/${WHATSAPP_DESTINATION_URL}?text=${encodeURIComponent(message)}`)
    } catch (error) {
      if (whatsappWindow && !whatsappWindow.closed) {
        whatsappWindow.close()
      }
      console.error(error)
      const errorMessage = error instanceof Error ? error.message : 'No se pudieron registrar las quinielas. Intenta de nuevo.'
      setToast({
        message: errorMessage,
        kind: 'error',
      })
      window.alert(errorMessage)
    } finally {
      setSending(false)
    }
  }

  const handleLookup = async () => {
    setLookupMessage('')
    setLookupResults([])
    setLookupHasSearched(false)
    const cleanLookupPhone = normalizePhone(lookupPhone)
    const hasLookupFolio = lookupFolio.trim().length > 0
    const hasLookupPhone = cleanLookupPhone.length === 10
    const hasLookupName = lookupName.trim().length >= 2
    if (!hasLookupFolio && !hasLookupPhone && !hasLookupName) {
      setLookupMessage('Ingresa al menos un dato: folio, celular completo de 10 digitos o nombre registrado.')
      return
    }
    setLookupHasSearched(true)
    try {
      const result = await lookupQuiniela(lookupFolio.trim(), cleanLookupPhone, lookupName.trim())
      const jornadaResults = result.filter((quiniela) => !openJornadaId || quiniela.jornadaId === openJornadaId)
      setLookupResults(jornadaResults)
      setLookupMessage(jornadaResults.length > 0 ? '' : 'No encontramos quinielas con esos datos.')
    } catch (error) {
      console.error(error)
      setLookupMessage('No se pudo consultar la quiniela.')
    }
  }

  const clearLookupState = () => {
    setLookupMessage('')
    setLookupResults([])
    setLookupHasSearched(false)
  }

  const formatQuinielaStatus = (status: QuinielaStatus) => {
    if (status === 'accepted') return 'Aceptada'
    if (status === 'cancelled') return 'Rechazada'
    return 'Pendiente'
  }

  const escapePdfText = (value: string | number | null | undefined) => {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;')
  }

  const exportRegistroPdf = async () => {
    if (registroRankingRows.length === 0) {
      window.alert('No hay quinielas para exportar con los filtros actuales.')
      return
    }

    const tournamentName = jornada?.tournamentId ? tournaments.find((item) => item.id === jornada.tournamentId)?.nombre : ''
    const pdfTitle = jornadaTitle.toUpperCase()
    const pdfSubtitle = tournamentName ? `${tournamentName.toUpperCase()} - ${pdfTitle}` : pdfTitle

    try {
      const [{ jsPDF }, { default: autoTable }] = await Promise.all([
        import('jspdf'),
        import('jspdf-autotable'),
      ])
      const useLandscapePdf = registroMatches.length > 10
      const pdf = new jsPDF({
        orientation: useLandscapePdf ? 'landscape' : 'portrait',
        unit: 'pt',
        format: 'letter',
        compress: true,
        putOnlyUsedFonts: true,
      })

      
      const pageWidth = pdf.internal.pageSize.getWidth()
      const pageHeight = pdf.internal.pageSize.getHeight()
      const marginX = 16
      const tableWidth = pageWidth - marginX * 2
      const matchCount = Math.max(registroMatches.length, 1)
      const idColumnWidth = useLandscapePdf ? 66 : 70
      const nameColumnWidth = useLandscapePdf ? 122 : 112
      const pointsColumnWidth = 32
      const matchColumnWidth = Math.max(
        24,
        (tableWidth - idColumnWidth - nameColumnWidth - pointsColumnWidth) / matchCount,
      )
      const pdfTeamLabel = (teamName: string) => teamName
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9]/g, '')
        .slice(0, 3)
        .toUpperCase()
      const matchHeaders = registroMatches.map((match) => (
        `${pdfTeamLabel(match.local)}\nvs\n${pdfTeamLabel(match.visitante)}`
      ))
      const pointTotals = registroRankingRows.map((quiniela) => countQuinielaPoints(quiniela, registroMatches))
      const maxPoints = pointTotals.length > 0 ? Math.max(...pointTotals) : 0
      const minPoints = pointTotals.length > 0 ? Math.min(...pointTotals) : 0
      const hasPointSpread = maxPoints > minPoints
      const body = registroRankingRows.map((quiniela, rowIndex) => [
        String(quiniela.folio ?? quiniela.id),
        quiniela.nombre,
        ...registroMatches.map((match) => {
          const selection = quiniela.selecciones.find((item) => item.partidoId === match.id)
          return selection ? formatSelection(selection) : '-'
        }),
        String(pointTotals[rowIndex]),
      ])
      const columnStyles: Record<number, { cellWidth: number; halign?: 'left' | 'center' | 'right' }> = {
        0: { cellWidth: idColumnWidth, halign: 'center' },
        1: { cellWidth: nameColumnWidth, halign: 'left' },
      }

      registroMatches.forEach((_, index) => {
        columnStyles[index + 2] = { cellWidth: matchColumnWidth, halign: 'center' }
      })
      columnStyles[registroMatches.length + 2] = { cellWidth: pointsColumnWidth, halign: 'center' }

      try {
        const logoResponse = await fetch('/logo.png', { cache: 'force-cache' })
        if (logoResponse.ok) {
          const logoBlob = await logoResponse.blob()
          const logoDataUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader()
            reader.addEventListener('load', () => resolve(String(reader.result)), { once: true })
            reader.addEventListener('error', () => reject(reader.error), { once: true })
            reader.readAsDataURL(logoBlob)
          })
          pdf.addImage(logoDataUrl, 'PNG', marginX, 7, 48, 48, undefined, 'FAST')
        }
      } catch (logoError) {
        console.warn('No se pudo agregar el logo al PDF.', logoError)
      }

      pdf.setTextColor(5, 5, 5)
      pdf.setFont('helvetica', 'bold')
      pdf.setFontSize(7)
      pdf.text(`Personas en primer lugar: ${registroFirstPlaceCount}`, marginX, 62)
      pdf.text(`Personas con 0 aciertos: ${registroZeroPointsCount}`, marginX, 70)
      pdf.setTextColor(255, 16, 16)
      pdf.setFontSize(useLandscapePdf ? 18 : 16)
      pdf.text('PRONOSTICOS ENTRE CUATES', pageWidth / 2, 80, { align: 'center' })
      pdf.setFillColor(7, 0, 109)
      pdf.rect(marginX, 86, tableWidth, 19, 'F')
      pdf.setTextColor(255, 255, 255)
      pdf.setFontSize(useLandscapePdf ? 17 : 15)
      pdf.text('SUERTE A TODOS LOS PARTICIPANTES', pageWidth / 2, 100, { align: 'center' })
      pdf.setTextColor(5, 5, 5)
      pdf.setFontSize(12)
      pdf.text(`1° LUGAR ${firstPrizeLabel}  /  2° LUGAR ${secondPrizeLabel}`, pageWidth / 2, 118, { align: 'center' })
      pdf.setFillColor(7, 0, 109)
      pdf.rect(marginX, 124, tableWidth, 14, 'F')
      pdf.setTextColor(255, 255, 255)
      pdf.setFontSize(8)
      pdf.text(pdfSubtitle, pageWidth / 2, 134, { align: 'center' })

      autoTable(pdf, {
        startY: 138,
        margin: { top: 18, right: marginX, bottom: 24, left: marginX },
        head: [['ID', 'NOMBRE', ...matchHeaders, 'PTS']],
        body,
        showHead: 'everyPage',
        theme: 'grid',
        tableWidth,
        styles: {
          font: 'helvetica',
          fontSize: useLandscapePdf ? 6.5 : 6.2,
          fontStyle: 'bold',
          cellPadding: { top: 1.8, right: 1.2, bottom: 1.8, left: 1.2 },
          lineColor: [15, 15, 15],
          lineWidth: 0.35,
          textColor: [5, 5, 5],
          valign: 'middle',
          overflow: 'linebreak',
        },
        headStyles: {
          fillColor: [7, 0, 109],
          textColor: [255, 255, 255],
          fontSize: useLandscapePdf ? 5.8 : 5.4,
          fontStyle: 'bold',
          halign: 'center',
          valign: 'middle',
          minCellHeight: 24,
        },
        bodyStyles: {
          fillColor: [255, 255, 255],
          minCellHeight: 10,
        },
        alternateRowStyles: {
          fillColor: [247, 247, 247],
        },
        columnStyles,
        didParseCell: (data) => {
          if (data.section !== 'body') return
          const rowIndex = data.row.index
          const matchIndex = data.column.index - 2

          if (matchIndex >= 0 && matchIndex < registroMatches.length) {
            const quiniela = registroRankingRows[rowIndex]
            const match = registroMatches[matchIndex]
            const selection = quiniela?.selecciones.find((item) => item.partidoId === match.id)
            const outcome = getMatchOutcome(match.localScore ?? null, match.visitanteScore ?? null)
            if (outcome && selection?.seleccion.includes(outcome)) {
              data.cell.styles.fillColor = [16, 214, 120]
            }
          }

          if (data.column.index === registroMatches.length + 2) {
            const points = pointTotals[rowIndex]
            data.cell.styles.fillColor = hasPointSpread && points === maxPoints
              ? [16, 214, 120]
              : hasPointSpread && points === minPoints
                ? [255, 77, 79]
                : [255, 242, 0]
            data.cell.styles.textColor = hasPointSpread && points === minPoints ? [255, 255, 255] : [0, 0, 0]
          }
        },
      })

      /* Prueba */

      const pageCount = pdf.getNumberOfPages()
      for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
        pdf.setPage(pageNumber)
        pdf.setFont('helvetica', 'normal')
        pdf.setFontSize(7)
        pdf.setTextColor(45, 45, 45)
        pdf.text('Pronosticos Entre Cuates', marginX, pageHeight - 9)
        pdf.text(`Pagina ${pageNumber} de ${pageCount}`, pageWidth - marginX, pageHeight - 9, { align: 'right' })
      }

      const safeTitle = jornadaTitle
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .toLowerCase() || 'jornada'
      const pdfUrl = URL.createObjectURL(pdf.output('blob'))
      const downloadLink = document.createElement('a')
      downloadLink.href = pdfUrl
      downloadLink.download = `pronosticos-${safeTitle}.pdf`
      document.body.appendChild(downloadLink)
      downloadLink.click()
      downloadLink.remove()
      window.setTimeout(() => URL.revokeObjectURL(pdfUrl), 30_000)
      setToast({ message: 'PDF generado y descargado.', kind: 'success' })
      return
    } catch (directPdfError) {
      console.error('No se pudo generar el PDF directo; se usara el dialogo de impresion.', directPdfError)
    }

    const tableWrap = document.querySelector('.registro-card .registro-table-wrap')
    const clonedTableWrap = tableWrap?.cloneNode(true) as HTMLElement | null

    if (!clonedTableWrap) {
      window.alert('No se encontro la tabla para exportar.')
      return
    }

    const clonedTable = clonedTableWrap.querySelector('.registro-table') as HTMLTableElement | null

    if (!clonedTable) {
      window.alert('No se encontro la tabla para exportar.')
      return
    }

    clonedTable
      .querySelectorAll('.registro-mobile-title-row, .registro-mobile-match-stack-row, .registro-mobile-pick-head-row')
      .forEach((row) => row.remove())

    const matchCount = Math.max(registroMatches.length, 1)
    const useLandscapePdf = registroMatches.length > 10
    const pdfOrientation = useLandscapePdf ? 'landscape' : 'portrait'
    const pdfContentWidth = useLandscapePdf ? '10.64in' : '8.14in'
    const idColumnWidth = useLandscapePdf ? 9 : 11
    const nameColumnWidth = useLandscapePdf ? 18 : 20
    const pointsColumnWidth = useLandscapePdf ? 5 : 6
    const matchesWidth = 100 - idColumnWidth - nameColumnWidth - pointsColumnWidth
    const matchColumnWidth = matchesWidth / matchCount
    const colgroup = document.createElement('colgroup')
    const addPdfColumn = (className: string, width: number) => {
      const column = document.createElement('col')
      column.className = className
      column.style.width = `${width}%`
      colgroup.appendChild(column)
    }

    addPdfColumn('pdf-id-column', idColumnWidth)
    addPdfColumn('pdf-name-column', nameColumnWidth)
    registroMatches.forEach(() => addPdfColumn('pdf-match-column', matchColumnWidth))
    addPdfColumn('pdf-points-column', pointsColumnWidth)
    clonedTable.prepend(colgroup)

    const pdfWindow = window.open('', '_blank')

    if (!pdfWindow) {
      window.alert('Permite las ventanas emergentes para exportar la tabla como PDF.')
      return
    }

    pdfWindow.document.write(`
      <!doctype html>
      <html lang="es">
        <head>
          <meta charset="utf-8" />
          <title>Quinielas registradas ${escapePdfText(jornadaTitle)}</title>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Barlow+Condensed:wght@400;600;700;800&family=Barlow:wght@400;500;600;700&display=swap');

            @page { size: letter ${pdfOrientation}; margin: 0.18in 0.18in 0.28in; }
            *,
            *::before,
            *::after {
              box-sizing: border-box;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
            html,
            body {
              margin: 0;
              padding: 0;
              width: 100%;
              background: #ffffff !important;
              color: #050505;
              font-family: 'Barlow', Arial, Helvetica, sans-serif;
            }
            .pdf-shell {
              width: ${pdfContentWidth};
              max-width: 100%;
              overflow: visible;
              background: #ffffff !important;
            }
            .pdf-fit {
              width: ${pdfContentWidth};
              max-width: 100%;
            }
            .pdf-top {
              display: grid;
              grid-template-columns: 128px 1fr 128px;
              align-items: start;
              min-height: 82px;
            }
            .pdf-logo {
              display: block;
              width: 112px;
              height: auto;
              margin: 4px 0 0 8px;
            }
            .pdf-counts {
              margin: 6px 0 6px 14px;
              font-family: Arial, Helvetica, sans-serif;
              font-size: 12px;
              line-height: 1.25;
              font-weight: 800;
            }
            .pdf-title {
              margin: 0 0 4px;
              text-align: center;
              color: #ff1010;
              font-family: Arial, Helvetica, sans-serif;
              font-size: 27px;
              font-weight: 900;
              letter-spacing: 1px;
            }
            .pdf-blue-band {
              margin: 0;
              padding: 4px 10px 5px;
              background: #07006d !important;
              color: #ffffff !important;
              text-align: center;
              font-family: Arial, Helvetica, sans-serif;
              font-size: 26px;
              line-height: 1;
              font-weight: 900;
              letter-spacing: 1.5px;
              text-transform: uppercase;
            }
            .pdf-prizes {
              display: flex;
              align-items: center;
              justify-content: center;
              gap: 22px;
              margin: 4px 0 5px;
              font-family: Arial, Helvetica, sans-serif;
              font-size: 22px;
              line-height: 1;
              font-weight: 900;
            }
            .pdf-prizes strong {
              color: #ff1010 !important;
            }
            .pdf-subtitle {
              margin: 0;
              padding: 2px 10px 4px;
              background: #07006d !important;
              color: #ffffff !important;
              text-align: center;
              font-family: Arial, Helvetica, sans-serif;
              font-size: 16px;
              line-height: 1;
              font-weight: 900;
              text-transform: uppercase;
            }
            .registro-table-wrap {
              overflow: visible !important;
              border-radius: 0;
              border: 1px solid rgba(0, 0, 0, 0.75);
              background: #f4f7fb !important;
              box-shadow: none;
              width: ${pdfContentWidth} !important;
              min-width: ${pdfContentWidth} !important;
              max-width: ${pdfContentWidth} !important;
            }
            .registro-table {
              width: ${pdfContentWidth} !important;
              min-width: ${pdfContentWidth} !important;
              max-width: ${pdfContentWidth} !important;
              table-layout: fixed;
              border-collapse: collapse;
              background: #ffffff !important;
            }
            .registro-mobile-title-row,
            .registro-mobile-match-stack-row,
            .registro-mobile-pick-head-row {
              display: none !important;
            }
            .registro-desktop-head-row {
              display: table-row !important;
            }
            .registro-table .registro-id-col,
            .registro-table .registro-name-col,
            .registro-table .registro-points-col,
            .registro-table .registro-match-col {
              min-width: 0;
              max-width: none;
            }
            .registro-table thead th {
              position: static;
              background: #07006d !important;
              color: #ffffff !important;
              height: auto;
              padding: 0 1px;
              text-align: center;
              font-family: 'Barlow Condensed', Arial, Helvetica, sans-serif;
              font-size: 6.5pt;
              letter-spacing: 0.4px;
              text-transform: uppercase;
              border: 1px solid #101010;
              vertical-align: middle;
            }
            .registro-table thead th .registro-team-label {
              display: grid;
              justify-items: center;
              align-items: center;
              gap: 0;
            }
            .registro-table thead th .registro-team-line {
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              min-height: 9px;
              line-height: 0.75;
              gap: 0;
            }
            .registro-table thead th .registro-team-logo {
              display: block;
              width: 9px;
              height: 9px;
              object-fit: contain;
            }
            .registro-table thead th small {
              display: block;
              margin: 0;
              color: rgba(255, 255, 255, 0.75) !important;
              font-size: 5px;
              letter-spacing: 0.3px;
            }
            .registro-table thead th .registro-team-score {
              display: block;
              height: 5px;
              line-height: 5px;
              font-size: 5px;
            }
            .registro-team-name-score {
              display: inline-flex;
              align-items: center;
              justify-content: center;
              max-width: 100%;
            }
            .registro-team-name-score > span {
              display: none;
            }
            .registro-table tbody td {
              height: auto;
              padding: 1.5px 1px;
              text-align: center;
              border: 1px solid #101010;
              color: #050505 !important;
              font-family: 'Barlow Condensed', Arial, Helvetica, sans-serif;
              font-size: 7.5pt;
              line-height: 1.05;
              font-weight: 800;
              vertical-align: middle;
              background: #ffffff !important;
            }
            .registro-table thead {
              display: table-header-group;
            }
            .registro-table tbody tr {
              break-inside: avoid;
              page-break-inside: avoid;
            }
            .registro-table tbody td:nth-child(1),
            .registro-table tbody td:nth-child(2) {
              background: #f7f7f7 !important;
            }
            .registro-id-col,
            .registro-name-col {
              overflow-wrap: anywhere;
            }
            .registro-name-col {
              white-space: normal;
              overflow: visible;
              text-overflow: clip;
            }
            .registro-pick-cell.hit {
              background: #10d678 !important;
            }
            .registro-pick-cell.miss,
            .registro-pick-cell.empty {
              background: #ffffff !important;
              color: #111111 !important;
            }
            .registro-points-cell {
              background: #fff200 !important;
              color: #000000 !important;
            }
            .registro-points-cell.leader {
              background: #10d678 !important;
            }
            .registro-points-cell.last {
              background: #ff4d4f !important;
              color: #ffffff !important;
            }
            .registro-pick {
              display: block;
              width: 100%;
              padding: 0;
              border: 0;
              background: transparent !important;
              color: inherit !important;
              font: inherit;
              white-space: nowrap;
            }
            .pdf-footer {
              margin-top: 8px;
              text-align: right;
              font-family: Arial, Helvetica, sans-serif;
              font-size: 11px;
              color: #050505 !important;
            }
            @media print {
              body { min-width: 0; }
              .pdf-shell,
              .pdf-fit { width: ${pdfContentWidth}; max-width: 100%; }
            }
          </style>
        </head>
        <body>
          <div class="pdf-shell">
            <div class="pdf-fit">
              <div class="pdf-top">
                <img class="pdf-logo" src="/logo.png" alt="Pronosticos Entre Cuates" />
              </div>
              <div class="pdf-counts">
                <div>Personas en primer lugar: ${escapePdfText(registroFirstPlaceCount)}</div>
                <div>Personas con 0 aciertos: ${escapePdfText(registroZeroPointsCount)}</div>
              </div>
              <h1 class="pdf-title">PRONOSTICOS ENTRE CUATES</h1>
              <div class="pdf-blue-band">SUERTE A TODOS LOS PARTICIPANTES</div>
              <div class="pdf-prizes">
                <span>1&deg; LUGAR <strong>${escapePdfText(firstPrizeLabel)}</strong></span>
                <span>/</span>
                <span>2&deg; LUGAR <strong>${escapePdfText(secondPrizeLabel)}</strong></span>
              </div>
              <div class="pdf-subtitle">${escapePdfText(pdfSubtitle)}</div>
              ${clonedTableWrap.outerHTML}
              <div class="pdf-footer">Pronosticos Entre Cuates</div>
            </div>
          </div>
          <script>
            const printWhenReady = () => {
              const images = Array.from(document.images);
              const pendingImages = images.filter((image) => !image.complete);
              const print = () => {
                requestAnimationFrame(() => window.print());
              };
              if (pendingImages.length === 0) {
                print();
                return;
              }
              Promise.allSettled(pendingImages.map((image) => new Promise((resolve) => {
                image.addEventListener('load', resolve, { once: true });
                image.addEventListener('error', resolve, { once: true });
              }))).then(print);
            };
            window.addEventListener('load', printWhenReady);
          </script>
        </body>
      </html>
    `)
    pdfWindow.document.close()
    pdfWindow.focus()
    return
  }


  const renderRegistroTable = (rows: SavedQuiniela[], showStatus = false) => {
    const leadingColumnSpan = showStatus ? 3 : 2
    const trailingColumnSpan = showStatus ? 2 : 1
    const tableColumnCount = leadingColumnSpan + registroMatches.length + trailingColumnSpan
    const rowPointTotals = rows.map((quiniela) => countQuinielaPoints(quiniela, registroMatches))
    const maxRowPoints = rowPointTotals.length > 0 ? Math.max(...rowPointTotals) : 0
    const minRowPoints = rowPointTotals.length > 0 ? Math.min(...rowPointTotals) : 0
    const hasPointSpread = maxRowPoints > minRowPoints

    return (
    <div className="registro-table-wrap">
      <table className="registro-table">
        <thead>
          <tr className="registro-mobile-title-row">
            <th colSpan={tableColumnCount}>{jornadaTitle}</th>
          </tr>
          <tr className="registro-mobile-match-stack-row">
            <th className="registro-id-col">ID</th>
            <th className="registro-name-col">Nombre</th>
            {showStatus ? <th className="registro-phone-col">Tel.</th> : null}
            {registroMatches.map((match) => (
              <th className="registro-match-col registro-mobile-match-stack" key={`mobile-stack-${match.id}`}>
                {renderTeamLogo(match.local, '⚽', 'registro-team-logo')}
                <strong>{match.localScore ?? '-'}</strong>
                <small>vs</small>
                <strong>{match.visitanteScore ?? '-'}</strong>
                {renderTeamLogo(match.visitante, '⚽', 'registro-team-logo')}
              </th>
            ))}
            {showStatus ? <th className="registro-status-col">Estado</th> : null}
            <th className="registro-points-col">Pts</th>
          </tr>
          <tr className="registro-desktop-head-row">
            <th className="registro-id-col">ID</th>
            <th className="registro-name-col">Nombre</th>
            {showStatus ? <th>Teléfono</th> : null}
            {registroMatches.map((match) => (
              <th className="registro-match-col" key={match.id}>
                <span className="registro-team-label">
                  <span className="registro-team-line" title={match.local}>
                    {renderTeamLogo(match.local, '⚽', 'registro-team-logo')}
                    <span className="registro-team-name-score">
                      <strong className="registro-team-score">{match.localScore ?? '-'}</strong>
                    </span>
                  </span>
                  <small>vs</small>
                  <span className="registro-team-line away" title={match.visitante}>
                    {renderTeamLogo(match.visitante, '⚽', 'registro-team-logo')}
                    <span className="registro-team-name-score">
                      <strong className="registro-team-score">{match.visitanteScore ?? '-'}</strong>
                    </span>
                  </span>
                </span>
              </th>
            ))}
            {showStatus ? <th className="registro-status-col">Estado</th> : null}
            <th className="registro-points-col">Puntos</th>
          </tr>
          <tr className="registro-mobile-pick-head-row">
            <th className="registro-id-col">ID</th>
            <th className="registro-name-col">Nombre</th>
            {showStatus ? <th className="registro-phone-col">Tel.</th> : null}
            {registroMatches.map((match) => (
              <th className="registro-match-col" key={`mobile-pick-head-${match.id}`}>
                {getMatchOutcome(match.localScore ?? null, match.visitanteScore ?? null) ?? '-'}
              </th>
            ))}
            {showStatus ? <th className="registro-status-col">Estado</th> : null}
            <th className="registro-points-col">Pts</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((quiniela) => {
            const points = countQuinielaPoints(quiniela, registroMatches)
            const pointsPosition = hasPointSpread
              ? points === maxRowPoints
                ? 'leader'
                : points === minRowPoints
                  ? 'last'
                  : 'middle'
              : 'middle'

            return (
            <tr key={quiniela.id}>
              <td className="registro-id-col">{quiniela.folio ?? quiniela.id}</td>
              <td className="registro-name-col">{quiniela.nombre}</td>
              {showStatus ? <td className="registro-phone-col">{quiniela.celular || '-'}</td> : null}
              {registroMatches.map((match) => {
                const selection = quiniela.selecciones.find((item) => item.partidoId === match.id)
                const picks = selection?.seleccion ?? []
                const outcome = getMatchOutcome(match.localScore ?? null, match.visitanteScore ?? null)
                const pickCellState = outcome && picks.includes(outcome) ? 'hit' : picks.length > 0 ? 'miss' : 'empty'

                return (
                  <td className={`registro-match-col registro-pick-cell ${pickCellState}`} key={`${quiniela.id}-${match.id}`}>
                    <span className={`registro-pick ${picks.length >= 2 ? 'multi' : picks[0] || 'empty'}`}>
                      {selection ? formatSelection(selection) : '—'}
                    </span>
                  </td>
                )
              })}
              {showStatus ? (
                <td className="registro-status-col">
                  <span className={`registro-status ${quiniela.status}`}>
                    {formatQuinielaStatus(quiniela.status)}
                  </span>
                </td>
              ) : null}
              <td className={`registro-points-col registro-points-cell ${pointsPosition}`}>
                <strong>{points}</strong>
              </td>
            </tr>
            )
          })}
        </tbody>
      </table>
    </div>
    )
  }

  const handlePaymentChange = async (quiniela: SavedQuiniela, paymentStatus: PaymentStatus) => {
    if (paymentStatus === 'paid') {
      setPaymentModalQuiniela(quiniela)
      setPaymentReferenceInput(quiniela.paymentReference ?? '')
      return
    }

    try {
      await updateQuinielaPayment(quiniela.id, paymentStatus, '')
      setQuinielas((current) => current.map((item) => (item.id === quiniela.id ? { ...item, paymentStatus, paymentReference: '', paidAt: null } : item)))
      await refreshQuinielas()
      setToast({ message: 'Pago actualizado.', kind: 'success' })
    } catch (error) {
      console.error(error)
      setToast({ message: 'No se pudo actualizar el pago.', kind: 'error' })
    }
  }

  const handlePrize = async (quiniela: SavedQuiniela) => {
    setPrizeModalQuiniela(quiniela)
    setPrizeAmountInput(String(quiniela.prizeAmount ?? 0))
  }

  const closePrizeModal = () => {
    setPrizeModalQuiniela(null)
    setPrizeAmountInput('')
  }

  const savePrizeAmount = async () => {
    if (!prizeModalQuiniela) return

    const amount = Number(prizeAmountInput)
    if (!Number.isFinite(amount) || amount < 0) {
      setToast({ message: 'Ingresa un monto de premio valido.', kind: 'error' })
      return
    }

    try {
      await updateQuinielaPrize(prizeModalQuiniela.id, amount, amount > 0)
      closePrizeModal()
      await refreshQuinielas()
      setToast({ message: 'Premio actualizado.', kind: 'success' })
    } catch (error) {
      console.error(error)
      setToast({ message: 'No se pudo actualizar el premio.', kind: 'error' })
    }
  }

  const exportAdminCsv = () => {
    const rows = [
      ['Folio', 'Nombre', 'Celular', 'Modalidad', 'Costo', 'Estatus', 'Pago', 'Referencia', 'Premio', 'Fecha'],
      ...filteredAdminQuinielas.map((q) => [q.folio ?? q.id, q.nombre, q.celular, q.modalidad, q.costo, q.status, q.paymentStatus ?? 'pending', q.paymentReference ?? '', q.prizeAmount ?? 0, q.fechaRegistro]),
    ]
    const csv = rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n')
    const link = document.createElement('a')
    link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    link.download = `quinielas-${jornada?.nombre ?? 'jornada'}.csv`
    link.click()
    URL.revokeObjectURL(link.href)
  }

  const handleCreateTournament = async () => {
    if (newTournamentName.trim().length < 2) {
      setToast({ message: 'Ingresa un nombre de torneo.', kind: 'error' })
      return
    }

    try {
      await createTournament({
        nombre: newTournamentName.trim(),
        liga: newTournamentLeague.trim() || 'Liga MX',
        temporada: newTournamentSeason.trim() || LIGA_MX_DEFAULT_SEASON,
        status: 'active',
      })
      setNewTournamentName('')
      setNewTournamentLeague('Liga MX')
      setNewTournamentSeason(LIGA_MX_DEFAULT_SEASON)
      setShowTournamentModal(false)
      await refreshQuinielas()
      setToast({ message: 'Torneo creado.', kind: 'success' })
    } catch (error) {
      console.error(error)
      setToast({ message: 'No se pudo crear el torneo.', kind: 'error' })
    }
  }

  const handleTournamentStatus = async (item: Tournament, status: TournamentStatus) => {
    try {
      await updateTournament(item.id, { status })
      await refreshQuinielas()
      setToast({ message: 'Estado de torneo actualizado.', kind: 'success' })
    } catch (error) {
      console.error(error)
      setToast({ message: 'No se pudo actualizar el torneo.', kind: 'error' })
    }
  }

  const closePaymentModal = () => {
    setPaymentModalQuiniela(null)
    setPaymentReferenceInput('')
  }

  const savePaymentReference = async () => {
    if (!paymentModalQuiniela) return

    const cleanReference = paymentReferenceInput.trim()
    if (cleanReference.length === 0) {
      setToast({ message: 'Ingresa una referencia de pago.', kind: 'error' })
      return
    }

    try {
      await updateQuinielaPayment(paymentModalQuiniela.id, 'paid', cleanReference)
      setQuinielas((current) => current.map((item) => (item.id === paymentModalQuiniela.id ? { ...item, paymentStatus: 'paid', paymentReference: cleanReference, paidAt: new Date().toISOString() } : item)))
      closePaymentModal()
      await refreshQuinielas()
      setToast({ message: 'Pago actualizado.', kind: 'success' })
    } catch (error) {
      console.error(error)
      setToast({ message: 'No se pudo actualizar el pago.', kind: 'error' })
    }
  }

  const startEditTournament = (item: Tournament) => {
    setEditingTournamentId(item.id)
    setEditTournamentName(item.nombre)
    setEditTournamentLeague(item.liga)
    setEditTournamentSeason(item.temporada)
    setEditTournamentStatus(item.status)
  }

  const saveEditTournament = async () => {
    if (!editingTournamentId) return
    if (editTournamentName.trim().length < 2) {
      setToast({ message: 'Ingresa un nombre de torneo.', kind: 'error' })
      return
    }

    try {
      await updateTournament(editingTournamentId, {
        nombre: editTournamentName.trim(),
        liga: editTournamentLeague.trim() || 'Liga MX',
        temporada: editTournamentSeason.trim() || LIGA_MX_DEFAULT_SEASON,
        status: editTournamentStatus,
      })
      closeEditTournamentModal()
      await refreshQuinielas()
      setToast({ message: 'Torneo actualizado.', kind: 'success' })
    } catch (error) {
      console.error(error)
      setToast({ message: 'No se pudo actualizar el torneo.', kind: 'error' })
    }
  }

  const deleteTournament = async (item: Tournament) => {
    setAdminDeleteConfirm({ type: 'tournament', id: item.id, name: item.nombre })
  }

  const handleCreateJornada = async () => {
    if (newJornadaName.trim().length < 2) return
    try {
      await createJornada({
        tournamentId: newJornadaTournamentId ? Number(newJornadaTournamentId) : null,
        nombre: newJornadaName.trim(),
        numero: newJornadaNumber ? Number(newJornadaNumber) : null,
        openAt: newJornadaOpen ? new Date(newJornadaOpen).toISOString() : null,
        closeAt: newJornadaClose ? new Date(newJornadaClose).toISOString() : null,
        firstPrize: Number(newJornadaFirstPrize || 0),
        secondPrize: Number(newJornadaSecondPrize || 0),
      })
      setNewJornadaName('')
      setNewJornadaNumber('')
      setNewJornadaOpen('')
      setNewJornadaClose('')
      setNewJornadaFirstPrize('')
      setNewJornadaSecondPrize('')
      setShowJornadaModal(false)
      await refreshQuinielas()
      setToast({ message: 'Jornada creada.', kind: 'success' })
    } catch (error) {
      console.error(error)
      setToast({ message: 'No se pudo crear la jornada.', kind: 'error' })
    }
  }

  const deleteJornada = async (item: Jornada) => {
    setAdminDeleteConfirm({ type: 'jornada', id: item.id, name: item.nombre })
  }

  const closeAdminDeleteConfirm = () => {
    setAdminDeleteConfirm(null)
  }

  const runAdminDeleteConfirm = async () => {
    if (!adminDeleteConfirm) return

    try {
      if (adminDeleteConfirm.type === 'tournament') {
        await deleteTournamentById(adminDeleteConfirm.id)
        setToast({ message: 'Torneo eliminado.', kind: 'info' })
      } else {
        await deleteJornadaById(adminDeleteConfirm.id)
        if (editingJornadaId === adminDeleteConfirm.id) cancelEditJornada()
        setToast({ message: 'Jornada eliminada.', kind: 'info' })
      }
      await refreshQuinielas()
    } catch (error) {
      const fallback = adminDeleteConfirm.type === 'tournament' ? 'No se pudo eliminar el torneo.' : 'No se pudo eliminar la jornada.'
      const message = error instanceof Error ? error.message : fallback
      if (!message.startsWith('No se puede eliminar')) {
        console.error(error)
      }
      setToast({ message, kind: 'error' })
    } finally {
      setAdminDeleteConfirm(null)
    }
  }

  const handleJornadaStatus = async (item: Jornada, status: JornadaStatus) => {
    try {
      await updateJornada(item.id, { status })
      await refreshQuinielas()
      setToast({ message: status === 'open' ? 'Jornada publicada.' : 'Estado de jornada actualizado.', kind: 'success' })
    } catch (error) {
      console.error(error)
      setToast({ message: 'No se pudo actualizar la jornada.', kind: 'error' })
    }
  }

  const handleDistributePrizes = async (item: Jornada) => {
    try {
      await distributeJornadaPrizes(item.id)
      await refreshQuinielas()
      setToast({ message: 'Premios repartidos entre los ganadores.', kind: 'success' })
    } catch (error) {
      console.error(error)
      setToast({ message: 'No se pudieron repartir los premios.', kind: 'error' })
    }
  }

  const startEditJornada = (item: Jornada) => {
    setEditingJornadaId(item.id)
    setEditJornadaName(item.nombre)
    setEditJornadaTournamentId(item.tournamentId ? String(item.tournamentId) : '')
    setEditJornadaNumber(item.numero ? String(item.numero) : '')
    setEditJornadaOpen(formatDatetimeLocal(item.openAt))
    setEditJornadaClose(formatDatetimeLocal(item.closeAt))
    setEditJornadaFirstPrize(String(item.firstPrize))
    setEditJornadaSecondPrize(String(item.secondPrize))
    setEditJornadaNotes(item.notes ?? '')
  }

  const cancelEditJornada = () => {
    setEditingJornadaId(null)
    setEditJornadaName('')
    setEditJornadaTournamentId('')
    setEditJornadaNumber('')
    setEditJornadaOpen('')
    setEditJornadaClose('')
    setEditJornadaFirstPrize('')
    setEditJornadaSecondPrize('')
    setEditJornadaNotes('')
  }

  const saveEditJornada = async () => {
    if (!editingJornadaId) return
    if (editJornadaName.trim().length < 2) {
      setToast({ message: 'Ingresa un nombre de jornada valido.', kind: 'error' })
      return
    }

    try {
      await updateJornada(editingJornadaId, {
        tournamentId: editJornadaTournamentId ? Number(editJornadaTournamentId) : null,
        nombre: editJornadaName.trim(),
        numero: editJornadaNumber ? Number(editJornadaNumber) : null,
        openAt: editJornadaOpen ? new Date(editJornadaOpen).toISOString() : null,
        closeAt: editJornadaClose ? new Date(editJornadaClose).toISOString() : null,
        firstPrize: Number(editJornadaFirstPrize || 0),
        secondPrize: Number(editJornadaSecondPrize || 0),
        notes: editJornadaNotes.trim(),
      })
      cancelEditJornada()
      await refreshQuinielas()
      setToast({ message: 'Jornada actualizada.', kind: 'success' })
    } catch (error) {
      console.error(error)
      setToast({ message: 'No se pudo actualizar la jornada.', kind: 'error' })
    }
  }

  const publishEditJornada = async () => {
    if (!editingJornadaId) return
    if (editJornadaName.trim().length < 2) {
      setToast({ message: 'Ingresa un nombre de jornada valido.', kind: 'error' })
      return
    }

    try {
      await updateJornada(editingJornadaId, {
        tournamentId: editJornadaTournamentId ? Number(editJornadaTournamentId) : null,
        nombre: editJornadaName.trim(),
        numero: editJornadaNumber ? Number(editJornadaNumber) : null,
        status: 'open',
        openAt: editJornadaOpen ? new Date(editJornadaOpen).toISOString() : null,
        closeAt: editJornadaClose ? new Date(editJornadaClose).toISOString() : null,
        firstPrize: Number(editJornadaFirstPrize || 0),
        secondPrize: Number(editJornadaSecondPrize || 0),
        notes: editJornadaNotes.trim(),
      })
      cancelEditJornada()
      await refreshQuinielas()
      setToast({ message: 'Jornada publicada.', kind: 'success' })
    } catch (error) {
      console.error(error)
      setToast({ message: 'No se pudo publicar la jornada.', kind: 'error' })
    }
  }

  const startEditMatch = (match: Match) => {
    setEditingMatchId(match.id)
    setEditLocal(match.local)
    setEditVisitante(match.visitante)
    setEditLocalScore(match.localScore?.toString() ?? '')
    setEditVisitanteScore(match.visitanteScore?.toString() ?? '')
    const parsedTime = parseMatchTime(match.time)
    setEditDate(parsedTime.date)
    setEditTime(parsedTime.time)
    setEditMatchJornadaId(String(match.jornadaId ?? jornada?.id ?? jornadas[0]?.id ?? ''))
    setShowEditLocalSuggestions(false)
    setShowEditVisitanteSuggestions(false)
  }

  const cancelEditMatch = () => {
    setEditingMatchId(null)
    setEditLocal('')
    setEditVisitante('')
    setEditDate('')
    setEditTime('')
    setEditLocalScore('')
    setEditVisitanteScore('')
    setEditMatchJornadaId('')
  }

  const saveEditMatch = async (id: number) => {
    const localScore = parseScoreInput(editLocalScore)
    const visitanteScore = parseScoreInput(editVisitanteScore)
    const currentMatch = adminMatchSource.find((m) => m.id === id)
    const selectedJornadaId = Number(editMatchJornadaId)
    let timeClass = currentMatch?.timeClass || ''

    if (!selectedJornadaId || !jornadas.some((item) => item.id === selectedJornadaId)) {
      setToast({ message: 'Selecciona una jornada para el partido.', kind: 'error' })
      return
    }

    if (editDate) {
      const editedDate = new Date(`${editDate}T${editTime || '00:00'}`)
      timeClass = editedDate.getDay() === 0 ? 'dom' : ''
    }

    const updatedMatch: Match = {
      id,
      jornadaId: selectedJornadaId,
      local: editLocal.trim() || currentMatch?.local || '',
      visitante: editVisitante.trim() || currentMatch?.visitante || '',
      time: buildMatchTime(editDate, editTime, currentMatch?.time || ''),
      timeClass,
      localImg: currentMatch?.localImg || '',
      visitanteImg: currentMatch?.visitanteImg || '',
      localScore,
      visitanteScore,
    }

    try {
      await updateMatch(updatedMatch)
      await refreshQuinielas()
      cancelEditMatch()
      setToast({ message: 'Partido actualizado.', kind: 'success' })
    } catch (err) {
      console.error(err)
      setToast({ message: 'No se pudo actualizar el partido en la base de datos.', kind: 'error' })
    }
  }

  const deleteMatch = async (id: number) => {
    const previousMatches = matches
    const previousAdminMatches = adminMatches
    try {
      await deleteMatchById(id)
      setMatches((curr) => curr.filter((m) => m.id !== id))
      setAdminMatches((curr) => curr.filter((m) => m.id !== id))
      await refreshQuinielas()
      setToast({ message: 'Partido eliminado.', kind: 'info' })
    } catch (err) {
      setMatches(previousMatches)
      setAdminMatches(previousAdminMatches)
      const message = err instanceof Error ? err.message : 'No se pudo eliminar el partido de la base de datos.'
      if (!message.startsWith('No se puede eliminar este partido')) {
        console.error(err)
      }
      setToast({ message, kind: 'error' })
    }
  }

  return (
    <div className={`app-shell${navOpen ? ' nav-open' : ''}${activeView === 'registro' ? ' registro-shell' : ''}`}>
      <button className="nav-toggle" onClick={() => setNavOpen((current) => !current)} type="button" aria-expanded={navOpen} aria-label="Abrir o cerrar menu">
        Menu
      </button>
      <div className={`nav-backdrop${navOpen ? ' visible' : ''}`} onClick={() => setNavOpen(false)} />

      <nav className={`topnav${navOpen ? ' open' : ''}`}>
        <button className="nav-close" onClick={() => setNavOpen(false)} type="button" aria-label="Cerrar menu">
          Cerrar
        </button>
        <div className="topnav-links">
          <button className={`nav-link-btn${activeView === 'home' ? ' active' : ''}`} onClick={() => openView('home')} type="button">
            Inicio
          </button>
          <button className={`nav-link-btn${activeView === 'registro' ? ' active' : ''}`} onClick={() => openView('registro')} type="button">
            Registro al momento/Verificador
          </button>
          <button className={`nav-link-btn${activeView === 'admin' ? ' active' : ''}`} onClick={() => openView('admin')} type="button">
            Admin
          </button>
        </div>
        <div className="topnav-social" aria-label="Redes sociales">
          <a className="social-btn social-facebook" href={FACEBOOK_PROFILE_URL} onClick={() => setNavOpen(false)} rel="noopener noreferrer" target="_blank">
            <svg className="social-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="M15.1 8.4h2.2V4.7c-.4-.1-1.7-.2-3.2-.2-3.2 0-5.4 1.9-5.4 5.4v3H5.3V17h3.4v7h4.2v-7h3.4l.5-4.1h-3.9v-2.6c0-1.2.3-1.9 2.2-1.9Z" />
            </svg>
            Facebook
          </a>
          <a className="social-btn social-whatsapp" href={`https://wa.me/${WHATSAPP_DESTINATION_URL}`} onClick={() => setNavOpen(false)} rel="noopener noreferrer" target="_blank">
            <svg className="social-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="M12.1 2a9.8 9.8 0 0 0-8.4 14.9L2.5 22l5.3-1.2A9.9 9.9 0 1 0 12.1 2Zm0 2a7.9 7.9 0 1 1-3.9 14.8l-.4-.2-3 .7.7-2.9-.3-.5A7.8 7.8 0 0 1 12.1 4Zm-3.4 4.2c-.2 0-.5.1-.7.4-.2.3-.9.9-.9 2.1 0 1.3.9 2.5 1 2.7.1.2 1.8 2.8 4.4 3.8 2.2.9 2.7.7 3.2.6.5-.1 1.6-.7 1.8-1.3.2-.6.2-1.1.2-1.2-.1-.1-.2-.2-.5-.4l-1.7-.8c-.3-.1-.5-.1-.7.2l-.7.9c-.2.2-.4.2-.7.1-1-.4-1.9-.9-2.6-1.7-.6-.7-.9-1.2-1.1-1.6-.1-.3 0-.4.1-.6l.4-.5c.1-.2.2-.3.3-.5.1-.2 0-.4 0-.5l-.8-1.8c-.2-.5-.4-.5-.6-.5h-.4Z" />
            </svg>
            WhatsApp
          </a>
        </div>
      </nav>

      {activeView === 'home' ? (
        <>
          <header className="hero">
            <div className="hero-inner">
              <div className="hero-prize" aria-label="Premios de la jornada">
                <div className="hero-prize-item">
                  <span className="label">Primer lugar</span>
                  <strong className="amount">{firstPrizeLabel}</strong>
                </div>
                <div className="hero-prize-item">
                  <span className="label">Segundo lugar acumulado</span>
                  <strong className="amount">{secondPrizeLabel}</strong>
                </div>
              </div>

              <div className="hero-center">
                <img src="/logo.png" className="hero-logo" alt="Pronosticos Entre Cuates" onError={(event) => { event.currentTarget.style.display = 'none' }} />
                <div className="hero-edition">
                  <span>PRONOSTICOS ENTRE</span> CUATES
                </div>
                <div className="edition-sub">
                  EDICION <span>{APP_CONFIG.edition}</span>
                </div>
              </div>
              <div className="hero-close">
                <div className="label">⏰ Cierre</div>
                <div className="time">{jornada?.closeAt ? new Date(jornada.closeAt).toLocaleDateString('es-MX') : APP_CONFIG.closeLabel}</div>
                <div className="time small">{jornada?.closeAt ? new Date(jornada.closeAt).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }) : APP_CONFIG.closeTime}</div>
              </div>
            </div>
          </header>

          <div className="prize-banner">
            <p>
              3 DOBLES <span className="highlight">$30</span> / 5 DOBLES <span className="highlight">$50</span> - UNICAS JUGADAS A ELEGIR - ULTIMO PREMIO
            </p>
          </div>

          <div className="input-block mobile-mode-block">
            <div className="input-label">Modalidad</div>
            <div className="mode-options">
              {MODALIDADES.map((option) => (
                <button
                  className={`mode-option${modalidad === option ? ' active' : ''}`}
                  disabled={!registrosAbiertos}
                  key={option}
                  onClick={() => handleModalidadChange(option)}
                  type="button"
                >
                  <span>{option}</span>
                  <strong>${getCosto(option)}</strong>
                </button>
              ))}
            </div>
            <div className="mode-hint">Cada modalidad define el costo y el máximo de dobles permitidos.</div>
          </div>

          {dataLoading ? <div className="app-notice">Cargando datos de la jornada...</div> : null}
          {dataError ? <div className="app-notice error">{dataError}</div> : null}
          {jornadaPendientePorFecha ? <div className="app-notice">Esta jornada abre el {new Date(jornada!.openAt!).toLocaleString('es-MX')}</div> : null}
          {jornadaCerradaPorFecha ? <div className="app-notice error">Esta jornada esta cerrada</div> : null}
          {!jornadaPendientePorFecha && !jornadaCerradaPorFecha && !registrosAbiertos ? <div className="app-notice error">Los registros de esta jornada estan cerrados.</div> : null}

          <main className="main-container">
            <div className="left-column">
              <div className="matches-panel">
                <div className={`progress-card${progresoCompleto ? ' complete' : ''}`} id="progress-dots" aria-label="Progreso de partidos seleccionados">
                  <div className="progress-head">
                    <div className="progress-sub">
                      {partidosCompletos} de {matches.length} partidos seleccionados
                    </div>
                    <div className="progress-percent">{Math.round(progresoPorcentaje)}%</div>
                  </div>
                  <div className="progress-track">
                    <div className="progress-fill" style={progresoStyle} />
                  </div>
                  <div className="progress-state">{progresoCompleto ? 'Listo para guardar la quiniela' : 'Completa los partidos para terminar'}</div>
                </div>

                <div className="matches-content">
                  <div className="date-divider">Partidos de tu lista manual - logos de TheSportsDB</div>
                  <div className="matches-wrap" id="matches-container">
                    {publicMatches.length === 0 ? (
                      <div className="combo-empty">No hay partidos disponibles para seleccionar en este momento.</div>
                    ) : null}
                    {publicMatches.map((match, index) => (
                      <div className={`match-row${index % 2 === 1 ? ' alt' : ''}`} key={match.id}>
                        <div className="match-top">
                          <div className="team-badge team-home">
                            {renderTeamLogo(match.local, '⚽', 'team-logo-img')}
                            <div className="team-name-home">{match.local}</div>
                          </div>
                          <div className="match-vs">vs</div>
                          <div className="team-badge team-away">
                            <div className="team-name-away">{match.visitante}</div>
                            {renderTeamLogo(match.visitante, '⚽', 'team-logo-img')}
                          </div>
                        </div>
                        <div className="lev-group">
                          {(['L', 'E', 'V'] as PickOption[]).map((option) => {
                            const currentSelection = selecciones.find((selection) => selection.partidoId === match.id)?.seleccion ?? []
                            const isActive = currentSelection.includes(option)

                            return (
                              <button
                                className={`lev-btn ${isActive ? `active-${option}` : ''}`}
                                disabled={!registrosAbiertos}
                                key={option}
                                onClick={() => handleSelection(match.id, option)}
                                type="button"
                              >
                                {option}
                              </button>
                            )
                          })}
                        </div>
                        <div className="match-time-away">
                          <span className={`time-badge ${match.timeClass}`}>{formatMatchTime(match.time)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="right-column">
              <div className="bottom-section">
                <div className="input-block desktop-mode-block">
                  <div className="input-label">Modalidad</div>
                  <div className="mode-options">
                    {MODALIDADES.map((option) => (
                      <button
                        className={`mode-option${modalidad === option ? ' active' : ''}`}
                        disabled={!registrosAbiertos}
                        key={option}
                        onClick={() => handleModalidadChange(option)}
                        type="button"
                      >
                        <span>{option}</span>
                        <strong>${getCosto(option)}</strong>
                      </button>
                    ))}
                  </div>
                  <div className="mode-hint">Cada modalidad define el costo y el máximo de dobles permitidos.</div>
                </div>

                <div className="input-block">
                  <div className="input-label">Tu Nombre</div>
                  <input className="input-field" id="input-name" placeholder="Ingresa tu nombre completo" value={nombre} onChange={(event) => setNombre(event.target.value)} />
                </div>

                <div className="input-block">
                  <div className="input-label">Celular</div>
                  <input
                    className="input-field"
                    id="input-phone"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    placeholder="Numero de celular"
                    type="tel"
                    value={celular}
                    onChange={(event) => setCelular(normalizePhone(event.target.value).slice(0, 10))}
                  />
                </div>
              </div>

              <div className="cost-bar">
                <div>
                  <div className="cost-label">Costo actual</div>
                  <div className="cost-amount" id="cost-display">
                    ${costoActual.toFixed(2)}
                  </div>
                </div>
                <div className="quinielas-total">
                  Dobles usados: <span id="dobles-display">{doblesUsados}/{maxDobles}</span>
                </div>
                <div className="quinielas-total">
                  Combinaciones: <span id="combos-display">{combinaciones.length}</span>
                </div>
                <div className="close-mini">Guardadas: {draftQuinielas.length}</div>
              </div>

              <div className="input-block combination-block">
                <div className="input-label">Resultados actuales</div>
                {progresoCompleto ? (
                  <>
                    <div className="mode-hint">Se generaron {combinaciones.length} combinaciones con tus selecciones actuales.</div>
                    <div className="results-line" aria-label="Resumen de resultados por partido">
                      {publicSelections.map((selection, index) => (
                        <span className="results-pill" key={`${selection.partidoId}-${index}`}>
                          {selection.seleccion.join('/') || '—'}
                        </span>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="combo-empty">Completa todos los partidos para generar combinaciones.</div>
                )}
              </div>

              <div className="actions">
                <button className="btn btn-clear" id="clear-btn" onClick={limpiar} type="button" disabled={!registrosAbiertos}>
                  Limpiar
                </button>
                <button className="btn btn-add" id="add-btn" onClick={agregarQuiniela} type="button" disabled={!puedeAgregar}>
                  Agregar quiniela
                </button>
                <button className="btn btn-random" id="random-btn" onClick={aleatorio} type="button" disabled={!registrosAbiertos}>
                  Aleatorio
                </button>
              </div>

              <button className={`btn-send${!registrosAbiertos ? ' blocked' : ''}`} id="send-btn" onClick={sendWhatsApp} type="button" disabled={sending || !registrosAbiertos}>
                {sending ? 'Registrando quinielas...' : registrosAbiertos ? 'Enviar por WhatsApp' : 'Jornada bloqueada'}
              </button>

              <div className="quinielas-list">
                {visibleQuinielas.length === 0 ? (
                  <div className="empty-msg" id="empty-msg">
                    No has agregado ninguna Quiniela...
                  </div>
                ) : null}
                <div id="quinielas-container">
                  {visibleQuinielas.map((quiniela) => (
                    <div className="quiniela-item" key={quiniela.id}>
                      <div className="qi-name">
                        {quiniela.nombre}
                        {quiniela.celular ? ` - ${quiniela.celular}` : ''}
                      </div>
                      <div className="qi-meta">
                        {quiniela.modalidad} · {quiniela.doblesUsados} dobles · {quiniela.combinaciones.length} combos
                      </div>
                      <div className="qi-picks">
                        {quiniela.selecciones.map((selection, index) => (
                          <div className={`pick-chip ${selection.seleccion.length >= 2 ? 'multi' : selection.seleccion[0] || ''}`} key={`${quiniela.id}-${index}`}>
                            {formatSelection(selection)}
                          </div>
                        ))}
                      </div>
                      <div className="qi-cost">${quiniela.costo}</div>
                      <button className="qi-del" onClick={() => removeQuiniela(quiniela.id)} type="button">
                        X
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </main>
        </>
      ) : activeView === 'registro' ? (
        <main className="registro-view">
          <section className="registro-hero">
            <div className="registro-kicker">📋 Consulta privada</div>
            <h1>Registro al momento/Verificador</h1>
            <p>Verifica tu quiniela, revisa las capturas aprobadas y consulta los resultados de la jornada en un solo lugar.</p>
            <div className="lookup-form">
              <input className="input-field" placeholder="Folio, por ejemplo Q1-000001" value={lookupFolio} onChange={(event) => { setLookupFolio(event.target.value); clearLookupState() }} />
              <input className="input-field" inputMode="tel" maxLength={10} placeholder="Celular completo" value={lookupPhone} onChange={(event) => { setLookupPhone(normalizePhone(event.target.value)); clearLookupState() }} />
              <input className="input-field" placeholder="Nombre registrado" value={lookupName} onChange={(event) => { setLookupName(event.target.value); clearLookupState() }} />
              <button className="registro-back" onClick={handleLookup} type="button">Consultar</button>
            </div>
            {lookupMessage ? <div className="app-notice error">{lookupMessage}</div> : null}
            {lookupHasSearched && lookupResults.length > 0 ? (
              <div className="lookup-table-area">
                {renderRegistroTable(lookupResults, true)}
              </div>
            ) : null}
            <div className="registro-stats">
              <article>
                <span>Aprobadas</span>
                <strong>{registroQuinielas.length}</strong>
              </article>
              <article>
                <span>Partidos</span>
                <strong>{registroMatches.length}</strong>
              </article>
              <article>
                <span>Personas en primer lugar</span>
                <strong>{registroFirstPlaceCount}</strong>
              </article>
              <article>
                <span>Personas con 0 aciertos</span>
                <strong>{registroZeroPointsCount}</strong>
              </article>
            </div>
          </section>

          <section className="registro-card">
            <div className="registro-card-head">
              <div>
                <h2>Quinielas registradas {jornadaTitle}</h2>
                <p>Vista tipo tabla para revisar cada captura sin salir del diseño principal.</p>
              </div>
              <div className="registro-actions">
                <button className="registro-export" disabled={registroRankingRows.length === 0} onClick={exportRegistroPdf} type="button">
                  Exportar PDF
                </button>
              </div>
            </div>

            <div className="ranking-filters" aria-label="Filtros de quinielas registradas">
              <select className="filter-select" value={rankingModalFilter} onChange={(event) => setRankingModalFilter(event.target.value as 'all' | Modalidad)}>
                <option value="all">Todas las modalidades</option>
                {MODALIDADES.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
              <select className="filter-select" value={rankingSortOrder} onChange={(event) => setRankingSortOrder(event.target.value as 'desc' | 'asc')}>
                <option value="desc">Mayor puntaje</option>
                <option value="asc">Menor puntaje</option>
              </select>
            </div>

            {registroQuinielas.length === 0 ? (
              <div className="registro-empty">{registroJornadaId ? 'Todavia no hay quinielas aprobadas para esta jornada.' : 'No hay una jornada vigente en este momento.'}</div>
            ) : registroRankingRows.length === 0 ? (
              <div className="registro-empty">No hay quinielas que coincidan con los filtros.</div>
            ) : (
              renderRegistroTable(registroRankingRows)
            )}
          </section>

        </main>
      ) : (
        <>
          {adminAuthenticated ? (
            <div id="admin-shell" className="visible">
              <header className="admin-topbar">
                <div className="topbar-left">
                  <div className="topbar-logo"><img src="/logo.png" alt="" /><span>Pronosticos Entre Cuates</span></div>
                  <div className="admin-pill">Admin</div>
                </div>
                <div className="topbar-tabs">
                  <button className={`tab-btn${adminTab === 'quinielas' ? ' active' : ''}`} onClick={() => setAdminTab('quinielas')} type="button">
                    📋 Quinielas
                  </button>
                  <button className={`tab-btn${adminTab === 'create' ? ' active' : ''}`} onClick={() => setAdminTab('create')} type="button">
                    ➕ Administrar partidos
                  </button>
                  <button className={`tab-btn${adminTab === 'jornadas' ? ' active' : ''}`} onClick={() => setAdminTab('jornadas')} type="button">
                    Jornadas
                  </button>
                </div>
                <div className="topbar-right">
                  <div className="admin-user">
                    Sesión: <strong>{adminEmail || '—'}</strong>
                  </div>
                  <button className="logout-btn" onClick={handleAdminLogout} type="button">
                    🚪 Salir
                  </button>
                </div>
              </header>

              <div className="admin-content">
                <div className="stats-row" id="stats-row">
                  <div className="stat-card">
                    <div className="stat-icon">📋</div>
                    <div>
                      <div className="stat-label">Total registradas</div>
                      <div className="stat-val cyan">{quinielas.length}</div>
                    </div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-icon">✅</div>
                    <div>
                      <div className="stat-label">Aceptadas</div>
                      <div className="stat-val green">{adminAcceptedCount}</div>
                    </div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-icon">⏳</div>
                    <div>
                      <div className="stat-label">Pendientes</div>
                      <div className="stat-val yellow">{adminPendingCount}</div>
                    </div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-icon">💰</div>
                    <div>
                      <div className="stat-label">Total acumulado</div>
                      <div className="stat-val green">${adminAcceptedTotalVisible.toLocaleString()}</div>
                    </div>
                  </div>
                </div>

                {adminTab === 'quinielas' ? (
                  <div id="tab-quinielas">
                    <div className="section-card">
                      <div className="section-head">
                        <h2>📋 Quinielas registradas</h2>
                        <div className="section-head-actions">
                          <span className="badge-count">{filteredAdminQuinielas.length} registro{filteredAdminQuinielas.length !== 1 ? 's' : ''}</span>
                          <button className="act-btn save" onClick={openNewAdminQuiniela} type="button">Agregar Quiniela</button>
                          <button className="act-btn admin-mobile-export" onClick={exportAdminCsv} type="button">Exportar CSV</button>
                        </div>
                      </div>
                      <div className="section-body">
                        <div className="filter-bar">
                          <input className="filter-input" placeholder="🔍 Buscar por nombre o celular…" value={adminSearch} onChange={(event) => setAdminSearch(event.target.value)} />
                          <select className="filter-select" value={adminStatusFilter} onChange={(event) => setAdminStatusFilter(event.target.value as 'all' | QuinielaStatus)}>
                            <option value="all">Estados</option>
                            <option value="pending">⏳ Pendiente</option>
                            <option value="accepted">✅ Aceptada</option>
                            <option value="cancelled">❌ Rechazada</option>
                          </select>
                          <select className="filter-select" value={adminModalFilter} onChange={(event) => setAdminModalFilter(event.target.value as 'all' | Modalidad)}>
                            <option value="all">Modalidades</option>
                            <option value="3 dobles">3 Dobles</option>
                            <option value="5 dobles">5 Dobles</option>
                          </select>
                          <select className="filter-select" value={adminPaymentFilter} onChange={(event) => setAdminPaymentFilter(event.target.value as 'all' | PaymentStatus)}>
                            <option value="all">Pagos</option>
                            <option value="pending">Pago pendiente</option>
                            <option value="paid">Pagada</option>
                            <option value="refunded">Reembolsada</option>
                          </select>
                          <button className="act-btn admin-filter-export" onClick={exportAdminCsv} type="button">Exportar CSV</button>
                        </div>
                        {filteredAdminQuinielas.length === 0 ? (
                          <div className="table-empty admin-quiniela-empty">
                            <div className="empty-icon">Buscar</div>
                            <p>No hay quinielas con ese filtro</p>
                          </div>
                        ) : (
                          <div className="admin-quiniela-cards" aria-label="Quinielas registradas">
                            {filteredAdminQuinielas.map((quiniela) => {
                              const folio = quiniela.folio ?? `#${quiniela.id}`
                              const paymentStatus = quiniela.paymentStatus ?? 'pending'
                              const prizeAmount = quiniela.prizeAmount ?? 0
                              const fechaRegistro = new Date(quiniela.fechaRegistro).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' })

                              return (
                                <article className="admin-quiniela-card" key={quiniela.id}>
                                  <div className="admin-quiniela-card-top">
                                    <div className="admin-quiniela-card-title">
                                      <span>{folio}</span>
                                      <strong>{quiniela.nombre}</strong>
                                    </div>
                                    <span className={`admin-q-status ${quiniela.status}`}>
                                      {getStatusLabel(quiniela.status)}
                                    </span>
                                  </div>

                                  <div className="admin-quiniela-card-grid">
                                    <div className="admin-q-field">
                                      <span>Celular</span>
                                      <strong>{quiniela.celular || '-'}</strong>
                                    </div>
                                    <div className="admin-q-field">
                                      <span>Modalidad</span>
                                      <strong>{quiniela.modalidad}</strong>
                                    </div>
                                    <div className="admin-q-field">
                                      <span>Dobles / Combos</span>
                                      <strong>{quiniela.doblesUsados} / {quiniela.combinaciones.length}</strong>
                                    </div>
                                    <div className="admin-q-field">
                                      <span>Costo</span>
                                      <strong className="admin-q-money">${quiniela.costo}</strong>
                                    </div>
                                    <div className="admin-q-field">
                                      <span>Pago</span>
                                      <button className={`admin-q-payment ${paymentStatus}`} onClick={() => handlePaymentChange(quiniela, paymentStatus === 'paid' ? 'pending' : 'paid')} type="button">
                                        {getPaymentLabel(paymentStatus)}
                                      </button>
                                    </div>
                                    <div className="admin-q-field">
                                      <span>Premio</span>
                                      <button className="admin-q-prize" onClick={() => handlePrize(quiniela)} type="button">
                                        ${prizeAmount.toFixed(2)}
                                      </button>
                                    </div>
                                  </div>

                                  <div className="admin-q-selections">
                                    <span>Selecciones</span>
                                    <div className="admin-q-chips">
                                      {quiniela.selecciones.map((selection, index) => (
                                        <span className={`pick-chip-sm ${getSelectionChipClass(selection)}`} key={`${quiniela.id}-${index}`}>
                                          {formatSelection(selection)}
                                        </span>
                                      ))}
                                    </div>
                                  </div>

                                  <div className="admin-q-date">
                                    <span aria-hidden="true">Reloj</span>
                                    {fechaRegistro}
                                  </div>

                                  <div className="admin-q-actions">
                                    {quiniela.status !== 'accepted' ? (
                                      <button className="admin-q-action accept" onClick={() => openConfirm('accept', quiniela.id)} type="button">
                                        Aceptar
                                      </button>
                                    ) : null}
                                    {quiniela.status !== 'cancelled' ? (
                                      <button className="admin-q-action reject" onClick={() => openConfirm('cancel', quiniela.id)} type="button">
                                        Rechazar
                                      </button>
                                    ) : null}
                                    <button className="admin-q-action icon-action edit-icon-action" onClick={() => startEditAdminQuiniela(quiniela)} type="button" title="Editar quiniela" aria-label={`Editar quiniela ${folio}`} />
                                    <button className="admin-q-action delete" onClick={() => openConfirm('delete', quiniela.id)} type="button" title="Eliminar quiniela" aria-label={`Eliminar quiniela ${folio}`} />
                                  </div>
                                </article>
                              )
                            })}
                          </div>
                        )}
                        <div className="table-wrap">
                          <table className="admin-table">
                            <thead>
                              <tr>
                                <th>Folio</th>
                                <th>Nombre</th>
                                <th>Celular</th>
                                <th>Modalidad</th>
                                <th>Selecciones</th>
                                <th>Dobles</th>
                                <th>Combos</th>
                                <th>Costo</th>
                                <th>Fecha</th>
                                <th>Estado</th>
                                <th>Pago</th>
                                <th>Premio</th>
                                <th>Acciones</th>
                              </tr>
                            </thead>
                            <tbody>
                              {filteredAdminQuinielas.length === 0 ? (
                                <tr>
                                  <td colSpan={13}>
                                    <div className="table-empty">
                                      <div className="empty-icon">🔍</div>
                                      <p>No hay quinielas con ese filtro</p>
                                    </div>
                                  </td>
                                </tr>
                              ) : (
                                filteredAdminQuinielas.map((quiniela) => (
                                  <tr key={quiniela.id}>
                                    <td>
                                      <strong>{quiniela.folio ?? `#${quiniela.id}`}</strong>
                                    </td>
                                    <td>
                                      <strong>{quiniela.nombre}</strong>
                                    </td>
                                    <td>{quiniela.celular || '—'}</td>
                                    <td>{quiniela.modalidad}</td>
                                    <td>
                                      <div className="picks-row">
                                        {quiniela.selecciones.map((selection, index) => {
                                          const isMulti = selection.seleccion.length >= 2
                                          const chipClass = isMulti ? 'multi' : selection.seleccion[0] || 'empty'

                                          return (
                                            <span className={`pick-chip-sm ${chipClass}`} key={`${quiniela.id}-${index}`}>
                                              {formatSelection(selection)}
                                            </span>
                                          )
                                        })}
                                      </div>
                                    </td>
                                    <td>{quiniela.doblesUsados}</td>
                                    <td>{quiniela.combinaciones.length}</td>
                                    <td>
                                      <strong style={{ color: 'var(--green)' }}>${quiniela.costo}</strong>
                                    </td>
                                    <td style={{ fontSize: '12px', color: 'var(--gray-mid)' }}>{new Date(quiniela.fechaRegistro).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' })}</td>
                                    <td>
                                      <span className={`status-badge ${quiniela.status}`}>
                                        {quiniela.status === 'pending' ? '⏳ Pendiente' : quiniela.status === 'accepted' ? '✅ Aceptada' : '❌ Rechazada'}
                                      </span>
                                    </td>
                                    <td>
                                      <button className="act-btn" onClick={() => handlePaymentChange(quiniela, quiniela.paymentStatus === 'paid' ? 'pending' : 'paid')} type="button">
                                        {quiniela.paymentStatus === 'paid' ? 'Pagada' : 'Pendiente'}
                                      </button>
                                    </td>
                                    <td>
                                      <button className="act-btn" onClick={() => handlePrize(quiniela)} type="button">
                                        ${(quiniela.prizeAmount ?? 0).toFixed(2)}
                                      </button>
                                    </td>
                                    <td>
                                      <div className="acts-cell">
                                        {quiniela.status !== 'accepted' ? (
                                          <button className="act-btn accept" onClick={() => openConfirm('accept', quiniela.id)} type="button">
                                            ✅ Aceptar
                                          </button>
                                        ) : null}
                                        {quiniela.status !== 'cancelled' ? (
                                          <button className="act-btn cancel" onClick={() => openConfirm('cancel', quiniela.id)} type="button">
                                            ❌ Rechazar
                                          </button>
                                        ) : null}
                                        <button className="act-btn icon-action edit-icon-action" onClick={() => startEditAdminQuiniela(quiniela)} type="button" title="Editar quiniela" aria-label={`Editar quiniela ${quiniela.folio ?? quiniela.id}`} />
                                        <button className="act-btn delete" onClick={() => openConfirm('delete', quiniela.id)} type="button">
                                          🗑
                                        </button>
                                      </div>
                                    </td>
                                  </tr>
                                ))
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : adminTab === 'create' ? (
                  <div id="tab-create">
                    <div className="section-card">
                      <div className="section-head">
                        <h2>➕ Administrar partidos</h2>
                        <div className="section-head-actions">
                          <button className="ca-btn" onClick={() => setShowLigaMxImportModal(true)} type="button">Cargar Liga MX</button>
                          <button className="ca-btn save" onClick={() => setShowAddMatchModal(true)} type="button">Agregar partido</button>
                        </div>
                      </div>
                      <div className="section-body">
                        <div className="create-grid matches-modal-layout">
                          <div>
                            <div className="matches-create-wrap">
                              <div className="matches-create-context">Jornada visible: {jornada?.nombre ?? APP_CONFIG.edition}</div>
                              <div className="matches-filter-bar">
                                <label htmlFor="match-jornada-filter">Filtrar por jornada</label>
                                <select
                                  id="match-jornada-filter"
                                  className="rp-input"
                                  value={matchJornadaFilter}
                                  onChange={(event) => setMatchJornadaFilter(event.target.value)}
                                >
                                  <option value="all">Todas las jornadas</option>
                                  {jornadas.map((item) => (
                                    <option key={item.id} value={item.id}>
                                      {item.nombre}
                                    </option>
                                  ))}
                                </select>
                                <span>{filteredAdminMatches.length} partidos</span>
                              </div>
                              <div className="matches-create-header">⚽ Partidos · {APP_CONFIG.edition}</div>
                              <div id="matches-create-list">
                                {filteredAdminMatches.length === 0 ? (
                                  <div className="match-create-empty">No hay partidos para este filtro.</div>
                                ) : null}
                                {filteredAdminMatches.map((match, index) => (
                                  <div className="match-create-row" key={match.id}>
                                    <div className="mcr-num">{index + 1}</div>

                                    {editingMatchId === match.id ? (
                                      <div className="mcr-edit-layout">
                                        <div className="mcr-edit-catalog">
                                          {renderTeamCatalogToggle()}
                                        </div>
                                        <div className="mcr-teams-edit">
                                          <div className="mcr-team-edit-block">
                                            <div className="mcr-team-edit-head">
                                              <span className="mcr-team-edit-label">Local</span>
                                              <input
                                                className="mcr-goal-input"
                                                min={0}
                                                placeholder="Goles"
                                                type="number"
                                                value={editLocalScore}
                                                onChange={(e) => setEditLocalScore(e.target.value)}
                                              />
                                            </div>
                                            <div style={{ position: 'relative' }}>
                                              <input
                                                className="rp-input"
                                                value={editLocal}
                                                onChange={(e) => {
                                                  setEditLocal(e.target.value)
                                                  setShowEditLocalSuggestions(true)
                                                }}
                                                onFocus={() => setShowEditLocalSuggestions(true)}
                                                onBlur={() => setTimeout(() => setShowEditLocalSuggestions(false), 150)}
                                              />
                                              {showEditLocalSuggestions ? (
                                                <div className="suggestions">
                                                  {filterTeams(editLocal).map((t) => (
                                                    <div
                                                      key={t}
                                                      className="suggestion-item"
                                                      onMouseDown={() => {
                                                        setEditLocal(t)
                                                        setShowEditLocalSuggestions(false)
                                                      }}
                                                    >
                                                      {t}
                                                    </div>
                                                  ))}
                                                </div>
                                              ) : null}
                                            </div>
                                          </div>
                                          <span className="mcr-vs">vs</span>
                                          <div className="mcr-team-edit-block">
                                            <div className="mcr-team-edit-head">
                                              <span className="mcr-team-edit-label">Visitante</span>
                                              <input
                                                className="mcr-goal-input"
                                                min={0}
                                                placeholder="Goles"
                                                type="number"
                                                value={editVisitanteScore}
                                                onChange={(e) => setEditVisitanteScore(e.target.value)}
                                              />
                                            </div>
                                            <div style={{ position: 'relative' }}>
                                              <input
                                                className="rp-input"
                                                value={editVisitante}
                                                onChange={(e) => {
                                                  setEditVisitante(e.target.value)
                                                  setShowEditVisitanteSuggestions(true)
                                                }}
                                                onFocus={() => setShowEditVisitanteSuggestions(true)}
                                                onBlur={() => setTimeout(() => setShowEditVisitanteSuggestions(false), 150)}
                                              />
                                              {showEditVisitanteSuggestions ? (
                                                <div className="suggestions">
                                                  {filterTeams(editVisitante).map((t) => (
                                                    <div
                                                      key={t}
                                                      className="suggestion-item"
                                                      onMouseDown={() => {
                                                        setEditVisitante(t)
                                                        setShowEditVisitanteSuggestions(false)
                                                      }}
                                                    >
                                                      {t}
                                                    </div>
                                                  ))}
                                                </div>
                                              ) : null}
                                            </div>
                                          </div>
                                        </div>
                                        <div className={`mcr-time edit`}> 
                                          <input className="rp-input" type="date" value={editDate} onChange={(e) => setEditDate(e.target.value)} />
                                          <input className="rp-input" type="time" value={editTime} onChange={(e) => setEditTime(e.target.value)} />
                                        </div>
                                        <div className="mcr-jornada-edit">
                                          <select
                                            className="rp-input"
                                            disabled={jornadas.length === 0}
                                            value={editMatchJornadaId}
                                            onChange={(event) => setEditMatchJornadaId(event.target.value)}
                                          >
                                            {jornadas.length === 0 ? <option value="">Sin jornadas</option> : null}
                                            {jornadas.map((item) => (
                                              <option key={item.id} value={item.id}>
                                                {item.nombre}
                                              </option>
                                            ))}
                                          </select>
                                        </div>
                                        <div className="mcr-actions">
                                          <button className="act-btn save" onClick={() => saveEditMatch(match.id)} type="button">Guardar</button>
                                          <button className="act-btn cancel" onClick={cancelEditMatch} type="button">Cancelar</button>
                                        </div>
                                      </div>
                                    ) : (
                                      <>
                                        <div className="mcr-teams">
                                          <span className="mcr-team-name">
                                            {match.local}
                                            <span className="mcr-score-pill">{match.localScore ?? '—'}</span>
                                          </span>
                                          <span className="mcr-vs">vs</span>
                                          <span className="mcr-team-name away">
                                            {match.visitante}
                                            <span className="mcr-score-pill">{match.visitanteScore ?? '—'}</span>
                                          </span>
                                        </div>
                                        <div className={`mcr-time ${match.timeClass === 'dom' ? 'dom' : 'sab'}`}>{formatMatchTime(match.time)}</div>
                                        <div className="mcr-actions">
                                          <button className="act-btn icon-action edit-icon-action match-icon-btn" onClick={() => startEditMatch(match)} type="button" title="Editar partido" aria-label={`Editar partido ${match.local} vs ${match.visitante}`}>Editar</button>
                                          <button className="act-btn delete match-icon-btn match-delete-icon" onClick={() => deleteMatch(match.id)} type="button" title="Eliminar partido" aria-label={`Eliminar partido ${match.local} vs ${match.visitante}`}>Eliminar</button>
                                        </div>
                                      </>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>

                          <div className="register-panel match-side-panel-hidden">
                            <div className="rp-card">
                              <div className="rp-field">
                                <div className="rp-label">Jornada destino</div>
                                <select
                                  className="rp-input"
                                  disabled={openJornadas.length === 0}
                                  value={newMatchJornadaId}
                                  onChange={(event) => setNewMatchJornadaId(event.target.value)}
                                >
                                  {openJornadas.length === 0 ? (
                                    <option value="">No hay jornadas disponibles</option>
                                  ) : null}
                                  {openJornadas.map((item) => (
                                    <option key={item.id} value={item.id}>
                                      {item.nombre}
                                    </option>
                                  ))}
                                </select>
                              </div>
                              <div className="liga-import-panel">
                                <div className="rp-title">Liga MX automatica</div>
                                <div className="mode-hint">Carga partidos de la temporada desde TheSportsDB y guardalos en la jornada seleccionada.</div>
                                <div className="liga-import-fields">
                                  <div>
                                    <div className="rp-label">Temporada</div>
                                    <input className="rp-input" value={ligaMxSeason} onChange={(event) => setLigaMxSeason(event.target.value)} placeholder="2026-2027" />
                                  </div>
                                  <div>
                                    <div className="rp-label">Jornada Liga MX</div>
                                    <input className="rp-input" inputMode="numeric" value={ligaMxRound} onChange={(event) => setLigaMxRound(event.target.value.replace(/\D/g, ''))} placeholder="Todas" />
                                  </div>
                                </div>
                                <div className="liga-import-actions">
                                  <button className="ca-btn" onClick={fetchLigaMxMatches} type="button" disabled={loadingLigaMxMatches}>
                                    {loadingLigaMxMatches ? 'Cargando...' : 'Cargar temporada'}
                                  </button>
                                  <button className="ca-btn save" onClick={saveLigaMxImportMatches} type="button" disabled={savingLigaMxMatches || ligaMxImportMatches.length === 0}>
                                    {savingLigaMxMatches ? 'Guardando...' : 'Guardar en jornada'}
                                  </button>
                                </div>
                                {ligaMxImportMessage ? <div className="liga-import-message">{ligaMxImportMessage}</div> : null}
                                {ligaMxImportMatches.length > 0 ? (
                                  <div className="liga-import-preview">
                                    {ligaMxImportMatches.map((match) => (
                                      <div className="liga-import-item" key={match.sourceId}>
                                        <strong>{match.local} vs {match.visitante}</strong>
                                        <span>{match.round ? `J${match.round} · ` : ''}{formatMatchTime(match.time)}</span>
                                      </div>
                                    ))}
                                  </div>
                                ) : null}
                              </div>
                              <div className="rp-title">➕ Agregar partido</div>
                              <div className="match-add-head">
                                {renderTeamCatalogToggle()}
                              </div>
                              <div className="rp-field">
                                <div className="rp-label">Local</div>
                                <div style={{ position: 'relative' }}>
                                  <input
                                    className="rp-input"
                                    placeholder="Equipo local"
                                    value={newMatchLocal}
                                    onChange={(e) => {
                                      setNewMatchLocal(e.target.value)
                                      setShowNewLocalSuggestions(true)
                                    }}
                                    onFocus={() => setShowNewLocalSuggestions(true)}
                                    onBlur={() => setTimeout(() => setShowNewLocalSuggestions(false), 150)}
                                  />
                                  {showNewLocalSuggestions ? (
                                    <div className="suggestions">
                                      {filterTeams(newMatchLocal).map((t) => (
                                        <div key={t} className="suggestion-item" onMouseDown={() => { setNewMatchLocal(t); setShowNewLocalSuggestions(false) }}>
                                          {t}
                                        </div>
                                      ))}
                                    </div>
                                  ) : null}
                                </div>
                              </div>
                              <div className="rp-field">
                                <div className="rp-label">Visitante</div>
                                <div style={{ position: 'relative' }}>
                                  <input
                                    className="rp-input"
                                    placeholder="Equipo visitante"
                                    value={newMatchVisitante}
                                    onChange={(e) => {
                                      setNewMatchVisitante(e.target.value)
                                      setShowNewVisitanteSuggestions(true)
                                    }}
                                    onFocus={() => setShowNewVisitanteSuggestions(true)}
                                    onBlur={() => setTimeout(() => setShowNewVisitanteSuggestions(false), 150)}
                                  />
                                  {showNewVisitanteSuggestions ? (
                                    <div className="suggestions">
                                      {filterTeams(newMatchVisitante).map((t) => (
                                        <div key={t} className="suggestion-item" onMouseDown={() => { setNewMatchVisitante(t); setShowNewVisitanteSuggestions(false) }}>
                                          {t}
                                        </div>
                                      ))}
                                    </div>
                                  ) : null}
                                </div>
                              </div>
                              <div className="rp-field">
                                <div className="rp-label">Fecha</div>
                                <input className="rp-input" type="date" value={newMatchDate} onChange={(e) => setNewMatchDate(e.target.value)} />
                              </div>
                              <div className="rp-field">
                                <div className="rp-label">Hora</div>
                                <input className="rp-input" type="time" value={newMatchTime} onChange={(e) => setNewMatchTime(e.target.value)} />
                              </div>
                              <div style={{ marginTop: 8 }}>
                                <button className="ca-btn save" onClick={addMatch} type="button">Agregar partido</button>
                              </div>
                            </div>
                            
                            
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div id="tab-jornadas">
                    <div className="section-card">
                      <div className="section-head">
                        <h2>Jornadas, cierre y premios</h2>
                        <div className="section-head-actions">
                          <button className="ca-btn save" onClick={() => setShowTournamentModal(true)} type="button">Agregar Torneo</button>
                          <button className="ca-btn save" onClick={() => setShowJornadaModal(true)} type="button">Agregar Jornada</button>
                        </div>
                      </div>
                      <div className="section-body">
                        <div className="tournament-panel">
                          <div className="jornada-match-preview-title">Torneos</div>
                          <div className="tournament-list">
                            {tournaments.length === 0 ? (
                              <div className="jornada-match-empty">Todavia no hay torneos.</div>
                            ) : tournaments.map((item) => (
                              <div className="tournament-item" key={item.id}>
                                <div>
                                  <strong>{item.nombre}</strong>
                                  <span>{item.liga} - {item.temporada}</span>
                                </div>
                                <div className="acts-cell">
                                  <span className={`status-badge ${item.status}`}>{item.status}</span>
                                  <button className="act-btn" onClick={() => startEditTournament(item)} type="button">Editar</button>
                                  {item.status !== 'active' ? <button className="act-btn" onClick={() => handleTournamentStatus(item, 'active')} type="button">Activar</button> : null}
                                  {item.status !== 'finished' ? <button className="act-btn accept" onClick={() => handleTournamentStatus(item, 'finished')} type="button">Finalizar</button> : null}
                                  <button className="act-btn delete" onClick={() => deleteTournament(item)} type="button">Eliminar</button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                        <div className="jornada-list">
                          {jornadas.map((item) => (
                            <article className="jornada-item" key={item.id}>
                              <div>
                                <strong>{item.numero ? `Jornada ${item.numero}: ${item.nombre}` : item.nombre}</strong>
                                <span>Torneo: {tournaments.find((tournament) => tournament.id === item.tournamentId)?.nombre ?? 'Sin torneo'}</span>
                                <span>Apertura: {item.openAt ? new Date(item.openAt).toLocaleString('es-MX') : 'Manual'}</span>
                                <span>{item.closeAt ? new Date(item.closeAt).toLocaleString('es-MX') : 'Sin cierre programado'}</span>
                                <span>Premios: ${item.firstPrize} / ${item.secondPrize}</span>
                              </div>
                              <div className="acts-cell">
                                <span className={`status-badge ${item.status}`}>{item.status}</span>
                                <button className="act-btn" onClick={() => startEditJornada(item)} type="button">Editar</button>
                                {item.status === 'draft' ? (
                                  <button className="act-btn publish" onClick={() => handleJornadaStatus(item, 'open')} type="button">Publicar</button>
                                ) : null}
                                {item.status !== 'draft' && item.status !== 'open' ? (
                                  <button className="act-btn" onClick={() => handleJornadaStatus(item, 'open')} type="button">Abrir</button>
                                ) : null}
                                <button className="act-btn cancel" onClick={() => handleJornadaStatus(item, 'closed')} type="button">Cerrar</button>
                                <button className="act-btn" onClick={() => handleDistributePrizes(item)} type="button">Repartir premios</button>
                                <button className="act-btn accept" onClick={() => handleJornadaStatus(item, 'finished')} type="button">Finalizar</button>
                                <button className="act-btn delete" onClick={() => deleteJornada(item)} type="button">Eliminar</button>
                              </div>
                            </article>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <footer className="admin-footer">
                ⚡ Desarrollado por <a href="#">RRAD 2026</a> · Panel de administración
              </footer>
            </div>
          ) : (
            <div id="login-screen">
              <div className="login-card">
                <div className="login-logo-wrap">
                  <div className="badge">
                    <img src="/logo.png" alt="" />
                    <span>ADMIN</span>
                  </div>
                </div>
                <div className="login-title">Acceso Admin</div>
                <div className="login-sub">Panel de control · Quinielas</div>

                <div className={`login-error${adminLoginError ? ' show' : ''}`}>❌ {adminLoginError || 'Correo o contraseña incorrectos'}</div>

                <div className="login-field">
                  <label htmlFor="login-email">📧 Correo electrónico</label>
                  <input id="login-email" className="login-input" placeholder="admin@rrad.com" type="email" value={adminLoginEmail} onChange={(event) => setAdminLoginEmail(event.target.value)} />
                </div>
                <div className="login-field">
                  <label htmlFor="login-pass">🔑 Contraseña</label>
                  <input
                    id="login-pass"
                    className="login-input"
                    placeholder="••••••••"
                    type="password"
                    value={adminLoginPassword}
                    onChange={(event) => setAdminLoginPassword(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        handleAdminLogin()
                      }
                    }}
                  />
                </div>
                <button className="login-btn" onClick={handleAdminLogin} type="button">
                  Entrar al panel
                </button>
                <div className="login-footer">⚡ Desarrollado por RRAD 2026</div>
              </div>
            </div>
          )}

          {showTournamentModal && adminAuthenticated ? (
            <div className="modal-overlay show">
              <div className="modal-card admin-form-modal">
                <div className="admin-quiniela-editor">
                  <div className="admin-quiniela-editor-head">
                    <div>
                      <h3>Agregar Torneo</h3>
                      <p>Crea el contenedor principal para agrupar jornadas.</p>
                    </div>
                    <button className="modal-close-btn" onClick={closeTournamentModal} type="button" aria-label="Cerrar modal">×</button>
                  </div>
                  <div className="modal-form-grid">
                    <label className="jornada-field">
                      <span>Nombre del torneo</span>
                      <input className="rp-input" placeholder="Apertura 2026" value={newTournamentName} onChange={(event) => setNewTournamentName(event.target.value)} />
                    </label>
                    <label className="jornada-field">
                      <span>Liga</span>
                      <input className="rp-input" placeholder="Liga MX" value={newTournamentLeague} onChange={(event) => setNewTournamentLeague(event.target.value)} />
                    </label>
                    <label className="jornada-field">
                      <span>Temporada</span>
                      <input className="rp-input" placeholder="2026-2027" value={newTournamentSeason} onChange={(event) => setNewTournamentSeason(event.target.value)} />
                    </label>
                  </div>
                  <div className="admin-quiniela-actions">
                    <button className="act-btn cancel" onClick={closeTournamentModal} type="button">Cancelar</button>
                    <button className="act-btn save" onClick={handleCreateTournament} type="button">Crear torneo</button>
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {editingTournamentId && adminAuthenticated ? (
            <div className="modal-overlay show">
              <div className="modal-card admin-form-modal">
                <div className="admin-quiniela-editor">
                  <div className="admin-quiniela-editor-head">
                    <div>
                      <h3>Editar Torneo</h3>
                      <p>Actualiza los datos generales y el estado del torneo.</p>
                    </div>
                    <button className="modal-close-btn" onClick={closeEditTournamentModal} type="button" aria-label="Cerrar modal">×</button>
                  </div>
                  <div className="modal-form-grid">
                    <label className="jornada-field">
                      <span>Nombre del torneo</span>
                      <input className="rp-input" placeholder="Apertura 2026" value={editTournamentName} onChange={(event) => setEditTournamentName(event.target.value)} />
                    </label>
                    <label className="jornada-field">
                      <span>Liga</span>
                      <input className="rp-input" placeholder="Liga MX" value={editTournamentLeague} onChange={(event) => setEditTournamentLeague(event.target.value)} />
                    </label>
                    <label className="jornada-field">
                      <span>Temporada</span>
                      <input className="rp-input" placeholder="2026-2027" value={editTournamentSeason} onChange={(event) => setEditTournamentSeason(event.target.value)} />
                    </label>
                    <label className="jornada-field">
                      <span>Estado</span>
                      <select className="rp-input" value={editTournamentStatus} onChange={(event) => setEditTournamentStatus(event.target.value as TournamentStatus)}>
                        <option value="draft">Draft</option>
                        <option value="active">Active</option>
                        <option value="finished">Finished</option>
                      </select>
                    </label>
                  </div>
                  <div className="admin-quiniela-actions">
                    <button className="act-btn cancel" onClick={closeEditTournamentModal} type="button">Cancelar</button>
                    <button className="act-btn save" onClick={saveEditTournament} type="button">Guardar cambios</button>
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {showJornadaModal && adminAuthenticated ? (
            <div className="modal-overlay show">
              <div className="modal-card admin-form-modal jornada-form-modal">
                <div className="admin-quiniela-editor">
                  <div className="admin-quiniela-editor-head">
                    <div>
                      <h3>Agregar Jornada</h3>
                      <p>Configura apertura, cierre y premios para esta jornada.</p>
                    </div>
                    <button className="modal-close-btn" onClick={closeJornadaModal} type="button" aria-label="Cerrar modal">×</button>
                  </div>
                  <div className="modal-form-grid jornada-modal-grid">
                    <label className="jornada-field">
                      <span>Torneo</span>
                      <select className="rp-input" value={newJornadaTournamentId} onChange={(event) => setNewJornadaTournamentId(event.target.value)}>
                        <option value="">Sin torneo</option>
                        {activeTournaments.map((item) => (
                          <option key={item.id} value={item.id}>{item.nombre}</option>
                        ))}
                      </select>
                    </label>
                    <label className="jornada-field">
                      <span>Numero</span>
                      <input className="rp-input" min={1} placeholder="1" type="number" value={newJornadaNumber} onChange={(event) => setNewJornadaNumber(event.target.value)} />
                    </label>
                    <label className="jornada-field">
                      <span>Nombre</span>
                      <input className="rp-input" placeholder="Nombre de la jornada" value={newJornadaName} onChange={(event) => setNewJornadaName(event.target.value)} />
                    </label>
                    <label className="jornada-field">
                      <span>Apertura</span>
                      <input className="rp-input" type="datetime-local" value={newJornadaOpen} onChange={(event) => setNewJornadaOpen(event.target.value)} />
                    </label>
                    <label className="jornada-field">
                      <span>Cierre</span>
                      <input className="rp-input" type="datetime-local" value={newJornadaClose} onChange={(event) => setNewJornadaClose(event.target.value)} />
                    </label>
                    <label className="jornada-field">
                      <span>Primer premio</span>
                      <input className="rp-input" min={0} placeholder="Primer premio" type="number" value={newJornadaFirstPrize} onChange={(event) => setNewJornadaFirstPrize(event.target.value)} />
                    </label>
                    <label className="jornada-field">
                      <span>Segundo premio</span>
                      <input className="rp-input" min={0} placeholder="Segundo premio" type="number" value={newJornadaSecondPrize} onChange={(event) => setNewJornadaSecondPrize(event.target.value)} />
                    </label>
                  </div>
                  <div className="admin-quiniela-actions">
                    <button className="act-btn cancel" onClick={closeJornadaModal} type="button">Cancelar</button>
                    <button className="act-btn save" onClick={handleCreateJornada} type="button">Crear jornada</button>
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {editingJornadaId && adminAuthenticated ? (
            <div className="modal-overlay show">
              <div className="modal-card admin-form-modal jornada-form-modal">
                <div className="admin-quiniela-editor">
                  <div className="admin-quiniela-editor-head">
                    <div>
                      <h3>Editar Jornada</h3>
                      <p>Modifica torneo, fechas, premios y notas de la jornada.</p>
                    </div>
                    <button className="modal-close-btn" onClick={cancelEditJornada} type="button" aria-label="Cerrar modal">×</button>
                  </div>
                  <div className="modal-form-grid jornada-modal-grid">
                    <label className="jornada-field">
                      <span>Torneo</span>
                      <select className="rp-input" value={editJornadaTournamentId} onChange={(event) => setEditJornadaTournamentId(event.target.value)}>
                        <option value="">Sin torneo</option>
                        {tournaments.map((tournament) => (
                          <option key={tournament.id} value={tournament.id}>{tournament.nombre}</option>
                        ))}
                      </select>
                    </label>
                    <label className="jornada-field">
                      <span>Numero</span>
                      <input className="rp-input" min={1} placeholder="1" type="number" value={editJornadaNumber} onChange={(event) => setEditJornadaNumber(event.target.value)} />
                    </label>
                    <label className="jornada-field">
                      <span>Nombre</span>
                      <input className="rp-input" placeholder="Nombre de la jornada" value={editJornadaName} onChange={(event) => setEditJornadaName(event.target.value)} />
                    </label>
                    <label className="jornada-field">
                      <span>Apertura</span>
                      <input className="rp-input" type="datetime-local" value={editJornadaOpen} onChange={(event) => setEditJornadaOpen(event.target.value)} />
                    </label>
                    <label className="jornada-field">
                      <span>Cierre</span>
                      <input className="rp-input" type="datetime-local" value={editJornadaClose} onChange={(event) => setEditJornadaClose(event.target.value)} />
                    </label>
                    <label className="jornada-field">
                      <span>Primer premio</span>
                      <input className="rp-input" min={0} placeholder="Primer premio" type="number" value={editJornadaFirstPrize} onChange={(event) => setEditJornadaFirstPrize(event.target.value)} />
                    </label>
                    <label className="jornada-field">
                      <span>Segundo premio</span>
                      <input className="rp-input" min={0} placeholder="Segundo premio" type="number" value={editJornadaSecondPrize} onChange={(event) => setEditJornadaSecondPrize(event.target.value)} />
                    </label>
                    <label className="jornada-field jornada-notes-input">
                      <span>Notas</span>
                      <textarea className="rp-input" placeholder="Notas" value={editJornadaNotes} onChange={(event) => setEditJornadaNotes(event.target.value)} />
                    </label>
                    <div className="jornada-match-preview">
                      <div className="jornada-match-preview-title">Partidos en esta jornada</div>
                      {getJornadaMatches(editingJornadaId).length === 0 ? (
                        <div className="jornada-match-empty">Esta jornada todavia no tiene partidos.</div>
                      ) : (
                        <div className="jornada-match-list">
                          {getJornadaMatches(editingJornadaId).map((match) => (
                            <div className="jornada-match-item" key={match.id}>
                              <span>{match.local}</span>
                              <strong>vs</strong>
                              <span>{match.visitante}</span>
                              <em>{formatMatchTime(match.time)}</em>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="admin-quiniela-actions">
                    <button className="act-btn cancel" onClick={cancelEditJornada} type="button">Cancelar</button>
                    {jornadas.find((item) => item.id === editingJornadaId)?.status === 'draft' ? (
                      <button className="act-btn publish" onClick={publishEditJornada} type="button">Publicar</button>
                    ) : null}
                    <button className="act-btn save" onClick={saveEditJornada} type="button">Guardar cambios</button>
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {showLigaMxImportModal && adminAuthenticated ? (
            <div className="modal-overlay show">
              <div className="modal-card admin-form-modal jornada-form-modal">
                <div className="admin-quiniela-editor">
                  <div className="admin-quiniela-editor-head">
                    <div>
                      <h3>Cargar Liga MX</h3>
                      <p>Importa partidos desde TheSportsDB y guardalos en la jornada seleccionada.</p>
                    </div>
                    <button className="modal-close-btn" onClick={() => setShowLigaMxImportModal(false)} type="button" aria-label="Cerrar modal">×</button>
                  </div>
                  <div className="modal-form-grid jornada-modal-grid">
                    <label className="jornada-field">
                      <span>Jornada destino</span>
                      <select className="rp-input" disabled={openJornadas.length === 0} value={newMatchJornadaId} onChange={(event) => setNewMatchJornadaId(event.target.value)}>
                        {openJornadas.length === 0 ? <option value="">No hay jornadas disponibles</option> : null}
                        {openJornadas.map((item) => (
                          <option key={item.id} value={item.id}>{item.nombre}</option>
                        ))}
                      </select>
                    </label>
                    <label className="jornada-field">
                      <span>Temporada</span>
                      <input className="rp-input" value={ligaMxSeason} onChange={(event) => setLigaMxSeason(event.target.value)} placeholder="2026-2027" />
                    </label>
                    <label className="jornada-field">
                      <span>Jornada Liga MX</span>
                      <input className="rp-input" inputMode="numeric" value={ligaMxRound} onChange={(event) => setLigaMxRound(event.target.value.replace(/\D/g, ''))} placeholder="Todas" />
                    </label>
                  </div>
                  <div className="liga-import-actions modal-import-actions">
                    <button className="ca-btn" onClick={fetchLigaMxMatches} type="button" disabled={loadingLigaMxMatches}>
                      {loadingLigaMxMatches ? 'Cargando...' : 'Cargar temporada'}
                    </button>
                    <button className="ca-btn save" onClick={saveLigaMxImportMatches} type="button" disabled={savingLigaMxMatches || ligaMxImportMatches.length === 0}>
                      {savingLigaMxMatches ? 'Guardando...' : 'Guardar en jornada'}
                    </button>
                  </div>
                  {ligaMxImportMessage ? <div className="liga-import-message">{ligaMxImportMessage}</div> : null}
                  {ligaMxImportMatches.length > 0 ? (
                    <div className="liga-import-preview modal-import-preview">
                      {ligaMxImportMatches.map((match) => (
                        <div className="liga-import-item" key={match.sourceId}>
                          <strong>{match.local} vs {match.visitante}</strong>
                          <span>{match.round ? `J${match.round} · ` : ''}{formatMatchTime(match.time)}</span>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}

          {showAddMatchModal && adminAuthenticated ? (
            <div className="modal-overlay show">
              <div className="modal-card admin-form-modal jornada-form-modal">
                <div className="admin-quiniela-editor">
                  <div className="admin-quiniela-editor-head">
                    <div>
                      <h3>Agregar Partido</h3>
                      <p>Captura equipos, fecha y hora para la jornada seleccionada.</p>
                    </div>
                    <button className="modal-close-btn" onClick={() => setShowAddMatchModal(false)} type="button" aria-label="Cerrar modal">×</button>
                  </div>
                  <div className="match-add-head">
                    {renderTeamCatalogToggle()}
                  </div>
                  <div className="modal-form-grid jornada-modal-grid">
                    <label className="jornada-field">
                      <span>Jornada destino</span>
                      <select className="rp-input" disabled={openJornadas.length === 0} value={newMatchJornadaId} onChange={(event) => setNewMatchJornadaId(event.target.value)}>
                        {openJornadas.length === 0 ? <option value="">No hay jornadas disponibles</option> : null}
                        {openJornadas.map((item) => (
                          <option key={item.id} value={item.id}>{item.nombre}</option>
                        ))}
                      </select>
                    </label>
                    <label className="jornada-field team-suggest-field">
                      <span>Local</span>
                      <input className="rp-input" placeholder="Equipo local" value={newMatchLocal} onChange={(event) => { setNewMatchLocal(event.target.value); setShowNewLocalSuggestions(true) }} onFocus={() => setShowNewLocalSuggestions(true)} onBlur={() => setTimeout(() => setShowNewLocalSuggestions(false), 150)} />
                      {showNewLocalSuggestions ? (
                        <div className="suggestions">
                          {filterTeams(newMatchLocal).map((team) => (
                            <div key={team} className="suggestion-item" onMouseDown={() => { setNewMatchLocal(team); setShowNewLocalSuggestions(false) }}>{team}</div>
                          ))}
                        </div>
                      ) : null}
                    </label>
                    <label className="jornada-field team-suggest-field">
                      <span>Visitante</span>
                      <input className="rp-input" placeholder="Equipo visitante" value={newMatchVisitante} onChange={(event) => { setNewMatchVisitante(event.target.value); setShowNewVisitanteSuggestions(true) }} onFocus={() => setShowNewVisitanteSuggestions(true)} onBlur={() => setTimeout(() => setShowNewVisitanteSuggestions(false), 150)} />
                      {showNewVisitanteSuggestions ? (
                        <div className="suggestions">
                          {filterTeams(newMatchVisitante).map((team) => (
                            <div key={team} className="suggestion-item" onMouseDown={() => { setNewMatchVisitante(team); setShowNewVisitanteSuggestions(false) }}>{team}</div>
                          ))}
                        </div>
                      ) : null}
                    </label>
                    <label className="jornada-field">
                      <span>Fecha</span>
                      <input className="rp-input" type="date" value={newMatchDate} onChange={(event) => setNewMatchDate(event.target.value)} />
                    </label>
                    <label className="jornada-field">
                      <span>Hora</span>
                      <input className="rp-input" type="time" value={newMatchTime} onChange={(event) => setNewMatchTime(event.target.value)} />
                    </label>
                  </div>
                  <div className="admin-quiniela-actions">
                    <button className="act-btn cancel" onClick={() => setShowAddMatchModal(false)} type="button">Cancelar</button>
                    <button className="act-btn save" onClick={addMatch} type="button">Agregar partido</button>
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {editingMatchId && adminAuthenticated ? (
            <div className="modal-overlay show">
              <div className="modal-card admin-form-modal jornada-form-modal">
                <div className="admin-quiniela-editor">
                  <div className="admin-quiniela-editor-head">
                    <div>
                      <h3>Editar Partido</h3>
                      <p>Actualiza equipos, marcador, fecha, hora y jornada.</p>
                    </div>
                    <button className="modal-close-btn" onClick={cancelEditMatch} type="button" aria-label="Cerrar modal">×</button>
                  </div>
                  <div className="match-add-head">
                    {renderTeamCatalogToggle()}
                  </div>
                  <div className="modal-form-grid jornada-modal-grid">
                    <label className="jornada-field team-suggest-field">
                      <span>Local</span>
                      <input className="rp-input" value={editLocal} onChange={(event) => { setEditLocal(event.target.value); setShowEditLocalSuggestions(true) }} onFocus={() => setShowEditLocalSuggestions(true)} onBlur={() => setTimeout(() => setShowEditLocalSuggestions(false), 150)} />
                      {showEditLocalSuggestions ? (
                        <div className="suggestions">
                          {filterTeams(editLocal).map((team) => (
                            <div key={team} className="suggestion-item" onMouseDown={() => { setEditLocal(team); setShowEditLocalSuggestions(false) }}>{team}</div>
                          ))}
                        </div>
                      ) : null}
                    </label>
                    <label className="jornada-field team-suggest-field">
                      <span>Visitante</span>
                      <input className="rp-input" value={editVisitante} onChange={(event) => { setEditVisitante(event.target.value); setShowEditVisitanteSuggestions(true) }} onFocus={() => setShowEditVisitanteSuggestions(true)} onBlur={() => setTimeout(() => setShowEditVisitanteSuggestions(false), 150)} />
                      {showEditVisitanteSuggestions ? (
                        <div className="suggestions">
                          {filterTeams(editVisitante).map((team) => (
                            <div key={team} className="suggestion-item" onMouseDown={() => { setEditVisitante(team); setShowEditVisitanteSuggestions(false) }}>{team}</div>
                          ))}
                        </div>
                      ) : null}
                    </label>
                    <label className="jornada-field">
                      <span>Goles local</span>
                      <input className="rp-input" min={0} placeholder="Goles" type="number" value={editLocalScore} onChange={(event) => setEditLocalScore(event.target.value)} />
                    </label>
                    <label className="jornada-field">
                      <span>Goles visitante</span>
                      <input className="rp-input" min={0} placeholder="Goles" type="number" value={editVisitanteScore} onChange={(event) => setEditVisitanteScore(event.target.value)} />
                    </label>
                    <label className="jornada-field">
                      <span>Fecha</span>
                      <input className="rp-input" type="date" value={editDate} onChange={(event) => setEditDate(event.target.value)} />
                    </label>
                    <label className="jornada-field">
                      <span>Hora</span>
                      <input className="rp-input" type="time" value={editTime} onChange={(event) => setEditTime(event.target.value)} />
                    </label>
                    <label className="jornada-field">
                      <span>Jornada</span>
                      <select className="rp-input" disabled={jornadas.length === 0} value={editMatchJornadaId} onChange={(event) => setEditMatchJornadaId(event.target.value)}>
                        {jornadas.length === 0 ? <option value="">Sin jornadas</option> : null}
                        {jornadas.map((item) => (
                          <option key={item.id} value={item.id}>{item.nombre}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <div className="admin-quiniela-actions">
                    <button className="act-btn cancel" onClick={cancelEditMatch} type="button">Cancelar</button>
                    <button className="act-btn save" onClick={() => saveEditMatch(editingMatchId)} type="button">Guardar cambios</button>
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {showAdminQuinielaModal && adminAuthenticated ? (
            <div className="modal-overlay show">
              <div className="modal-card admin-quiniela-modal">
                <div className="admin-quiniela-editor">
                  <div className="admin-quiniela-editor-head">
                    <div>
                      <h3>{adminEditQuinielaId ? 'Editar quiniela' : 'Agregar Quiniela'}</h3>
                      <p>{adminEditQuinielaId ? `Modificando quiniela #${adminEditQuinielaId}` : 'Crea una quiniela aceptada desde el panel de admin.'}</p>
                    </div>
                    <button className="modal-close-btn" onClick={closeAdminQuinielaModal} type="button" aria-label="Cerrar modal">×</button>
                  </div>
                  <div className="admin-quiniela-grid">
                    <div className="admin-quiniela-field">
                      <label>Nombre</label>
                      <input className="rp-input" placeholder="Nombre completo" value={adminQuinielaNombre} onChange={(event) => setAdminQuinielaNombre(event.target.value)} />
                    </div>
                    <div className="admin-quiniela-field">
                      <label>Celular</label>
                      <input className="rp-input" inputMode="tel" maxLength={10} placeholder="10 digitos" value={adminQuinielaCelular} onChange={(event) => setAdminQuinielaCelular(normalizePhone(event.target.value))} />
                    </div>
                    <div className="admin-quiniela-field">
                      <label>Modalidad</label>
                      <div className="admin-mode-options">
                        {MODALIDADES.map((option) => (
                          <button className={`mode-option${adminQuinielaModalidad === option ? ' active' : ''}`} key={option} onClick={() => handleAdminQuinielaModalidad(option)} type="button">
                            <span>{option}</span>
                            <strong>${getCosto(option)}</strong>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="admin-quiniela-summary">
                    <span>Costo: <strong>${adminQuinielaCosto}</strong></span>
                    <span>Dobles: <strong>{adminQuinielaDobles}/{adminQuinielaMaxDobles}</strong></span>
                    <span>Combinaciones: <strong>{adminQuinielaCombinaciones.length}</strong></span>
                    <span>Partidos: <strong>{adminVisibleQuinielaSelections.filter((selection) => selection.seleccion.length > 0).length}/{adminQuinielaMatches.length}</strong></span>
                  </div>
                  <div className="admin-quiniela-matches">
                    {adminQuinielaMatches.length === 0 ? (
                      <div className="jornada-match-empty">Esta jornada todavia no tiene partidos.</div>
                    ) : adminQuinielaMatches.map((match) => {
                      const currentSelection = adminQuinielaSelections.find((selection) => selection.partidoId === match.id)?.seleccion ?? []

                      return (
                        <div className="admin-quiniela-match" key={match.id}>
                          <div className="admin-quiniela-match-name">
                            <div className="admin-quiniela-team">
                              {renderTeamLogo(match.local, '⚽', 'admin-quiniela-logo')}
                              <strong>{match.local}</strong>
                            </div>
                            <span>vs</span>
                            <div className="admin-quiniela-team away">
                              <strong>{match.visitante}</strong>
                              {renderTeamLogo(match.visitante, '⚽', 'admin-quiniela-logo')}
                            </div>
                          </div>
                          <div className="lev-group">
                            {(['L', 'E', 'V'] as PickOption[]).map((option) => (
                              <button
                                className={`lev-btn ${currentSelection.includes(option) ? `active-${option}` : ''}`}
                                key={option}
                                onClick={() => handleAdminQuinielaSelection(match.id, option)}
                                type="button"
                              >
                                {option}
                              </button>
                            ))}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  <div className="admin-quiniela-actions admin-quiniela-modal-actions">
                    <button
                      className="act-btn save admin-modal-confirm"
                      disabled={savingAdminQuiniela || !adminQuinielaCompleta || !adminQuinielaNombreValido || !adminQuinielaCelularValido || adminQuinielaDobles > adminQuinielaMaxDobles}
                      onClick={saveAdminQuiniela}
                      type="button"
                    >
                      <span className="admin-modal-action-icon">✓</span>
                      <span>{savingAdminQuiniela ? 'Guardando...' : adminEditQuinielaId ? 'Guardar cambios' : 'Crear quiniela'}</span>
                    </button>
                    <button className="act-btn cancel admin-modal-reject" onClick={closeAdminQuinielaModal} type="button">
                      <span className="admin-modal-action-icon">×</span>
                      <span>Cancelar</span>
                    </button>
                    <button className="act-btn admin-modal-icon admin-modal-random" onClick={randomAdminQuiniela} type="button" title="Aleatorio" aria-label="Aleatorio">
                      <span className="admin-modal-action-icon">✎</span>
                      <span>Aleatorio</span>
                    </button>
                    <button className="act-btn delete admin-modal-icon admin-modal-clear" onClick={clearAdminQuinielaForm} type="button" title="Limpiar" aria-label="Limpiar">
                      <span className="admin-modal-action-icon">🗑</span>
                      <span>Limpiar</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {toast ? <div className={`toast ${toast.kind} show`}>{toast.message}</div> : null}

          {paymentModalQuiniela && adminAuthenticated ? (
            <div className="modal-overlay show">
              <div className="modal-card admin-form-modal">
                <div className="admin-quiniela-editor">
                  <div className="admin-quiniela-editor-head">
                    <div>
                      <h3>Referencia de Pago</h3>
                      <p>{paymentModalQuiniela.folio ?? `#${paymentModalQuiniela.id}`} · {paymentModalQuiniela.nombre}</p>
                    </div>
                    <button className="modal-close-btn" onClick={closePaymentModal} type="button" aria-label="Cerrar modal">×</button>
                  </div>
                  <div className="modal-form-grid">
                    <label className="jornada-field modal-field-full">
                      <span>Referencia</span>
                      <input
                        className="rp-input"
                        autoFocus
                        placeholder="Referencia de pago"
                        value={paymentReferenceInput}
                        onChange={(event) => setPaymentReferenceInput(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            savePaymentReference()
                          }
                        }}
                      />
                    </label>
                  </div>
                  <div className="admin-quiniela-actions">
                    <button className="act-btn cancel" onClick={closePaymentModal} type="button">Cancelar</button>
                    <button className="act-btn save" onClick={savePaymentReference} type="button">Guardar referencia</button>
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {prizeModalQuiniela && adminAuthenticated ? (
            <div className="modal-overlay show">
              <div className="modal-card admin-form-modal">
                <div className="admin-quiniela-editor">
                  <div className="admin-quiniela-editor-head">
                    <div>
                      <h3>Monto del Premio</h3>
                      <p>{prizeModalQuiniela.folio ?? `#${prizeModalQuiniela.id}`} · {prizeModalQuiniela.nombre}</p>
                    </div>
                    <button className="modal-close-btn" onClick={closePrizeModal} type="button" aria-label="Cerrar modal">×</button>
                  </div>
                  <div className="modal-form-grid">
                    <label className="jornada-field modal-field-full">
                      <span>Monto</span>
                      <input
                        className="rp-input"
                        autoFocus
                        min={0}
                        placeholder="0"
                        type="number"
                        value={prizeAmountInput}
                        onChange={(event) => setPrizeAmountInput(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            savePrizeAmount()
                          }
                        }}
                      />
                    </label>
                  </div>
                  <div className="admin-quiniela-actions">
                    <button className="act-btn cancel" onClick={closePrizeModal} type="button">Cancelar</button>
                    <button className="act-btn save" onClick={savePrizeAmount} type="button">Guardar monto</button>
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {adminDeleteConfirm ? (
            <div className="modal-overlay show">
              <div className="modal-card">
                <div className="modal-title">
                  {adminDeleteConfirm.type === 'tournament' ? 'Eliminar torneo' : 'Eliminar jornada'}
                </div>
                <div className="modal-body">
                  {adminDeleteConfirm.type === 'tournament' ? (
                    <>
                      Se eliminara el torneo <strong>{adminDeleteConfirm.name}</strong>. Esta accion no se puede deshacer.
                    </>
                  ) : (
                    <>
                      Se eliminara la jornada <strong>{adminDeleteConfirm.name}</strong>, junto con sus partidos, quinielas y selecciones. Esta accion no se puede deshacer.
                    </>
                  )}
                </div>
                <div className="modal-actions">
                  <button className="modal-btn" onClick={closeAdminDeleteConfirm} type="button">
                    Cancelar
                  </button>
                  <button className="modal-btn confirm-cancel" onClick={runAdminDeleteConfirm} type="button">
                    Eliminar
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          {confirmAction ? (
            <div className="modal-overlay show">
              <div className="modal-card">
                <div className="modal-title">
                  {confirmAction.type === 'accept' ? '✅ Aceptar quiniela' : confirmAction.type === 'cancel' ? '❌ Rechazar quiniela' : '🗑 Eliminar quiniela'}
                </div>
                <div className="modal-body">
                  {confirmQuiniela ? (
                    <>
                      {confirmAction.type === 'accept' ? '¿Aceptar' : confirmAction.type === 'cancel' ? '¿Rechazar' : '¿Eliminar permanentemente'} la quiniela de <strong>{confirmQuiniela.nombre}</strong>?
                      {confirmAction.type === 'delete' ? ' Esta acción no se puede deshacer.' : confirmAction.type === 'accept' ? ` Esto la marcará como válida y sumará $${confirmQuiniela.costo}.` : ' Esta acción la marcará como cancelada.'}
                    </>
                  ) : (
                    '¿Estás seguro?'
                  )}
                </div>
                <div className="modal-actions">
                  <button className="modal-btn" onClick={closeConfirm} type="button">
                    Cancelar
                  </button>
                  <button className={`modal-btn ${confirmAction.type === 'accept' ? 'confirm-accept' : 'confirm-cancel'}`} onClick={runConfirmAction} type="button">
                    {confirmAction.type === 'accept' ? 'Aceptar' : confirmAction.type === 'cancel' ? 'Rechazar' : 'Eliminar'}
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </>
      )}

      {activeView !== 'admin' ? (
        <footer className="footer">
          Desarrollado por <a href="#">RRAD 2026</a> - Todos los derechos reservados
        </footer>
      ) : null}
    </div>
  )
}
export default App
