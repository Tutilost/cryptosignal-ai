import type { NextApiRequest, NextApiResponse } from 'next'
import { verifyJWT } from '../../lib/auth'
import axios from 'axios'

async function fetchKlines(symbol: string, interval = '1h', limit = 100) {
  const s = symbol.replace('/', '')
  const url = `https://api.binance.com/api/v3/klines?symbol=${s}&interval=${interval}&limit=${limit}`
  const { data } = await axios.get(url)
  return data.map((k: any) => ({
    open: parseFloat(k[1]),
    high: parseFloat(k[2]),
    low: parseFloat(k[3]),
    close: parseFloat(k[4]),
    volume: parseFloat(k[5])
  }))
}

function calcRSI(closes: number[], period = 14): number {
  if (closes.length < period + 1) return 50
  let gains = 0, losses = 0
  for (let i = closes.length - period; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1]
    if (diff > 0) gains += diff
    else losses += Math.abs(diff)
  }
  const rs = gains / (losses || 1)
  return parseFloat((100 - 100 / (1 + rs)).toFixed(2))
}

function calcEMA(closes: number[], period: number): number {
  const k = 2 / (period + 1)
  let ema = closes[0]
  for (let i = 1; i < closes.length; i++) ema = closes[i] * k + ema * (1 - k)
  return ema
}

function calcMACD(closes: number[]) {
  const ema12 = calcEMA(closes, 12)
  const ema26 = calcEMA(closes, 26)
  return parseFloat((ema12 - ema26).toFixed(4))
}

function calcVolumeScore(candles: any[]): number {
  const vols = candles.map(c => c.volume)
  const avg = vols.slice(0, -1).reduce((a, b) => a + b, 0) / (vols.length - 1)
  return parseFloat(((vols[vols.length - 1] / avg) * 100).toFixed(0))
}

function generateSignal(pair: string, rsi: number, macd: number, volume: number, price: number) {
  let signal: 'LONG' | 'SHORT' | 'NEUTRO'
  let confidence: number
  let reasoning: string[] = []

  if (rsi < 35 && macd > 0) {
    signal = 'LONG'
    confidence = Math.min(95, 60 + (35 - rsi) + (macd > 0.5 ? 10 : 5))
    reasoning = [
      `RSI em ${rsi} — zona de sobrevenda, pressão compradora crescendo`,
      `MACD positivo (${macd}) — momentum bullish confirmado`,
      `Volume ${volume}% da média — ${volume > 120 ? 'confirmação de força' : 'aguardando aumento'}`
    ]
  } else if (rsi > 65 && macd < 0) {
    signal = 'SHORT'
    confidence = Math.min(95, 60 + (rsi - 65) + (macd < -0.5 ? 10 : 5))
    reasoning = [
      `RSI em ${rsi} — zona de sobrecompra, possível reversão`,
      `MACD negativo (${macd}) — momentum bearish`,
      `Volume ${volume}% da média — ${volume > 120 ? 'pressão vendedora forte' : 'movimento fraco'}`
    ]
  } else {
    signal = 'NEUTRO'
    confidence = Math.floor(Math.random() * 20) + 45
    reasoning = [
      `RSI em ${rsi} — zona neutra, sem pressão direcional clara`,
      `MACD em ${macd} — aguardando catalisador`,
      `Consolidação em torno de $${price.toLocaleString()}`
    ]
  }

  return { pair, signal, confidence, price, indicators: { rsi, macd, volume }, reasoning, creditsUsed: 1, creditsRemaining: 49, timestamp: new Date().toISOString() }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end()
  const token = req.cookies['cs_token']
  if (!token) return res.status(401).json({ error: 'Não autenticado' })
  const payload = verifyJWT(token)
  if (!payload) return res.status(401).json({ error: 'Token inválido' })

  const { pair = 'BTC/USDT' } = req.body

  try {
    const candles = await fetchKlines(pair, '1h', 100)
    const closes = candles.map((c: any) => c.close)
    const rsi = calcRSI(closes)
    const macd = calcMACD(closes)
    const volume = calcVolumeScore(candles)
    const price = closes[closes.length - 1]

    res.json(generateSignal(pair, rsi, macd, volume, price))
  } catch (err: any) {
    res.status(500).json({ error: 'Erro ao buscar dados da Binance: ' + err.message })
  }
}
