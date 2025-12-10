<script>
  import { onMount } from 'svelte'
  import { getRecentLogs } from '$lib/logger'
  
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
      extend_subscription: '➕ Estendeu assinatura',
      cancel_subscription: '❌ Cancelou assinatura',
      reactivate_subscription: '✅ Reativou assinatura',
      reset_password: '🔑 Reset de senha',
      login: '🔐 Login',
      view_dashboard: '👁️ Visualizou dashboard'
    }
    return labels[action] || action
  }
  
  function formatDate(dateString) {
    const date = new Date(dateString)
    return date.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }
</script>

<svelte:head>
  <title>Logs - Zelo Admin</title>
</svelte:head>

<div class="space-y-6">
  <!-- Header -->
  <div class="flex justify-between items-center">
    <div>
      <h2 class="text-2xl font-bold">Logs de Atividade</h2>
      <p class="text-slate-400 mt-1">Histórico de ações administrativas</p>
    </div>
    
    <div class="flex gap-2">
      <select
        bind:value={limit}
        on:change={loadLogs}
        class="px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-sky-500"
      >
        <option value={50}>Últimos 50</option>
        <option value={100}>Últimos 100</option>
        <option value={200}>Últimos 200</option>
      </select>
      
      <button
        on:click={loadLogs}
        class="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition"
      >
        🔄 Atualizar
      </button>
    </div>
  </div>
  
  <!-- Logs List -->
  {#if loading}
    <div class="text-center py-12">
      <div class="text-slate-400">Carregando logs...</div>
    </div>
  {:else if logs.length === 0}
    <div class="bg-slate-800 border border-slate-700 rounded-lg p-12 text-center">
      <div class="text-slate-400">Nenhum log encontrado</div>
    </div>
  {:else}
    <div class="bg-slate-800 border border-slate-700 rounded-lg overflow-hidden">
      <div class="overflow-x-auto">
        <table class="w-full">
          <thead class="bg-slate-900 border-b border-slate-700">
            <tr>
              <th class="px-4 py-3 text-left text-sm font-medium text-slate-400">Data/Hora</th>
              <th class="px-4 py-3 text-left text-sm font-medium text-slate-400">Admin</th>
              <th class="px-4 py-3 text-left text-sm font-medium text-slate-400">Ação</th>
              <th class="px-4 py-3 text-left text-sm font-medium text-slate-400">Alvo</th>
              <th class="px-4 py-3 text-left text-sm font-medium text-slate-400">Detalhes</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-700">
            {#each logs as log (log.id)}
              <tr class="hover:bg-slate-700/50 transition">
                <td class="px-4 py-3 text-sm text-slate-300 whitespace-nowrap">
                  {formatDate(log.created_at)}
                </td>
                <td class="px-4 py-3 text-sm text-slate-300">
                  {log.admin_email}
                </td>
                <td class="px-4 py-3 text-sm">
                  <span class="text-white">
                    {getActionLabel(log.action)}
                  </span>
                </td>
                <td class="px-4 py-3 text-sm text-slate-300">
                  {log.target_email || '-'}
                </td>
                <td class="px-4 py-3 text-sm text-slate-400">
                  {#if log.details && Object.keys(log.details).length > 0}
                    <details class="cursor-pointer">
                      <summary class="text-sky-400 hover:underline">Ver detalhes</summary>
                      <pre class="mt-2 text-xs bg-slate-900 p-2 rounded overflow-x-auto">{JSON.stringify(log.details, null, 2)}</pre>
                    </details>
                  {:else}
                    -
                  {/if}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>
  {/if}
</div>
