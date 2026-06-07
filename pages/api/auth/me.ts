import type { NextApiRequest, NextApiResponse } from 'next'
import { verifyJWT } from '../../../lib/auth'

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).end()
  const token = req.cookies['cs_token']
  if (!token) return res.status(401).json({ error: 'Não autenticado' })
  const payload = verifyJWT(token)
  if (!payload) return res.status(401).json({ error: 'Token inválido' })
  res.json({ address: payload.address, credits: 50 })
}
