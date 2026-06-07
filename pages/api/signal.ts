import type { NextApiRequest, NextApiResponse } from 'next'
import { verifyJWT } from '../../lib/auth'
import axios from 'axios'

const BINANCE_URLS = [
  'https://api1.binance.com',
  'https://api2.binance.com', 
  'https://api3.binance.com',
  'https://fapi.binance.com'
]

async function fetchKlines(symbol: string, interval = '1h', limit = 100) {
  const s = symbol.replace('/', '')
  let lastError: any
  for (const base of BINANCE_URLS) {
    try {
      const url = `${base}/api/v3/klines?symbol=${s}&interval=${interval}&limit=${limit}`
      const { data } = await axios.get(url, { timeout: 8000 })
      return data.map((k: any) => ({
        open: parseFloat(k[1]),
        high: parseFloat(k[2]),
        low: parseFloat(k[3]),
        close: parseFloat(k[4]),
        volume: parseFloat(k[5])
      }))
    } catch (e) { lastError = e }
  }
  throw lastError
}

async function fetchFromCoinGecko(symbol: string) {
  const map: Record<string, string> = {
    'BTC/USDT': 'bitcoin', 'ETH/USDT': 'ethereum', 'SOL/USDT': 'solana',
    'BNB/USDT': 'binancecoin', 'ARB/USDT': 'arbitrum', 'OP/USDT': 'optimism'
  }
  const id = map[symbol] || 'bitcoin'
  const url = `https://api.coingecko.com/api/v3/coins/${id}/market_chart?vs_currency=usd&days=4&interval=hourly`
  const { data } = await axios.get(url, { timeout: 8000 })
  const prices = data.prices.map((p: any) => p[1])
  const volumes = data.total_volumes.map((v: any) => v[1])
  return prices.map((close: number, i: number) => ({ close, volume: volumes[i] || 0 }))
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
  return parseFloat((ema12 - ema26).toFixed(2))
}

function calcVolumeScore(candles: any[]): number {
  const vols = candles.map(c => c.volume)
  const avg = vols.slice(0, -1).reduce((a: number, b: number) => a + b, 0) / (vols.length - 1)
  return parseFloat(((vols[vols.length - 1] / avg) * 100).toFixed(0))
}

function buildSignal(pair: string, rsi: number, macd: number, volume: number, price: number) {
  let signal: 'LONG' | 'SHORT' | 'NEUTRO'
  let confidence: number
  let reasoning: string[]

  if (rsi < 35 && macd > 0) {
    signal = 'LONG'
    confidence = Math.min(95, 60 + (35 - rsi) + (macd > 0.5 ? 10 : 5))
    reasoning = [`RSI em ${rsi} — sobrevenda, pressão compradora crescendo`, `MACD positivo (${macd}) — momentum bullish`, `Volume ${volume}% da média`]
  } else if (rsi > 65 && macd < 0) {
    signal = 'SHORT'
    confidence = Math.min(95, 60 + (rsi - 65) + (macd < -0.5 ? 10 : 5))
    reasoning = [`RSI em ${rsi} — sobrecompra, possível reversão`, `MACD negativo (${macd}) — momentum bearish`, `Volume ${volume}% da média`]
  } else {
    signal = 'NEUTRO'
    confidence = 50 + Math.abs(50 - rsi)
    reasoning = [`RSI em ${rsi} — zona neutra`, `MACD em ${macd}`, `Preço atual: $${price.toLocaleString()}`]
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
    let candles: any[]
    try {
      candles = await fetchKlines(pair, '1h', 100)
    } catch {
      candles = await fetchFromCoinGecko(pair)
    }
    const closes = candles.map((c: any) => c.close)
    const rsi = calcRSI(closes)
    const macd = calcMACD(closes)
    const volume = calcVolumeScore(candles)
    const price = closes[closes.length - 1]
    res.json(buildSignal(pair, rsi, macd, volume, price))
  } catch (err: any) {
    res.status(500).json({ error: 'Erro ao buscar dados: ' + err.message })
  }
}
