import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY!

// Cliente público (frontend)
export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Cliente admin (backend — bypassa RLS)
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)

// ============================================
// Usuários
// ============================================
export async function getOrCreateUser(address: string) {
  const { data, error } = await supabaseAdmin
    .from('users')
    .upsert(
      { address: address.toLowerCase(), updated_at: new Date().toISOString() },
      { onConflict: 'address', ignoreDuplicates: false }
    )
    .select()
    .single()

  if (error) throw error
  return data
}

export async function getUser(address: string) {
  const { data } = await supabaseAdmin
    .from('users')
    .select('*')
    .eq('address', address.toLowerCase())
    .single()
  return data
}

// ============================================
// Créditos
// ============================================
export async function getCredits(address: string): Promise<number> {
  const { data } = await supabaseAdmin
    .from('users')
    .select('credits')
    .eq('address', address.toLowerCase())
    .single()
  return data?.credits ?? 0
}

export async function deductCredits(
  address: string,
  amount: number,
  reason: string
): Promise<{ success: boolean; remaining?: number; error?: string }> {
  const current = await getCredits(address)

  if (current < amount) {
    return { success: false, error: 'Créditos insuficientes' }
  }

  const { data, error } = await supabaseAdmin
    .from('users')
    .update({ credits: current - amount })
    .eq('address', address.toLowerCase())
    .select('credits')
    .single()

  if (error) return { success: false, error: error.message }

  // Log da operação
  await supabaseAdmin.from('credit_logs').insert({
    address: address.toLowerCase(),
    amount: -amount,
    reason,
    balance_after: data.credits
  })

  return { success: true, remaining: data.credits }
}

export async function addCredits(address: string, amount: number, reason: string) {
  const current = await getCredits(address)

  const { data, error } = await supabaseAdmin
    .from('users')
    .update({ credits: current + amount })
    .eq('address', address.toLowerCase())
    .select('credits')
    .single()

  if (error) throw error

  await supabaseAdmin.from('credit_logs').insert({
    address: address.toLowerCase(),
    amount: +amount,
    reason,
    balance_after: data.credits
  })

  return data.credits
}

// ============================================
// SQL para criar as tabelas no Supabase
// (execute no SQL Editor do Supabase)
// ============================================
export const SUPABASE_SCHEMA = `
-- Usuários
CREATE TABLE IF NOT EXISTS users (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  address TEXT UNIQUE NOT NULL,
  credits INTEGER DEFAULT 50,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Log de créditos
CREATE TABLE IF NOT EXISTS credit_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  address TEXT NOT NULL,
  amount INTEGER NOT NULL,
  reason TEXT,
  balance_after INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Sinais gerados
CREATE TABLE IF NOT EXISTS signals (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  address TEXT NOT NULL,
  pair TEXT NOT NULL,
  signal TEXT NOT NULL,
  confidence NUMERIC,
  analysis JSONB,
  credits_used INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_users_address ON users(address);
CREATE INDEX IF NOT EXISTS idx_logs_address ON credit_logs(address);
CREATE INDEX IF NOT EXISTS idx_signals_address ON signals(address);
`
