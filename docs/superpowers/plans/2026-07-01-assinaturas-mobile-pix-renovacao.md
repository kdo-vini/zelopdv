# Assinaturas mobile-first + PIX de renovação (admin) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar paridade mobile-first à tela de Assinaturas do admin e permitir que o admin gere um PIX de renovação (plano atual da conta) que renova a assinatura automaticamente ao ser pago, entregue por WhatsApp.

**Architecture:** Extrair a criação/persistência de cobrança PIX para funções compartilhadas em `src/lib/server/billingPix.js`, consumidas tanto pelo endpoint owner existente quanto por um novo endpoint admin (`POST /api/admin/billing/pix/create`). A ativação continua 100% via webhook AbacatePay existente (`syncPixPaymentWithRemote`), que lê tudo do registro `billing_payments`. A UI do admin (`admin-dashboard`) ganha um card mobile com paridade de ações e um modal de geração/entrega do PIX.

**Tech Stack:** SvelteKit 2 (app principal, Svelte 5 / admin-dashboard Svelte 4), Vitest, Supabase (service-role via `supabaseAdmin`), AbacatePay (PIX transparente), ZeloChat interno (WhatsApp).

## Global Constraints

- Catálogo canônico de planos/add-ons/preços: `src/lib/pricing.js`. Nunca hardcode preço fora dele.
- `subscriptions` é a fonte de verdade de acesso; uma assinatura efetiva canônica por `user_id` (`order(updated_at desc).limit(1)`).
- `supabaseAdmin` só em handlers server-side.
- Endpoints admin seguem o padrão CORS + checagem `super_admins.is_active=true` de `src/routes/api/admin/billing/*`.
- Mensagens WhatsApp via ZeloChat são texto puro, **sem emoji** (convenção de `src/lib/server/whatsapp.js`).
- Não hardcode hex em componentes; usar as classes/tema já existentes no `admin-dashboard`.
- Preços atuais (de `pricing.js`, para conferência de testes): pdv R$ 59, chat R$ 147, bundle R$ 197; add-ons mesas/pedidos/acessos R$ 30; menu R$ 40.
- A ativação de assinatura por PIX NÃO é feita na criação; ocorre no webhook ao pagar.

---

## File Structure

- `src/lib/server/billingPix.js` (modificar) — novas funções compartilhadas: `validatePixCustomerProfile`, `buildPixDescription`, `serializePixCharge`, `pendingPaymentMatchesSelection`, `createOrReusePixCharge`, `buildRenewalPixWhatsAppMessage`, const `PIX_EXPIRATION_SECONDS`.
- `src/routes/api/billing/pix/create/+server.js` (modificar) — refatorar para consumir os helpers compartilhados; comportamento inalterado.
- `src/routes/api/admin/billing/pix/create/+server.js` (criar) — endpoint admin.
- `tests/server.billingPix.renewal.test.js` (criar) — unit dos helpers.
- `tests/api.admin-billing-pix-create.test.js` (criar) — integração do endpoint admin.
- `admin-dashboard/src/routes/subscriptions/+page.svelte` (modificar) — card mobile com paridade + modal PIX + funções de geração/entrega.

---

## Task 1: Helpers puros de PIX em `billingPix.js`

Extrai validação de perfil e a mensagem de WhatsApp — funções puras, fáceis de testar sem mocks.

**Files:**
- Modify: `src/lib/server/billingPix.js`
- Test: `tests/server.billingPix.renewal.test.js`

**Interfaces:**
- Consumes: `normalizeBrazilianTaxId`, `isValidBrazilianTaxId`, `normalizeBrazilianPhone` de `$lib/masks`; `PLANS` de `$lib/pricing`.
- Produces:
  - `validatePixCustomerProfile(perfil): { ok: true, name: string, taxId: string, phone: string } | { ok: false, code: 'missing_fields'|'invalid_tax_id'|'invalid_phone', message: string }`
  - `buildPixDescription(planTier): string` (≤ 37 chars)
  - `buildRenewalPixWhatsAppMessage({ nome: string, planName: string, amountCents: number, brCode: string }): string`
  - `PIX_EXPIRATION_SECONDS: number` (3600)

- [ ] **Step 1: Write the failing test**

Create `tests/server.billingPix.renewal.test.js`:

```js
import { describe, expect, it } from 'vitest';
import {
  validatePixCustomerProfile,
  buildPixDescription,
  buildRenewalPixWhatsAppMessage,
  PIX_EXPIRATION_SECONDS,
} from '../src/lib/server/billingPix.js';

describe('validatePixCustomerProfile', () => {
  it('ok com perfil completo e normaliza taxId/phone', () => {
    const r = validatePixCustomerProfile({
      nome_exibicao: 'Loja Teste',
      documento: '529.982.247-25',
      contato: '(11) 99999-9999',
    });
    expect(r.ok).toBe(true);
    expect(r.name).toBe('Loja Teste');
    expect(r.taxId).toBe('52998224725');
    expect(r.phone).toBe('5511999999999');
  });

  it('missing_fields quando falta documento', () => {
    const r = validatePixCustomerProfile({ nome_exibicao: 'Loja', documento: null, contato: '11999999999' });
    expect(r.ok).toBe(false);
    expect(r.code).toBe('missing_fields');
  });

  it('invalid_tax_id quando CPF invalido', () => {
    const r = validatePixCustomerProfile({ nome_exibicao: 'Loja', documento: '11111111111', contato: '11999999999' });
    expect(r.ok).toBe(false);
    expect(r.code).toBe('invalid_tax_id');
  });

  it('invalid_phone quando telefone invalido', () => {
    const r = validatePixCustomerProfile({ nome_exibicao: 'Loja', documento: '52998224725', contato: '123' });
    expect(r.ok).toBe(false);
    expect(r.code).toBe('invalid_phone');
  });

  it('missing_fields quando perfil null', () => {
    expect(validatePixCustomerProfile(null).code).toBe('missing_fields');
  });
});

describe('buildPixDescription', () => {
  it('usa nome do plano e limita a 37 chars', () => {
    const d = buildPixDescription('pdv');
    expect(d).toContain('ZeloPDV');
    expect(d.length).toBeLessThanOrEqual(37);
  });
  it('fallback Zelo para plano desconhecido', () => {
    expect(buildPixDescription('xxx')).toContain('Zelo');
  });
});

describe('buildRenewalPixWhatsAppMessage', () => {
  it('inclui nome, valor formatado, plano e brCode, sem emoji', () => {
    const msg = buildRenewalPixWhatsAppMessage({
      nome: 'João Silva',
      planName: 'ZeloPDV',
      amountCents: 5900,
      brCode: '00020101-BRCODE-XYZ',
    });
    expect(msg).toContain('João');
    expect(msg).toContain('ZeloPDV');
    expect(msg).toContain('59,00');
    expect(msg).toContain('00020101-BRCODE-XYZ');
    // sem emoji: só ASCII + acentos latinos
    expect(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(msg)).toBe(false);
  });
});

describe('PIX_EXPIRATION_SECONDS', () => {
  it('vale 3600', () => {
    expect(PIX_EXPIRATION_SECONDS).toBe(3600);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- server.billingPix.renewal`
Expected: FAIL (funções não exportadas ainda).

- [ ] **Step 3: Implement the helpers**

Edit `src/lib/server/billingPix.js`. Add imports no topo (após os imports existentes):

```js
import {
  isValidBrazilianTaxId,
  normalizeBrazilianPhone,
  normalizeBrazilianTaxId,
} from '$lib/masks';
import { PLANS } from '$lib/pricing';
```

Add ao final do arquivo:

```js
export const PIX_EXPIRATION_SECONDS = 60 * 60;

export function buildPixDescription(planTier) {
  const base = `Assinatura ${PLANS[planTier]?.name || 'Zelo'}`;
  return base.slice(0, 37);
}

export function validatePixCustomerProfile(perfil) {
  if (!perfil?.nome_exibicao || !perfil?.documento || !perfil?.contato) {
    return {
      ok: false,
      code: 'missing_fields',
      message: 'Complete nome da empresa, CPF/CNPJ e telefone antes de gerar um Pix.',
    };
  }
  const taxId = normalizeBrazilianTaxId(perfil.documento);
  if (!taxId || !isValidBrazilianTaxId(taxId)) {
    return {
      ok: false,
      code: 'invalid_tax_id',
      message: 'CPF/CNPJ inválido no perfil da empresa. Atualize o cadastro antes de gerar Pix.',
    };
  }
  const phone = normalizeBrazilianPhone(perfil.contato);
  if (!phone) {
    return {
      ok: false,
      code: 'invalid_phone',
      message: 'Telefone inválido no perfil da empresa. Atualize o cadastro antes de gerar Pix.',
    };
  }
  return { ok: true, name: perfil.nome_exibicao, taxId, phone };
}

function formatBrlFromCents(amountCents) {
  return (Number(amountCents || 0) / 100).toFixed(2).replace('.', ',');
}

export function buildRenewalPixWhatsAppMessage({ nome, planName, amountCents, brCode }) {
  const primeiroNome = (nome || 'tudo bem').split(' ')[0];
  return (
    `Ola ${primeiroNome}! Aqui esta o PIX para renovar sua assinatura ${planName} do ZeloPDV, ` +
    `no valor de R$ ${formatBrlFromCents(amountCents)}. ` +
    `Copie o codigo abaixo e pague no app do seu banco (PIX Copia e Cola). ` +
    `Assim que o pagamento for confirmado, sua assinatura e renovada automaticamente.\n\n` +
    `${brCode}\n\n` +
    `Qualquer duvida e so chamar. — Equipe ZeloPDV`
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- server.billingPix.renewal`
Expected: PASS (todos os describes acima).

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/billingPix.js tests/server.billingPix.renewal.test.js
git commit -m "feat(billing): helpers puros de PIX (validacao perfil + msg whatsapp)"
```

---

## Task 2: `createOrReusePixCharge` compartilhado em `billingPix.js`

Move a lógica de reaproveitamento/criação de cobrança + insert de `billing_payments` para uma função compartilhada.

**Files:**
- Modify: `src/lib/server/billingPix.js`
- Test: `tests/server.billingPix.renewal.test.js` (adiciona describe novo)

**Interfaces:**
- Consumes: `createTransparentPixCharge` de `$lib/server/abacatePay`; `calculateValue`, `sanitizeAddons` de `$lib/pricing`; `supabaseAdmin`; `buildPixDescription`, `PIX_EXPIRATION_SECONDS` (Task 1).
- Produces:
  - `serializePixCharge(row): { paymentId, status, amountCents, brCode, qrCodeBase64, expiresAt, providerPaymentId, planTier, addons: {mesas,pedidos,acessos,menu} }`
  - `pendingPaymentMatchesSelection(payment, planTier, addons, amountCents): boolean`
  - `createOrReusePixCharge({ userId, email, planTier, addons, name, taxId, phone, source, metadataExtra? }): Promise<{ reused: boolean, row: object }>`
    - `addons` já sanitizado `{mesas,pedidos,acessos,menu}`; `source` string p/ `metadata.source`; `metadataExtra` objeto opcional mesclado no metadata.

- [ ] **Step 1: Write the failing test**

Adicione a `tests/server.billingPix.renewal.test.js` (topo: adicione `vi, beforeEach` ao import do vitest e o helper de mock):

```js
import { beforeEach, describe, expect, it, vi } from 'vitest';

function makeSelectChain(result) {
  const chain = {
    eq: vi.fn(() => chain),
    order: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    maybeSingle: vi.fn(async () => ({ data: result ?? null, error: null })),
    single: vi.fn(async () => ({ data: result ?? null, error: null })),
  };
  return chain;
}

function makeSupabaseAdmin(state) {
  return {
    from: vi.fn((table) => ({
      select: vi.fn(() => makeSelectChain(state.selectResults?.[table] ?? null)),
      insert: vi.fn((payload) => {
        state.writes.push({ table, operation: 'insert', payload });
        return {
          select: vi.fn(() => ({
            single: vi.fn(async () => ({ data: Array.isArray(payload) ? payload[0] : payload, error: null })),
          })),
        };
      }),
      update: vi.fn((payload) => ({
        eq: vi.fn(async () => {
          state.writes.push({ table, operation: 'update', payload });
          return { error: null };
        }),
      })),
    })),
  };
}

describe('createOrReusePixCharge', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    vi.stubEnv('ABACATEPAY_API_KEY', 'abc_dev_test_key');
  });

  async function load(state, chargeImpl) {
    vi.doMock('$lib/server/supabaseAdmin', () => ({ supabaseAdmin: makeSupabaseAdmin(state) }));
    vi.doMock('$lib/server/abacatePay', () => ({
      isAbacatePayConfigured: () => true,
      createTransparentPixCharge: chargeImpl,
    }));
    return await import('../src/lib/server/billingPix.js');
  }

  it('cria charge nova e insere billing_payments pending com kind subscription_renewal', async () => {
    const state = {
      writes: [],
      selectResults: {
        subscriptions: { id: 'sub-1', status: 'active', current_period_end: '2026-08-01T00:00:00Z' },
        billing_payments: null,
      },
    };
    const charge = vi.fn(async () => ({
      id: 'pix_1', status: 'PENDING', brCode: 'BR-CODE-1',
      brCodeBase64: 'data:image/png;base64,xx', expiresAt: '2026-07-01T18:00:00Z',
    }));
    const { createOrReusePixCharge } = await load(state, charge);

    const res = await createOrReusePixCharge({
      userId: 'user-1', email: 'u@test.com', planTier: 'pdv',
      addons: { mesas: false, pedidos: false, acessos: false, menu: false },
      name: 'Loja', taxId: '52998224725', phone: '5511999999999', source: 'admin_renewal_pix',
    });

    expect(res.reused).toBe(false);
    expect(charge).toHaveBeenCalledOnce();
    const insert = state.writes.find(w => w.table === 'billing_payments' && w.operation === 'insert');
    expect(insert.payload.status).toBe('pending');
    expect(insert.payload.kind).toBe('subscription_renewal');
    expect(insert.payload.user_id).toBe('user-1');
    expect(insert.payload.subscription_id).toBe('sub-1');
    expect(insert.payload.plan_tier).toBe('pdv');
    expect(insert.payload.amount_expected_cents).toBe(5900);
    expect(insert.payload.metadata.source).toBe('admin_renewal_pix');
    expect(res.row.br_code).toBe('BR-CODE-1');
  });

  it('reusa pending valido com mesma selecao sem criar charge nova', async () => {
    const state = {
      writes: [],
      selectResults: {
        subscriptions: { id: 'sub-1', status: 'active' },
        billing_payments: {
          id: 'pay-existing', status: 'pending', amount_expected_cents: 5900,
          plan_tier: 'pdv', has_mesas_addon: false, has_pedidos_addon: false,
          has_acessos_addon: false, has_zelo_menu: false,
          br_code: 'BR-OLD', qr_code_base64: 'data:x', provider_payment_id: 'pix_old',
          expires_at: new Date(Date.now() + 3600_000).toISOString(),
        },
      },
    };
    const charge = vi.fn();
    const { createOrReusePixCharge } = await load(state, charge);

    const res = await createOrReusePixCharge({
      userId: 'user-1', email: 'u@test.com', planTier: 'pdv',
      addons: { mesas: false, pedidos: false, acessos: false, menu: false },
      name: 'Loja', taxId: '52998224725', phone: '5511999999999', source: 'zelo_saas_pix',
    });

    expect(res.reused).toBe(true);
    expect(charge).not.toHaveBeenCalled();
    expect(res.row.id).toBe('pay-existing');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- server.billingPix.renewal`
Expected: FAIL (`createOrReusePixCharge` não existe).

- [ ] **Step 3: Implement the shared function**

Edit `src/lib/server/billingPix.js`. Adicione imports (junto aos de Task 1):

```js
import { createTransparentPixCharge } from '$lib/server/abacatePay';
import { calculateValue, sanitizeAddons } from '$lib/pricing';
```

Adicione ao final:

```js
export function serializePixCharge(row) {
  return {
    paymentId: row.id,
    status: row.status,
    amountCents: row.amount_expected_cents,
    brCode: row.br_code,
    qrCodeBase64: row.qr_code_base64,
    expiresAt: row.expires_at,
    providerPaymentId: row.provider_payment_id,
    planTier: row.plan_tier,
    addons: {
      mesas: !!row.has_mesas_addon,
      pedidos: !!row.has_pedidos_addon,
      acessos: !!row.has_acessos_addon,
      menu: !!row.has_zelo_menu,
    },
  };
}

export function pendingPaymentMatchesSelection(payment, planTier, addons, amountCents) {
  return payment?.plan_tier === planTier
    && !!payment?.has_mesas_addon === !!addons.mesas
    && !!payment?.has_pedidos_addon === !!addons.pedidos
    && !!payment?.has_acessos_addon === !!addons.acessos
    && !!payment?.has_zelo_menu === !!addons.menu
    && Number(payment?.amount_expected_cents) === Number(amountCents);
}

export async function createOrReusePixCharge({
  userId, email, planTier, addons, name, taxId, phone, source, metadataExtra = {},
}) {
  const safeAddons = sanitizeAddons(planTier, addons);
  const amountCents = Math.round(calculateValue(planTier, safeAddons) * 100);

  const { data: existingSub } = await supabaseAdmin
    .from('subscriptions')
    .select('id, status, current_period_end, manually_extended_until, plan_tier, payment_provider')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: latestPending } = await supabaseAdmin
    .from('billing_payments')
    .select('id, status, amount_expected_cents, br_code, qr_code_base64, expires_at, provider_payment_id, plan_tier, has_mesas_addon, has_pedidos_addon, has_acessos_addon, has_zelo_menu')
    .eq('user_id', userId)
    .eq('provider', 'abacatepay')
    .eq('method', 'pix')
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const now = new Date();
  if (latestPending?.expires_at) {
    const expiresAt = new Date(latestPending.expires_at);
    if (expiresAt > now) {
      if (pendingPaymentMatchesSelection(latestPending, planTier, safeAddons, amountCents)) {
        return { reused: true, row: latestPending };
      }
      await supabaseAdmin.from('billing_payments')
        .update({ status: 'cancelled', provider_status: 'REPLACED', updated_at: now.toISOString() })
        .eq('id', latestPending.id);
    } else {
      await supabaseAdmin.from('billing_payments')
        .update({ status: 'expired', provider_status: 'EXPIRED', updated_at: now.toISOString() })
        .eq('id', latestPending.id);
    }
  }

  const externalReference = `pix_${userId}_${Date.now()}`;
  const kind = existingSub ? 'subscription_renewal' : 'subscription_start';
  const metadata = {
    source,
    userId,
    email,
    planTier,
    addons: safeAddons,
    kind,
    billingCycle: 'monthly',
    ...metadataExtra,
  };

  const remotePayment = await createTransparentPixCharge({
    amount: amountCents,
    expiresIn: PIX_EXPIRATION_SECONDS,
    description: buildPixDescription(planTier),
    externalId: externalReference,
    metadata,
    customer: { name, email, taxId, cellphone: phone },
  });

  const nowIso = new Date().toISOString();
  const insertPayload = {
    user_id: userId,
    subscription_id: existingSub?.id || null,
    provider: 'abacatepay',
    method: 'pix',
    kind,
    status: 'pending',
    plan_tier: planTier,
    has_mesas_addon: !!safeAddons.mesas,
    has_pedidos_addon: !!safeAddons.pedidos,
    has_acessos_addon: !!safeAddons.acessos,
    has_zelo_menu: !!safeAddons.menu,
    amount_expected_cents: amountCents,
    amount_paid_cents: null,
    currency: 'BRL',
    external_reference: externalReference,
    provider_payment_id: remotePayment?.id || null,
    provider_checkout_id: remotePayment?.id || null,
    provider_customer_id: null,
    provider_subscription_id: null,
    provider_status: remotePayment?.status || 'PENDING',
    br_code: remotePayment?.brCode || null,
    qr_code_base64: remotePayment?.brCodeBase64 || null,
    expires_at: remotePayment?.expiresAt || null,
    paid_at: null,
    metadata,
    created_at: nowIso,
    updated_at: nowIso,
  };

  const { data: insertedRow, error: insertError } = await supabaseAdmin
    .from('billing_payments')
    .insert(insertPayload)
    .select('id, status, amount_expected_cents, br_code, qr_code_base64, expires_at, provider_payment_id, plan_tier, has_mesas_addon, has_pedidos_addon, has_acessos_addon, has_zelo_menu')
    .single();

  if (insertError || !insertedRow) {
    throw new Error('Falha ao salvar cobrança Pix.');
  }

  return { reused: false, row: insertedRow };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- server.billingPix.renewal`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/billingPix.js tests/server.billingPix.renewal.test.js
git commit -m "feat(billing): createOrReusePixCharge compartilhado"
```

---

## Task 3: Refatorar endpoint owner `pix/create` para consumir os helpers

Comportamento inalterado — o teste existente `tests/api.billing-pix-create.test.js` deve continuar verde.

**Files:**
- Modify: `src/routes/api/billing/pix/create/+server.js`
- Test (existente, re-run): `tests/api.billing-pix-create.test.js`

**Interfaces:**
- Consumes: `validatePixCustomerProfile`, `createOrReusePixCharge`, `serializePixCharge` (Tasks 1-2).

- [ ] **Step 1: Run the existing test to establish green baseline**

Run: `npm test -- api.billing-pix-create`
Expected: PASS (baseline antes de refatorar).

- [ ] **Step 2: Replace the endpoint body**

Substitua todo o conteúdo de `src/routes/api/billing/pix/create/+server.js` por:

```js
import { json } from '@sveltejs/kit';
import { supabaseAdmin } from '$lib/server/supabaseAdmin';
import { getServerAccessContext } from '$lib/server/accessControl';
import { isAbacatePayConfigured } from '$lib/server/abacatePay';
import { getPostHogClient } from '$lib/server/posthog';
import {
  createOrReusePixCharge,
  serializePixCharge,
  validatePixCustomerProfile,
} from '$lib/server/billingPix';
import {
  isValidPlanTier,
  isAddonAllowed,
  PLANS,
  sanitizeAddons,
} from '$lib/pricing';

export async function POST({ request }) {
  try {
    if (!supabaseAdmin) {
      return json({ error: 'Supabase admin não configurado.' }, { status: 500 });
    }
    if (!isAbacatePayConfigured()) {
      return json({ error: 'AbacatePay não configurado.' }, { status: 500 });
    }

    const token = request.headers.get('authorization')?.replace('Bearer ', '');
    if (!token) return json({ error: 'Não autorizado' }, { status: 401 });

    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) return json({ error: 'Não autorizado' }, { status: 401 });

    const accessContext = await getServerAccessContext(user.id);
    if (accessContext.isSubUser) {
      return json({ error: 'Subusuários não podem gerenciar billing.' }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const planTier = body.planTier || 'pdv';
    const requestedAddons = body.addons || {};

    if (!isValidPlanTier(planTier)) {
      return json({ error: `Plano inválido. Use: ${Object.keys(PLANS).join(', ')}.` }, { status: 400 });
    }
    for (const addonId of ['mesas', 'pedidos', 'acessos', 'menu']) {
      if (requestedAddons[addonId] && !isAddonAllowed(planTier, addonId)) {
        return json({ error: `Plano ${planTier} não suporta o add-on ${addonId}.` }, { status: 400 });
      }
    }
    const addons = sanitizeAddons(planTier, requestedAddons);

    const { data: perfil, error: perfilError } = await supabaseAdmin
      .from('empresa_perfil')
      .select('nome_exibicao, documento, contato')
      .eq('user_id', user.id)
      .maybeSingle();

    if (perfilError) {
      return json({ error: 'Erro ao carregar perfil da empresa.' }, { status: 500 });
    }

    const profile = validatePixCustomerProfile(perfil);
    if (!profile.ok) {
      return json({ error: profile.message, redirect: '/perfil?msg=complete' }, { status: 400 });
    }

    const { reused, row } = await createOrReusePixCharge({
      userId: user.id,
      email: user.email,
      planTier,
      addons,
      name: profile.name,
      taxId: profile.taxId,
      phone: profile.phone,
      source: 'zelo_saas_pix',
    });

    if (!reused) {
      const posthog = getPostHogClient();
      if (posthog) {
        posthog.capture({
          distinctId: user.id,
          event: 'pix_charge_created',
          properties: {
            plan: planTier,
            addons,
            amount_cents: row.amount_expected_cents,
            kind: row.kind || 'subscription',
            payment_id: row.id,
          },
        });
        await posthog.flush();
      }
      return json(serializePixCharge(row));
    }

    return json({ reused: true, ...serializePixCharge(row) });
  } catch (error) {
    console.error('[billing/pix/create] error:', error?.message || error);
    return json({ error: error?.message || 'Falha ao gerar cobrança Pix.' }, { status: 500 });
  }
}
```

- [ ] **Step 3: Run the existing test to verify no regression**

Run: `npm test -- api.billing-pix-create`
Expected: PASS (mesmos 4 casos: 401, 403, 400 perfil, 200 com QR/brCode).

- [ ] **Step 4: Run typecheck**

Run: `npm run check`
Expected: sem novos erros no endpoint alterado.

- [ ] **Step 5: Commit**

```bash
git add src/routes/api/billing/pix/create/+server.js
git commit -m "refactor(billing): owner pix/create consome helpers compartilhados"
```

---

## Task 4: Endpoint admin `POST /api/admin/billing/pix/create`

**Files:**
- Create: `src/routes/api/admin/billing/pix/create/+server.js`
- Test: `tests/api.admin-billing-pix-create.test.js`

**Interfaces:**
- Consumes: `createOrReusePixCharge`, `serializePixCharge`, `validatePixCustomerProfile`, `buildRenewalPixWhatsAppMessage` (Tasks 1-2); `sendWhatsAppTextDetailed` de `$lib/server/whatsapp`; `sanitizeAddons`, `PLANS` de `$lib/pricing`.
- Produces: resposta JSON `{ ...serializePixCharge(row), reused, whatsappSent: boolean, whatsappError: string|null }`; ou `{ error, code, missing? }` em falha.

- [ ] **Step 1: Write the failing test**

Create `tests/api.admin-billing-pix-create.test.js`:

```js
import { beforeEach, describe, expect, it, vi } from 'vitest';

const loadHandler = async () => await import('../src/routes/api/admin/billing/pix/create/+server.js');

function makeSelectChain(result) {
  const chain = {
    eq: vi.fn(() => chain),
    order: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    maybeSingle: vi.fn(async () => ({ data: result ?? null, error: null })),
    single: vi.fn(async () => ({ data: result ?? null, error: null })),
  };
  return chain;
}

function makeSupabaseAdmin(state) {
  return {
    auth: {
      getUser: vi.fn(async () => ({ data: { user: state.adminUser ?? { id: 'admin-user' } }, error: state.authError ?? null })),
      admin: {
        getUserById: vi.fn(async () => ({ data: { user: { id: 'target-1', email: 'cliente@test.com' } }, error: null })),
      },
    },
    from: vi.fn((table) => ({
      select: vi.fn(() => makeSelectChain(state.selectResults?.[table] ?? null)),
      insert: vi.fn((payload) => {
        state.writes.push({ table, operation: 'insert', payload });
        return { select: vi.fn(() => ({ single: vi.fn(async () => ({ data: Array.isArray(payload) ? payload[0] : payload, error: null })) })) };
      }),
      update: vi.fn((payload) => ({ eq: vi.fn(async () => { state.writes.push({ table, operation: 'update', payload }); return { error: null }; }) })),
    })),
  };
}

function makeRequest({ token = 'tok', body = {}, origin = 'http://localhost:5174' } = {}) {
  return {
    headers: { get: (n) => {
      const k = n.toLowerCase();
      if (k === 'authorization') return token ? `Bearer ${token}` : null;
      if (k === 'origin') return origin;
      if (k === 'content-type') return 'application/json';
      return null;
    } },
    json: async () => body,
  };
}

function baseState(overrides = {}) {
  return {
    writes: [],
    adminUser: { id: 'admin-user' },
    selectResults: {
      super_admins: { id: 'admin-1', is_active: true },
      subscriptions: {
        id: 'sub-1', user_id: 'target-1', status: 'active', plan_tier: 'pdv',
        has_mesas_addon: false, has_pedidos_addon: false, has_acessos_addon: false, has_zelo_menu: false,
        payment_provider: 'abacatepay',
      },
      empresa_perfil: { nome_exibicao: 'Loja Cliente', documento: '52998224725', contato: '11999999999' },
      billing_payments: null,
    },
    ...overrides,
  };
}

function doMocks(state, { whatsappOk = true } = {}) {
  vi.doMock('$lib/server/supabaseAdmin', () => ({ supabaseAdmin: makeSupabaseAdmin(state) }));
  vi.doMock('$lib/server/abacatePay', () => ({
    isAbacatePayConfigured: () => true,
    createTransparentPixCharge: vi.fn(async () => ({
      id: 'pix_new', status: 'PENDING', brCode: 'BR-NEW', brCodeBase64: 'data:img', expiresAt: '2026-07-01T18:00:00Z',
    })),
  }));
  state.whatsappCalls = [];
  vi.doMock('$lib/server/whatsapp', () => ({
    sendWhatsAppTextDetailed: vi.fn(async (to, msg) => { state.whatsappCalls.push({ to, msg }); return { ok: whatsappOk, error: whatsappOk ? null : 'sender down' }; }),
  }));
}

beforeEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.stubEnv('ABACATEPAY_API_KEY', 'abc_dev_test_key');
});

describe('API: admin/billing/pix/create', () => {
  it('401 sem token', async () => {
    const state = baseState();
    doMocks(state);
    const { POST } = await loadHandler();
    const res = await POST({ request: makeRequest({ token: null }) });
    expect(res.status).toBe(401);
  });

  it('403 quando nao e super admin ativo', async () => {
    const state = baseState({ selectResults: { ...baseState().selectResults, super_admins: null } });
    doMocks(state);
    const { POST } = await loadHandler();
    const res = await POST({ request: makeRequest({ body: { subscriptionId: 'sub-1' } }) });
    expect(res.status).toBe(403);
  });

  it('400 profile_incomplete quando falta documento', async () => {
    const s = baseState();
    s.selectResults.empresa_perfil = { nome_exibicao: 'Loja', documento: null, contato: '11999999999' };
    doMocks(s);
    const { POST } = await loadHandler();
    const res = await POST({ request: makeRequest({ body: { subscriptionId: 'sub-1' } }) });
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.code).toBe('missing_fields');
  });

  it('404 quando subscription nao existe', async () => {
    const s = baseState();
    s.selectResults.subscriptions = null;
    doMocks(s);
    const { POST } = await loadHandler();
    const res = await POST({ request: makeRequest({ body: { subscriptionId: 'nope' } }) });
    expect(res.status).toBe(404);
  });

  it('200 cria PIX pelo plano atual e envia whatsapp', async () => {
    const s = baseState();
    doMocks(s);
    const { POST } = await loadHandler();
    const res = await POST({ request: makeRequest({ body: { subscriptionId: 'sub-1' } }) });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.planTier).toBe('pdv');
    expect(body.brCode).toBe('BR-NEW');
    expect(body.whatsappSent).toBe(true);
    expect(s.whatsappCalls).toHaveLength(1);
    expect(s.whatsappCalls[0].to).toBe('11999999999');
    expect(s.whatsappCalls[0].msg).toContain('BR-NEW');
    const insert = s.writes.find(w => w.table === 'billing_payments' && w.operation === 'insert');
    expect(insert.payload.plan_tier).toBe('pdv');
    expect(insert.payload.metadata.source).toBe('admin_renewal_pix');
  });

  it('200 com whatsappSent=false quando envio falha (nao quebra criacao)', async () => {
    const s = baseState();
    doMocks(s, { whatsappOk: false });
    const { POST } = await loadHandler();
    const res = await POST({ request: makeRequest({ body: { subscriptionId: 'sub-1' } }) });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.whatsappSent).toBe(false);
    expect(body.whatsappError).toBeTruthy();
    expect(body.brCode).toBe('BR-NEW');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- api.admin-billing-pix-create`
Expected: FAIL (endpoint não existe).

- [ ] **Step 3: Implement the endpoint**

Create `src/routes/api/admin/billing/pix/create/+server.js`:

```js
import { json } from '@sveltejs/kit';
import { supabaseAdmin } from '$lib/server/supabaseAdmin';
import { isAbacatePayConfigured } from '$lib/server/abacatePay';
import { sendWhatsAppTextDetailed } from '$lib/server/whatsapp';
import {
  createOrReusePixCharge,
  serializePixCharge,
  validatePixCustomerProfile,
  buildRenewalPixWhatsAppMessage,
} from '$lib/server/billingPix';
import { PLANS, sanitizeAddons } from '$lib/pricing';

const ALLOWED_ORIGINS = new Set([
  'https://admin.zelopdv.com.br',
  'https://www.admin.zelopdv.com.br',
  'http://localhost:5174',
  'http://127.0.0.1:5174',
]);

function buildCorsHeaders(request) {
  const origin = request.headers.get('origin');
  const allowOrigin = origin && ALLOWED_ORIGINS.has(origin) ? origin : null;
  if (!allowOrigin) return {};
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'POST,OPTIONS',
    'Access-Control-Allow-Headers': 'authorization,content-type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}

export function OPTIONS({ request }) {
  const cors = buildCorsHeaders(request);
  const origin = request.headers.get('origin');
  if (origin && !cors['Access-Control-Allow-Origin']) {
    return new Response(null, { status: 403 });
  }
  return new Response(null, { status: 204, headers: cors });
}

export async function POST({ request }) {
  const cors = buildCorsHeaders(request);
  const origin = request.headers.get('origin');
  if (origin && !cors['Access-Control-Allow-Origin']) {
    return json({ error: 'Origem não permitida.' }, { status: 403, headers: cors });
  }

  try {
    if (!supabaseAdmin) {
      return json({ error: 'Supabase admin não configurado.' }, { status: 500, headers: cors });
    }
    if (!isAbacatePayConfigured()) {
      return json({ error: 'AbacatePay não configurado.' }, { status: 500, headers: cors });
    }

    const token = request.headers.get('authorization')?.replace('Bearer ', '');
    if (!token) return json({ error: 'Não autorizado.' }, { status: 401, headers: cors });

    const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !user) return json({ error: 'Não autorizado.' }, { status: 401, headers: cors });

    const { data: admin } = await supabaseAdmin
      .from('super_admins')
      .select('id, is_active')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .maybeSingle();
    if (!admin) return json({ error: 'Acesso restrito a super admins.' }, { status: 403, headers: cors });

    const body = await request.json().catch(() => ({}));
    const subscriptionId = body.subscriptionId;
    if (!subscriptionId) return json({ error: 'subscriptionId obrigatório.' }, { status: 400, headers: cors });

    const { data: sub, error: subErr } = await supabaseAdmin
      .from('subscriptions')
      .select('id, user_id, status, plan_tier, has_mesas_addon, has_pedidos_addon, has_acessos_addon, has_zelo_menu, payment_provider')
      .eq('id', subscriptionId)
      .maybeSingle();
    if (subErr || !sub) return json({ error: 'Subscription não encontrada.' }, { status: 404, headers: cors });

    const planTier = sub.plan_tier || 'pdv';
    const addons = sanitizeAddons(planTier, {
      mesas: sub.has_mesas_addon,
      pedidos: sub.has_pedidos_addon,
      acessos: sub.has_acessos_addon,
      menu: sub.has_zelo_menu,
    });

    const { data: perfil } = await supabaseAdmin
      .from('empresa_perfil')
      .select('nome_exibicao, documento, contato')
      .eq('user_id', sub.user_id)
      .maybeSingle();

    const profile = validatePixCustomerProfile(perfil);
    if (!profile.ok) {
      return json({ error: profile.message, code: profile.code }, { status: 400, headers: cors });
    }

    const { data: targetAuth } = await supabaseAdmin.auth.admin.getUserById(sub.user_id);
    const email = targetAuth?.user?.email || null;

    const { reused, row } = await createOrReusePixCharge({
      userId: sub.user_id,
      email,
      planTier,
      addons,
      name: profile.name,
      taxId: profile.taxId,
      phone: profile.phone,
      source: 'admin_renewal_pix',
      metadataExtra: { actorAdminId: admin.id },
    });

    const serialized = serializePixCharge(row);

    const message = buildRenewalPixWhatsAppMessage({
      nome: profile.name,
      planName: PLANS[planTier]?.name || 'ZeloPDV',
      amountCents: serialized.amountCents,
      brCode: serialized.brCode,
    });
    const whatsappResult = await sendWhatsAppTextDetailed(profile.phone, message);

    return json({
      ...serialized,
      reused,
      whatsappSent: !!whatsappResult?.ok,
      whatsappError: whatsappResult?.ok ? null : (whatsappResult?.error || 'Falha ao enviar WhatsApp.'),
    }, { headers: cors });
  } catch (error) {
    console.error('[admin/billing/pix/create] error:', error?.message || error);
    return json({ error: error?.message || 'Falha ao gerar cobrança Pix.' }, { status: 500, headers: cors });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- api.admin-billing-pix-create`
Expected: PASS (6 casos).

- [ ] **Step 5: Run full suite + typecheck**

Run: `npm test`
Expected: PASS (nenhuma regressão nos testes existentes).
Run: `npm run check`
Expected: sem novos erros.

- [ ] **Step 6: Commit**

```bash
git add src/routes/api/admin/billing/pix/create/+server.js tests/api.admin-billing-pix-create.test.js
git commit -m "feat(admin-billing): endpoint POST /api/admin/billing/pix/create com envio WhatsApp"
```

---

## Task 5: Card mobile com paridade de ações (admin-dashboard)

Reconstrói o bloco `<div class="md:hidden ...">` em `subscriptions/+page.svelte` para expor plano+valor (tocável → editar), dropdown de status, +7D Trial, Renovar/Prorrogar, Cancelar/Reativar. Reaproveita as funções existentes — sem lógica nova. Dots PDV×Chat e data de criação ficam fora (decisão do spec).

**Files:**
- Modify: `admin-dashboard/src/routes/subscriptions/+page.svelte` (bloco mobile em ~linhas 1279-1331)

**Interfaces:**
- Consumes (já existem no `<script>`): `openPlanModal`, `handleUpdateStatus`, `handleExtendTrialOnly`, `openExtendModal`, `handleCancelSubscription`, `handleReactivateSubscription`, `getStatusBadge`, `getDaysUntilEffectiveExpiry`, `getEffectiveExpiry`, `hasActiveManualExtension`, `isSubscriptionExpired`, `getSubscriptionAdminStatus`, `subscriptionValue`, `planLabel`, `formatSubscriptionDate`, `getProviderLabel`, `getProviderTone`, `statusUpdating`.

- [ ] **Step 1: Replace the mobile card block**

Em `admin-dashboard/src/routes/subscriptions/+page.svelte`, substitua todo o bloco `<!-- Mobile Stacked View -->` (da linha `<div class="md:hidden space-y-4" in:fade>` até o `</div>` que fecha esse container, imediatamente antes de `{/if}`) por:

```svelte
    <!-- Mobile Stacked View (paridade de ações) -->
    <div class="md:hidden space-y-4" in:fade>
      {#each filteredSubscriptions as sub (sub.id)}
        {@const badge = getStatusBadge(sub)}
        {@const daysLeft = getDaysUntilEffectiveExpiry(sub)}
        {@const isExpired = isSubscriptionExpired(sub)}
        {@const isExpiringSoon = ['active', 'trialing'].includes(getSubscriptionAdminStatus(sub)) && daysLeft <= 7 && daysLeft > 0}
        {@const effectiveExpiry = getEffectiveExpiry(sub)}
        {@const onManualExt = hasActiveManualExtension(sub)}

        <div class="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg relative overflow-hidden">
          <div class="flex justify-between items-start mb-3 gap-3">
            <div class="min-w-0">
              <h3 class="text-sm font-bold text-slate-100 truncate">{sub.empresa_perfil.nome_exibicao || 'S/N'}</h3>
              <div class="flex items-center gap-2 mt-0.5 min-w-0">
                <p class="text-xs text-slate-500 truncate">{sub.empresa_perfil.contato}</p>
                <span class={`text-[10px] font-semibold uppercase tracking-wide shrink-0 ${getProviderTone(sub.payment_provider)}`}>
                  {getProviderLabel(sub.payment_provider)}
                </span>
              </div>
            </div>
            <span class="inline-flex px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider rounded-sm border shrink-0 {badge.class}">
              {badge.text}
            </span>
          </div>

          <!-- Plano + addons + valor (tocável → editar) -->
          <button
            on:click={() => openPlanModal(sub)}
            class="w-full flex items-center justify-between gap-3 px-3 py-2 rounded-xl border border-slate-700/50 hover:border-slate-600 hover:bg-slate-800/40 transition-all text-left"
            title="Mudar plano/addons"
          >
            <div class="min-w-0">
              <span class="text-[11px] font-semibold tracking-wide block {sub.plan_tier === 'bundle' ? 'text-indigo-300' : sub.plan_tier === 'chat' ? 'text-violet-300' : 'text-sky-300'}">
                {planLabel(sub.plan_tier || 'pdv')}
              </span>
              {#if sub.has_mesas_addon || sub.has_pedidos_addon || sub.has_acessos_addon}
                <span class="text-[9px] font-bold text-emerald-400 uppercase tracking-wider">
                  {[
                    sub.has_mesas_addon ? '+Mesas' : null,
                    sub.has_pedidos_addon ? '+Pedidos' : null,
                    sub.has_acessos_addon ? '+Acessos' : null,
                  ].filter(Boolean).join(' · ')}
                </span>
              {/if}
            </div>
            <span class="text-xs font-mono text-slate-300 shrink-0">R$ {subscriptionValue(sub).toFixed(2)}</span>
          </button>

          <div class="grid grid-cols-2 gap-4 text-xs py-3 border-t border-slate-800 mt-3">
            <div>
              <span class="text-slate-500 block mb-0.5">Expiração:</span>
              <span class="{isExpired ? 'text-rose-400 font-semibold' : isExpiringSoon ? 'text-amber-400 font-semibold' : 'text-slate-300'} font-medium inline-flex items-center gap-1.5">
                {formatSubscriptionDate(effectiveExpiry)}
                {#if onManualExt}
                  <span class="inline-flex px-1 py-0.5 text-[8px] font-bold rounded-sm bg-amber-500/10 text-amber-400 border border-amber-500/20">+EXT</span>
                {/if}
              </span>
              {#if sub.status === 'active'}
                <span class="block text-[11px] mt-0.5 {isExpired ? 'text-rose-400/80' : isExpiringSoon ? 'text-amber-400/80' : 'text-slate-500'}">
                  {isExpired ? `Em atraso há ${Math.abs(daysLeft)}d` : `Restam ${daysLeft} dias`}
                </span>
              {/if}
            </div>
            <div>
              <span class="text-slate-500 block mb-0.5">Status:</span>
              <select
                value={sub.status}
                on:change={(e) => handleUpdateStatus(sub, e.target.value)}
                disabled={statusUpdating}
                class="w-full appearance-none bg-slate-800/50 border border-slate-700/50 rounded-lg px-2 py-1 text-[11px] font-bold text-slate-300 focus:outline-hidden transition-all cursor-pointer disabled:opacity-50"
              >
                <option value="active">ACTIVE</option>
                <option value="trialing">TRIAL</option>
                <option value="trial_expired">TRIAL EXPIRED</option>
                <option value="past_due">PAST DUE</option>
                <option value="canceled">CANCELED</option>
              </select>
            </div>
          </div>

          <div class="flex flex-wrap items-center gap-2 border-t border-slate-800 pt-3 mt-1">
            {#if sub.status === 'trialing' || isExpired}
              <button
                on:click={() => handleExtendTrialOnly(sub, 7)}
                disabled={statusUpdating}
                class="px-3 py-1.5 text-[11px] font-bold text-sky-400 bg-sky-500/10 hover:bg-sky-500/20 border border-sky-500/20 rounded-lg transition-all disabled:opacity-50"
              >
                +7D Trial
              </button>
            {/if}

            {#if sub.status === 'active'}
              <button on:click={() => openExtendModal(sub)} class="flex-1 min-w-24 py-1.5 bg-emerald-500/10 text-emerald-400 font-medium text-xs rounded-lg border border-emerald-500/20">
                Prorrogar
              </button>
            {:else if sub.status === 'canceled'}
              <button on:click={() => handleReactivateSubscription(sub)} class="flex-1 min-w-24 py-1.5 bg-emerald-500/10 text-emerald-400 font-medium text-xs rounded-lg border border-emerald-500/20">
                Reativar
              </button>
            {/if}

            <!-- PIX de renovação (Task 6 conecta a ação) -->
            <button on:click={() => openPixModal(sub)} class="flex-1 min-w-24 py-1.5 bg-teal-500/10 text-teal-300 font-medium text-xs rounded-lg border border-teal-500/20">
              Gerar PIX
            </button>

            {#if sub.status === 'active'}
              <button on:click={() => handleCancelSubscription(sub)} class="px-2 py-1.5 bg-slate-800 text-rose-400 hover:text-rose-300 rounded-lg border border-slate-700">
                <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            {/if}
          </div>
        </div>
      {/each}
    </div>
```

> Nota: `openPixModal` é referenciada aqui mas só é definida na Task 6. Portanto o typecheck/build só fica 100% verde ao final da Task 6 — execute as Tasks 5 e 6 na sequência e faça o build depois da Task 6.

- [ ] **Step 2: Sanity visual (dev server)**

Run: `cd admin-dashboard && npm run dev`
Abra a rota `/subscriptions` em viewport mobile (DevTools ~390px) e confirme: plano tocável abre modal de plano, dropdown de status muda status, +7D Trial aparece em trial/expirada, Prorrogar/Reativar/Cancelar presentes conforme status. (O botão "Gerar PIX" ainda não abre nada até a Task 6.)

- [ ] **Step 3: Commit**

```bash
git add admin-dashboard/src/routes/subscriptions/+page.svelte
git commit -m "feat(admin-ui): card mobile de assinaturas com paridade de acoes"
```

---

## Task 6: UI de geração e entrega do PIX (admin-dashboard)

Adiciona estado, função `openPixModal`/`generateRenewalPix`, `copyPixCode`, `resendPixWhatsapp` e o modal de resultado (valor, status WhatsApp, copia-e-cola, aviso Stripe). Também liga o botão "Gerar PIX" no desktop.

**Files:**
- Modify: `admin-dashboard/src/routes/subscriptions/+page.svelte`

**Interfaces:**
- Consumes: `API_BASE`, `supabase`, `success`, `errorToast`, `logAdminAction`, `adminInfo`, `getInitials`, `getProviderLabel`, `planLabel`, `PLANS` (já importados/definidos no `<script>`).

- [ ] **Step 1: Add state + functions to the `<script>`**

Em `admin-dashboard/src/routes/subscriptions/+page.svelte`, logo após as declarações de estado de modal (após `let editZeloMenuAddon = false`), adicione:

```js
  // PIX de renovação (admin)
  let showPixModal = false
  let pixTarget = null
  let pixLoading = false
  let pixResendLoading = false
  let pixResult = null // { brCode, qrCodeBase64, amountCents, planTier, whatsappSent, whatsappError, reused }
  let pixCopied = false
```

E logo após a função `closePlanModal()` adicione:

```js
  function openPixModal(sub) {
    pixTarget = sub
    pixResult = null
    pixCopied = false
    showPixModal = true
    generateRenewalPix()
  }

  function closePixModal() {
    showPixModal = false
    pixTarget = null
    pixResult = null
    pixLoading = false
    pixResendLoading = false
    pixCopied = false
  }

  async function callGeneratePix() {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      errorToast('Sessão expirada. Faça login novamente.')
      return null
    }
    const res = await fetch(`${API_BASE}/api/admin/billing/pix/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ subscriptionId: pixTarget.id }),
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) {
      errorToast(body.error || 'Erro ao gerar PIX de renovação.')
      return null
    }
    return body
  }

  async function generateRenewalPix() {
    if (!pixTarget) return
    try {
      pixLoading = true
      const body = await callGeneratePix()
      if (!body) return
      pixResult = body
      await logAdminAction({
        adminId: adminInfo.id,
        action: 'admin_generate_renewal_pix',
        targetUserId: pixTarget.user_id,
        details: {
          subscription_id: pixTarget.id,
          company: pixTarget.empresa_perfil.nome_exibicao,
          plan_tier: body.planTier,
          amount_cents: body.amountCents,
          whatsapp_sent: body.whatsappSent,
          reused: body.reused,
        },
      })
      if (body.whatsappSent) success('PIX gerado e enviado por WhatsApp.')
      else errorToast('PIX gerado, mas o WhatsApp falhou. Use o copia-e-cola.')
    } catch (err) {
      console.error('generateRenewalPix error:', err)
      errorToast('Erro ao gerar PIX de renovação.')
    } finally {
      pixLoading = false
    }
  }

  async function resendPixWhatsapp() {
    try {
      pixResendLoading = true
      const body = await callGeneratePix()
      if (!body) return
      pixResult = body
      if (body.whatsappSent) success('WhatsApp reenviado.')
      else errorToast('Não foi possível reenviar: ' + (body.whatsappError || 'erro'))
    } finally {
      pixResendLoading = false
    }
  }

  async function copyPixCode() {
    if (!pixResult?.brCode) return
    try {
      await navigator.clipboard.writeText(pixResult.brCode)
      pixCopied = true
      setTimeout(() => (pixCopied = false), 2000)
    } catch {
      errorToast('Não foi possível copiar. Selecione o código manualmente.')
    }
  }
```

- [ ] **Step 2: Wire the desktop "Gerar PIX" button**

No bloco desktop, dentro da célula de ações (`<td class="py-3 px-4 text-right">`), no ramo `{#if sub.status === 'active'}` logo após o botão "Renovar" e antes do botão Cancel, adicione:

```svelte
                    <!-- Gerar PIX de renovação -->
                    <button on:click={() => openPixModal(sub)} class="px-3 py-1.5 flex items-center gap-1.5 text-xs font-semibold text-teal-300 hover:text-teal-200 bg-teal-500/10 hover:bg-teal-500/20 border border-teal-500/20 rounded-lg transition-all" title="Gerar PIX de renovação">
                       <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-2M9 12h12l-3-3m0 6l3-3" /></svg>
                       PIX
                    </button>
```

Para permitir gerar PIX também em contas não-ativas (expirada/trial/cancelada), adicione no ramo `{:else if sub.status === 'canceled'}` (após o botão Reativar) e crie um ramo genérico: o modo mais simples é adicionar, ao final da `<div class="flex items-center justify-end gap-1.5">`, **fora** do if/else de status, um botão PIX sempre presente:

```svelte
                  {#if sub.status !== 'active'}
                    <button on:click={() => openPixModal(sub)} class="px-3 py-1.5 flex items-center gap-1.5 text-xs font-semibold text-teal-300 hover:text-teal-200 bg-teal-500/10 hover:bg-teal-500/20 border border-teal-500/20 rounded-lg transition-all" title="Gerar PIX de renovação">
                       <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-2M9 12h12l-3-3m0 6l3-3" /></svg>
                       PIX
                    </button>
                  {/if}
```

(No mobile o botão "Gerar PIX" já é sempre visível pela Task 5.)

- [ ] **Step 3: Add the PIX result modal**

Ao final do arquivo, após o `{/if}` do `showPlanModal`, adicione:

```svelte
<!-- PIX de Renovação Modal -->
{#if showPixModal && pixTarget}
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-md bg-[#0B0F19]/80" transition:fade={{ duration: 200 }}>
    <div class="relative w-full max-w-md bg-slate-900 border border-slate-700/50 rounded-2xl shadow-2xl overflow-hidden" transition:slide={{ duration: 300, axis: 'y' }}>
      <div class="absolute top-0 inset-x-0 h-px bg-linear-to-r from-transparent via-teal-500/60 to-transparent"></div>

      <div class="px-6 py-5 border-b border-slate-800 flex justify-between items-center">
        <h3 class="text-lg font-bold text-white tracking-wide">PIX de Renovação</h3>
        <button on:click={closePixModal} class="text-slate-500 hover:text-white transition-colors outline-hidden"><svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg></button>
      </div>

      <div class="p-6 space-y-5">
        <div>
          <p class="text-xs text-slate-500 uppercase tracking-widest font-semibold mb-1">Empresa</p>
          <div class="flex items-center gap-3 p-3 bg-slate-800/50 rounded-xl border border-slate-700/50">
            <div class="w-8 h-8 bg-teal-500/20 text-teal-300 flex items-center justify-center rounded-full font-bold text-xs">{getInitials(pixTarget.empresa_perfil.nome_exibicao)}</div>
            <div class="min-w-0">
              <div class="text-sm font-medium text-slate-200 truncate">{pixTarget.empresa_perfil.nome_exibicao}</div>
              <div class="text-[11px] text-slate-500">{pixTarget.empresa_perfil.contato}</div>
            </div>
          </div>
        </div>

        {#if pixTarget.payment_provider === 'stripe'}
          <div class="rounded-lg p-3 border text-[11px] leading-relaxed bg-amber-500/5 border-amber-500/30 text-amber-300">
            <strong class="block">Conta é cartão recorrente (Stripe)</strong>
            Este PIX é uma cobrança avulsa. Ao ser pago, o provedor da assinatura passa a ser AbacatePay.
          </div>
        {/if}

        {#if pixLoading}
          <div class="flex flex-col items-center justify-center py-8 space-y-3">
            <div class="w-8 h-8 border-2 border-teal-500/30 border-t-teal-500 rounded-full animate-spin"></div>
            <div class="text-sm text-slate-400">Gerando cobrança PIX...</div>
          </div>
        {:else if pixResult}
          <div class="grid grid-cols-2 gap-4">
            <div>
              <p class="text-[11px] font-medium text-slate-500 mb-1 leading-none">Plano</p>
              <div class="text-sm font-semibold text-slate-200">{planLabel(pixResult.planTier || 'pdv')}</div>
            </div>
            <div>
              <p class="text-[11px] font-medium text-slate-500 mb-1 leading-none">Valor</p>
              <div class="text-sm font-mono font-semibold text-teal-300">R$ {(pixResult.amountCents / 100).toFixed(2)}</div>
            </div>
          </div>

          <div class="rounded-lg p-3 border text-[11px] {pixResult.whatsappSent ? 'bg-emerald-500/5 border-emerald-500/30 text-emerald-300' : 'bg-rose-500/5 border-rose-500/30 text-rose-300'}">
            {#if pixResult.whatsappSent}
              PIX enviado por WhatsApp para {pixTarget.empresa_perfil.contato}.
            {:else}
              WhatsApp não enviado{pixResult.whatsappError ? `: ${pixResult.whatsappError}` : ''}. Use o copia-e-cola abaixo.
            {/if}
          </div>

          {#if pixResult.qrCodeBase64}
            <div class="flex justify-center">
              <img src={pixResult.qrCodeBase64} alt="QR Code PIX" class="w-40 h-40 rounded-lg bg-white p-2" />
            </div>
          {/if}

          <div>
            <p class="text-[11px] font-medium text-slate-500 mb-1">PIX copia-e-cola</p>
            <div class="flex items-stretch gap-2">
              <code class="flex-1 min-w-0 truncate px-3 py-2 bg-slate-800/60 border border-slate-700 rounded-lg text-[11px] text-slate-300">{pixResult.brCode}</code>
              <button on:click={copyPixCode} class="px-3 py-2 text-xs font-semibold text-teal-300 bg-teal-500/10 hover:bg-teal-500/20 border border-teal-500/20 rounded-lg transition-all whitespace-nowrap">
                {pixCopied ? 'Copiado!' : 'Copiar'}
              </button>
            </div>
          </div>
        {/if}
      </div>

      <div class="px-6 py-4 bg-slate-800/30 border-t border-slate-800 flex justify-end gap-3">
        <button on:click={closePixModal} class="px-4 py-2 text-sm font-medium text-slate-400 hover:text-white transition-colors">Fechar</button>
        {#if pixResult}
          <button on:click={resendPixWhatsapp} disabled={pixResendLoading} class="px-5 py-2 text-sm font-semibold text-white bg-teal-500 hover:bg-teal-400 rounded-xl transition-all shadow-[0_0_15px_rgba(20,184,166,0.4)] disabled:opacity-50">
            {pixResendLoading ? 'Reenviando...' : 'Reenviar WhatsApp'}
          </button>
        {/if}
      </div>
    </div>
  </div>
{/if}
```

- [ ] **Step 4: Typecheck + build**

Run: `cd admin-dashboard && npm run check`
Expected: sem novos erros.
Run: `cd admin-dashboard && npm run build`
Expected: build OK.

- [ ] **Step 5: Manual verification (dev server)**

Run: `cd admin-dashboard && npm run dev` (e `npm run dev` no app principal em :5173).
Confirme no `/subscriptions`: clicar "Gerar PIX" (desktop e mobile) abre o modal, mostra spinner, depois valor+plano+QR+copia-e-cola; "Copiar" copia; para uma sub Stripe aparece o aviso; "Reenviar WhatsApp" re-dispara.

- [ ] **Step 6: Commit**

```bash
git add admin-dashboard/src/routes/subscriptions/+page.svelte
git commit -m "feat(admin-ui): modal de geracao e entrega do PIX de renovacao"
```

---

## Final Verification

- [ ] `npm test` — suíte completa do app principal PASSA.
- [ ] `npm run check` (app principal) — sem novos erros.
- [ ] `cd admin-dashboard && npm run check` — sem novos erros.
- [ ] `cd admin-dashboard && npm run build` — build OK.
- [ ] Verificação manual em staging: gerar PIX numa conta de teste, pagar, confirmar que o webhook AbacatePay ativa/renova a `subscription` (status `active`, `current_period_end` +1 mês).
- [ ] Atualizar `docs/BILLING.md` (endpoint matrix: adicionar `POST /api/admin/billing/pix/create`) e `docs/CURRENT.md` conforme convenções do `CLAUDE.md`.

---

## Self-Review (feito pelo autor do plano)

**Spec coverage:**
- A (paridade mobile: editar plano/addons + status + trial) → Task 5. Dots/data de criação omitidos por decisão. ✓
- B (endpoint admin, deriva plano atual, ativação via webhook, refatoração compartilhada) → Tasks 1-4. ✓
- C (entrega WhatsApp + fallback copia-e-cola + reenvio) → Task 4 (envio) + Task 6 (UI/fallback/reenvio). ✓
- D (elegibilidade ampla + perfil incompleto explica falta + aviso Stripe) → Task 4 (código profile_incomplete/404) + Task 6 (aviso Stripe, botão sempre visível). ✓
- E (testes) → Tasks 1-4 (Vitest) + Tasks 5-6 (check/build/manual). ✓

**Type consistency:** `createOrReusePixCharge` retorna `{ reused, row }` e é consumida assim nas Tasks 3-4; `serializePixCharge(row)` usada consistentemente; `validatePixCustomerProfile` retorna `{ok,name,taxId,phone}`/`{ok,code,message}` consumido igual em owner e admin; `sendWhatsAppTextDetailed` retorna `{ok,error}` consumido na Task 4.

**Placeholder scan:** sem TODO/TBD; todo passo com código tem código completo. A única dependência forward (`openPixModal` na Task 5 antes de definida na Task 6) está sinalizada explicitamente com nota de ordem de execução/build.
