import type { NextApiRequest, NextApiResponse } from 'next'
import { generateNonce } from '../../../lib/auth'

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end()
  const { address } = req.body
  if (!address) return res.status(400).json({ error: 'Endereço obrigatório' })
  const nonce = generateNonce(address)
  res.json({ nonce })
}
