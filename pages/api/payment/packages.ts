import type { NextApiRequest, NextApiResponse } from 'next'

export const PACKAGES = [
  { id: 'starter', name: 'Starter', credits: 100, priceUSD: 9, desc: 'Para testar a plataforma' },
  { id: 'pro', name: 'Pro', credits: 500, priceUSD: 29, desc: 'Para traders ativos' },
  { id: 'elite', name: 'Elite', credits: 2000, priceUSD: 99, desc: 'Para traders profissionais' },
]

export const RECEIVE_ADDRESS = '0x6FD92C51998dE3cea7Cdc9e2711E49C366A85D5e'

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  res.json({ packages: PACKAGES, address: RECEIVE_ADDRESS })
}
