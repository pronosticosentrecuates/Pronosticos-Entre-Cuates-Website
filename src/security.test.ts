import { describe, expect, it } from 'vitest'
import { hasValidPrivateLookupFactor, sanitizeCsvCell } from './security'

describe('security helpers', () => {
  it('neutralizes spreadsheet formulas while preserving regular text', () => {
    expect(sanitizeCsvCell('Nombre normal')).toBe('"Nombre normal"')
    expect(sanitizeCsvCell('=HYPERLINK("https://example.test")')).toBe('"\t=HYPERLINK(""https://example.test"")"')
    expect(sanitizeCsvCell('+1+1')).toBe('"\t+1+1"')
    expect(sanitizeCsvCell('@SUM(A1:A2)')).toBe('"\t@SUM(A1:A2)"')
    expect(sanitizeCsvCell('  =1+1')).toBe('"\t  =1+1"')
    expect(sanitizeCsvCell('－1+1')).toBe('"\t－1+1"')
  })

  it('accepts any one exact lookup factor', () => {
    expect(hasValidPrivateLookupFactor('Q12-000123', '', '')).toBe(true)
    expect(hasValidPrivateLookupFactor('', '5512345678', '')).toBe(true)
    expect(hasValidPrivateLookupFactor('', '', 'Ana Perez')).toBe(true)
    expect(hasValidPrivateLookupFactor('Q12-123', '123', '')).toBe(false)
    expect(hasValidPrivateLookupFactor('', '', '')).toBe(false)
  })
})
