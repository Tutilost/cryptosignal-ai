import jwt from 'jsonwebtoken'
import { ethers } from 'ethers'

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production'

const nonces = new Map<string, { nonce: string; expires: number }>()

export function generateNonce(address: string): string {
  const nonce = Math.random().toString(36).substring(2, 15) +
                Math.random().toString(36).substring(2, 15)
  nonces.set(address.toLowerCase(), {
    nonce,
    expires: Date.now() + 5 * 60 * 1000
  })
  return nonce
}

export function getNonce(address: string): string | null {
  const entry = nonces.get(address.toLowerCase())
  if (!entry) return null
  if (Date.now() > entry.expires) {
    nonces.delete(address.toLowerCase())
    return null
  }
  return entry.nonce
}

export function clearNonce(address: string) {
  nonces.delete(address.toLowerCase())
}

export async function verifySiweMessage(message: string, signature: string): Promise<{
  success: boolean
  address?: string
  error?: string
}> {
  try {
    // Recupera o endereço que assinou a mensagem
    const recoveredAddress = ethers.verifyMessage(message, signature)

    // Extrai o nonce da mensagem
    const nonceMatch = message.match(/Nonce: ([a-z0-9]+)/i)
    if (!nonceMatch) return { success: false, error: 'Nonce não encontrado na mensagem' }
    const messageNonce = nonceMatch[1]

    const address = recoveredAddress.toLowerCase()
    const storedNonce = getNonce(address)

    if (!storedNonce || storedNonce !== messageNonce) {
      return { success: false, error: 'Nonce inválido ou expirado' }
    }

    clearNonce(address)
    return { success: true, address }
  } catch (err: any) {
    return { success: false, error: err.message || 'Assinatura inválida' }
  }
}

export function createJWT(address: string): string {
  return jwt.sign(
    { address, iat: Math.floor(Date.now() / 1000) },
    JWT_SECRET,
    { expiresIn: '24h' }
  )
}

export function verifyJWT(token: string): { address: string } | null {
  try {
    const payload = jwt.verify(token, JWT_SECRET) as any
    return { address: payload.address }
  } catch {
    return null
  }
}
