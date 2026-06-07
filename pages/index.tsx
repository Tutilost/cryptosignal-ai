import { useState, useEffect, useCallback } from 'react'
import Head from 'next/head'

declare global { interface Window { ethereum?: any } }

type User = { address: string; credits: number }
type PairInfo = { symbol: string; name: string; change24h: number }
type Signal = {
  pair: string; signal: 'LONG' | 'SHORT' | 'NEUTRO'
  confidence: number; price: number
  indicators: { rsi: number; macd: number; volume: number }
  bollinger: { upper: number; middle: number; lower: number }
  ema7: number; ema21: number; ema50: number
  fearGreed: { value: number; label: string }
  reasoning: string[]
  creditsUsed: number; creditsRemaining: number; timestamp: string
}

export default function Home() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [connecting, setConnecting] = useState(false)
  const [signals, setSignals] = useState<Signal[]>([])
  const [selectedPair, setSelectedPair] = useState('BTC/USDT')
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState('')
  const [pairs, setPairs] = useState<PairInfo[]>([])
  const [search, setSearch] = useState('')

  useEffect(() => {
    fetch('/api/auth/me').then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.address) setUser(d) }).finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    fetch('/api/pairs').then(r => r.ok ? r.json() : [])
      .then(d => { if (Array.isArray(d) && d.length > 0) setPairs(d) })
  }, [])

  const filteredPairs = pairs.filter(p =>
    p.symbol.toLowerCase().includes(search.toLowerCase()) ||
    p.name.toLowerCase().includes(search.toLowerCase())
  )

  const connectWallet = useCallback(async () => {
    setError(''); setConnecting(true)
    try {
      const provider = window.ethereum
      if (!provider) throw new Error('Nenhuma carteira encontrada.')
      const accounts: string[] = await provider.request({ method: 'eth_requestAccounts' })
      const address = accounts[0]
      const { nonce } = await fetch('/api/auth/nonce', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address })
      }).then(r => r.json())
      const message = `Entrar no CryptoSignal AI\n\nEndereço: ${address}\nNonce: ${nonce}\nEssa ação não move fundos.`
      const signature = await provider.request({ method: 'personal_sign', params: [message, address] })
      const data = await fetch('/api/auth/verify', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, signature, address })
      }).then(r => r.json())
      if (data.error) throw new Error(data.error)
      setUser({ address: data.address, credits: data.credits })
    } catch (err: any) { setError(err.message || 'Erro ao conectar') }
    finally { setConnecting(false) }
  }, [])

  const logout = useCallback(async () => {
    await fetch('/api/auth/logout'); setUser(null); setSignals([])
  }, [])

  const generateSignal = useCallback(async () => {
    if (!user || user.credits < 1) return
    setGenerating(true); setError('')
    try {
      const data = await fetch('/api/signal', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pair: selectedPair })
      }).then(r => r.json())
      if (data.error) throw new Error(data.error)
      setSignals(prev => [data, ...prev.slice(0, 9)])
      setUser(prev => prev ? { ...prev, credits: data.creditsRemaining } : prev)
    } catch (err: any) { setError(err.message || 'Erro ao gerar sinal') }
    finally { setGenerating(false) }
  }, [user, selectedPair])

  const removeSignal = (i: number) => setSignals(prev => prev.filter((_, idx) => idx !== i))

  const short = (a: string) => `${a.slice(0,6)}...${a.slice(-4)}`
  const col = (s: string) => s==='LONG'?'#4ade80':s==='SHORT'?'#f87171':'#fbbf24'
  const bgc = (s: string) => s==='LONG'?'rgba(74,222,128,0.1)':s==='SHORT'?'rgba(248,113,113,0.1)':'rgba(251,191,36,0.1)'
  const fgColor = (v: number) => v<=25?'#f87171':v<=45?'#fb923c':v<=55?'#facc15':v<=75?'#a3e635':'#4ade80'

  if (loading) return <div style={S.center}><div style={S.spin}/></div>

  return (
    <>
      <Head><title>CryptoSignal AI</title></Head>
      <div style={S.root}>
        <header style={S.header}>
          <div style={S.hInner}>
            <div style={S.logo}><span style={S.logoMark}>◈</span><span style={S.logoTxt}>CryptoSignal AI</span></div>
            {user && (
              <div style={S.hRight}>
                <div style={S.credits}><span style={{color:'#a78bfa',fontSize:12}}>◆</span><span style={S.credNum}>{user.credits}</span><span style={S.credLbl}>créditos</span></div>
                <div style={S.addr}>{short(user.address)}</div>
                <button onClick={logout} style={S.logoutBtn}>sair</button>
              </div>
            )}
          </div>
        </header>

        <main style={S.main}>
          {!user ? (
            <div style={S.loginWrap}>
              <div style={S.loginCard}>
                <div style={{fontSize:40,color:'#a78bfa',marginBottom:16}}>◈</div>
                <h1 style={S.loginTitle}>CryptoSignal AI</h1>
                <p style={S.loginSub}>Sinais profissionais gerados por IA.<br/>Acesso via carteira — sem senha.</p>
                <div style={S.features}>
                  {['Assinatura não move fundos','Chave privada fica na sua carteira','Sessão segura de 24h','50 créditos grátis ao entrar'].map(f=>(
                    <div key={f} style={S.feat}><span style={{color:'#a78bfa',fontWeight:700}}>✓</span><span style={{color:'#c4c4d4'}}>{f}</span></div>
                  ))}
                </div>
                {error && <div style={S.errBox}>{error}</div>}
                <button onClick={connectWallet} disabled={connecting} style={{...S.connectBtn,opacity:connecting?0.7:1}}>
                  {connecting?'Aguardando carteira...':'◈ Conectar Carteira'}
                </button>
                <p style={{fontSize:12,color:'#6060a0',marginTop:12}}>Funciona com MetaMask, OKX Wallet e WalletConnect</p>
              </div>
            </div>
          ) : (
            <div style={S.dash}>
              <div style={S.panel}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14}}>
                  <h2 style={{fontFamily:'monospace',fontSize:14,fontWeight:700,color:'#e2e2f0'}}>Gerar sinal</h2>
                  <span style={{fontSize:12,color:'#8080a0'}}>1 crédito por sinal</span>
                </div>

                {/* Busca */}
                <input
                  type="text"
                  placeholder="🔍  Buscar par ou moeda... (ex: SOL, Ethereum)"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  style={S.searchInput}
                />

                <div style={{display:'flex',gap:12,marginTop:10}}>
                  <select value={selectedPair} onChange={e=>setSelectedPair(e.target.value)} style={S.select}>
                    {(search ? filteredPairs : pairs).length > 0
                      ? (search ? filteredPairs : pairs).map(p=>(
                          <option key={p.symbol} value={p.symbol}>
                            {p.symbol} — {p.name} ({p.change24h?.toFixed(1)}%)
                          </option>
                        ))
                      : <option value="BTC/USDT">BTC/USDT</option>
                    }
                  </select>
                  <button onClick={generateSignal} disabled={generating||user.credits<1}
                    style={{...S.genBtn,opacity:(generating||user.credits<1)?0.5:1}}>
                    {generating?'Analisando...':'▶ Gerar'}
                  </button>
                </div>

                {error&&<div style={{...S.errBox,marginTop:12}}>{error}</div>}
                {user.credits===0&&<div style={S.warnBox}>Créditos esgotados. Em breve: recarga via USDC na Base.</div>}
              </div>

              {signals.length===0?(
                <div style={{textAlign:'center',padding:'60px 0'}}>
                  <div style={{fontSize:36,color:'#2a2a3e',marginBottom:12}}>◈</div>
                  <p style={{fontSize:14,color:'#6060a0'}}>Nenhum sinal ainda. Selecione um par e clique em gerar.</p>
                </div>
              ):signals.map((sig,i)=>(
                <div key={i} style={{...S.sigCard,borderLeft:`3px solid ${col(sig.signal)}`}}>

                  {/* Header */}
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:12}}>
                    <div style={{display:'flex',alignItems:'center',gap:10}}>
                      <span style={{fontFamily:'monospace',fontSize:16,fontWeight:700,color:'#e2e2f0'}}>{sig.pair}</span>
                      <span style={{fontSize:11,fontWeight:700,padding:'3px 10px',borderRadius:4,background:bgc(sig.signal),color:col(sig.signal),fontFamily:'monospace',border:`1px solid ${col(sig.signal)}33`}}>{sig.signal}</span>
                    </div>
                    <div style={{display:'flex',alignItems:'center',gap:12}}>
                      <div style={{textAlign:'right'}}>
                        <div style={{fontFamily:'monospace',fontSize:22,fontWeight:700,color:col(sig.signal)}}>{sig.confidence}%</div>
                        <div style={{fontSize:11,color:'#8080a0'}}>confiança</div>
                      </div>
                      <button onClick={()=>removeSignal(i)} style={S.closeBtn} title="Fechar">✕</button>
                    </div>
                  </div>

                  {/* Preço */}
                  <div style={{fontFamily:'monospace',fontSize:14,color:'#a78bfa',marginBottom:14,fontWeight:500}}>
                    ${sig.price?.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:4})}
                  </div>

                  {/* Indicadores grid */}
                  <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8,marginBottom:12}}>
                    {[
                      ['RSI', sig.indicators.rsi, sig.indicators.rsi < 35 ? '#4ade80' : sig.indicators.rsi > 65 ? '#f87171' : '#c4c4d4'],
                      ['MACD', sig.indicators.macd, sig.indicators.macd > 0 ? '#4ade80' : '#f87171'],
                      ['Volume', sig.indicators.volume+'%', '#c4c4d4'],
                      ['EMA 7', '$'+sig.ema7?.toLocaleString(), '#a78bfa'],
                      ['EMA 21', '$'+sig.ema21?.toLocaleString(), '#818cf8'],
                      ['EMA 50', '$'+sig.ema50?.toLocaleString(), '#6366f1'],
                    ].map(([l,v,c])=>(
                      <div key={String(l)} style={{background:'#0f0f1a',borderRadius:6,padding:'8px 10px',border:'0.5px solid #1e1e30'}}>
                        <div style={{fontSize:10,color:'#6060a0',textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:3}}>{l}</div>
                        <div style={{fontFamily:'monospace',fontSize:12,color:String(c),fontWeight:500}}>{v}</div>
                      </div>
                    ))}
                  </div>

                  {/* Bollinger */}
                  <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8,marginBottom:12}}>
                    {[
                      ['BB Superior', '$'+sig.bollinger?.upper?.toLocaleString(), '#f87171'],
                      ['BB Média', '$'+sig.bollinger?.middle?.toLocaleString(), '#c4c4d4'],
                      ['BB Inferior', '$'+sig.bollinger?.lower?.toLocaleString(), '#4ade80'],
                    ].map(([l,v,c])=>(
                      <div key={String(l)} style={{background:'#0f0f1a',borderRadius:6,padding:'8px 10px',border:'0.5px solid #1e1e30'}}>
                        <div style={{fontSize:10,color:'#6060a0',textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:3}}>{l}</div>
                        <div style={{fontFamily:'monospace',fontSize:12,color:String(c),fontWeight:500}}>{v}</div>
                      </div>
                    ))}
                  </div>

                  {/* Fear & Greed */}
                  {sig.fearGreed&&(
                    <div style={{background:'#0f0f1a',border:'0.5px solid #1e1e30',borderRadius:6,padding:'10px 12px',marginBottom:12}}>
                      <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:6}}>
                        <span style={{fontSize:11,color:'#8080a0',textTransform:'uppercase',letterSpacing:'0.05em'}}>Fear & Greed Index</span>
                        <span style={{fontFamily:'monospace',fontSize:13,fontWeight:700,color:fgColor(sig.fearGreed.value),marginLeft:'auto'}}>{sig.fearGreed.value} — {sig.fearGreed.label}</span>
                      </div>
                      <div style={{height:6,background:'#1e1e30',borderRadius:99,overflow:'hidden'}}>
                        <div style={{width:`${sig.fearGreed.value}%`,height:'100%',background:`linear-gradient(90deg, #f87171, #fbbf24, #4ade80)`,borderRadius:99}}/>
                      </div>
                    </div>
                  )}

                  {/* Reasoning */}
                  <div style={{display:'flex',flexDirection:'column',gap:6,marginBottom:12}}>
                    {sig.reasoning.map((r,j)=>(
                      <div key={j} style={{display:'flex',gap:8,fontSize:13,color:'#b0b0c4',lineHeight:1.5}}>
                        <span style={{color:col(sig.signal),fontSize:10,marginTop:3,flexShrink:0}}>▸</span><span>{r}</span>
                      </div>
                    ))}
                  </div>

                  <div style={{display:'flex',justifyContent:'space-between',fontSize:11,color:'#4040608',paddingTop:8,borderTop:'0.5px solid #1e1e30'}}>
                    <span style={{color:'#6060a0'}}>{new Date(sig.timestamp).toLocaleTimeString('pt-BR')}</span>
                    <span style={{color:'#6060a0'}}>−{sig.creditsUsed} crédito</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </main>
      </div>
      <style>{`
        *{box-sizing:border-box;margin:0;padding:0;}
        body{background:#08080f;}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        select option{background:#0f0f1a;color:#e2e2f0;}
        input::placeholder{color:#404060;}
      `}</style>
    </>
  )
}

const S: Record<string,React.CSSProperties> = {
  root:{minHeight:'100vh',background:'#08080f',fontFamily:'"DM Sans",system-ui,sans-serif',color:'#e2e2f0'},
  center:{display:'flex',alignItems:'center',justifyContent:'center',height:'100vh',background:'#08080f'},
  spin:{width:32,height:32,border:'2px solid #1e1e30',borderTop:'2px solid #a78bfa',borderRadius:'50%',animation:'spin 0.8s linear infinite'},
  header:{borderBottom:'1px solid #1a1a28',background:'#0a0a14',position:'sticky',top:0,zIndex:100,backdropFilter:'blur(10px)'},
  hInner:{maxWidth:960,margin:'0 auto',padding:'0 24px',height:56,display:'flex',alignItems:'center',justifyContent:'space-between'},
  logo:{display:'flex',alignItems:'center',gap:8},
  logoMark:{fontSize:20,color:'#a78bfa'},
  logoTxt:{fontFamily:'monospace',fontSize:15,fontWeight:700,color:'#e2e2f0'},
  hRight:{display:'flex',alignItems:'center',gap:12},
  credits:{display:'flex',alignItems:'center',gap:6,background:'#1a1428',border:'1px solid #2d2050',padding:'5px 12px',borderRadius:8},
  credNum:{fontFamily:'monospace',fontSize:14,fontWeight:700,color:'#a78bfa'},
  credLbl:{fontSize:11,color:'#7060a0'},
  addr:{fontFamily:'monospace',fontSize:12,color:'#a0a0c0',background:'#0f0f1a',border:'1px solid #1e1e30',padding:'5px 12px',borderRadius:8},
  logoutBtn:{background:'none',border:'1px solid #1e1e30',color:'#6060a0',fontSize:12,padding:'5px 12px',borderRadius:8,cursor:'pointer',fontFamily:'inherit',transition:'all 0.2s'},
  main:{maxWidth:960,margin:'0 auto',padding:'32px 24px'},
  loginWrap:{minHeight:'calc(100vh - 56px)',display:'flex',alignItems:'center',justifyContent:'center',padding:24},
  loginCard:{background:'#0a0a14',border:'1px solid #1a1a28',borderRadius:16,padding:40,maxWidth:400,width:'100%',textAlign:'center'},
  loginTitle:{fontFamily:'monospace',fontSize:22,fontWeight:700,color:'#e2e2f0',marginBottom:10},
  loginSub:{fontSize:14,color:'#8080a0',lineHeight:1.7,marginBottom:24},
  features:{textAlign:'left',marginBottom:28,display:'flex',flexDirection:'column',gap:10},
  feat:{display:'flex',alignItems:'center',gap:10,fontSize:13},
  errBox:{background:'#1a0808',border:'1px solid #3d1010',color:'#fca5a5',fontSize:13,padding:'10px 14px',borderRadius:8,marginBottom:16,textAlign:'left'},
  connectBtn:{width:'100%',padding:'14px 20px',background:'linear-gradient(135deg, #7c3aed, #a78bfa)',color:'#fff',border:'none',borderRadius:10,fontSize:15,fontWeight:600,cursor:'pointer',fontFamily:'monospace',marginBottom:14},
  dash:{display:'flex',flexDirection:'column',gap:16},
  panel:{background:'#0a0a14',border:'1px solid #1a1a28',borderRadius:12,padding:20},
  searchInput:{width:'100%',background:'#0f0f1a',border:'1px solid #1e1e30',color:'#e2e2f0',padding:'10px 14px',borderRadius:8,fontSize:13,fontFamily:'inherit',outline:'none'},
  select:{flex:1,background:'#0f0f1a',border:'1px solid #1e1e30',color:'#e2e2f0',padding:'10px 14px',borderRadius:8,fontSize:13,fontFamily:'monospace',cursor:'pointer'},
  genBtn:{padding:'10px 24px',background:'linear-gradient(135deg, #7c3aed, #a78bfa)',color:'#fff',border:'none',borderRadius:8,fontSize:14,fontWeight:600,cursor:'pointer',fontFamily:'monospace',whiteSpace:'nowrap'},
  warnBox:{marginTop:12,background:'#1a1400',border:'1px solid #3d3000',color:'#fcd34d',fontSize:13,padding:'10px 14px',borderRadius:8},
  sigCard:{background:'#0a0a14',border:'1px solid #1a1a28',borderRadius:12,padding:18,animation:'fadeIn 0.3s ease'},
  closeBtn:{background:'#1a1a28',border:'1px solid #2a2a3e',color:'#8080a0',width:28,height:28,borderRadius:6,cursor:'pointer',fontSize:12,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,fontFamily:'inherit'},
}
