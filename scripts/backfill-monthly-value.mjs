// Backfill único de subscriptions.monthly_value_cents pras assinaturas ativas
// hoje, sem esperar o próximo evento Stripe/Pix. Roda uma vez, não é cron.
//
// Escreve APENAS a coluna monthly_value_cents — nunca toca em plan_tier,
// status, addons ou qualquer coisa que afete acesso/entitlement.
//
// Uso (dry-run por padrão — só imprime o que mudaria):
//   node --env-file=.env.vercel scripts/backfill-monthly-value.mjs
// Pra aplicar de verdade:
//   node --env-file=.env.vercel scripts/backfill-monthly-value.mjs --apply
//
// IMPORTANTE: use o env de PRODUÇÃO (.env.vercel ou as envs reais do Vercel/
// Dokploy), não .env.local — senão vai ler/escrever no banco/Stripe errado.

import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';
import { computeStripeMonthlyValueCents } from '../src/lib/pricing.js';

const APPLY = process.argv.includes('--apply');

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_PUBLIC_SUPABASE_URL || process.env.PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const stripeSecretKey = process.env.STRIPE_SECRET_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Faltando SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY no ambiente. Rode com --env-file apontando pro env de produção.');
  process.exit(1);
}
if (!stripeSecretKey) {
  console.error('Faltando STRIPE_SECRET_KEY no ambiente.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);
const stripe = new Stripe(stripeSecretKey, { apiVersion: '2024-06-20' });

async function findLatestPaidPixAmount(sub) {
  const { data, error } = await supabase
    .from('billing_payments')
    .select('amount_expected_cents, paid_at')
    .eq('subscription_id', sub.id)
    .eq('status', 'paid')
    .order('paid_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.warn(`  [warn] falha lendo billing_payments pra sub ${sub.id}: ${error.message}`);
    return null;
  }
  return data?.amount_expected_cents ?? null;
}

async function findStripeAmount(sub) {
  if (!sub.provider_subscription_id) return null;
  try {
    const stripeSub = await stripe.subscriptions.retrieve(sub.provider_subscription_id, {
      expand: ['items.data.price'],
    });
    return computeStripeMonthlyValueCents(stripeSub.items?.data);
  } catch (err) {
    console.warn(`  [warn] falha buscando Stripe sub ${sub.provider_subscription_id}: ${err.message}`);
    return null;
  }
}

async function main() {
  console.log(APPLY ? '=== MODO: aplicando de verdade ===' : '=== MODO: dry-run (nada será escrito) ===');

  const { data: subs, error } = await supabase
    .from('subscriptions')
    .select('id, user_id, status, plan_tier, payment_provider, provider_subscription_id, monthly_value_cents')
    .in('status', ['active', 'trialing']);

  if (error) {
    console.error('Erro lendo subscriptions:', error.message);
    process.exit(1);
  }

  console.log(`${subs.length} assinatura(s) ativa(s)/trial encontrada(s).\n`);

  let toUpdate = 0;
  let skipped = 0;
  let unresolved = 0;

  for (const sub of subs) {
    if (sub.monthly_value_cents != null) {
      console.log(`- [skip] sub ${sub.id} (user ${sub.user_id}) já tem monthly_value_cents=${sub.monthly_value_cents}`);
      skipped++;
      continue;
    }

    let amountCents = null;
    if (sub.payment_provider === 'stripe') {
      amountCents = await findStripeAmount(sub);
    } else if (sub.payment_provider === 'abacatepay') {
      amountCents = await findLatestPaidPixAmount(sub);
    }

    if (amountCents == null) {
      console.log(`- [sem dado] sub ${sub.id} (user ${sub.user_id}, provider=${sub.payment_provider || 'nenhum'}, plan=${sub.plan_tier}) — não achei valor real, mantém fallback estimado.`);
      unresolved++;
      continue;
    }

    console.log(`- [update] sub ${sub.id} (user ${sub.user_id}, provider=${sub.payment_provider}, plan=${sub.plan_tier}) → monthly_value_cents=${amountCents} (R$ ${(amountCents / 100).toFixed(2)})`);
    toUpdate++;

    if (APPLY) {
      const { error: updateError } = await supabase
        .from('subscriptions')
        .update({ monthly_value_cents: amountCents })
        .eq('id', sub.id);
      if (updateError) {
        console.error(`  [erro] falha ao gravar sub ${sub.id}: ${updateError.message}`);
      }
    }
  }

  console.log(`\nResumo: ${toUpdate} pra atualizar, ${skipped} já ok, ${unresolved} sem dado real (ficam no fallback estimado).`);
  if (!APPLY && toUpdate > 0) {
    console.log('\nDry-run apenas. Rode de novo com --apply pra gravar de verdade.');
  }
}

main().then(() => process.exit(0)).catch((err) => {
  console.error('Erro inesperado:', err);
  process.exit(1);
});
