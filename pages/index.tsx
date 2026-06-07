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
  sma50: number; sma200: number
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

  useEffect(() => {
    fetch('/api/auth/me').then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.address) setUser(d) }).finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    fetch('/api/pairs').then(r => r.ok ? r.json() : [])
      .then(d => { if (Array.isArray(d) && d.length > 0) setPairs(d) })
  }, [])

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

  const short = (a: string) => `${a.slice(0,6)}...${a.slice(-4)}`
  const col = (s: string) => s==='LONG'?'#16a34a':s==='SHORT'?'#dc2626':'#d97706'
  const bgc = (s: string) => s==='LONG'?'#f0fdf4':s==='SHORT'?'#fef2f2':'#fffbeb'
  const fgColor = (v: number) => v<=25?'#ef4444':v<=45?'#f97316':v<=55?'#eab308':v<=75?'#84cc16':'#22c55e'

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
                <div style={S.credits}><span style={{color:'#7c6fff',fontSize:12}}>◆</span><span style={S.credNum}>{user.credits}</span><span style={S.credLbl}>créditos</span></div>
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
                <div style={{fontSize:40,color:'#7c6fff',marginBottom:16}}>◈</div>
                <h1 style={S.loginTitle}>CryptoSignal AI</h1>
                <p style={S.loginSub}>Sinais profissionais gerados por IA.<br/>Acesso via carteira — sem senha.</p>
                <div style={S.features}>
                  {['Assinatura não move fundos','Chave privada fica na sua carteira','Sessão segura de 24h','50 créditos grátis ao entrar'].map(f=>(
                    <div key={f} style={S.feat}><span style={{color:'#7c6fff',fontWeight:700}}>✓</span><span>{f}</span></div>
                  ))}
                </div>
                {error && <div style={S.errBox}>{error}</div>}
                <button onClick={connectWallet} disabled={connecting} style={{...S.connectBtn,opacity:connecting?0.7:1}}>
                  {connecting?'Aguardando carteira...':'◈ Conectar Carteira'}
                </button>
                <p style={{fontSize:12,color:'#404060',marginTop:12}}>Funciona com MetaMask, OKX Wallet e WalletConnect</p>
              </div>
            </div>
          ) : (
            <div style={S.dash}>
              <div style={S.panel}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
                  <h2 style={{fontFamily:'monospace',fontSize:14,fontWeight:700,color:'#e8e8f0'}}>Gerar sinal</h2>
                  <span style={{fontSize:12,color:'#404060'}}>1 crédito por sinal</span>
                </div>
                <div style={{display:'flex',gap:12}}>
                  <select value={selectedPair} onChange={e=>setSelectedPair(e.target.value)} style={S.select}>
                    {pairs.length>0
                      ?pairs.map(p=><option key={p.symbol} value={p.symbol}>{p.symbol} — {p.name} ({p.change24h?.toFixed(1)}%)</option>)
                      :<option value="BTC/USDT">BTC/USDT</option>}
                  </select>
                  <button onClick={generateSignal} disabled={generating||user.credits<1} style={{...S.genBtn,opacity:(generating||user.credits<1)?0.5:1}}>
                    {generating?'Analisando...':'▶ Gerar'}
                  </button>
                </div>
                {error&&<div style={{...S.errBox,marginTop:12}}>{error}</div>}
              </div>

              {signals.length===0?(
                <div style={{textAlign:'center',padding:'60px 0'}}>
                  <div style={{fontSize:36,color:'#2a2a3e',marginBottom:12}}>◈</div>
                  <p style={{fontSize:14,color:'#404060'}}>Nenhum sinal ainda. Selecione um par e clique em gerar.</p>
                </div>
              ):signals.map((sig,i)=>(
                <div key={i} style={{...S.sigCard,borderLeft:`3px solid ${col(sig.signal)}`}}>
                  {/* Header */}
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14}}>
                    <div style={{display:'flex',alignItems:'center',gap:10}}>
                      <span style={{fontFamily:'monospace',fontSize:16,fontWeight:700,color:'#e8e8f0'}}>{sig.pair}</span>
                      <span style={{fontSize:11,fontWeight:700,padding:'3px 8px',borderRadius:4,background:bgc(sig.signal),color:col(sig.signal),fontFamily:'monospace'}}>{sig.signal}</span>
                    </div>
                    <div style={{textAlign:'right'}}>
                      <div style={{fontFamily:'monospace',fontSize:22,fontWeight:700,color:col(sig.signal)}}>{sig.confidence}%</div>
                      <div style={{fontSize:11,color:'#404060'}}>confiança</div>
                    </div>
                  </div>

                  {/* Preço */}
                  <div style={{fontFamily:'monospace',fontSize:13,color:'#7c6fff',marginBottom:12}}>
                    ${sig.price?.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}
                  </div>

                  {/* Indicadores */}
                  <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8,marginBottom:12}}>
                    {[['RSI',sig.indicators.rsi],['MACD',sig.indicators.macd],['Volume',sig.indicators.volume+'%'],
                      ['SMA50','$'+sig.sma50?.toLocaleString()],['SMA200','$'+sig.sma200?.toLocaleString()],
                      ['BB Upper','$'+sig.bollinger?.upper?.toLocaleString()]
                    ].map(([l,v])=>(
                      <div key={String(l)} style={{background:'#141424',borderRadius:6,padding:'8px 10px'}}>
                        <div style={{fontSize:10,color:'#404060',textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:2}}>{l}</div>
                        <div style={{fontFamily:'monospace',fontSize:12,color:'#9090c0'}}>{v}</div>
                      </div>
                    ))}
                  </div>

                  {/* Fear & Greed */}
                  {sig.fearGreed && (
                    <div style={{display:'flex',alignItems:'center',gap:10,background:'#141424',borderRadius:6,padding:'8px 12px',marginBottom:12}}>
                      <span style={{fontSize:11,color:'#404060'}}>Fear & Greed</span>
                      <div style={{flex:1,height:4,background:'#2a2a3e',borderRadius:99,overflow:'hidden'}}>
                        <div style={{width:`${sig.fearGreed.value}%`,height:'100%',background:fgColor(sig.fearGreed.value),borderRadius:99}}/>
                      </div>
                      <span style={{fontFamily:'monospace',fontSize:12,fontWeight:700,color:fgColor(sig.fearGreed.value)}}>{sig.fearGreed.value} — {sig.fearGreed.label}</span>
                    </div>
                  )}

                  {/* Reasoning */}
                  <div style={{display:'flex',flexDirection:'column',gap:4,marginBottom:10}}>
                    {sig.reasoning.map((r,j)=>(
                      <div key={j} style={{display:'flex',gap:6,fontSize:12,color:'#6060a0',lineHeight:1.5}}>
                        <span style={{color:col(sig.signal),fontSize:10,marginTop:2}}>▸</span><span>{r}</span>
                      </div>
                    ))}
                  </div>

                  <div style={{display:'flex',justifyContent:'space-between',fontSize:11,color:'#303050',paddingTop:8,borderTop:'0.5px solid #1e1e30'}}>
                    <span>{new Date(sig.timestamp).toLocaleTimeString('pt-BR')}</span>
                    <span>−{sig.creditsUsed} crédito</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </main>
      </div>
      <style>{`*{box-sizing:border-box;margin:0;padding:0;}body{background:#0a0a0f;}@keyframes spin{to{transform:rotate(360deg)}}@keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}`}</style>
    </>
  )
}

const S: Record<string,React.CSSProperties> = {
  root:{minHeight:'100vh',background:'#0a0a0f',fontFamily:'"DM Sans",sans-serif',color:'#e8e8f0'},
  center:{display:'flex',alignItems:'center',justifyContent:'center',height:'100vh',background:'#0a0a0f'},
  spin:{width:32,height:32,border:'2px solid #2a2a3e',borderTop:'2px solid #7c6fff',borderRadius:'50%',animation:'spin 0.8s linear infinite'},
  header:{borderBottom:'1px solid #1e1e30',background:'#0d0d18',position:'sticky',top:0,zIndex:100},
  hInner:{maxWidth:960,margin:'0 auto',padding:'0 24px',height:56,display:'flex',alignItems:'center',justifyContent:'space-between'},
  logo:{display:'flex',alignItems:'center',gap:8},
  logoMark:{fontSize:20,color:'#7c6fff'},
  logoTxt:{fontFamily:'monospace',fontSize:15,fontWeight:700,color:'#e8e8f0'},
  hRight:{display:'flex',alignItems:'center',gap:12},
  credits:{display:'flex',alignItems:'center',gap:5,background:'#1e1830',border:'1px solid #2e2850',padding:'4px 10px',borderRadius:6},
  credNum:{fontFamily:'monospace',fontSize:14,fontWeight:700,color:'#7c6fff'},
  credLbl:{fontSize:11,color:'#6060a0'},
  addr:{fontFamily:'monospace',fontSize:12,color:'#9090c0',background:'#141424',border:'1px solid #1e1e30',padding:'4px 10px',borderRadius:6},
  logoutBtn:{background:'none',border:'1px solid #2a2a3e',color:'#6060a0',fontSize:12,padding:'4px 10px',borderRadius:6,cursor:'pointer',fontFamily:'inherit'},
  main:{maxWidth:960,margin:'0 auto',padding:'32px 24px'},
  loginWrap:{minHeight:'calc(100vh - 56px)',display:'flex',alignItems:'center',justifyContent:'center',padding:24},
  loginCard:{background:'#0d0d18',border:'1px solid #1e1e30',borderRadius:16,padding:40,maxWidth:400,width:'100%',textAlign:'center'},
  loginTitle:{fontFamily:'monospace',fontSize:22,fontWeight:700,color:'#e8e8f0',marginBottom:10},
  loginSub:{fontSize:14,color:'#6060a0',lineHeight:1.6,marginBottom:24},
  features:{textAlign:'left',marginBottom:24,display:'flex',flexDirection:'column',gap:8},
  feat:{display:'flex',alignItems:'center',gap:10,fontSize:13,color:'#9090c0'},
  errBox:{background:'#1a0808',border:'1px solid #3d1010',color:'#f87171',fontSize:13,padding:'10px 14px',borderRadius:8,marginBottom:16,textAlign:'left'},
  connectBtn:{width:'100%',padding:'14px 20px',background:'#7c6fff',color:'#fff',border:'none',borderRadius:10,fontSize:15,fontWeight:600,cursor:'pointer',fontFamily:'monospace',marginBottom:14},
  dash:{display:'flex',flexDirection:'column',gap:20},
  panel:{background:'#0d0d18',border:'1px solid #1e1e30',borderRadius:12,padding:20},
  select:{flex:1,background:'#141424',border:'1px solid #2a2a3e',color:'#e8e8f0',padding:'10px 14px',borderRadius:8,fontSize:14,fontFamily:'monospace',cursor:'pointer'},
  genBtn:{padding:'10px 24px',background:'#7c6fff',color:'#fff',border:'none',borderRadius:8,fontSize:14,fontWeight:600,cursor:'pointer',fontFamily:'monospace',whiteSpace:'nowrap'},
  sigCard:{background:'#0d0d18',border:'1px solid #1e1e30',borderRadius:10,padding:16,animation:'fadeIn 0.3s ease'},
}
