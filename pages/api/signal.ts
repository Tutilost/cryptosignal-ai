import type { NextApiRequest, NextApiResponse } from 'next'
import { verifyJWT } from '../../lib/auth'
import axios from 'axios'

async function getCoinGeckoId(symbol: string): Promise<string> {
  try {
    const { data } = await axios.get(
      'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=100&page=1',
      { timeout: 8000 }
    )
    const ticker = symbol.replace('/USDT', '').toLowerCase()
    const coin = data.find((c: any) => c.symbol.toLowerCase() === ticker)
    return coin?.id || ticker
  } catch {
    const fallback: Record<string, string> = {
      'BTC/USDT': 'bitcoin', 'ETH/USDT': 'ethereum', 'SOL/USDT': 'solana',
      'BNB/USDT': 'binancecoin', 'ARB/USDT': 'arbitrum', 'OP/USDT': 'optimism'
    }
    return fallback[symbol] || 'bitcoin'
  }
}

async function fetchCandles(symbol: string) {
  const id = await getCoinGeckoId(symbol)
  const url = `https://api.coingecko.com/api/v3/coins/${id}/market_chart?vs_currency=usd&days=4&interval=hourly`
  const { data } = await axios.get(url, { timeout: 10000 })
  const prices = data.prices.map((p: any) => p[1])
  const volumes = data.total_volumes.map((v: any) => v[1])
  return prices.map((close: number, i: number) => ({ close, volume: volumes[i] || 0 }))
}

async function fetchFearGreed(): Promise<{ value: number; label: string }> {
  try {
    const { data } = await axios.get('https://api.alternative.me/fng/?limit=1', { timeout: 5000 })
    const v = parseInt(data.data[0].value)
    const label = v <= 25 ? 'Medo Extremo' : v <= 45 ? 'Medo' : v <= 55 ? 'Neutro' : v <= 75 ? 'Ganância' : 'Ganância Extrema'
    return { value: v, label }
  } catch {
    return { value: 50, label: 'Neutro' }
  }
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

function calcSMA(closes: number[], period: number): number {
  const slice = closes.slice(-period)
  return parseFloat((slice.reduce((a, b) => a + b, 0) / slice.length).toFixed(2))
}

function calcBollinger(closes: number[], period = 20) {
  const sma = calcSMA(closes, period)
  const slice = closes.slice(-period)
  const variance = slice.reduce((sum, v) => sum + Math.pow(v - sma, 2), 0) / period
  const std = Math.sqrt(variance)
  return {
    upper: parseFloat((sma + 2 * std).toFixed(2)),
    middle: parseFloat(sma.toFixed(2)),
    lower: parseFloat((sma - 2 * std).toFixed(2))
  }
}

function calcVolumeScore(candles: any[]): number {
  const vols = candles.map(c => c.volume)
  const avg = vols.slice(0, -1).reduce((a: number, b: number) => a + b, 0) / (vols.length - 1)
  return parseFloat(((vols[vols.length - 1] / avg) * 100).toFixed(0))
}

function buildSignal(
  pair: string, rsi: number, macd: number, volume: number, price: number,
  bollinger: any, sma50: number, sma200: number, fearGreed: any
) {
  let signal: 'LONG' | 'SHORT' | 'NEUTRO'
  let confidence: number
  let reasoning: string[] = []

  const aboveSma50 = price > sma50
  const aboveSma200 = price > sma200
  const nearLower = price <= bollinger.lower * 1.02
  const nearUpper = price >= bollinger.upper * 0.98
  const bullishFG = fearGreed.value < 35
  const bearishFG = fearGreed.value > 70

  let bullPoints = 0
  let bearPoints = 0

  if (rsi < 35) bullPoints += 2
  if (rsi > 65) bearPoints += 2
  if (macd > 0) bullPoints += 1
  if (macd < 0) bearPoints += 1
  if (aboveSma50) bullPoints += 1
  if (!aboveSma50) bearPoints += 1
  if (aboveSma200) bullPoints += 1
  if (!aboveSma200) bearPoints += 1
  if (nearLower) bullPoints += 2
  if (nearUpper) bearPoints += 2
  if (bullishFG) bullPoints += 1
  if (bearishFG) bearPoints += 1

  if (bullPoints >= 5) {
    signal = 'LONG'
    confidence = Math.min(95, 50 + bullPoints * 5)
    reasoning = [
      `RSI em ${rsi} — ${rsi < 35 ? 'sobrevenda confirmada' : 'zona neutra-bullish'}`,
      `Preço ${nearLower ? 'tocando banda inferior de Bollinger — suporte forte' : `acima da SMA50 ($${sma50.toLocaleString()})`}`,
      `Tendência de longo prazo: ${aboveSma200 ? '✓ acima da SMA200' : '✗ abaixo da SMA200'}`,
      `Sentimento: ${fearGreed.label} (${fearGreed.value}) — ${bullishFG ? 'medo cria oportunidade' : 'neutro'}`
    ]
  } else if (bearPoints >= 5) {
    signal = 'SHORT'
    confidence = Math.min(95, 50 + bearPoints * 5)
    reasoning = [
      `RSI em ${rsi} — ${rsi > 65 ? 'sobrecompra confirmada' : 'zona neutra-bearish'}`,
      `Preço ${nearUpper ? 'tocando banda superior de Bollinger — resistência forte' : `abaixo da SMA50 ($${sma50.toLocaleString()})`}`,
      `Tendência de longo prazo: ${aboveSma200 ? 'ainda acima da SMA200' : '✗ abaixo da SMA200 — bearish'}`,
      `Sentimento: ${fearGreed.label} (${fearGreed.value}) — ${bearishFG ? 'ganância excessiva, cuidado' : 'neutro'}`
    ]
  } else {
    signal = 'NEUTRO'
    confidence = 45 + Math.abs(bullPoints - bearPoints) * 3
    reasoning = [
      `RSI em ${rsi} — sem pressão direcional clara`,
      `Bollinger: upper $${bollinger.upper.toLocaleString()} / lower $${bollinger.lower.toLocaleString()}`,
      `SMA50: $${sma50.toLocaleString()} | SMA200: $${sma200.toLocaleString()}`,
      `Sentimento: ${fearGreed.label} (${fearGreed.value})`
    ]
  }

  return {
    pair, signal, confidence, price,
    indicators: { rsi, macd, volume },
    bollinger, sma50, sma200,
    fearGreed,
    reasoning,
    creditsUsed: 1, creditsRemaining: 49,
    timestamp: new Date().toISOString()
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end()
  const token = req.cookies['cs_token']
  if (!token) return res.status(401).json({ error: 'Não autenticado' })
  const payload = verifyJWT(token)
  if (!payload) return res.status(401).json({ error: 'Token inválido' })

  const { pair = 'BTC/USDT' } = req.body

  try {
    const [candles, fearGreed] = await Promise.all([
      fetchCandles(pair),
      fetchFearGreed()
    ])
    const closes = candles.map((c: any) => c.close)
    const rsi = calcRSI(closes)
    const macd = calcMACD(closes)
    const volume = calcVolumeScore(candles)
    const price = closes[closes.length - 1]
    const bollinger = calcBollinger(closes)
    const sma50 = calcSMA(closes, Math.min(50, closes.length))
    const sma200 = calcSMA(closes, Math.min(200, closes.length))

    res.json(buildSignal(pair, rsi, macd, volume, price, bollinger, sma50, sma200, fearGreed))
  } catch (err: any) {
    res.status(500).json({ error: 'Erro ao buscar dados: ' + err.message })
  }
}
