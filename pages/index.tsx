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
  const [showDropdown, setShowDropdown] = useState(false)

  useEffect(() => {
    fetch('/api/auth/me').then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.address) setUser(d) }).finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    fetch('/api/pairs').then(r => r.ok ? r.json() : [])
      .then(d => { if (Array.isArray(d) && d.length > 0) setPairs(d) })
  }, [])

  const filteredPairs = search.length > 0
    ? pairs.filter(p =>
        p.symbol.toLowerCase().includes(search.toLowerCase()) ||
        p.name.toLowerCase().includes(search.toLowerCase())
      )
    : pairs

  const selectPair = (symbol: string) => {
    setSelectedPair(symbol)
    setSearch('')
    setShowDropdown(false)
  }

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

  const [showShop, setShowShop] = useState(false)
  const [buyStep, setBuyStep] = useState<'select'|'pay'|'confirm'>('select')
  const [selectedPkg, setSelectedPkg] = useState<any>(null)
  const [txHash, setTxHash] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [payError, setPayError] = useState('')
  const [paySuccess, setPaySuccess] = useState(false)

  const PACKAGES = [
    { id:'starter', name:'Starter', credits:100, priceUSD:9, desc:'Para testar a plataforma' },
    { id:'pro', name:'Pro', credits:500, priceUSD:29, desc:'Para traders ativos' },
    { id:'elite', name:'Elite', credits:2000, priceUSD:99, desc:'Para traders profissionais' },
  ]
  const RECEIVE = '0x6FD92C51998dE3cea7Cdc9e2711E49C366A85D5e'

  const confirmPayment = async () => {
    if (!txHash || !selectedPkg) return
    setConfirming(true); setPayError('')
    try {
      const data = await fetch('/api/payment/confirm', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ txHash, packageId: selectedPkg.id })
      }).then(r=>r.json())
      if (data.error) throw new Error(data.error)
      setUser(prev => prev ? {...prev, credits: data.credits} : prev)
      setPaySuccess(true)
      setTimeout(() => { setShowShop(false); setPaySuccess(false); setBuyStep('select'); setTxHash('') }, 3000)
    } catch(err:any) { setPayError(err.message) }
    finally { setConfirming(false) }
  }

  const short = (a: string) => `${a.slice(0,6)}...${a.slice(-4)}`
  const col = (s: string) => s==='LONG'?'#4ade80':s==='SHORT'?'#f87171':'#fbbf24'
  const bgc = (s: string) => s==='LONG'?'rgba(74,222,128,0.1)':s==='SHORT'?'rgba(248,113,113,0.1)':'rgba(251,191,36,0.1)'
  const fgColor = (v: number) => v<=25?'#f87171':v<=45?'#fb923c':v<=55?'#facc15':v<=75?'#a3e635':'#4ade80'

  if (loading) return <div style={S.center}><div style={S.spin}/></div>

  return (
    <>
      <Head><title>CryptoSignal AI</title></Head>
      <div style={S.root} onClick={() => setShowDropdown(false)}>
        <header style={S.header}>
          <div style={S.hInner}>
            <div style={S.logo}><span style={S.logoMark}>◈</span><span style={S.logoTxt}>CryptoSignal AI</span></div>
            {user && (
              <div style={S.hRight}>
                <div style={S.credits} onClick={()=>setShowShop(true)} title="Comprar créditos">
                  <span style={{color:'#a78bfa',fontSize:12}}>◆</span>
                  <span style={S.credNum}>{user.credits}</span>
                  <span style={S.credLbl}>créditos</span>
                  <span style={{fontSize:11,color:'#7060a0',marginLeft:4}}>+</span>
                </div>
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

                {/* Par selecionado */}
                <div style={{fontSize:12,color:'#8080a0',marginBottom:8}}>
                  Par selecionado: <span style={{color:'#a78bfa',fontFamily:'monospace',fontWeight:600}}>{selectedPair}</span>
                </div>

                {/* Busca custom */}
                <div style={{position:'relative'}} onClick={e => e.stopPropagation()}>
                  <div style={{display:'flex',gap:8,marginBottom:4}}>
                    <div style={{flex:1,position:'relative'}}>
                      <input
                        type="text"
                        placeholder="🔍  Buscar par ou moeda... (ex: SOL, Ethereum)"
                        value={search}
                        onChange={e => { setSearch(e.target.value); setShowDropdown(true) }}
                        onFocus={() => setShowDropdown(true)}
                        style={S.searchInput}
                      />
                      {search && (
                        <button onClick={() => { setSearch(''); setShowDropdown(false) }}
                          style={{position:'absolute',right:10,top:'50%',transform:'translateY(-50%)',background:'none',border:'none',color:'#6060a0',cursor:'pointer',fontSize:14}}>
                          ✕
                        </button>
                      )}
                    </div>
                    <button onClick={generateSignal} disabled={generating||user.credits<1}
                      style={{...S.genBtn,opacity:(generating||user.credits<1)?0.5:1}}>
                      {generating?'Analisando...':'▶ Gerar'}
                    </button>
                  </div>

                  {/* Dropdown de pares */}
                  {showDropdown && filteredPairs.length > 0 && (
                    <div style={S.dropdown}>
                      {filteredPairs.slice(0, 20).map(p => (
                        <div key={p.symbol} onClick={() => selectPair(p.symbol)}
                          style={{
                            ...S.dropdownItem,
                            background: selectedPair === p.symbol ? '#1a1428' : 'transparent'
                          }}>
                          <span style={{fontFamily:'monospace',fontSize:13,color:'#e2e2f0',fontWeight:selectedPair===p.symbol?700:400}}>{p.symbol}</span>
                          <span style={{fontSize:12,color:'#8080a0',marginLeft:8}}>{p.name}</span>
                          <span style={{marginLeft:'auto',fontSize:12,fontFamily:'monospace',color:p.change24h>=0?'#4ade80':'#f87171'}}>
                            {p.change24h>=0?'+':''}{p.change24h?.toFixed(1)}%
                          </span>
                        </div>
                      ))}
                      {filteredPairs.length > 20 && (
                        <div style={{padding:'8px 12px',fontSize:11,color:'#6060a0',textAlign:'center'}}>
                          +{filteredPairs.length-20} resultados — refine a busca
                        </div>
                      )}
                    </div>
                  )}
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
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:12}}>
                    <div style={{display:'flex',alignItems:'center',gap:10}}>
                      <span style={{fontFamily:'monospace',fontSize:16,fontWeight:700,color:'#e2e2f0'}}>{sig.pair}</span>
                      <span style={{fontSize:11,fontWeight:700,padding:'3px 10px',borderRadius:4,background:bgc(sig.signal),color:col(sig.signal),fontFamily:'monospace',border:`1px solid ${col(sig.signal)}44`}}>{sig.signal}</span>
                    </div>
                    <div style={{display:'flex',alignItems:'center',gap:12}}>
                      <div style={{textAlign:'right'}}>
                        <div style={{fontFamily:'monospace',fontSize:22,fontWeight:700,color:col(sig.signal)}}>{sig.confidence}%</div>
                        <div style={{fontSize:11,color:'#8080a0'}}>confiança</div>
                      </div>
                      <button onClick={()=>removeSignal(i)} style={S.closeBtn}>✕</button>
                    </div>
                  </div>

                  <div style={{fontFamily:'monospace',fontSize:14,color:'#a78bfa',marginBottom:14,fontWeight:500}}>
                    ${sig.price?.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:4})}
                  </div>

                  <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8,marginBottom:10}}>
                    {[
                      ['RSI', sig.indicators.rsi, sig.indicators.rsi<35?'#4ade80':sig.indicators.rsi>65?'#f87171':'#c4c4d4'],
                      ['MACD', sig.indicators.macd, sig.indicators.macd>0?'#4ade80':'#f87171'],
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

                  <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8,marginBottom:10}}>
                    {[
                      ['BB Superior','$'+sig.bollinger?.upper?.toLocaleString(),'#f87171'],
                      ['BB Média','$'+sig.bollinger?.middle?.toLocaleString(),'#c4c4d4'],
                      ['BB Inferior','$'+sig.bollinger?.lower?.toLocaleString(),'#4ade80'],
                    ].map(([l,v,c])=>(
                      <div key={String(l)} style={{background:'#0f0f1a',borderRadius:6,padding:'8px 10px',border:'0.5px solid #1e1e30'}}>
                        <div style={{fontSize:10,color:'#6060a0',textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:3}}>{l}</div>
                        <div style={{fontFamily:'monospace',fontSize:12,color:String(c),fontWeight:500}}>{v}</div>
                      </div>
                    ))}
                  </div>

                  {sig.fearGreed&&(
                    <div style={{background:'#0f0f1a',border:'0.5px solid #1e1e30',borderRadius:6,padding:'10px 12px',marginBottom:12}}>
                      <div style={{display:'flex',alignItems:'center',marginBottom:6}}>
                        <span style={{fontSize:11,color:'#8080a0',textTransform:'uppercase',letterSpacing:'0.05em'}}>Fear & Greed</span>
                        <span style={{fontFamily:'monospace',fontSize:13,fontWeight:700,color:fgColor(sig.fearGreed.value),marginLeft:'auto'}}>{sig.fearGreed.value} — {sig.fearGreed.label}</span>
                      </div>
                      <div style={{height:6,background:'#1e1e30',borderRadius:99,overflow:'hidden'}}>
                        <div style={{width:`${sig.fearGreed.value}%`,height:'100%',background:'linear-gradient(90deg,#f87171,#fbbf24,#4ade80)',borderRadius:99}}/>
                      </div>
                    </div>
                  )}

                  {/* Trade Setup */}
                  {(sig as any).tradeSetup && (
                    <div style={{background:'#0f0f1a',border:`1px solid ${col(sig.signal)}33`,borderRadius:8,padding:'12px 14px',marginBottom:12}}>
                      <div style={{fontSize:11,color:'#8080a0',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:10,fontWeight:600}}>
                        📊 Trade Setup
                      </div>
                      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:10}}>
                        <div style={{background:'#141424',borderRadius:6,padding:'8px 12px',border:'0.5px solid #1e1e30'}}>
                          <div style={{fontSize:10,color:'#8080a0',marginBottom:3}}>ENTRADA</div>
                          <div style={{fontFamily:'monospace',fontSize:13,color:'#e2e2f0',fontWeight:600}}>${(sig as any).tradeSetup.entry?.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:6})}</div>
                        </div>
                        <div style={{background:'#1a0808',borderRadius:6,padding:'8px 12px',border:'0.5px solid #3d1010'}}>
                          <div style={{fontSize:10,color:'#f87171',marginBottom:3}}>STOP LOSS</div>
                          <div style={{fontFamily:'monospace',fontSize:13,color:'#f87171',fontWeight:600}}>${(sig as any).tradeSetup.stopLoss?.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:6})}</div>
                          <div style={{fontSize:10,color:'#6060a0',marginTop:2}}>Risco: {(sig as any).tradeSetup.riskPct}%</div>
                        </div>
                      </div>
                      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
                        <div style={{background:'rgba(74,222,128,0.05)',borderRadius:6,padding:'8px 12px',border:'0.5px solid rgba(74,222,128,0.2)'}}>
                          <div style={{fontSize:10,color:'#4ade80',marginBottom:3}}>ALVO 3:1 🎯</div>
                          <div style={{fontFamily:'monospace',fontSize:13,color:'#4ade80',fontWeight:600}}>${(sig as any).tradeSetup.tp1?.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:6})}</div>
                        </div>
                        <div style={{background:'rgba(74,222,128,0.08)',borderRadius:6,padding:'8px 12px',border:'0.5px solid rgba(74,222,128,0.3)'}}>
                          <div style={{fontSize:10,color:'#4ade80',marginBottom:3}}>ALVO 5:1 🚀</div>
                          <div style={{fontFamily:'monospace',fontSize:13,color:'#4ade80',fontWeight:700}}>${(sig as any).tradeSetup.tp2?.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:6})}</div>
                        </div>
                      </div>
                    </div>
                  )}

                  <div style={{display:'flex',flexDirection:'column',gap:6,marginBottom:12}}>
                    {sig.reasoning.map((r,j)=>(
                      <div key={j} style={{display:'flex',gap:8,fontSize:13,color:'#b0b0c4',lineHeight:1.5}}>
                        <span style={{color:col(sig.signal),fontSize:10,marginTop:3,flexShrink:0}}>▸</span><span>{r}</span>
                      </div>
                    ))}
                  </div>

                  <div style={{display:'flex',justifyContent:'space-between',fontSize:11,paddingTop:8,borderTop:'0.5px solid #1e1e30'}}>
                    <span style={{color:'#6060a0'}}>{new Date(sig.timestamp).toLocaleTimeString('pt-BR')}</span>
                    <span style={{color:'#6060a0'}}>−{sig.creditsUsed} crédito</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </main>
      </div>
      {/* Modal de compra */}
      {showShop && user && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.8)',zIndex:200,display:'flex',alignItems:'center',justifyContent:'center',padding:24}}
          onClick={()=>setShowShop(false)}>
          <div style={{background:'#0a0a14',border:'1px solid #1a1a28',borderRadius:16,padding:28,maxWidth:420,width:'100%',maxHeight:'90vh',overflowY:'auto'}}
            onClick={e=>e.stopPropagation()}>

            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
              <h2 style={{fontFamily:'monospace',fontSize:16,color:'#e2e2f0'}}>◆ Comprar Créditos</h2>
              <button onClick={()=>setShowShop(false)} style={{background:'none',border:'none',color:'#6060a0',cursor:'pointer',fontSize:18}}>✕</button>
            </div>

            {paySuccess ? (
              <div style={{textAlign:'center',padding:'24px 0'}}>
                <div style={{fontSize:40,marginBottom:12}}>✅</div>
                <div style={{color:'#4ade80',fontFamily:'monospace',fontSize:16,fontWeight:700}}>Pagamento confirmado!</div>
                <div style={{color:'#8080a0',fontSize:13,marginTop:8}}>{selectedPkg?.credits} créditos adicionados à sua conta.</div>
              </div>
            ) : buyStep === 'select' ? (
              <>
                <p style={{fontSize:13,color:'#8080a0',marginBottom:16}}>Aceita USDC e USDT na rede Base. Taxa de ~$0.01.</p>
                <div style={{display:'flex',flexDirection:'column',gap:10}}>
                  {PACKAGES.map(pkg=>(
                    <div key={pkg.id} onClick={()=>{setSelectedPkg(pkg);setBuyStep('pay')}}
                      style={{background:'#0f0f1a',border:'1px solid #1e1e30',borderRadius:10,padding:'14px 16px',cursor:'pointer',transition:'border 0.2s'}}>
                      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                        <div>
                          <div style={{fontFamily:'monospace',fontSize:14,fontWeight:700,color:'#e2e2f0'}}>{pkg.name}</div>
                          <div style={{fontSize:12,color:'#8080a0',marginTop:2}}>{pkg.desc}</div>
                        </div>
                        <div style={{textAlign:'right'}}>
                          <div style={{fontFamily:'monospace',fontSize:18,fontWeight:700,color:'#a78bfa'}}>${pkg.priceUSD}</div>
                          <div style={{fontSize:11,color:'#4ade80'}}>{pkg.credits} créditos</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : buyStep === 'pay' ? (
              <>
                <button onClick={()=>setBuyStep('select')} style={{background:'none',border:'none',color:'#8080a0',cursor:'pointer',fontSize:13,marginBottom:16}}>← Voltar</button>
                <div style={{background:'#0f0f1a',border:'1px solid #1e1e30',borderRadius:10,padding:16,marginBottom:16}}>
                  <div style={{fontSize:12,color:'#8080a0',marginBottom:8}}>Envie exatamente:</div>
                  <div style={{fontFamily:'monospace',fontSize:24,fontWeight:700,color:'#a78bfa',marginBottom:4}}>${selectedPkg?.priceUSD} USDC ou USDT</div>
                  <div style={{fontSize:12,color:'#8080a0'}}>= {selectedPkg?.credits} créditos</div>
                </div>
                <div style={{background:'#0f0f1a',border:'1px solid #1e1e30',borderRadius:10,padding:16,marginBottom:16}}>
                  <div style={{fontSize:12,color:'#8080a0',marginBottom:6}}>Para o endereço (rede Base):</div>
                  <div style={{fontFamily:'monospace',fontSize:11,color:'#e2e2f0',wordBreak:'break-all',background:'#141424',padding:'8px 10px',borderRadius:6,border:'1px solid #1e1e30'}}>{RECEIVE}</div>
                  <button onClick={()=>navigator.clipboard.writeText(RECEIVE)}
                    style={{marginTop:8,background:'#1a1428',border:'1px solid #2d2050',color:'#a78bfa',fontSize:12,padding:'6px 12px',borderRadius:6,cursor:'pointer',fontFamily:'inherit',width:'100%'}}>
                    📋 Copiar endereço
                  </button>
                </div>
                <div style={{fontSize:12,color:'#8080a0',marginBottom:8}}>Após enviar, cole o hash da transação:</div>
                <input
                  type="text" placeholder="0x... (hash da transação)"
                  value={txHash} onChange={e=>setTxHash(e.target.value)}
                  style={{width:'100%',background:'#0f0f1a',border:'1px solid #1e1e30',color:'#e2e2f0',padding:'10px 14px',borderRadius:8,fontSize:13,fontFamily:'monospace',outline:'none',marginBottom:12}}
                />
                {payError && <div style={{color:'#f87171',fontSize:12,marginBottom:12}}>{payError}</div>}
                <button onClick={confirmPayment} disabled={!txHash||confirming}
                  style={{width:'100%',padding:'12px',background:'linear-gradient(135deg,#7c3aed,#a78bfa)',color:'#fff',border:'none',borderRadius:8,fontSize:14,fontWeight:600,cursor:'pointer',fontFamily:'monospace',opacity:(!txHash||confirming)?0.5:1}}>
                  {confirming?'Verificando...':'✓ Confirmar Pagamento'}
                </button>
                <p style={{fontSize:11,color:'#404060',marginTop:10,textAlign:'center'}}>Os créditos são adicionados automaticamente após confirmação on-chain</p>
              </>
            ) : null}
          </div>
        </div>
      )}

      <style>{`
        *{box-sizing:border-box;margin:0;padding:0;}
        body{background:#08080f;}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        input::placeholder{color:#404060;}
      `}</style>
    </>
  )
}

const S: Record<string,React.CSSProperties> = {
  root:{minHeight:'100vh',background:'#08080f',fontFamily:'"DM Sans",system-ui,sans-serif',color:'#e2e2f0'},
  center:{display:'flex',alignItems:'center',justifyContent:'center',height:'100vh',background:'#08080f'},
  spin:{width:32,height:32,border:'2px solid #1e1e30',borderTop:'2px solid #a78bfa',borderRadius:'50%',animation:'spin 0.8s linear infinite'},
  header:{borderBottom:'1px solid #1a1a28',background:'#0a0a14',position:'sticky',top:0,zIndex:100},
  hInner:{maxWidth:960,margin:'0 auto',padding:'0 24px',height:56,display:'flex',alignItems:'center',justifyContent:'space-between'},
  logo:{display:'flex',alignItems:'center',gap:8},
  logoMark:{fontSize:20,color:'#a78bfa'},
  logoTxt:{fontFamily:'monospace',fontSize:15,fontWeight:700,color:'#e2e2f0'},
  hRight:{display:'flex',alignItems:'center',gap:12},
  credits:{display:'flex',alignItems:'center',gap:6,background:'#1a1428',border:'1px solid #2d2050',padding:'5px 12px',borderRadius:8},
  credNum:{fontFamily:'monospace',fontSize:14,fontWeight:700,color:'#a78bfa'},
  credLbl:{fontSize:11,color:'#7060a0'},
  addr:{fontFamily:'monospace',fontSize:12,color:'#a0a0c0',background:'#0f0f1a',border:'1px solid #1e1e30',padding:'5px 12px',borderRadius:8},
  logoutBtn:{background:'none',border:'1px solid #1e1e30',color:'#8080a0',fontSize:12,padding:'5px 12px',borderRadius:8,cursor:'pointer',fontFamily:'inherit'},
  main:{maxWidth:960,margin:'0 auto',padding:'32px 24px'},
  loginWrap:{minHeight:'calc(100vh - 56px)',display:'flex',alignItems:'center',justifyContent:'center',padding:24},
  loginCard:{background:'#0a0a14',border:'1px solid #1a1a28',borderRadius:16,padding:40,maxWidth:400,width:'100%',textAlign:'center'},
  loginTitle:{fontFamily:'monospace',fontSize:22,fontWeight:700,color:'#e2e2f0',marginBottom:10},
  loginSub:{fontSize:14,color:'#8080a0',lineHeight:1.7,marginBottom:24},
  features:{textAlign:'left',marginBottom:28,display:'flex',flexDirection:'column',gap:10},
  feat:{display:'flex',alignItems:'center',gap:10,fontSize:13},
  errBox:{background:'#1a0808',border:'1px solid #3d1010',color:'#fca5a5',fontSize:13,padding:'10px 14px',borderRadius:8,textAlign:'left'},
  connectBtn:{width:'100%',padding:'14px 20px',background:'linear-gradient(135deg,#7c3aed,#a78bfa)',color:'#fff',border:'none',borderRadius:10,fontSize:15,fontWeight:600,cursor:'pointer',fontFamily:'monospace',marginBottom:14},
  dash:{display:'flex',flexDirection:'column',gap:16},
  panel:{background:'#0a0a14',border:'1px solid #1a1a28',borderRadius:12,padding:20},
  searchInput:{width:'100%',background:'#0f0f1a',border:'1px solid #1e1e30',color:'#e2e2f0',padding:'10px 14px',borderRadius:8,fontSize:13,fontFamily:'inherit',outline:'none'},
  dropdown:{position:'absolute',top:'100%',left:0,right:0,background:'#0f0f1a',border:'1px solid #1e1e30',borderRadius:8,marginTop:4,zIndex:50,maxHeight:280,overflowY:'auto'},
  dropdownItem:{display:'flex',alignItems:'center',padding:'10px 14px',cursor:'pointer',borderBottom:'0.5px solid #1a1a28'},
  genBtn:{padding:'10px 24px',background:'linear-gradient(135deg,#7c3aed,#a78bfa)',color:'#fff',border:'none',borderRadius:8,fontSize:14,fontWeight:600,cursor:'pointer',fontFamily:'monospace',whiteSpace:'nowrap'},
  warnBox:{marginTop:12,background:'#1a1400',border:'1px solid #3d3000',color:'#fcd34d',fontSize:13,padding:'10px 14px',borderRadius:8},
  sigCard:{background:'#0a0a14',border:'1px solid #1a1a28',borderRadius:12,padding:18,animation:'fadeIn 0.3s ease'},
  closeBtn:{background:'#1a1a28',border:'1px solid #2a2a3e',color:'#8080a0',width:28,height:28,borderRadius:6,cursor:'pointer',fontSize:12,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,fontFamily:'inherit'},
}
