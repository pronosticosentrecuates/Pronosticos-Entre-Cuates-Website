import type { jsPDF } from 'jspdf'
import { getTeamLogoSource } from './config'
import type { Match } from './data'

export type PdfTeamLogoDataUrls = Map<string, string>

type PdfTableCell = {
  x: number
  y: number
  width: number
  height: number
}

const PDF_LOGO_SIZE = 96
const pdfLogoDataUrlCache = new Map<string, Promise<string | null>>()

export function getPdfTeamLabel(teamName: string) {
  return teamName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .slice(0, 3)
    .toUpperCase()
}

export function getPdfMatchHeader(match: Match) {
  return `${getPdfTeamLabel(match.local)} ${match.localScore ?? '-'}\nvs\n${getPdfTeamLabel(match.visitante)} ${match.visitanteScore ?? '-'}`
}

export function sortPdfRowsByPoints<T extends { id: number; folio?: string }>(
  rows: T[],
  getPoints: (row: T) => number,
) {
  return [...rows].sort((a, b) => {
    const pointsOrder = getPoints(b) - getPoints(a)
    if (pointsOrder !== 0) return pointsOrder

    const folioOrder = String(a.folio ?? a.id).localeCompare(
      String(b.folio ?? b.id),
      'es',
      { numeric: true, sensitivity: 'base' },
    )
    return folioOrder || a.id - b.id
  })
}

function rasterizePdfLogo(source: string) {
  const cachedLogo = pdfLogoDataUrlCache.get(source)
  if (cachedLogo) return cachedLogo

  const logoPromise = (async () => {
    try {
      const response = await fetch(source, { cache: 'force-cache' })
      if (!response.ok) return null

      const logoBlob = await response.blob()
      const logoUrl = URL.createObjectURL(logoBlob)

      try {
        const image = new Image()
        await new Promise<void>((resolve, reject) => {
          image.addEventListener('load', () => resolve(), { once: true })
          image.addEventListener('error', () => reject(new Error(`No se pudo cargar ${source}`)), { once: true })
          image.src = logoUrl
        })

        const canvas = document.createElement('canvas')
        canvas.width = PDF_LOGO_SIZE
        canvas.height = PDF_LOGO_SIZE
        const context = canvas.getContext('2d')
        if (!context) return null

        const naturalWidth = Math.max(image.naturalWidth, 1)
        const naturalHeight = Math.max(image.naturalHeight, 1)
        const scale = Math.min(PDF_LOGO_SIZE / naturalWidth, PDF_LOGO_SIZE / naturalHeight)
        const drawWidth = naturalWidth * scale
        const drawHeight = naturalHeight * scale
        context.drawImage(
          image,
          (PDF_LOGO_SIZE - drawWidth) / 2,
          (PDF_LOGO_SIZE - drawHeight) / 2,
          drawWidth,
          drawHeight,
        )
        return canvas.toDataURL('image/png')
      } finally {
        URL.revokeObjectURL(logoUrl)
      }
    } catch (error) {
      console.warn(`No se pudo preparar el escudo ${source} para el PDF.`, error)
      return null
    }
  })()

  pdfLogoDataUrlCache.set(source, logoPromise)
  return logoPromise
}

export async function loadPdfTeamLogoDataUrls(matches: Match[]) {
  const teamNames = [...new Set(matches.flatMap((match) => [match.local, match.visitante]))]
  const logoDataUrls: PdfTeamLogoDataUrls = new Map()

  await Promise.all(teamNames.map(async (teamName) => {
    const logoSource = getTeamLogoSource(teamName)
    if (!logoSource) return

    const logoDataUrl = await rasterizePdfLogo(logoSource)
    if (logoDataUrl) logoDataUrls.set(teamName, logoDataUrl)
  }))

  return logoDataUrls
}

function drawPdfTeamScore(
  pdf: jsPDF,
  centerX: number,
  centerY: number,
  teamName: string,
  score: number | null | undefined,
  logoDataUrls: PdfTeamLogoDataUrls,
) {
  const scoreLabel = String(score ?? '-')
  const logoDataUrl = logoDataUrls.get(teamName)

  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(5.4)
  pdf.setTextColor(255, 255, 255)

  if (!logoDataUrl) {
    pdf.text(`${getPdfTeamLabel(teamName)} ${scoreLabel}`, centerX, centerY + 1.8, { align: 'center' })
    return
  }

  const logoSize = 7
  const logoGap = 1.4
  const scoreWidth = pdf.getTextWidth(scoreLabel)
  const contentWidth = logoSize + logoGap + scoreWidth
  const logoX = centerX - contentWidth / 2
  pdf.addImage(logoDataUrl, 'PNG', logoX, centerY - logoSize / 2, logoSize, logoSize)
  pdf.text(scoreLabel, logoX + logoSize + logoGap, centerY + 1.8)
}

export function drawPdfMatchHeader(
  pdf: jsPDF,
  cell: PdfTableCell,
  match: Match,
  logoDataUrls: PdfTeamLogoDataUrls,
) {
  const centerX = cell.x + cell.width / 2
  const rowHeight = cell.height / 3

  drawPdfTeamScore(pdf, centerX, cell.y + rowHeight / 2, match.local, match.localScore, logoDataUrls)
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(4.7)
  pdf.setTextColor(255, 255, 255)
  pdf.text('vs', centerX, cell.y + rowHeight * 1.5 + 1.5, { align: 'center' })
  drawPdfTeamScore(pdf, centerX, cell.y + rowHeight * 2.5, match.visitante, match.visitanteScore, logoDataUrls)
}
