import { useState, useEffect } from 'react'
import Head from 'next/head'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export default function Performance() {
  const [signals, setSignals] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [address, setAddress] = useState('')

  useEffect(() => {
    fetch('/api/auth/me').then(r => r.ok ? r.json() : null).then(d => {
      if (d?.address) {
        setAddress(d.address)
        loadSignals(d.address)
      } else {
        setLoading(false)
      }
    })
  }, [])

  const loadSignals = async (addr: string) => {
    const { data } = await supabase
      .from('signals')
      .select('*')
      .eq('address', addr.toLowerCase())
      .order('created_at', { ascending: false })
      .limit(100)
    setSignals(data || [])
    setLoading(false)
  }

  const stats = {
    total: signals.length,
    long: signals.filter(s => s.signal === 'LONG').length,
    short: signals.filter(s => s.signal === 'SHORT').length,
    neutro: signals.filter(s => s.signal === 'NEUTRO').length,
    avgConf: signals.length ? Math.round(signals.reduce((a, s) => a + s.confidence, 0) / signals.length) : 0,
    pairs: signals.map(s => s.pair).filter((v, i, a) => a.indexOf(v) === i).length,
  }

  const col = (s: string) => s==='LONG'?'#4ade80':s==='SHORT'?'#f87171':'#fbbf24'

  if (loading) return <div style={S.center}><div style={S.spin}/></div>

  return (
    <>
      <Head><title>Performance — CryptoSignal AI</title></Head>
      <div style={S.root}>
        <header style={S.header}>
          <div style={S.hInner}>
            <a href="/" style={{textDecoration:'none'}}>
              <div style={S.logo}><span style={{fontSize:20,color:'#a78bfa'}}>◈</span><span style={S.logoTxt}>CryptoSignal AI</span></div>
            </a>
            <a href="/" style={{fontSize:13,color:'#8080a0',textDecoration:'none'}}>← Voltar ao app</a>
          </div>
        </header>

        <main style={S.main}>
          <h1 style={{fontFamily:'monospace',fontSize:20,color:'#e2e2f0',marginBottom:24}}>📊 Performance & Histórico</h1>

          {!address ? (
            <div style={{textAlign:'center',padding:'60px 0',color:'#6060a0'}}>
              <div style={{fontSize:36,marginBottom:12}}>◈</div>
              <p>Conecte sua carteira no app para ver seu histórico.</p>
              <a href="/" style={{color:'#a78bfa',marginTop:12,display:'block'}}>Ir para o app →</a>
            </div>
          ) : (
            <>
              {/* Stats */}
              <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(140px,1fr))',gap:12,marginBottom:24}}>
                {[
                  ['Total sinais', stats.total, '#e2e2f0'],
                  ['LONG', stats.long, '#4ade80'],
                  ['SHORT', stats.short, '#f87171'],
                  ['NEUTRO', stats.neutro, '#fbbf24'],
                  ['Confiança média', stats.avgConf+'%', '#a78bfa'],
                  ['Pares analisados', stats.pairs, '#818cf8'],
                ].map(([l,v,c])=>(
                  <div key={String(l)} style={{background:'#0a0a14',border:'1px solid #1a1a28',borderRadius:10,padding:'14px 16px'}}>
                    <div style={{fontSize:11,color:'#6060a0',textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:6}}>{l}</div>
                    <div style={{fontFamily:'monospace',fontSize:22,fontWeight:700,color:String(c)}}>{v}</div>
                  </div>
                ))}
              </div>

              {/* Aviso de acerto */}
              <div style={{background:'#0f0f1a',border:'1px solid #1e1e30',borderRadius:10,padding:'14px 16px',marginBottom:20,fontSize:13,color:'#8080a0',lineHeight:1.6}}>
                ℹ️ <strong style={{color:'#e2e2f0'}}>Em breve:</strong> rastreamento automático de acertos por alvo (1:1, 2:1, 3:1, 5:1) com base nos preços históricos. Por enquanto você pode comparar manualmente os alvos gerados com o que aconteceu no mercado.
              </div>

              {/* Histórico */}
              <div style={{display:'flex',flexDirection:'column',gap:10}}>
                {signals.length === 0 ? (
                  <div style={{textAlign:'center',padding:'40px 0',color:'#6060a0'}}>Nenhum sinal gerado ainda.</div>
                ) : signals.map((sig, i) => (
                  <div key={i} style={{background:'#0a0a14',border:'1px solid #1a1a28',borderRadius:10,padding:'14px 16px',borderLeft:`3px solid ${col(sig.signal)}`}}>
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
                      <div style={{display:'flex',alignItems:'center',gap:10}}>
                        <span style={{fontFamily:'monospace',fontSize:14,fontWeight:700,color:'#e2e2f0'}}>{sig.pair}</span>
                        <span style={{fontSize:11,fontWeight:700,padding:'2px 8px',borderRadius:4,background:`${col(sig.signal)}15`,color:col(sig.signal),fontFamily:'monospace'}}>{sig.signal}</span>
                      </div>
                      <div style={{display:'flex',alignItems:'center',gap:12}}>
                        <span style={{fontFamily:'monospace',fontSize:14,fontWeight:700,color:col(sig.signal)}}>{sig.confidence}%</span>
                        <span style={{fontSize:11,color:'#6060a0'}}>{new Date(sig.created_at).toLocaleString('pt-BR')}</span>
                      </div>
                    </div>
                    {sig.price && (
                      <div style={{display:'flex',gap:16,fontSize:12,color:'#8080a0'}}>
                        <span>Preço entrada: <span style={{color:'#a78bfa',fontFamily:'monospace'}}>${sig.price?.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:4})}</span></span>
                        {sig.analysis?.tradeSetup?.targets && (
                          <>
                            <span>SL: <span style={{color:'#f87171',fontFamily:'monospace'}}>${sig.analysis.tradeSetup.stopLoss?.toLocaleString()}</span></span>
                            <span>1:1: <span style={{color:'#4ade80',fontFamily:'monospace'}}>${sig.analysis.tradeSetup.targets.conservative?.tp?.toLocaleString()}</span></span>
                            <span>3:1: <span style={{color:'#f97316',fontFamily:'monospace'}}>${sig.analysis.tradeSetup.targets.high?.tp?.toLocaleString()}</span></span>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </main>
      </div>
      <style>{`*{box-sizing:border-box;margin:0;padding:0;}body{background:#08080f;}@keyframes spin{to{transform:rotate(360deg)}}`}</style>
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
  logoTxt:{fontFamily:'monospace',fontSize:15,fontWeight:700,color:'#e2e2f0'},
  main:{maxWidth:960,margin:'0 auto',padding:'32px 24px'},
}
