/**
 * Test-only helpers around {@link ./api.ts} — pure status→label mapping so
 * probe classification is assertable without stubbing global fetch.
 */
export { parseAccount, parseKey } from './api.ts'

/** Mirror of `probeKey`'s HTTP-status branches, unwound from the try/catch. */
export function probeKeyLabel(status: number): 'ok' | 'invalid' | 'insufficient' {
  if (status === 200) return 'ok'
  if (status === 403) return 'insufficient'
  return 'invalid'
}
