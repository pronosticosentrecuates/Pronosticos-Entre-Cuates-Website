export const APP_CONFIG = {
  edition: import.meta.env.VITE_EDITION_NAME || 'Fin de semana',
  closeLabel: import.meta.env.VITE_CLOSE_LABEL || 'Por definir',
  closeTime: import.meta.env.VITE_CLOSE_TIME || '',
  firstPrize: import.meta.env.VITE_FIRST_PRIZE || 'Por definir',
  secondPrize: import.meta.env.VITE_SECOND_PRIZE || 'Por definir',
} as const

const COUNTRY_FLAG_CODES = [
  'ad', 'ae', 'af', 'ag', 'ai', 'al', 'am', 'ao', 'ar', 'as', 'at', 'au', 'aw', 'ax', 'az',
  'ba', 'bb', 'bd', 'be', 'bf', 'bg', 'bh', 'bi', 'bj', 'bl', 'bm', 'bn', 'bo', 'bq', 'br', 'bs', 'bt', 'bw', 'by', 'bz',
  'ca', 'cc', 'cd', 'cf', 'cg', 'ch', 'ci', 'ck', 'cl', 'cm', 'cn', 'co', 'cr', 'cu', 'cv', 'cw', 'cx', 'cy', 'cz',
  'de', 'dj', 'dk', 'dm', 'do', 'dz',
  'ec', 'ee', 'eg', 'eh', 'er', 'es', 'et',
  'fi', 'fj', 'fk', 'fm', 'fo', 'fr',
  'ga', 'gb', 'gb-eng', 'gb-nir', 'gb-sct', 'gb-wls', 'gd', 'ge', 'gf', 'gg', 'gh', 'gi', 'gl', 'gm', 'gn', 'gp', 'gq', 'gr', 'gt', 'gu', 'gw', 'gy',
  'hk', 'hn', 'hr', 'ht', 'hu',
  'id', 'ie', 'il', 'im', 'in', 'iq', 'ir', 'is', 'it',
  'je', 'jm', 'jo', 'jp',
  'ke', 'kg', 'kh', 'ki', 'km', 'kn', 'kp', 'kr', 'kw', 'ky', 'kz',
  'la', 'lb', 'lc', 'li', 'lk', 'lr', 'ls', 'lt', 'lu', 'lv', 'ly',
  'ma', 'mc', 'md', 'me', 'mf', 'mg', 'mh', 'mk', 'ml', 'mm', 'mn', 'mo', 'mp', 'mq', 'mr', 'ms', 'mt', 'mu', 'mv', 'mw', 'mx', 'my', 'mz',
  'na', 'nc', 'ne', 'nf', 'ng', 'ni', 'nl', 'no', 'np', 'nr', 'nu', 'nz',
  'om',
  'pa', 'pe', 'pf', 'pg', 'ph', 'pk', 'pl', 'pm', 'pn', 'pr', 'ps', 'pt', 'pw', 'py',
  'qa',
  're', 'ro', 'rs', 'ru', 'rw',
  'sa', 'sb', 'sc', 'sd', 'se', 'sg', 'sh', 'si', 'sk', 'sl', 'sm', 'sn', 'so', 'sr', 'ss', 'st', 'sv', 'sx', 'sy', 'sz',
  'tc', 'td', 'tg', 'th', 'tj', 'tk', 'tl', 'tm', 'tn', 'to', 'tr', 'tt', 'tv', 'tw', 'tz',
  'ua', 'ug', 'us', 'uy', 'uz',
  'va', 'vc', 've', 'vg', 'vi', 'vn', 'vu',
  'wf', 'ws', 'xk',
  'ye', 'yt',
  'za', 'zm', 'zw',
] as const

const COUNTRY_NAME_OVERRIDES: Record<string, string[]> = {
  'gb-eng': ['Inglaterra'],
  'gb-nir': ['Irlanda del Norte'],
  'gb-sct': ['Escocia'],
  'gb-wls': ['Gales'],
  nl: ['Holanda'],
}

const countryNameFormatterEs = new Intl.DisplayNames(['es-MX'], { type: 'region' })
const countryNameFormatterEn = new Intl.DisplayNames(['en'], { type: 'region' })

const COUNTRY_LOGOS = Object.fromEntries(
  COUNTRY_FLAG_CODES.flatMap((code) => {
    const flagPath = `https://flagcdn.com/${code}.svg`
    const regionNames = code.startsWith('gb-') ? [] : [
      countryNameFormatterEs.of(code.toUpperCase()),
      countryNameFormatterEn.of(code.toUpperCase()),
    ]
    const names = [
      ...regionNames,
      ...(COUNTRY_NAME_OVERRIDES[code] ?? []),
    ].filter((name): name is string => Boolean(name))
    const [name] = names
    return name ? [[name, flagPath]] : []
  }),
) as Record<string, string>

const CLUB_LOGOS: Record<string, string> = {
  America: '/logos_equipos/liga-mx/america.svg',
  América: '/logos_equipos/liga-mx/america.svg',
  'Club America': '/logos_equipos/liga-mx/america.svg',
  Atlas: '/logos_equipos/liga-mx/atlas.svg',
  Atlante: '/logos_equipos/liga-mx/atlante.svg',
  'Atletico de San Luis': '/logos_equipos/liga-mx/san_luis.svg',
  'Atletico San Luis': '/logos_equipos/liga-mx/san_luis.svg',
  'Atl. San Luis': '/logos_equipos/liga-mx/san_luis.svg',
  'San Luis': '/logos_equipos/liga-mx/san_luis.svg',
  'CD Guadalajara': '/logos_equipos/liga-mx/chivas.svg',
  Chivas: '/logos_equipos/liga-mx/chivas.svg',
  Guadalajara: '/logos_equipos/liga-mx/chivas.svg',
  Correcaminos: '/logos_equipos/liga-mx/correcaminos.svg',
  'Correcaminos UAT': '/logos_equipos/liga-mx/correcaminos.svg',
  'Cruz Azul': '/logos_equipos/liga-mx/cruz_azul.svg',
  Juarez: '/logos_equipos/liga-mx/juarez.svg',
  Juárez: '/logos_equipos/liga-mx/juarez.svg',
  'FC Juarez': '/logos_equipos/liga-mx/juarez.svg',
  Leon: '/logos_equipos/liga-mx/leon.svg',
  León: '/logos_equipos/liga-mx/leon.svg',
  'Club Leon': '/logos_equipos/liga-mx/leon.svg',
  Monterrey: '/logos_equipos/liga-mx/monterrey.svg',
  Mineros: '/logos_equipos/liga-mx/mineros.svg',
  'Mineros de Zacatecas': '/logos_equipos/liga-mx/mineros.svg',
  Necaxa: '/logos_equipos/liga-mx/necaxa.svg',
  Pachuca: '/logos_equipos/liga-mx/pachuca.svg',
  Puebla: '/logos_equipos/liga-mx/puebla.svg',
  Pumas: '/logos_equipos/liga-mx/pumas.svg',
  'Pumas UNAM': '/logos_equipos/liga-mx/pumas.svg',
  'UNAM Pumas': '/logos_equipos/liga-mx/pumas.svg',
  'U.N.A.M.': '/logos_equipos/liga-mx/pumas.svg',
  'Club Universidad Nacional': '/logos_equipos/liga-mx/pumas.svg',
  Queretaro: '/logos_equipos/liga-mx/queretaro.svg',
  Querétaro: '/logos_equipos/liga-mx/queretaro.svg',
  Santos: '/logos_equipos/liga-mx/santos.svg',
  'Santos Laguna': '/logos_equipos/liga-mx/santos.svg',
  Tigres: '/logos_equipos/liga-mx/tigres.svg',
  'Tigres UANL': '/logos_equipos/liga-mx/tigres.svg',
  'UANL Tigres': '/logos_equipos/liga-mx/tigres.svg',
  'Club Tigres': '/logos_equipos/liga-mx/tigres.svg',
  'Tigres de la UANL': '/logos_equipos/liga-mx/tigres.svg',
  Tijuana: '/logos_equipos/liga-mx/tijuana.svg',
  Toluca: '/logos_equipos/liga-mx/toluca.svg',
}

const MLS_CLUB_LOGOS: Record<string, string> = {
  'Charlotte FC': '/logos_equipos/mls/charlotte-fc.svg',
  'FC Cincinnati': '/logos_equipos/mls/cincinnati.svg',
  Cincinnati: '/logos_equipos/mls/cincinnati.svg',
  'Columbus Crew': '/logos_equipos/mls/columbus.svg',
  'Columbus C.': '/logos_equipos/mls/columbus.svg',
  'FC Dallas': '/logos_equipos/mls/dallas.svg',
  'Inter Miami CF': '/logos_equipos/mls/inter-miami.svg',
  'Inter Miami': '/logos_equipos/mls/inter-miami.svg',
  'Los Angeles Football Club': '/logos_equipos/mls/lafc.svg',
  LAFC: '/logos_equipos/mls/lafc.svg',
  'Minnesota United FC': '/logos_equipos/mls/minnesota.svg',
  Minnesota: '/logos_equipos/mls/minnesota.svg',
  'New York City Football Club': '/logos_equipos/mls/nyc.svg',
  'New York City FC': '/logos_equipos/mls/nyc.svg',
  'NYC FC': '/logos_equipos/mls/nyc.svg',
  'Portland Timbers': '/logos_equipos/mls/portland.svg',
  'Portland T.': '/logos_equipos/mls/portland.svg',
}

// Agrega aquí los escudos restantes cuando estén disponibles en public/logos_equipos/expansion.
const EXPANSION_CLUB_LOGOS: Record<string, string> = {
  'Cancún FC': '/logos_equipos/expansion/cancun.svg',
  'Cancun FC': '/logos_equipos/expansion/cancun.svg',
  Cancún: '/logos_equipos/expansion/cancun.svg',
  Cancun: '/logos_equipos/expansion/cancun.svg',
  Tapatío: '/logos_equipos/expansion/tapatio.svg',
  Tapatio: '/logos_equipos/expansion/tapatio.svg',
  'CD Tapatío': '/logos_equipos/expansion/tapatio.svg',
}

// Escudos de Premier League en public/logos_equipos/premier-league.
const PREMIER_LEAGUE_CLUB_LOGOS: Record<string, string> = {
  Arsenal: '/logos_equipos/premier-league/arsenal.svg',
  'Aston Villa': '/logos_equipos/premier-league/aston-villa.svg',
  Bournemouth: '/logos_equipos/premier-league/bournemouth.svg',
  Brentford: '/logos_equipos/premier-league/brentford.svg',
  'Brighton & Hove Albion': '/logos_equipos/premier-league/brighton.svg',
  Chelsea: '/logos_equipos/premier-league/chelsea.svg',
  'Coventry City': '/logos_equipos/premier-league/coventry-city.svg',
  'Crystal Palace': '/logos_equipos/premier-league/crystal-palace.svg',
  Everton: '/logos_equipos/premier-league/everton.svg',
  Fulham: '/logos_equipos/premier-league/fulham.svg',
  'Hull City': '/logos_equipos/premier-league/hull-city.svg',
  'Ipswich Town': '/logos_equipos/premier-league/ipswich-town.svg',
  'Leeds United': '/logos_equipos/premier-league/leeds-united.svg',
  Liverpool: '/logos_equipos/premier-league/liverpool.svg',
  'Manchester City': '/logos_equipos/premier-league/manchester-city.svg',
  'Manchester United': '/logos_equipos/premier-league/manchester-united.svg',
  'Newcastle United': '/logos_equipos/premier-league/newcastle-united.svg',
  'Nottingham Forest': '/logos_equipos/premier-league/nottingham-forest.svg',
  Sunderland: '/logos_equipos/premier-league/sunderland.svg',
  'Tottenham Hotspur': '/logos_equipos/premier-league/tottenham-hotspur.svg',
}

const LIGA_MX_TEAM_DISPLAY_NAMES = [
  'América',
  'Atlas',
  'Atlante',
  'Atletico de San Luis',
  'Chivas',
  'Cruz Azul',
  'Juárez',
  'León',
  'Monterrey',
  'Necaxa',
  'Pachuca',
  'Puebla',
  'Pumas',
  'Querétaro',
  'Santos Laguna',
  'Tigres',
  'Tijuana',
  'Toluca',
]

// Participantes del Apertura 2026, verificados el 28 de septiembre de 2026:
// https://www.foxsports.com.mx/2026/07/23/liga-de-expansion-que-clubes-se-fueron-y-cuales-siguen-en-el-torneo-para-la-temporada-2627/
const EXPANSION_TEAM_DISPLAY_NAMES = [
  'Alacranes de Durango',
  'Alebrijes de Oaxaca',
  'Atlético La Paz',
  'Atlético Morelia',
  'Cancún FC',
  'Correcaminos',
  'Cruz Azul Hidalgo',
  'Dorados de Sinaloa',
  'Jaiba Brava',
  'Leones Negros UDG',
  'Mineros de Zacatecas',
  'Piratas FC',
  'Tapatío',
  'Tepatitlán FC',
  'Tlaxcala FC',
  'Venados FC',
]

const MLS_TEAM_DISPLAY_NAMES = [
  'Atlanta United',
  'Austin FC',
  'Charlotte FC',
  'Chicago Fire FC',
  'FC Cincinnati',
  'Colorado Rapids',
  'Columbus Crew',
  'D.C. United',
  'FC Dallas',
  'Houston Dynamo FC',
  'Sporting Kansas City',
  'LA Galaxy',
  'Los Angeles Football Club',
  'Inter Miami CF',
  'Minnesota United FC',
  'CF Montréal',
  'Nashville SC',
  'New England Revolution',
  'Red Bull New York',
  'New York City Football Club',
  'Orlando City',
  'Philadelphia Union',
  'Portland Timbers',
  'Real Salt Lake',
  'San Diego FC',
  'San Jose Earthquakes',
  'Seattle Sounders FC',
  'St. Louis CITY SC',
  'Toronto FC',
  'Vancouver Whitecaps FC',
]

// Participantes de la temporada 2026/27, verificados el 23 de noviembre de 2026:
// https://www.premierleague.com/en/news/4672981/premier-league-club-kits-for-202627-season
const PREMIER_LEAGUE_TEAM_DISPLAY_NAMES = [
  'Arsenal',
  'Aston Villa',
  'Bournemouth',
  'Brentford',
  'Brighton & Hove Albion',
  'Chelsea',
  'Coventry City',
  'Crystal Palace',
  'Everton',
  'Fulham',
  'Hull City',
  'Ipswich Town',
  'Leeds United',
  'Liverpool',
  'Manchester City',
  'Manchester United',
  'Newcastle United',
  'Nottingham Forest',
  'Sunderland',
  'Tottenham Hotspur',
]

export const TEAM_LOGOS: Record<string, string> = {
  ...COUNTRY_LOGOS,
  ...CLUB_LOGOS,
  ...EXPANSION_CLUB_LOGOS,
  ...MLS_CLUB_LOGOS,
  ...PREMIER_LEAGUE_CLUB_LOGOS,
}

export function getTeamLogoSource(teamName: string) {
  const normalizedTeamName = teamName.trim().toLowerCase()
  return TEAM_LOGOS[teamName]
    ?? Object.entries(TEAM_LOGOS).find(([name]) => name.trim().toLowerCase() === normalizedTeamName)?.[1]
}

export function getTeamDisplayName(teamName: string) {
  const normalizedTeamName = teamName.trim().toLowerCase()

  if (normalizedTeamName === 'cd guadalajara' || normalizedTeamName === 'guadalajara') {
    return 'Chivas'
  }

  if (normalizedTeamName === 'correcaminos') {
    return 'Correcaminos'
  }

  return teamName
}

export const LIGA_MX_TEAM_NAMES = LIGA_MX_TEAM_DISPLAY_NAMES
export const EXPANSION_TEAM_NAMES = EXPANSION_TEAM_DISPLAY_NAMES
export const MLS_TEAM_NAMES = MLS_TEAM_DISPLAY_NAMES
export const PREMIER_LEAGUE_TEAM_NAMES = PREMIER_LEAGUE_TEAM_DISPLAY_NAMES
export const INTERNATIONAL_TEAM_NAMES = Object.keys(COUNTRY_LOGOS)
