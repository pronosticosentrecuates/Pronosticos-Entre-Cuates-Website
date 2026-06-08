export const APP_CONFIG = {
  edition: import.meta.env.VITE_EDITION_NAME || 'Fin de semana',
  closeLabel: import.meta.env.VITE_CLOSE_LABEL || 'Por definir',
  closeTime: import.meta.env.VITE_CLOSE_TIME || '',
  firstPrize: import.meta.env.VITE_FIRST_PRIZE || 'Por definir',
  secondPrize: import.meta.env.VITE_SECOND_PRIZE || 'Por definir',
} as const

export const TEAM_LOGOS: Record<string, string> = {
  'Cruz Azul': 'https://r2.thesportsdb.com/images/media/team/badge/cf4ozx1655760184.png',
  Pumas: 'https://r2.thesportsdb.com/images/media/team/badge/o01nvl1695734937.png',
  América: 'https://r2.thesportsdb.com/images/media/team/badge/amy1xs1581857392.png',
  Atlas: 'https://r2.thesportsdb.com/images/media/team/badge/svvyvw1473541813.png',
  'Atletico de San Luis': 'https://r2.thesportsdb.com/images/media/team/badge/9kgjme1593448412.png',
  'CD Guadalajara': 'https://r2.thesportsdb.com/images/media/team/badge/mp1box1593452087.png',
  Juárez: 'https://r2.thesportsdb.com/images/media/team/badge/b4oy071567446336.png',
  León: 'https://r2.thesportsdb.com/images/media/team/badge/pc9gro1752393439.png',
  Mazatlán: 'https://r2.thesportsdb.com/images/media/team/badge/fgpobf1593446489.png',
  Monterrey: 'https://r2.thesportsdb.com/images/media/team/badge/tqdk9e1779772432.png',
  Necaxa: 'https://r2.thesportsdb.com/images/media/team/badge/k9duyw1747334895.png',
  Pachuca: 'https://r2.thesportsdb.com/images/media/team/badge/h0jgg51593451845.png',
  Puebla: 'https://r2.thesportsdb.com/images/media/team/badge/o01nvl1695734937.png',
  Querétaro: 'https://r2.thesportsdb.com/images/media/team/badge/kg9gzh1779771734.png',
  'Santos Laguna': 'https://r2.thesportsdb.com/images/media/team/badge/lh80fx1701423708.png',
  Tigres: 'https://r2.thesportsdb.com/images/media/team/badge/b0mky81779772352.png',
  Tijuana: 'https://r2.thesportsdb.com/images/media/team/badge/b0mky81779772352.png',
  Toluca: 'https://r2.thesportsdb.com/images/media/team/badge/y64wy91523913186.png',
}
