import type { NextApiRequest, NextApiResponse } from 'next'
import { verifyJWT } from '../../lib/auth'
import axios from 'axios'

const cache = new Map<string, { data: any; ts: number }>()
const CACHE_TTL = 3 * 60 * 1000

function getCache(key: string) {
  const c = cache.get(key)
  if (c && Date.now() - c.ts < CACHE_TTL) return c.data
  return null
}
function setCache(key: string, data: any) { cache.set(key, { data, ts: Date.now() }) }

async function getCoinGeckoId(symbol: string): Promise<string> {
  const cached = getCache('pairs_list')
  let list = cached
  if (!list) {
    const { data } = await axios.get('https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=100&page=1', { timeout: 8000 })
    list = data; setCache('pairs_list', list)
  }
  const ticker = symbol.replace('/USDT', '').toLowerCase()
  const coin = list.find((c: any) => c.symbol.toLowerCase() === ticker)
  return coin?.id || ticker
}

async function fetchCandles(symbol: string) {
  const cached = getCache(`candles_${symbol}`)
  if (cached) return cached
  const id = await getCoinGeckoId(symbol)
  const { data } = await axios.get(`https://api.coingecko.com/api/v3/coins/${id}/market_chart?vs_currency=usd&days=4&interval=hourly`, { timeout: 10000 })
  const prices = data.prices.map((p: any) => p[1])
  const volumes = data.total_volumes.map((v: any) => v[1])
  const candles = prices.map((close: number, i: number) => ({ close, volume: volumes[i] || 0 }))
  setCache(`candles_${symbol}`, candles)
  return candles
}

async function fetchFearGreed(): Promise<{ value: number; label: string }> {
  const cached = getCache('fear_greed')
  if (cached) return cached
  try {
    const { data } = await axios.get('https://api.alternative.me/fng/?limit=1', { timeout: 5000 })
    const v = parseInt(data.data[0].value)
    const label = v<=25?'Medo Extremo':v<=45?'Medo':v<=55?'Neutro':v<=75?'Ganância':'Ganância Extrema'
    const result = { value: v, label }
    setCache('fear_greed', result)
    return result
  } catch { return { value: 50, label: 'Neutro' } }
}

function calcRSI(closes: number[], period = 14): number {
  if (closes.length < period+1) return 50
  let gains = 0, losses = 0
  for (let i = closes.length-period; i < closes.length; i++) {
    const diff = closes[i]-closes[i-1]
    if (diff>0) gains+=diff; else losses+=Math.abs(diff)
  }
  return parseFloat((100-100/(1+gains/(losses||1))).toFixed(2))
}

function calcEMA(closes: number[], period: number): number {
  const k = 2/(period+1)
  let ema = closes[0]
  for (let i=1; i<closes.length; i++) ema = closes[i]*k+ema*(1-k)
  return parseFloat(ema.toFixed(6))
}

function calcBollinger(closes: number[], period = 20) {
  const slice = closes.slice(-period)
  const sma = slice.reduce((a,b)=>a+b,0)/slice.length
  const std = Math.sqrt(slice.reduce((s,v)=>s+Math.pow(v-sma,2),0)/period)
  return { upper:parseFloat((sma+2*std).toFixed(6)), middle:parseFloat(sma.toFixed(6)), lower:parseFloat((sma-2*std).toFixed(6)) }
}

function calcVolumeScore(candles: any[]): number {
  const vols = candles.map(c=>c.volume)
  const avg = vols.slice(0,-1).reduce((a:number,b:number)=>a+b,0)/(vols.length-1)
  return parseFloat(((vols[vols.length-1]/avg)*100).toFixed(0))
}

function calcTradeSetup(signal: string, price: number, bollinger: any, atr: number) {
  const fmt = (n: number) => parseFloat(n.toFixed(6))

  if (signal === 'LONG') {
    const entry = fmt(price)
    const stopLoss = fmt(Math.min(bollinger.lower * 0.99, price - atr * 1.5))
    const risk = entry - stopLoss
    return {
      entry,
      stopLoss,
      tp1: fmt(entry + risk * 3), // 3:1
      tp2: fmt(entry + risk * 5), // 5:1
      risk: fmt(risk),
      riskPct: parseFloat(((risk/entry)*100).toFixed(2))
    }
  } else if (signal === 'SHORT') {
    const entry = fmt(price)
    const stopLoss = fmt(Math.max(bollinger.upper * 1.01, price + atr * 1.5))
    const risk = stopLoss - entry
    return {
      entry,
      stopLoss,
      tp1: fmt(entry - risk * 3), // 3:1
      tp2: fmt(entry - risk * 5), // 5:1
      risk: fmt(risk),
      riskPct: parseFloat(((risk/entry)*100).toFixed(2))
    }
  }
  return null
}

function calcStochRSI(closes: number[], rsiPeriod = 14, stochPeriod = 14, smoothK = 3, smoothD = 3) {
  // Calcula RSI para cada ponto
  const rsiValues: number[] = []
  for (let i = rsiPeriod; i < closes.length; i++) {
    let gains = 0, losses = 0
    for (let j = i - rsiPeriod + 1; j <= i; j++) {
      const diff = closes[j] - closes[j-1]
      if (diff > 0) gains += diff; else losses += Math.abs(diff)
    }
    rsiValues.push(100 - 100/(1 + gains/(losses||0.001)))
  }

  // Calcula Stoch do RSI
  const rawK: number[] = []
  for (let i = stochPeriod - 1; i < rsiValues.length; i++) {
    const slice = rsiValues.slice(i - stochPeriod + 1, i + 1)
    const minRsi = Math.min(...slice)
    const maxRsi = Math.max(...slice)
    const range = maxRsi - minRsi
    rawK.push(range === 0 ? 50 : ((rsiValues[i] - minRsi) / range) * 100)
  }

  // Suaviza K (média de smoothK períodos)
  const smoothedK: number[] = []
  for (let i = smoothK - 1; i < rawK.length; i++) {
    const slice = rawK.slice(i - smoothK + 1, i + 1)
    smoothedK.push(slice.reduce((a,b)=>a+b,0)/slice.length)
  }

  // D é a média de smoothD períodos do K suavizado
  const smoothedD: number[] = []
  for (let i = smoothD - 1; i < smoothedK.length; i++) {
    const slice = smoothedK.slice(i - smoothD + 1, i + 1)
    smoothedD.push(slice.reduce((a,b)=>a+b,0)/slice.length)
  }

  const k = smoothedK[smoothedK.length - 1] ?? 50
  const d = smoothedD[smoothedD.length - 1] ?? 50
  return {
    k: parseFloat(k.toFixed(2)),
    d: parseFloat(d.toFixed(2)),
    signal: k > d ? 'bullish' : 'bearish',
    overbought: k > 80,
    oversold: k < 20
  }
}

function calcATR(candles: any[], period = 14): number {
  if (candles.length < 2) return 0
  const trs = candles.slice(-period).map((c, i, arr) => {
    if (i === 0) return 0
    return Math.abs(c.close - arr[i-1].close)
  }).filter(v => v > 0)
  return trs.reduce((a,b)=>a+b,0)/trs.length
}

function buildSignal(pair: string, rsi: number, macd: number, volume: number, price: number, bollinger: any, ema7: number, ema21: number, ema50: number, fearGreed: any, atr: number, stochRsi: any) {
  const nearLower = price<=bollinger.lower*1.02
  const nearUpper = price>=bollinger.upper*0.98
  let bull=0, bear=0
  if (rsi<35) bull+=2; if (rsi>65) bear+=2
  if (macd>0) bull+=1; if (macd<0) bear+=1
  if (ema7>ema21) bull+=1; else bear+=1
  if (ema21>ema50) bull+=1; else bear+=1
  if (nearLower) bull+=2; if (nearUpper) bear+=2
  if (fearGreed.value<35) bull+=1; if (fearGreed.value>70) bear+=1
  if (stochRsi.oversold && stochRsi.signal==="bullish") bull+=2
  if (stochRsi.overbought && stochRsi.signal==="bearish") bear+=2

  let signal: 'LONG'|'SHORT'|'NEUTRO', confidence: number, reasoning: string[]
  if (bull>=5) {
    signal='LONG'; confidence=Math.min(95,50+bull*5)
    reasoning=[`RSI em ${rsi} — ${rsi<35?'sobrevenda confirmada':'zona bullish'}`,`EMA7 ${ema7>ema21?'acima':'abaixo'} da EMA21 — ${ema7>ema21?'tendência de alta':'atenção'}`,`Bollinger: ${nearLower?'tocando banda inferior — suporte forte':'dentro das bandas'}`,`Sentimento: ${fearGreed.label} (${fearGreed.value})`]
  } else if (bear>=5) {
    signal='SHORT'; confidence=Math.min(95,50+bear*5)
    reasoning=[`RSI em ${rsi} — ${rsi>65?'sobrecompra confirmada':'zona bearish'}`,`EMA7 ${ema7>ema21?'ainda acima':'abaixo'} da EMA21 — ${ema7<=ema21?'tendência de baixa':'reversão possível'}`,`Bollinger: ${nearUpper?'tocando banda superior — resistência forte':'dentro das bandas'}`,`Sentimento: ${fearGreed.label} (${fearGreed.value})`]
  } else {
    signal='NEUTRO'; confidence=45+Math.abs(bull-bear)*3
    reasoning=[`RSI em ${rsi} — sem pressão direcional clara`,`EMA7: $${ema7.toLocaleString()} | EMA21: $${ema21.toLocaleString()} | EMA50: $${ema50.toLocaleString()}`,`Bollinger: upper $${bollinger.upper.toLocaleString()} / lower $${bollinger.lower.toLocaleString()}`,`Sentimento: ${fearGreed.label} (${fearGreed.value})`]
  }

  const tradeSetup = calcTradeSetup(signal, price, bollinger, atr)

  return { pair, signal, confidence, price, indicators:{rsi,macd,volume}, bollinger, ema7, ema21, ema50, fearGreed, reasoning, tradeSetup, creditsUsed:1, creditsRemaining:49, timestamp:new Date().toISOString() }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method!=='POST') return res.status(405).end()
  const token = req.cookies['cs_token']
  if (!token) return res.status(401).json({error:'Não autenticado'})
  const payload = verifyJWT(token)
  if (!payload) return res.status(401).json({error:'Token inválido'})
  const { pair='BTC/USDT' } = req.body
  try {
    const [candles, fearGreed] = await Promise.all([fetchCandles(pair), fetchFearGreed()])
    const closes = candles.map((c:any)=>c.close)
    const rsi=calcRSI(closes), macd=parseFloat((calcEMA(closes,12)-calcEMA(closes,26)).toFixed(2))
    const volume=calcVolumeScore(candles), price=closes[closes.length-1]
    const bollinger=calcBollinger(closes)
    const ema7=calcEMA(closes,7), ema21=calcEMA(closes,21), ema50=calcEMA(closes,Math.min(50,closes.length))
    const atr=calcATR(candles)
    res.json(buildSignal(pair,rsi,macd,volume,price,bollinger,ema7,ema21,ema50,fearGreed,atr))
  } catch (err:any) { res.status(500).json({error:'Erro: '+err.message}) }
}
