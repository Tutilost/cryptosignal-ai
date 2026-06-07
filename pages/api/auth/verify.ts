import type { NextApiRequest, NextApiResponse } from 'next'
import { ethers } from 'ethers'
import { getNonce, clearNonce, createJWT } from '../../../lib/auth'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end()
  const { message, signature, address } = req.body
  if (!message || !signature || !address) return res.status(400).json({ error: 'Dados incompletos' })
  try {
    const recovered = ethers.verifyMessage(message, signature)
    if (recovered.toLowerCase() !== address.toLowerCase()) return res.status(401).json({ error: 'Assinatura inválida' })
    const nonceMatch = message.match(/Nonce: ([a-z0-9]+)/i)
    if (!nonceMatch) return res.status(401).json({ error: 'Nonce não encontrado' })
    const storedNonce = getNonce(address)
    if (!storedNonce || storedNonce !== nonceMatch[1]) return res.status(401).json({ error: 'Nonce expirado' })
    clearNonce(address)
    const token = createJWT(address.toLowerCase())
    res.setHeader('Set-Cookie', [`cs_token=${token}; HttpOnly; Path=/; Max-Age=86400; SameSite=Strict`])
    res.json({ success: true, address: address.toLowerCase(), credits: 50 })
  } catch (err: any) {
    res.status(401).json({ error: err.message || 'Erro na verificação' })
  }
}
