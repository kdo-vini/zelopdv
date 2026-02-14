<script>
  import { onMount } from 'svelte';
  import { supabase } from '$lib/supabaseClient';
  import ExpensesManager from '$lib/components/ExpensesManager.svelte';
  import { ensureActiveSubscription } from '$lib/guards';

  let uid = null;
  // Default to current month for the manager view
  let today = new Date();
  let dataInicio = new Date(today.getFullYear(), today.getMonth(), 1);
  let dataFim = new Date(today.getFullYear(), today.getMonth() + 1, 0); 
  
  // Expenses list just for passing down (although component handles its own refresh event, 
  // we might want to lift state up completely or let it handle its own fetching.
  // The current ExpensesManager waits for props `expenses`.
  // Ideally, the PAGE should fetch and pass down.
  
  let expenses = [];
  let loading = true;

  onMount(async () => {
    const ok = await ensureActiveSubscription({ requireProfile: true });
    if (!ok) return;
    const { data } = await supabase.auth.getUser();
    uid = data?.user?.id;
    if (uid) loadExpenses();
  });

  async function loadExpenses() {
    loading = true;
    const isoStart = customIso(dataInicio, 'start');
    const isoEnd = customIso(dataFim, 'end');
    
    const { data, error } = await supabase
        .from('expenses')
        .select('*')
        .eq('user_id', uid)
        .gte('date', isoStart)
        .lte('date', isoEnd)
        .order('date', { ascending: false });
    
    if (!error) expenses = data || [];
    loading = false;
  }

  function customIso(d, type) {
    if (!d) return null;
    let c = new Date(d);
    if (type === 'start') c.setHours(0,0,0,0);
    else c.setHours(23,59,59,999);
    return new Date(c.getTime() - c.getTimezoneOffset()*60000).toISOString();
  }

  // Handle date changes
  $: if (uid && dataInicio && dataFim) loadExpenses();

  // Strings for inputs
  $: dataInicioStr = dataInicio.toISOString().slice(0,10);
  $: dataFimStr = dataFim.toISOString().slice(0,10);

  import AdminLock from '$lib/components/AdminLock.svelte';
</script>

<AdminLock>
<div class="space-y-6">
  <header class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
    <div>
        <h1 class="text-2xl font-bold text-slate-900 dark:text-white">Gerenciar Despesas</h1>
        <p class="text-slate-500 dark:text-slate-400">Lance contas, fornecedores e retiradas.</p>
    </div>
    
    <!-- Date Filter -->
    <div class="flex items-center gap-2 bg-white dark:bg-slate-800 p-2 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm">
        <input type="date" class="input-tiny" value={dataInicioStr} on:change={(e) => dataInicio = new Date(e.target.value+'T00:00:00')} />
        <span class="text-slate-400">até</span>
        <input type="date" class="input-tiny" value={dataFimStr} on:change={(e) => dataFim = new Date(e.target.value+'T00:00:00')} />
    </div>
  </header>

  {#if uid}
    <ExpensesManager {uid} {expenses} on:refresh={loadExpenses} />
  {/if}
</div>
</AdminLock>

<style>
    .input-tiny {
        @apply border-none bg-transparent text-sm focus:ring-0 text-slate-700 dark:text-white dark:bg-slate-700/50 rounded px-2 py-1;
        color-scheme: dark; 
    }
    :global(html.light) .input-tiny {
        color-scheme: light;
    }
</style>
