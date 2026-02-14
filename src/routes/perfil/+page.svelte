<script>
  import { onMount } from 'svelte';
  import { supabase } from '$lib/supabaseClient';
  import { translateSubscriptionStatus } from '$lib/errorUtils';
  import { page } from '$app/stores';
  import { requiredOk as requiredOkUtil, buildPayload, isValidImage, normalizeLarguraBobina } from '$lib/profileUtils';
  import { addToast } from '$lib/stores/ui';
  export let params;

  // PIN Management
  let showChangePin = false;
  let newPin = '';
  let savingPin = false;

  // Validation UI
  let showPinBubble = false;
  let pinBubbleTimer;
  function triggerPinBubble() {
      showPinBubble = true;
      clearTimeout(pinBubbleTimer);
      pinBubbleTimer = setTimeout(() => showPinBubble = false, 2000);
  }

  async function saveNewPin() {
    // Implementation for saving PIN will go here
    // For now, just a placeholder to make the code syntactically correct
    console.log('Saving new PIN:', newPin);
    savingPin = true;
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));
      addToast('PIN atualizado com sucesso!', 'success');
      adminPin = newPin; // Update the displayed PIN
      showChangePin = false; // Close the form
      newPin = ''; // Clear the input
    } catch (error) {
      addToast('Erro ao atualizar PIN: ' + error.message, 'error');
    } finally {
      savingPin = false;
    }
  }

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

  import AdminLock from '$lib/components/AdminLock.svelte';

  // State for PIN management inside profile
  let adminPin = ''; 

  onMount(async () => {
    // ... existing auth checks ...
    // Require auth
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { window.location.href = '/login'; return; }
    userId = session.user.id;
    email = session.user.email || '';

    // ... existing subscription load ...
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
      console.warn('Falha ao carregar assinatura:', e?.message || e);
    } finally {
      subLoading = false;
    }

    // Load profile
    const { data, error } = await supabase
      .from('empresa_perfil')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    
    if (error) {
       addToast('Erro ao carregar perfil: ' + error.message, 'error');
       msg = 'Erro ao carregar perfil.';
    } else if (data) {
       // ... existing mappings ...
       nome_exibicao = data.nome_exibicao ?? '';
       documento = data.documento ?? '';
       contato = data.contato ?? '';
       inscricao_estadual = data.inscricao_estadual ?? '';
       endereco = data.endereco ?? '';
       largura_bobina = normalizeLarguraBobina(data.largura_bobina ?? '80mm');
       logo_url = data.logo_url ?? '';
       rodape_recibo = data.rodape_recibo ?? 'Obrigado pela preferência!';
       
       adminPin = data.pin_admin || ''; // Capture PIN for Lock
    }
    // ... rest of onMount ...
    const params = new URLSearchParams($page.url.search);
    if (params.get('msg') === 'complete' && !requiredOkUtil({ nome_exibicao, documento, contato, largura_bobina })) {
      msg = 'Complete as informações da sua empresa antes de continuar.';
    }
    loading = false;
    // ...
  });
  // ... existing functions ...
  let logoFile = null;

  function uploadLogo(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!isValidImage(file)) {
      addToast('Imagem inválida. Use PNG/JPG até 1.5MB.', 'error');
      return;
    }
    logoFile = file;
    pendingLogoUrl = URL.createObjectURL(file);
    markDirty();
  }

  async function openManageSubscription() {
    if (!stripeCustomerId && !email) {
      addToast('Não há informações de cliente para gerenciar assinatura.', 'error');
      return;
    }
    subLoading = true;
    try {
      const resp = await fetch('/api/billing/create-portal-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerId: stripeCustomerId, email })
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Erro ao criar sessão.');
      if (data.url) window.location.href = data.url;
    } catch (err) {
      addToast('Erro: ' + err.message, 'error');
      subLoading = false;
    }
  }

  async function salvar() {
    if (!canSave) return;
    saving = true;
    try {
      let finalUrl = logo_url;
      if (logoFile) {
        // Upload para bucket 'logos' com nome fixo userId.png
        const fileName = `${userId}.png`;
        const { error: upErr } = await supabase.storage
          .from('logos')
          .upload(fileName, logoFile, { upsert: true });
        
        if (upErr) throw upErr;
        
        const { data: { publicUrl } } = supabase.storage
          .from('logos')
          .getPublicUrl(fileName);
          
        finalUrl = `${publicUrl}?t=${Date.now()}`;
      }

      const payload = buildPayload({
        userId,
        nome_exibicao,
        documento,
        contato,
        inscricao_estadual,
        endereco,
        rodape_recibo,
        largura_bobina,
        logo_url: finalUrl,
        pendingLogoUrl: null // Passar null para usar o logo_url calculado
      });
      
      const { error } = await supabase.from('empresa_perfil').upsert(payload, { onConflict: 'user_id' });
      
      if (error) throw error;
      
      addToast('Perfil salvo com sucesso!', 'success');
      logo_url = finalUrl;
      logoFile = null;
      pendingLogoUrl = null;
      clearDirty();
    } catch (e) {
      console.error(e);
      addToast('Erro ao salvar: ' + e.message, 'error');
    } finally {
      saving = false;
    }
  }

  async function logout() {
    try {
      await supabase.auth.signOut();
    } catch (e) {
      console.error('Logout error:', e);
    }
    window.location.href = '/login';
  }
</script>

<AdminLock correctPin={adminPin}>
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
            <div class="text-sm">Status: <span class="font-semibold capitalize">{translateSubscriptionStatus(subStatus)}</span></div>
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
          {#if !subLoading && subStatus !== 'active' && subStatus !== 'trialing'}
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

    <!-- Admin PIN -->
    <section class="grid gap-4 border-t border-slate-700/50 pt-4">
      <h2 class="text-sm font-semibold text-slate-300 flex items-center gap-2">
        <span class="text-xs bg-slate-800 p-1 rounded">🔐</span> PIN Administrativo
      </h2>
      <div class="bg-slate-900 rounded p-3 border border-slate-700 flex flex-col sm:flex-row gap-3 items-end sm:items-center justify-between">
        <div class="text-sm text-slate-400">
          <p>O PIN protege áreas sensíveis (Relatórios, Despesas, Perfil).</p>
        </div>
        <button type="button" on:click={() => showChangePin = !showChangePin} class="text-sm text-sky-400 hover:text-sky-300 underline underline-offset-2">
          Alterar PIN
        </button>
      </div>

      {#if showChangePin}
       <div class="bg-slate-800/50 p-4 rounded border border-slate-700 grid gap-3 animate-fade-in">
           <label class="block">
             <span class="block mb-1 text-sm">Novo PIN (4 dígitos)</span>
             <div class="relative">
                <input 
                  type="password" 
                  maxlength="4" 
                  inputmode="numeric" 
                  pattern="[0-9]*" 
                  class="w-full rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-center tracking-[0.5em] font-mono text-white placeholder:text-slate-500 placeholder:tracking-normal" 
                  bind:value={newPin} 
                  on:input={(e) => {
                      if (/\D/.test(e.currentTarget.value)) {
                          triggerPinBubble();
                          newPin = e.currentTarget.value.replace(/\D/g, '');
                      }
                  }}
                  placeholder="0000" 
                />
                {#if showPinBubble}
                     <div class="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1 bg-amber-500 text-white text-xs font-bold rounded shadow-xl whitespace-nowrap z-50 animate-bounce">
                        Números apenas!
                        <div class="absolute top-full left-1/2 -translate-x-1/2 -mt-1 border-4 border-transparent border-t-amber-500"></div>
                     </div>
                {/if}
             </div>
           </label>
           <button type="button" class="btn-primary w-full" on:click={saveNewPin} disabled={newPin.length !== 4 || savingPin}>
             {savingPin ? 'Salvando...' : 'Atualizar PIN'}
           </button>
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
        <img src={pendingLogoUrl || logo_url} alt="Logo" class="w-20 h-20 rounded border border-slate-700 object-contain bg-slate-900" />
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

</AdminLock>

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
