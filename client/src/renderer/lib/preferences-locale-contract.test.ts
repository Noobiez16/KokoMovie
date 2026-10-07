import { describe, expect, it } from 'vitest'
import { preferencesPatchSchema } from '../../main/ipc/security'
import { SUPPORTED_LOCALES } from '../../main/locales'

describe('persisted interface locale contract', () => {
  it.each(SUPPORTED_LOCALES)('accepts the interface locale $code sent by Settings', ({ code }) => {
    expect(preferencesPatchSchema.parse({ language: code }).language).toBe(code)
  })
  it.each(['en', 'es', 'fr'])('retains compatibility with stored legacy locale %s', (language) => {
    expect(preferencesPatchSchema.parse({ language }).language).toBe(language)
  })
  it('rejects unsupported locale values and malformed preference types', () => {
    expect(preferencesPatchSchema.safeParse({ language: 'de-DE' }).success).toBe(false)
    expect(preferencesPatchSchema.safeParse({ language: 1 }).success).toBe(false)
  })
})
