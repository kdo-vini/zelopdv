<script>
  import { onMount } from 'svelte'
  import { getRecentLogs } from '$lib/logger'
  import { fade } from 'svelte/transition'
  
  let logs = []
  let loading = true
  let limit = 100
  
  onMount(async () => {
    await loadLogs()
    loading = false
  })
  
  async function loadLogs() {
    loading = true
    logs = await getRecentLogs(limit)
    loading = false
  }
  
  function getActionLabel(action) {
    const labels = {
      extend_subscription: '➕ Estendeu',
      cancel_subscription: '❌ Cancelou',
      reactivate_subscription: '✅ Reativou',
      reset_password: '🔑 Reset',
      login: '🔐 Login',
      view_dashboard: '👁️ Visualizou',
      delete_user: '🗑️ Excluiu',
      edit_user: '✏️ Editou'
    }
    return labels[action] || action
  }

  function getActionBadgeStyle(action) {
    if (action.includes('extend') || action.includes('reactivate')) return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
    if (action.includes('cancel') || action.includes('delete')) return 'bg-rose-500/10 text-rose-400 border-rose-500/20'
    if (action.includes('edit')) return 'bg-amber-500/10 text-amber-400 border-amber-500/20'
    return 'bg-sky-500/10 text-sky-400 border-sky-500/20'
  }
  
  function formatDate(dateString) {
    const date = new Date(dateString)
    return date.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    })
  }
</script>

<svelte:head>
  <title>Logs de Auditoria - Zelo Admin</title>
</svelte:head>

<div class="max-w-[1400px] mx-auto space-y-8 animate-in fade-in duration-500">
  
  <!-- Sleek Header Area -->
  <div class="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-6 border-b border-slate-800">
    <div class="relative">
      <h2 class="text-3xl font-extrabold tracking-tight text-white mb-1">Audit Logs</h2>
      <p class="text-slate-400 text-sm font-medium">Histórico imutável de ações e segurança</p>
      <!-- Accent Glow Line -->
      <div class="absolute -bottom-6 left-0 w-16 h-[2px] bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]"></div>
    </div>
    
    <div class="flex items-center gap-3">
      <div class="relative group">
        <select
          bind:value={limit}
          on:change={loadLogs}
          class="appearance-none pl-4 pr-10 py-2.5 bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-xl text-sm font-medium text-slate-300 focus:outline-hidden focus:ring-1 focus:ring-emerald-500/50 transition-all shadow-inner"
        >
          <option value={50}>50 Recentes</option>
          <option value={100}>100 Recentes</option>
          <option value={200}>200 Recentes</option>
        </select>
        <div class="absolute inset-y-0 right-3 flex items-center pointer-events-none">
          <svg class="h-4 w-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
        </div>
      </div>
      
      <button
        on:click={loadLogs}
        class="flex items-center justify-center w-11 h-11 bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-xl text-slate-300 hover:text-white transition-all shadow-xs focus:outline-hidden focus:ring-2 focus:ring-slate-700"
        title="Atualizar Logs"
      >
        <svg class="w-4 h-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
      </button>
    </div>
  </div>
  
  <!-- Data Grid / List -->
  {#if loading}
    <div class="flex flex-col items-center justify-center py-24 space-y-4" in:fade>
      <div class="w-8 h-8 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin"></div>
      <div class="text-sm font-medium text-slate-400">Puxando logs da nuvem...</div>
    </div>
  {:else if logs.length === 0}
    <div class="flex flex-col items-center justify-center py-24 px-4 text-center border border-dashed border-slate-800 rounded-2xl bg-slate-900/30" in:fade>
      <div class="w-16 h-16 mb-4 rounded-full bg-slate-800/50 flex items-center justify-center">
        <svg class="w-8 h-8 text-slate-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
        </svg>
      </div>
      <h3 class="text-lg font-medium text-slate-300">Nenhum Registro</h3>
      <p class="text-sm text-slate-500 mt-1 max-w-sm">Nenhuma atividade registrada no intervalo solicitado.</p>
    </div>
  {:else}
    <!-- Desktop Table View -->
    <div class="hidden md:block overflow-hidden bg-slate-900/40 border border-slate-800/60 rounded-2xl shadow-xl backdrop-blur-xs" in:fade>
      <table class="w-full text-left border-collapse">
        <thead>
          <tr class="border-b border-slate-800 bg-slate-900/80">
            <th class="py-4 px-6 text-xs font-semibold text-slate-400 uppercase tracking-wider">Data/Hora</th>
            <th class="py-4 px-6 text-xs font-semibold text-slate-400 uppercase tracking-wider">Agent (Admin)</th>
            <th class="py-4 px-6 text-xs font-semibold text-slate-400 uppercase tracking-wider">Ação</th>
            <th class="py-4 px-6 text-xs font-semibold text-slate-400 uppercase tracking-wider">Alvo Ocorrência</th>
            <th class="py-4 px-6 text-xs font-semibold text-slate-400 uppercase tracking-wider">Payload (Context)</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-800/50">
          {#each logs as log (log.id)}
            <tr class="group hover:bg-slate-800/30 transition-colors">
              <td class="py-4 px-6 text-[13px] font-medium text-slate-300 whitespace-nowrap">
                {formatDate(log.created_at)}
              </td>
              <td class="py-4 px-6 text-[13px] text-slate-400 font-mono">
                {log.admin_email}
              </td>
              <td class="py-4 px-6">
                <span class="inline-flex px-2 py-1 text-[11px] font-bold tracking-wide uppercase rounded-sm border {getActionBadgeStyle(log.action)}">
                  {getActionLabel(log.action)}
                </span>
              </td>
              <td class="py-4 px-6 text-[13px] text-slate-200">
                {log.target_email || '-'}
              </td>
              <td class="py-4 px-6 text-[13px] text-slate-400">
                {#if log.details && Object.keys(log.details).length > 0}
                  <details class="group/details cursor-pointer outline-hidden">
                    <summary class="text-sky-500 hover:text-sky-400 font-medium select-none outline-hidden list-none flex items-center gap-1">
                      <svg class="h-4 w-4 transition-transform group-open/details:rotate-90" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path></svg>
                      Raw Dump
                    </summary>
                    <div class="mt-3 p-3 bg-slate-950/50 rounded-xl border border-slate-800/80 shadow-inner">
                      <pre class="text-[11px] font-mono text-slate-300 overflow-x-auto scrollbar-hide">{JSON.stringify(log.details, null, 2)}</pre>
                    </div>
                  </details>
                {:else}
                  <span class="text-slate-600">-</span>
                {/if}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>

    <!-- Mobile Stacked View -->
    <div class="md:hidden space-y-4" in:fade>
      {#each logs as log (log.id)}
        <div class="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg relative overflow-hidden">
          <div class="flex justify-between items-start mb-3 border-b border-slate-800 pb-3">
            <span class="inline-flex px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-sm border {getActionBadgeStyle(log.action)}">
              {getActionLabel(log.action)}
            </span>
            <span class="text-xs text-slate-500">{formatDate(log.created_at)}</span>
          </div>
          
          <div class="space-y-2 text-sm">
            <div class="flex justify-between">
              <span class="text-slate-500">Admin:</span>
              <span class="font-mono text-slate-300 text-xs">{log.admin_email}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-slate-500">Alvo:</span>
              <span class="text-slate-200">{log.target_email || '-'}</span>
            </div>
            {#if log.details && Object.keys(log.details).length > 0}
              <div class="pt-2">
                <details class="group/details">
                  <summary class="text-sky-500 text-xs font-semibold cursor-pointer outline-hidden">Payload</summary>
                  <pre class="mt-2 text-[10px] bg-slate-950/50 p-2 rounded-lg text-slate-400 overflow-x-auto border border-slate-800">{JSON.stringify(log.details, null, 2)}</pre>
                </details>
              </div>
            {/if}
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>
