const CSV_FORMULA_PREFIX = /^(?:[\t\r\n]|[ ]*[=+\-@\uFF1D\uFF0B\uFF0D\uFF20])/

export function sanitizeCsvCell(value: unknown): string {
  const text = String(value ?? '')
  const safeText = CSV_FORMULA_PREFIX.test(text) ? `\t${text}` : text
  return `"${safeText.replace(/"/g, '""')}"`
}

export function hasValidPrivateLookupFactor(folio: string, phone: string, name: string): boolean {
  const normalizedFolio = folio.trim().toUpperCase()
  const normalizedPhone = phone.replace(/\D/g, '')
  const normalizedName = name.trim()

  const hasFolio = /^Q[0-9]+-[0-9]{6}$/.test(normalizedFolio)
  const hasPhone = normalizedPhone.length === 10
  const hasName = normalizedName.length >= 2
    && normalizedName.length <= 100
    && !/\p{Cc}/u.test(normalizedName)

  return hasFolio || hasPhone || hasName
}
