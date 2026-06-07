import jwt from 'jsonwebtoken'

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production'
const nonces = new Map<string, { nonce: string; expires: number }>()

export function generateNonce(address: string): string {
  const nonce = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15)
  nonces.set(address.toLowerCase(), { nonce, expires: Date.now() + 5 * 60 * 1000 })
  return nonce
}

export function getNonce(address: string): string | null {
  const entry = nonces.get(address.toLowerCase())
  if (!entry) return null
  if (Date.now() > entry.expires) { nonces.delete(address.toLowerCase()); return null }
  return entry.nonce
}

export function clearNonce(address: string) { nonces.delete(address.toLowerCase()) }

export function createJWT(address: string): string {
  return jwt.sign({ address, iat: Math.floor(Date.now() / 1000) }, JWT_SECRET, { expiresIn: '24h' })
}

export function verifyJWT(token: string): { address: string } | null {
  try { return jwt.verify(token, JWT_SECRET) as any } catch { return null }
}
