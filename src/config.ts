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
  America: '/logos_equipos/america.svg',
  América: '/logos_equipos/america.svg',
  'Club America': '/logos_equipos/america.svg',
  Atlas: '/logos_equipos/atlas.svg',
  Atlante: '/logos_equipos/atlante.svg',
  'Atletico de San Luis': '/logos_equipos/san_luis.svg',
  'Atl. San Luis': '/logos_equipos/san_luis.svg',
  'CD Guadalajara': '/logos_equipos/chivas.svg',
  Chivas: '/logos_equipos/chivas.svg',
  Guadalajara: '/logos_equipos/chivas.svg',
  'Cruz Azul': '/logos_equipos/cruz_azul.svg',
  Juarez: '/logos_equipos/juarez.svg',
  Juárez: '/logos_equipos/juarez.svg',
  'FC Juarez': '/logos_equipos/juarez.svg',
  Leon: '/logos_equipos/leon.svg',
  León: '/logos_equipos/leon.svg',
  'Club Leon': '/logos_equipos/leon.svg',
  Monterrey: '/logos_equipos/monterrey.svg',
  Necaxa: '/logos_equipos/necaxa.svg',
  Pachuca: '/logos_equipos/pachuca.svg',
  Puebla: '/logos_equipos/puebla.svg',
  Pumas: '/logos_equipos/pumas.svg',
  'Pumas UNAM': '/logos_equipos/pumas.svg',
  'UNAM Pumas': '/logos_equipos/pumas.svg',
  'U.N.A.M.': '/logos_equipos/pumas.svg',
  'Club Universidad Nacional': '/logos_equipos/pumas.svg',
  Queretaro: '/logos_equipos/queretaro.svg',
  Querétaro: '/logos_equipos/queretaro.svg',
  Santos: '/logos_equipos/santos.svg',
  'Santos Laguna': '/logos_equipos/santos.svg',
  Tigres: '/logos_equipos/tigres.svg',
  'Tigres UANL': '/logos_equipos/tigres.svg',
  'UANL Tigres': '/logos_equipos/tigres.svg',
  'Club Tigres': '/logos_equipos/tigres.svg',
  'Tigres de la UANL': '/logos_equipos/tigres.svg',
  Tijuana: '/logos_equipos/tijuana.svg',
  Toluca: '/logos_equipos/toluca.svg',
}

const LIGA_MX_TEAM_DISPLAY_NAMES = [
  'América',
  'Atlas',
  'Atlante',
  'Atletico de San Luis',
  'CD Guadalajara',
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

export const TEAM_LOGOS: Record<string, string> = {
  ...COUNTRY_LOGOS,
  ...CLUB_LOGOS,
}

export const LIGA_MX_TEAM_NAMES = LIGA_MX_TEAM_DISPLAY_NAMES
export const INTERNATIONAL_TEAM_NAMES = Object.keys(COUNTRY_LOGOS)
