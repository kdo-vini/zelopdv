<script>
  import { onMount } from 'svelte';
  import { supabase } from '$lib/supabaseClient';
  import {
    buildWhatsAppReferralUrl,
    formatReferralStatus,
    formatRewardStatus,
  } from '$lib/referrals';
  import { addToast } from '$lib/stores/ui';

  export let compact = false;

  let loading = true;
  let code = '';
  let link = '';
  let ownerUserId = '';
  let referrals = [];
  let rewards = [];

  $: whatsappUrl = link ? buildWhatsAppReferralUrl(link) : '';
  $: signedUpCount = referrals.filter((r) => ['signed_up', 'trial_started', 'pending_payment', 'paid_manual_confirmed', 'reward_approved', 'reward_applied'].includes(r.status)).length;
  $: paidCount = referrals.filter((r) => ['paid_manual_confirmed', 'reward_approved', 'reward_applied'].includes(r.status)).length;
  $: approvedRewards = rewards.filter((r) => r.status === 'approved').length;
  $: appliedRewards = rewards.filter((r) => r.status === 'applied').length;

  onMount(loadReferralData);

  async function loadReferralData() {
    loading = true;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return;

      const res = await fetch('/api/referrals/code', {
        headers: { authorization: `Bearer ${token}` },
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload?.error || 'Erro ao carregar indicação.');

      code = payload.code;
      link = payload.link;
      ownerUserId = payload.ownerUserId;

      const [referralsRes, rewardsRes] = await Promise.all([
        supabase
          .from('referrals')
          .select('id, referrer_empresa_id, referred_email, referred_phone, status, created_at, updated_at, paid_at')
          .eq('referrer_empresa_id', ownerUserId)
          .order('created_at', { ascending: false })
          .limit(compact ? 5 : 100),
        supabase
          .from('referral_rewards')
          .select('id, referral_id, empresa_id, reward_type, amount_cents, addon_key, status, reason, created_at, applied_at')
          .eq('empresa_id', ownerUserId)
          .order('created_at', { ascending: false })
          .limit(compact ? 5 : 100),
      ]);

      if (referralsRes.error) throw referralsRes.error;
      if (rewardsRes.error) throw rewardsRes.error;
      referrals = referralsRes.data || [];
      rewards = rewardsRes.data || [];
    } catch (err) {
      console.warn('[ReferralCard] load error:', err?.message || err);
      addToast('Não foi possível carregar suas indicações.', 'warning');
    } finally {
      loading = false;
    }
  }

  async function copyLink() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      addToast('Link de indicação copiado.', 'success');
    } catch {
      addToast('Copie o link manualmente pelo campo.', 'warning');
    }
  }

  function formatMoney(cents) {
    if (!cents) return '-';
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
  }
</script>

<section class="referral-card">
  <div class="header">
    <div>
      <p class="eyebrow">Indicações</p>
      <h2>Indique outro empreendedor</h2>
      <p class="description">Compartilhe seu código e ganhe crédito quando o indicado virar cliente.</p>
    </div>
    {#if !compact}
      <a class="subtle-link" href="/gestao">Dashboard</a>
    {:else}
      <a class="subtle-link" href="/gestao/indicacoes">Minhas indicações</a>
    {/if}
  </div>

  {#if loading}
    <p class="muted">Carregando indicação...</p>
  {:else}
    <div class="share-grid">
      <label>
        <span>Código</span>
        <input value={code} readonly />
      </label>
      <label>
        <span>Link</span>
        <input value={link} readonly />
      </label>
    </div>

    <div class="actions">
      <button type="button" on:click={copyLink}>Copiar link</button>
      <a class="whatsapp" href={whatsappUrl} target="_blank" rel="noreferrer">Indicar pelo WhatsApp</a>
    </div>

    <div class="stats">
      <div><strong>{referrals.length}</strong><span>enviadas</span></div>
      <div><strong>{signedUpCount}</strong><span>cadastros</span></div>
      <div><strong>{paidCount}</strong><span>clientes pagos</span></div>
      <div><strong>{approvedRewards}</strong><span>créditos aprovados</span></div>
      <div><strong>{appliedRewards}</strong><span>aplicados</span></div>
    </div>

    {#if !compact}
      <div class="tables">
        <div>
          <h3>Indicações enviadas</h3>
          {#if referrals.length}
            <ul class="rows">
              {#each referrals as item}
                <li>
                  <div>
                    <strong>{item.referred_email || item.referred_phone || 'Visitante ainda não identificado'}</strong>
                    <span>{new Date(item.created_at).toLocaleDateString('pt-BR')}</span>
                  </div>
                  <span class="status">{formatReferralStatus(item.status)}</span>
                </li>
              {/each}
            </ul>
          {:else}
            <p class="muted">Nenhuma indicação registrada ainda.</p>
          {/if}
        </div>

        <div>
          <h3>Créditos e recompensas</h3>
          {#if rewards.length}
            <ul class="rows">
              {#each rewards as reward}
                <li>
                  <div>
                    <strong>{reward.reward_type === 'credit' ? formatMoney(reward.amount_cents) : `${reward.addon_key || 'Add-on'} grátis`}</strong>
                    <span>{reward.reason || 'Aguardando aplicação manual'}</span>
                  </div>
                  <span class="status">{formatRewardStatus(reward.status)}</span>
                </li>
              {/each}
            </ul>
          {:else}
            <p class="muted">As recompensas aparecem aqui após confirmação manual do pagamento.</p>
          {/if}
        </div>
      </div>
    {/if}
  {/if}
</section>

<style>
  .referral-card {
    background: var(--bg-card);
    border: 1px solid var(--border-card);
    border-radius: 8px;
    padding: 1rem;
    display: grid;
    gap: 1rem;
  }

  .header {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
    align-items: flex-start;
  }

  .eyebrow {
    margin: 0 0 0.25rem;
    color: var(--primary);
    text-transform: uppercase;
    font-size: 0.7rem;
    font-weight: 800;
    letter-spacing: 0.08em;
  }

  h2,
  h3 {
    color: var(--text-main);
    margin: 0;
  }

  h2 {
    font-size: 1.1rem;
  }

  h3 {
    font-size: 0.95rem;
  }

  .description,
  .muted {
    color: var(--text-muted);
    margin: 0.25rem 0 0;
    font-size: 0.9rem;
  }

  .subtle-link {
    color: var(--primary);
    font-size: 0.85rem;
    font-weight: 700;
    text-decoration: none;
    white-space: nowrap;
  }

  .share-grid {
    display: grid;
    grid-template-columns: minmax(120px, 180px) minmax(0, 1fr);
    gap: 0.75rem;
  }

  label {
    display: grid;
    gap: 0.35rem;
    color: var(--text-label);
    font-size: 0.8rem;
    font-weight: 700;
  }

  input {
    width: 100%;
    min-width: 0;
    background: var(--bg-input);
    border: 1px solid var(--border-subtle);
    color: var(--text-main);
    border-radius: 8px;
    padding: 0.65rem 0.75rem;
    font-size: 0.9rem;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  button,
  .whatsapp {
    min-height: 40px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 8px;
    padding: 0.6rem 0.85rem;
    border: 1px solid var(--border-subtle);
    font-weight: 800;
    text-decoration: none;
    cursor: pointer;
  }

  button {
    background: var(--bg-input);
    color: var(--text-label);
  }

  .whatsapp {
    background: var(--primary);
    color: var(--primary-text);
  }

  .stats {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 0.5rem;
  }

  .stats div {
    background: var(--bg-input);
    border: 1px solid var(--border-subtle);
    border-radius: 8px;
    padding: 0.7rem;
    display: grid;
    gap: 0.15rem;
  }

  .stats strong {
    color: var(--text-main);
    font-size: 1.25rem;
  }

  .stats span {
    color: var(--text-muted);
    font-size: 0.75rem;
  }

  .tables {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
  }

  .rows {
    list-style: none;
    margin: 0.75rem 0 0;
    padding: 0;
    display: grid;
    gap: 0.5rem;
  }

  .rows li {
    display: flex;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 0.75rem;
    background: var(--bg-input);
    border: 1px solid var(--border-subtle);
    border-radius: 8px;
  }

  .rows strong,
  .rows span {
    display: block;
  }

  .rows strong {
    color: var(--text-main);
    font-size: 0.9rem;
  }

  .rows span {
    color: var(--text-muted);
    font-size: 0.78rem;
  }

  .status {
    color: var(--primary) !important;
    font-weight: 800;
    white-space: nowrap;
  }

  @media (max-width: 760px) {
    .share-grid,
    .tables {
      grid-template-columns: 1fr;
    }

    .stats {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
</style>
