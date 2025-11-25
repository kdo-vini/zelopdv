<script>
  import { onMount } from 'svelte';
  import { supabase } from '$lib/supabaseClient';
  import { page } from '$app/stores';
  import { requiredOk as requiredOkUtil, buildPayload, isValidImage, normalizeLarguraBobina } from '$lib/profileUtils';
  import { addToast } from '$lib/stores/ui';
  export let params;

  let msg = '';
  let loading = true;
  let saving = false;
  let userId = null;
  let email = '';
  
  // Subscription state
  let subLoading = true;
  let subStatus = null;
  let stripeCustomerId = null;
  let cancelAtPeriodEnd = false;
  let currentPeriodEnd = null; // ISO string

  // Form fields
  let nome_exibicao = '';
  let documento = '';
  let contato = '';
  let inscricao_estadual = '';
  let endereco = '';
  let largura_bobina = '80mm';
  let logo_url = '';
  let rodape_recibo = 'Obrigado pela preferência!';

  let pendingLogoUrl = null; // used when uploading before first save

  // Reativo: habilita o botão assim que os obrigatórios estiverem ok
  let canSave = false;
  $: canSave = requiredOkUtil({ nome_exibicao, documento, contato, largura_bobina });

  let dirty = false;
  function markDirty() { dirty = true; }
  function clearDirty() { dirty = false; }

  onMount(async () => {
    // Require auth
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { window.location.href = '/login'; return; }
  userId = session.user.id;
  email = session.user.email || '';

    // Load subscription (to enable Manage Subscription button)
    try {
      const { data: sub } = await supabase
        .from('subscriptions')
        .select('status, stripe_customer_id, cancel_at_period_end, current_period_end')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      subStatus = sub?.status ?? null;
      stripeCustomerId = sub?.stripe_customer_id ?? null;
      cancelAtPeriodEnd = !!sub?.cancel_at_period_end;
      currentPeriodEnd = sub?.current_period_end ?? null;
    } catch (e) {
      console.warn('Falha ao carregar assinatura:', e?.message || e); // Keep warning for non-critical sub load
    } finally {
      subLoading = false;
    }

    // Load profile (no default insert due to NOT NULL constraints)
    const { data, error } = await supabase
      .from('empresa_perfil')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) {
      addToast('Erro ao carregar perfil: ' + error.message, 'error');
      msg = 'Erro ao carregar perfil.';
    } else if (data) {
      nome_exibicao = data.nome_exibicao ?? '';
      documento = data.documento ?? '';
      contato = data.contato ?? '';
      inscricao_estadual = data.inscricao_estadual ?? '';
      endereco = data.endereco ?? '';
  // Normaliza largura para valores canônicos
  largura_bobina = normalizeLarguraBobina(data.largura_bobina ?? '80mm');
      logo_url = data.logo_url ?? '';
      rodape_recibo = data.rodape_recibo ?? 'Obrigado pela preferência!';
    }
    // Show completion notice if requested
    const params = new URLSearchParams($page.url.search);
    if (params.get('msg') === 'complete' && !requiredOkUtil({ nome_exibicao, documento, contato, largura_bobina })) {
      msg = 'Complete as informações da sua empresa antes de continuar.';
    }
    loading = false;

    // Warn on unsaved changes
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', (e) => {
        if (dirty) {
          e.preventDefault();
          e.returnValue = '';
        }
      });
    }
  });

  async function uploadLogo(e) {
    const file = e.target.files?.[0];
    if (!file || !userId) return;
    try {
      if (!isValidImage(file)) {
        msg = 'Arquivo inválido. Envie uma imagem (até ~1.5MB).';
        return;
      }
      const path = `${userId}.png`;
      const { error } = await supabase.storage.from('logos').upload(path, file, {
        upsert: true,
        contentType: file.type || 'image/png'
      });
      if (error) throw error;
      const { data } = supabase.storage.from('logos').getPublicUrl(path);
      const url = data.publicUrl;
      logo_url = url;
      // If a row exists, persist immediately; otherwise keep pending for first save
      const { data: existing } = await supabase
        .from('empresa_perfil')
        .select('user_id')
        .eq('user_id', userId)
        .maybeSingle();
      if (existing) {
        await supabase.from('empresa_perfil').upsert({ user_id: userId, logo_url: url }, { onConflict: 'user_id' });
      } else {
        pendingLogoUrl = url;
      }
      msg = 'Logo atualizada.';
      markDirty();
    } catch (err) {
      addToast('Erro ao enviar logo.', 'error');
      msg = 'Erro ao enviar logo.';
    }
  }

  async function salvar() {
    if (!requiredOkUtil({ nome_exibicao, documento, contato, largura_bobina })) { msg = 'Preencha os campos obrigatórios.'; return; }
    saving = true; msg = '';
    const payload = buildPayload({
      userId,
      nome_exibicao,
      documento,
      contato,
      inscricao_estadual,
      endereco,
      rodape_recibo,
      largura_bobina,
      logo_url,
      pendingLogoUrl
    });
    const { error } = await supabase.from('empresa_perfil').upsert(payload, { onConflict: 'user_id' });
    saving = false;
    if (error) { addToast('Erro ao salvar perfil: ' + error.message, 'error'); msg = 'Erro ao salvar perfil.'; return; }
    addToast('Perfil salvo com sucesso.', 'success');
    msg = 'Perfil salvo com sucesso.';
    clearDirty();
    setTimeout(() => { window.location.href = '/painel.html'; }, 600);
  }

  async function logout() {
    try { await supabase.auth.signOut(); } catch {}
    window.location.href = '/login';
  }

  async function openManageSubscription() {
    try {
      msg = '';
      const resp = await fetch('/api/billing/create-portal-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerId: stripeCustomerId, email })
      });
      const json = await resp.json();
      if (!resp.ok || !json?.url) {
        msg = json?.error || 'Não foi possível abrir o portal de assinatura.';
        return;
      }
      window.location.href = json.url;
    } catch (err) {
      addToast('Erro ao abrir o portal do cliente Stripe.', 'error');
      msg = 'Erro ao abrir o portal do cliente Stripe.';
    }
  }
</script>

<h1 class="text-2xl font-semibold mb-2">Perfil da Empresa</h1>
{#if msg}
  <div class="mb-4 text-sm text-amber-400">{msg}</div>
{/if}

{#if loading}
  <p>Carregando…</p>
{:else}
  <div class="flex items-center justify-between mb-4">
    <a href="/app" class="px-3 py-1.5 rounded-md border border-slate-700 text-slate-200 hover:bg-slate-800">Voltar ao App</a>
    <button on:click={logout} class="px-3 py-1.5 rounded-md border border-slate-700 text-slate-200 hover:bg-slate-800">Sair</button>
  </div>

  <form class="bg-slate-900/50 border border-slate-700 rounded-xl p-4 grid gap-6 max-w-2xl" on:submit|preventDefault={salvar}>
    <!-- Subscription section -->
    <section class="grid gap-2">
      <div class="flex items-center justify-between">
        <div>
          <div class="text-sm text-slate-400">Assinatura</div>
          {#if subLoading}
            <div class="text-sm">Carregando status…</div>
          {:else if subStatus}
            <div class="text-sm">Status: <span class="font-semibold capitalize">{subStatus}</span></div>
          {:else}
            <div class="text-sm">Nenhuma assinatura encontrada.</div>
          {/if}
        </div>
        <div class="flex items-center gap-2">
          <button type="button" on:click={openManageSubscription}
            class="px-3 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 disabled:opacity-60"
            disabled={subLoading}>
            Gerenciar assinatura
          </button>
          {#if !subLoading && subStatus !== 'active'}
            <a href="/assinatura" class="px-3 py-1.5 rounded-md bg-sky-600 hover:bg-sky-700 text-white">Assinar</a>
          {/if}
        </div>
      </div>
      {#if !subLoading && cancelAtPeriodEnd}
        <div class="text-xs text-amber-300 bg-amber-900/20 border border-amber-700/30 rounded-md px-3 py-2">
          A renovação automática foi desativada e sua assinatura será encerrada em
          <strong>{currentPeriodEnd ? new Date(currentPeriodEnd).toLocaleDateString() : '—'}</strong>.
        </div>
      {/if}
    </section>

    <!-- Company info -->
    <section class="grid gap-4">
      <h2 class="text-sm font-semibold text-slate-300">Informações da empresa</h2>
      <label class="block">
        <span class="block mb-1">Nome exibido no recibo *</span>
        <input class="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2" bind:value={nome_exibicao} on:input={markDirty} />
      </label>

      <div class="grid sm:grid-cols-2 gap-4">
        <label class="block">
          <span class="block mb-1">Documento (CNPJ/CPF) *</span>
          <input class="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2" bind:value={documento} on:input={markDirty} />
        </label>
        <label class="block">
          <span class="block mb-1">Contato (telefone ou e-mail) *</span>
          <input class="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2" bind:value={contato} on:input={markDirty} />
        </label>
      </div>

      <div class="grid sm:grid-cols-2 gap-4">
        <label class="block">
          <span class="block mb-1">Inscrição Estadual (opcional)</span>
          <input class="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2" bind:value={inscricao_estadual} on:input={markDirty} placeholder="ISENTO quando aplicável" />
        </label>
        <label class="block">
          <span class="block mb-1">Largura da bobina *</span>
          <select class="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2" bind:value={largura_bobina} on:change={() => { largura_bobina = normalizeLarguraBobina(largura_bobina); markDirty(); }}>
            <option value="80mm">80 mm</option>
            <option value="58mm">58 mm</option>
          </select>
        </label>
      </div>

      <label class="block">
        <span class="block mb-1">Endereço (opcional)</span>
        <input class="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2" bind:value={endereco} on:input={markDirty} />
      </label>
    </section>

    <!-- Branding -->
    <section class="grid gap-3">
      <h2 class="text-sm font-semibold text-slate-300">Branding</h2>
      <div class="flex items-center gap-4">
        <img src={logo_url} alt="Logo" class="w-20 h-20 rounded border border-slate-700 object-contain bg-slate-900" />
        <div class="flex flex-col gap-1">
          <input type="file" accept="image/*" on:change={uploadLogo} />
          <span class="text-xs text-slate-400">PNG quadrado até ~1MB recomendado</span>
        </div>
      </div>
      <label class="block">
        <span class="block mb-1">Rodapé do recibo (opcional)</span>
        <textarea class="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 min-h-[80px]" bind:value={rodape_recibo} on:input={markDirty} />
      </label>
    </section>

    <div class="flex items-center gap-3">
      <button type="submit" class="px-4 py-2 rounded-md bg-sky-600 hover:bg-sky-700 text-white font-semibold disabled:opacity-60" disabled={!canSave || saving}>
        {saving ? 'Salvando…' : 'Salvar alterações'}
      </button>
      {#if !canSave}
        <span class="text-sm text-amber-400">Preencha os campos obrigatórios marcados com *</span>
      {/if}
    </div>
  </form>
{/if}

<style>
  :global(.min-h-screen){min-height:100vh}
  :global(body){background:#0f172a}
  :global(.text-slate-200){color:#e5e7eb}
  :global(.text-slate-400){color:#94a3b8}
  :global(.bg-slate-900){background:#0b1220}
  :global(.border-slate-700){border-color:#334155}
  :global(.bg-sky-700){background:#0369a1}
  :global(.bg-sky-600){background:#0284c7}
  :global(.text-white){color:#fff}
  :global(.rounded-md){border-radius:0.5rem}
  :global(.rounded-xl){border-radius:0.75rem}
  :global(.px-3){padding-left:0.75rem;padding-right:0.75rem}
  :global(.py-2){padding-top:0.5rem;padding-bottom:0.5rem}
  :global(.px-4){padding-left:1rem;padding-right:1rem}
  :global(.py-1\.5){padding-top:0.375rem;padding-bottom:0.375rem}
  :global(.mb-1){margin-bottom:0.25rem}
  :global(.mb-2){margin-bottom:0.5rem}
  :global(.mb-4){margin-bottom:1rem}
  :global(.p-4){padding:1rem}
  :global(.grid){display:grid}
  :global(.gap-4){gap:1rem}
  :global(.gap-6){gap:1.5rem}
  :global(.gap-3){gap:0.75rem}
  :global(.max-w-2xl){max-width:42rem}
  :global(.flex){display:flex}
  :global(.items-center){align-items:center}
  :global(.gap-2){gap:0.5rem}
  :global(.gap-4){gap:1rem}
  :global(.w-20){width:5rem}
  :global(.h-20){height:5rem}
  :global(.object-contain){object-fit:contain}
  :global(.font-semibold){font-weight:600}
  :global(.text-2xl){font-size:1.5rem}
  :global(.hover\:bg-slate-800:hover){background:#1f2937}
  :global(.disabled\:opacity-60:disabled){opacity:.6}
  :global(.min-h-\[80px\]){min-height:80px}
</style>
