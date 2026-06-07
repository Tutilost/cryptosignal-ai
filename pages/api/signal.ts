import type { NextApiRequest, NextApiResponse } from 'next'
import { verifyJWT } from '../../lib/auth'

function generateSignal(pair: string) {
  const rsi = Math.floor(Math.random() * 40) + 30
  const macd = parseFloat(((Math.random() - 0.5) * 0.5).toFixed(4))
  const volume = Math.floor(Math.random() * 200) + 50
  const confidence = Math.floor(Math.random() * 30) + 60
  let signal: 'LONG' | 'SHORT' | 'NEUTRO'
  let reasoning: string[]
  if (rsi < 40 && macd > 0) {
    signal = 'LONG'
    reasoning = [`RSI em ${rsi} indica sobrevenda`, `MACD positivo (${macd}) — momentum bullish`, `Volume ${volume}% acima da média`]
  } else if (rsi > 65 && macd < 0) {
    signal = 'SHORT'
    reasoning = [`RSI em ${rsi} indica sobrecompra`, `MACD negativo (${macd}) — momentum bearish`, `Divergência de volume detectada`]
  } else {
    signal = 'NEUTRO'
    reasoning = [`RSI em zona neutra (${rsi})`, `MACD próximo de zero (${macd})`, `Aguardando rompimento de range`]
  }
  return { pair, signal, confidence, indicators: { rsi, macd, volume }, reasoning, creditsUsed: 1, creditsRemaining: 49, timestamp: new Date().toISOString() }
}

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end()
  const token = req.cookies['cs_token']
  if (!token) return res.status(401).json({ error: 'Não autenticado' })
  const payload = verifyJWT(token)
  if (!payload) return res.status(401).json({ error: 'Token inválido' })
  const { pair = 'BTC/USDT' } = req.body
  res.json(generateSignal(pair))
}
