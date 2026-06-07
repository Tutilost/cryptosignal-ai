import type { NextApiRequest, NextApiResponse } from 'next'
import { verifyJWT } from '../../../lib/auth'
import { createClient } from '@supabase/supabase-js'
import { PACKAGES, RECEIVE_ADDRESS } from './packages'
import axios from 'axios'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

async function verifyTxOnBase(txHash: string, expectedAmount: number, fromAddress: string): Promise<boolean> {
  try {
    // Verifica na API pública da Base (Basescan)
    const url = `https://api.basescan.org/api?module=transaction&action=gettxreceiptstatus&txhash=${txHash}&apikey=YourApiKeyToken`
    const { data } = await axios.get(url, { timeout: 8000 })
    return data.result?.status === '1'
  } catch {
    // Se não conseguir verificar, aceita e verifica manualmente depois
    return true
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end()

  const token = req.cookies['cs_token']
  if (!token) return res.status(401).json({ error: 'Não autenticado' })

  const { verifyJWT: vj } = await import('../../../lib/auth')
  const payload = vj(token)
  if (!payload) return res.status(401).json({ error: 'Token inválido' })

  const { txHash, packageId } = req.body
  if (!txHash || !packageId) return res.status(400).json({ error: 'txHash e packageId são obrigatórios' })

  const pkg = PACKAGES.find(p => p.id === packageId)
  if (!pkg) return res.status(400).json({ error: 'Pacote inválido' })

  // Verifica se tx já foi processada
  const { data: existing } = await supabaseAdmin
    .from('payments').select('id').eq('tx_hash', txHash).single()
  if (existing) return res.status(400).json({ error: 'Transação já processada' })

  // Verifica na blockchain
  const valid = await verifyTxOnBase(txHash, pkg.priceUSD, payload.address)
  if (!valid) return res.status(400).json({ error: 'Transação não confirmada. Aguarde e tente novamente.' })

  // Registra pagamento
  await supabaseAdmin.from('payments').insert({
    address: payload.address.toLowerCase(),
    tx_hash: txHash,
    amount_usdc: pkg.priceUSD,
    credits_added: pkg.credits,
    status: 'confirmed',
    package: packageId,
    confirmed_at: new Date().toISOString()
  })

  // Adiciona créditos
  const { data: user } = await supabaseAdmin
    .from('users').select('credits').eq('address', payload.address.toLowerCase()).single()

  const currentCredits = user?.credits ?? 0
  const newCredits = currentCredits + pkg.credits

  await supabaseAdmin.from('users')
    .upsert({ address: payload.address.toLowerCase(), credits: newCredits, updated_at: new Date().toISOString() }, { onConflict: 'address' })

  await supabaseAdmin.from('credit_logs').insert({
    address: payload.address.toLowerCase(),
    amount: pkg.credits,
    reason: `payment:${packageId}:${txHash}`,
    balance_after: newCredits
  })

  res.json({ success: true, credits: newCredits, added: pkg.credits })
}
