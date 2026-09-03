<script>
  import { onMount } from 'svelte';
  import { Lock, MessageCircle, Save } from 'lucide-svelte';
  import { supabase } from '$lib/supabaseClient.js';
  import { getAccessContext } from '$lib/accessControl.js';
  import { addToast } from '$lib/stores/ui.js';
  import { capturePostHogEvent } from '$lib/posthogClient.js';
  import { maskPhone, normalizeBrazilianPhone } from '$lib/masks.js';
  import Button from '$lib/components/ui/button/button.svelte';
  import InlineHelper from '$lib/components/ui/InlineHelper.svelte';
  const signalGroups = [
    { label: 'Vendas', types: [['REVENUE_BELOW_WEEKDAY_AVG', 'Vendas abaixo do ritmo'], ['REVENUE_ABOVE_WEEKDAY_AVG', 'Vendas acima do ritmo'], ['AVG_TICKET_DOWN', 'Ticket médio menor'], ['PRODUCT_SALES_DROP', 'Produto com menos saída'], ['TOP_PRODUCT_CONCENTRATION', 'Concentração em produto']] },
    { label: 'Financeiro', types: [['PAYMENT_MIX_SHIFT', 'Mudança no mix de pagamento'], ['FIADO_ISSUED_SHARE_HIGH', 'Fiado emitido'], ['CASH_DIFFERENCE_RECURRING', 'Diferença recorrente no caixa']] },
    { label: 'Estoque e operação', types: [['STOCK_COVERAGE_LOW', 'Cobertura de estoque baixa'], ['STOCK_ZERO_WITH_DEMAND', 'Estoque zerado com demanda'], ['CAIXA_LEFT_OPEN', 'Caixa aberto há muito tempo']] },
  ];
  const lockedTypes = new Set(['CASH_DIFFERENCE_RECURRING', 'STOCK_ZERO_WITH_DEMAND']);

  let loading = true;
  let saving = false;
  let isSubUser = false;
  let ownerUserId = null;
  let contact = '';
  let whatsappEnabled = false;
  let mutedTypes = [];
  let showExample = false;
  let pairLoading = true;
  let pairLinked = false;
  let pairPhoneMasked = '';
  let pairWhatsappNumber = '';
  let pairCode = '';
  let pairExpiresAt = null;
  let pairBusy = false;

  async function load() {
    try {
      const access = await getAccessContext();
      if (!access) throw new Error('Sessão expirada.');
      isSubUser = access.isSubUser;
      ownerUserId = access.ownerUserId;
      const { data, error } = await supabase
        .from('empresa_perfil')
        .select('contato, gerente_prefs')
        .eq('user_id', ownerUserId)
        .maybeSingle();
      if (error) throw error;
      contact = maskPhone(data?.contato || '');
      const prefs = data?.gerente_prefs || {};
      whatsappEnabled = prefs?.whatsapp?.enabled === true;
      mutedTypes = Array.isArray(prefs?.muted_types) ? prefs.muted_types.filter((type) => !lockedTypes.has(type)) : [];
    } catch (error) {
      addToast(error?.message || 'Não foi possível carregar as preferências.', 'error');
    } finally {
      loading = false;
    }
  }

  function toggleMuted(type) {
    if (lockedTypes.has(type) || isSubUser) return;
    mutedTypes = mutedTypes.includes(type) ? mutedTypes.filter((item) => item !== type) : [...mutedTypes, type];
  }

  async function save() {
    if (isSubUser) return;
    if (whatsappEnabled && !normalizeBrazilianPhone(contact)) {
      addToast('Informe um telefone brasileiro válido para receber o resumo.', 'warning');
      return;
    }
    saving = true;
    try {
      const prefs = { whatsapp: { enabled: whatsappEnabled }, muted_types: mutedTypes };
      const { error } = await supabase.from('empresa_perfil').update({ gerente_prefs: prefs, contato: normalizeBrazilianPhone(contact) || contact }).eq('user_id', ownerUserId);
      if (error) throw error;
      if (whatsappEnabled) void capturePostHogEvent('gerente_whatsapp_optin');
      addToast('Preferências do Zelinho atualizadas.', 'success');
    } catch (error) {
      addToast(error?.message || 'Não foi possível salvar as preferências.', 'error');
    } finally {
      saving = false;
    }
  }

  async function authHeaders() {
    const { data: { session } } = await supabase.auth.getSession();
    return { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token || ''}` };
  }

  async function loadPairing() {
    pairLoading = true;
    try {
      const response = await fetch('/api/gerente/pair', { headers: await authHeaders() });
      if (!response.ok) {
        if (response.status !== 403) addToast('Não foi possível consultar a conexão com o WhatsApp.', 'warning');
        return;
      }
      const data = await response.json();
      pairLinked = data.linked === true;
      pairPhoneMasked = data.phone_masked || '';
      pairWhatsappNumber = data.whatsapp_number || '';
    } catch {
      addToast('Não foi possível consultar a conexão com o WhatsApp.', 'warning');
    } finally {
      pairLoading = false;
    }
  }

  async function startPairing() {
    if (pairBusy || isSubUser) return;
    pairBusy = true;
    try {
      const response = await fetch('/api/gerente/pair/start', { method: 'POST', headers: await authHeaders(), body: '{}' });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || 'Não foi possível gerar o código.');
      pairCode = data.code;
      pairExpiresAt = data.expires_at;
      pairWhatsappNumber = data.whatsapp_number || pairWhatsappNumber;
      void capturePostHogEvent('gerente_whatsapp_pair_start');
    } catch (error) {
      addToast(error?.message || 'Não foi possível gerar o código.', 'error');
    } finally {
      pairBusy = false;
    }
  }

  async function unlinkPairing() {
    if (pairBusy || isSubUser) return;
    pairBusy = true;
    try {
      const response = await fetch('/api/gerente/pair', { method: 'DELETE', headers: await authHeaders() });
      if (!response.ok) throw new Error('Não foi possível desvincular.');
      pairLinked = false;
      pairPhoneMasked = '';
      pairCode = '';
      addToast('WhatsApp desvinculado do Zelinho.', 'success');
    } catch (error) {
      addToast(error?.message || 'Não foi possível desvincular.', 'error');
    } finally {
      pairBusy = false;
    }
  }

  onMount(() => { load(); loadPairing(); });
</script>

<svelte:head><title>Preferências do Zelinho | ZeloPDV</title></svelte:head>

<section class="prefs-page">
  <div class="mb-6 flex items-end justify-between border-b  pb-4" style="border-color: var(--border-card);">
    <div><p class="text-[10px] font-bold uppercase tracking-[0.2em] mb-1" style="color: var(--text-muted);">Gestão / Zelinho</p><h1 class="text-xl font-bold tracking-tight" style="color: var(--text-main);">Preferências</h1></div>
  </div>

  {#if loading}
    <div class="skeleton"></div><div class="skeleton short"></div>
  {:else}
    {#if isSubUser}
      <InlineHelper id="prefs-subuser-hint" tone="warning" message="Seu perfil pode consultar estas preferências, mas somente o dono da empresa pode alterá-las." />
    {/if}
    <section class="preference-card">
      <div class="card-heading"><MessageCircle size={20} /><div><h2>Zelinho no WhatsApp</h2><p>Converse com o gerente e peça ações como "pausa o refri no cardápio" direto do seu WhatsApp.</p></div></div>
      {#if pairLoading}
        <div class="skeleton short"></div>
      {:else if pairLinked}
        <p class="pair-status">Conectado ao WhatsApp <strong>{pairPhoneMasked}</strong>.</p>
        {#if pairWhatsappNumber}<p class="pair-hint">Salve o contato do Zelinho Gerente: <strong>{pairWhatsappNumber}</strong>.</p>{/if}
        {#if !isSubUser}<button type="button" class="pair-secondary" disabled={pairBusy} on:click={unlinkPairing}>Desvincular</button>{/if}
      {:else if pairCode}
        <p class="pair-hint">Mande este código para o Zelinho no WhatsApp <strong>{pairWhatsappNumber}</strong> em até 10 minutos:</p>
        <p class="pairing-code" aria-live="polite">{pairCode}</p>
        <button type="button" class="pair-secondary" disabled={pairBusy} on:click={() => { pairCode = ''; loadPairing(); }}>Já enviei o código</button>
      {:else if !pairWhatsappNumber}
        <p class="pair-hint">Em breve. Por enquanto, converse com o Zelinho pelo painel dentro do app.</p>
      {:else}
        <p class="pair-hint">Só o dono da empresa pode conectar. O telefone conectado é o único que fala com o Zelinho.</p>
        {#if !isSubUser}<Button on:click={startPairing} disabled={pairBusy}><MessageCircle />{pairBusy ? 'Gerando...' : 'Conectar no WhatsApp'}</Button>{/if}
      {/if}
    </section>

    <section class="preference-card">
      <div class="card-heading"><MessageCircle size={20} /><div><h2>Resumo no WhatsApp</h2><p>Uma mensagem por dia com os números e pontos que merecem atenção.</p></div></div>
      <label class="switch-row"><input type="checkbox" class="themed-checkbox" bind:checked={whatsappEnabled} disabled={isSubUser} aria-describedby={isSubUser ? 'prefs-subuser-hint' : undefined} /><span>Receber resumo diário</span></label>
      {#if whatsappEnabled}
        <div class="form-grid">
          <label><span>WhatsApp</span><input value={contact} inputmode="numeric" placeholder="(00) 00000-0000" disabled={isSubUser} aria-describedby={isSubUser ? 'prefs-subuser-hint' : undefined} on:input={(event) => { contact = maskPhone(event.currentTarget.value); event.currentTarget.value = contact; }} /></label>
        </div>
        <p class="schedule-note">Enviado após a análise diária do Zelinho.</p>
        <button class="example-toggle" on:click={() => showExample = !showExample}>{showExample ? 'Fechar exemplo' : 'Ver um exemplo'}</button>
        {#if showExample}<div class="example">Zelinho Gerente - sua empresa<br />Ontem: R$ 1.240,00 em 38 vendas, ticket médio de R$ 32,63.<br />Veja os números: zelopdv.com.br/gestao/gerente</div>{/if}
      {/if}
    </section>

    <section class="preference-card">
      <div class="card-heading"><div><h2>O que o Zelinho te avisa</h2><p>Silenciar tira o aviso do briefing e do WhatsApp, mas ele continua disponível no histórico.</p></div></div>
      <div class="groups">
        {#each signalGroups as group}
          <div class="signal-group">
            <h3>{group.label}</h3>
            {#each group.types as [type, label]}
              <label class="signal-option">
                <input
                  type="checkbox"
                  class="themed-checkbox"
                  checked={lockedTypes.has(type) ? false : mutedTypes.includes(type)}
                  disabled={lockedTypes.has(type) || isSubUser}
                  aria-describedby={lockedTypes.has(type) ? `locked-${type}-hint` : isSubUser ? 'prefs-subuser-hint' : undefined}
                  on:change={() => toggleMuted(type)}
                />
                <span>{label}</span>
                {#if lockedTypes.has(type)}
                  <span id={`locked-${type}-hint`} class="locked"><Lock size={13} /> Sempre ativo para acompanhar riscos</span>
                {/if}
              </label>
            {/each}
          </div>
        {/each}
      </div>
    </section>
    {#if !isSubUser}<div class="save-row"><Button on:click={save} disabled={saving}><Save />{saving ? 'Salvando...' : 'Salvar preferências'}</Button></div>{/if}
  {/if}
</section>

<style>
  .prefs-page { max-width: 820px; margin: 0 auto; }.preference-card { padding: 20px; margin-bottom: 16px; border: 1px solid var(--border-card); border-radius: 8px; background: var(--bg-card); }.card-heading { display: flex; gap: 10px; align-items: flex-start; margin-bottom: 18px; color: var(--primary); }.card-heading h2 { color: var(--text-main); font-size: 15px; font-weight: 700; }.card-heading p, .schedule-note { margin-top: 3px; color: var(--text-muted); font-size: 13px; line-height: 1.5; }.schedule-note { margin-top: 8px; }.switch-row, .signal-option { display: flex; align-items: center; gap: 9px; color: var(--text-label); font-size: 14px; }.switch-row { margin-bottom: 18px; }.form-grid { display: grid; grid-template-columns: minmax(0, 1fr); gap: 12px; }.form-grid label { display: grid; gap: 6px; color: var(--text-muted); font-size: 12px; }.form-grid input { width: 100%; height: 36px; border: 1px solid var(--border-subtle); border-radius: 6px; background: var(--bg-input); color: var(--text-main); padding: 0 10px; font-size: 14px; }.example-toggle { margin-top: 13px; padding: 0; border: 0; background: transparent; color: var(--link); font-size: 13px; cursor: pointer; }.example { margin-top: 10px; padding: 12px;  background: var(--bg-panel); color: var(--text-muted); white-space: pre-line; font-size: 13px; line-height: 1.55; }.groups { display: grid; gap: 18px; }.signal-group h3 { margin-bottom: 7px; color: var(--text-muted); font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; }.signal-option { min-height: 32px; border-bottom: 1px solid var(--border-subtle); }.signal-option:last-child { border-bottom: 0; }.locked { display: inline-flex; align-items: center; gap: 4px; margin-left: auto; color: var(--text-muted); font-size: 11px; }.save-row { display: flex; justify-content: flex-end; padding-top: 4px; }.skeleton { height: 230px; border-radius: 8px; background: var(--bg-panel); animation: pulse 1.2s ease-in-out infinite; }.skeleton.short { height: 280px; margin-top: 16px; } @keyframes pulse { 50% { opacity: .5; } } @media (max-width: 520px) { .locked { font-size: 10px; } }
  .switch-row { min-height: 44px; }
  .signal-option { min-height: 44px; }
  .form-grid input { height: 44px; }
  .example-toggle { min-height: 44px; }
  .save-row :global(button) { min-height: 44px; }
  .example { border: 1px solid var(--border-subtle); border-radius: 6px; }
  .skeleton { border: 1px solid var(--border-card); }
  @media (prefers-reduced-motion: reduce) { .skeleton { animation: none; } }
  .pair-status, .pair-hint { margin: 0 0 10px; font-size: 13px; color: var(--text-main); }
  .pair-hint { color: var(--text-muted); }
  .pairing-code { margin: 0 0 12px; font-size: 32px; font-weight: 700; letter-spacing: 0.3em; color: var(--text-main); font-variant-numeric: tabular-nums; }
  .pair-secondary { min-height: 44px; padding: 0 14px; border: 1px solid var(--border-subtle); border-radius: 8px; background: var(--bg-input); color: var(--text-main); font-size: 13px; font-weight: 600; cursor: pointer; }
  .pair-secondary:disabled { opacity: .6; cursor: not-allowed; }
</style>
