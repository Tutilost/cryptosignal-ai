import type { NextApiRequest, NextApiResponse } from 'next'
import axios from 'axios'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { data } = await axios.get(
      'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=100&page=1',
      { timeout: 8000 }
    )
    const pairs = data.map((c: any) => ({
      symbol: `${c.symbol.toUpperCase()}/USDT`,
      name: c.name,
      id: c.id,
      price: c.current_price,
      change24h: c.price_change_percentage_24h
    }))
    res.setHeader('Cache-Control', 's-maxage=300')
    res.json(pairs)
  } catch {
    res.status(500).json({ error: 'Erro ao buscar pares' })
  }
}
