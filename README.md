# CryptoSignal AI — MVP

Plataforma de sinais de crypto gerados por IA com autenticação por carteira Web3.

## Stack
- **Frontend**: Next.js 14 + TypeScript
- **Auth**: SIWE (Sign-In With Ethereum) + JWT httpOnly cookies
- **Banco**: Supabase (Postgres)
- **Rede**: Base (L2 Ethereum) — $0.01/tx para pagamentos

## Setup em 5 passos

### 1. Instalar dependências
```bash
npm install
```

### 2. Configurar variáveis de ambiente
```bash
cp .env.example .env.local
# Edite .env.local com seus valores
```

### 3. Criar tabelas no Supabase
No SQL Editor do seu projeto Supabase, execute o conteúdo de `lib/db.ts` 
(a constante `SUPABASE_SCHEMA` no final do arquivo).

### 4. Rodar em desenvolvimento
```bash
npm run dev
# Acesse http://localhost:3000
```

### 5. Deploy (Vercel — recomendado)
```bash
npx vercel
# Configure as env vars no dashboard da Vercel
```

## Como funciona o login
1. Usuário clica "Conectar MetaMask"
2. Backend gera nonce único (expira em 5 min)
3. MetaMask mostra mensagem para assinar (não move fundos)
4. Backend verifica assinatura com criptografia secp256k1
5. JWT válido por 24h é salvo em cookie httpOnly seguro

## Sistema de créditos
- Todo usuário novo ganha **50 créditos** grátis
- Cada sinal custa **1 crédito**
- Logs de todos os débitos em `credit_logs`
- Próximo passo: integrar pagamento USDC na rede Base

## Arquitetura dos arquivos
```
pages/
  index.tsx          → App principal (login + dashboard)
  api/
    auth/
      nonce.ts       → Gera nonce temporário
      verify.ts      → Verifica assinatura SIWE → JWT
      me.ts          → Retorna usuário autenticado
      logout.ts      → Limpa cookie
    signal.ts        → Gera sinal de IA (consome crédito)
lib/
  auth.ts            → SIWE, nonce, JWT
  db.ts              → Supabase, usuários, créditos
```

## Próximos passos
- [ ] Integrar API real (Binance, CoinGecko) para dados de mercado
- [ ] Adicionar pagamento USDC via Base
- [ ] Webhook para enviar sinais para bots externos
- [ ] Análise on-chain com dados Glassnode/Nansen
- [ ] Rate limiting por endereço
