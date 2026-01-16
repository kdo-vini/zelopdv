<!--
  Componente: BarChart.svelte
  Gráfico de barras responsivo usando CSS puro com Tailwind
  Ideal para séries diárias de vendas
-->
<script>
  /** @type {Array<{label: string, value: number, extra?: string}>} */
  export let data = [];
  
  /** @type {string} Título do gráfico */
  export let title = '';
  
  /** @type {string} Cor das barras (classe Tailwind) */
  export let barColor = 'bg-indigo-500';
  
  /** @type {string} Formato do valor (R$ ou número) */
  export let valuePrefix = 'R$ ';
  
  /** @type {number} Altura máxima das barras em pixels */
  export let maxHeight = 160;
  
  /** @type {boolean} Mostrar valores nas barras */
  export let showValues = true;
  
  // Calcula o valor máximo para escala
  $: maxValue = data.length ? Math.max(...data.map(d => d.value), 1) : 1;
  
  // Formata valores
  function formatValue(v) {
    return valuePrefix + Number(v || 0).toFixed(2);
  }
  
  function getBarHeight(value) {
    return Math.max(4, (value / maxValue) * maxHeight);
  }
</script>

<div class="w-full">
  {#if title}
    <h3 class="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">{title}</h3>
  {/if}
  
  {#if data.length === 0}
    <div class="text-sm text-slate-500 dark:text-slate-400 text-center py-8">
      Sem dados para exibir
    </div>
  {:else}
    <div class="flex items-end justify-between gap-1 sm:gap-2" style="height: {maxHeight + 40}px;">
      {#each data as item, idx}
        <div class="flex flex-col items-center flex-1 min-w-0 group">
          <!-- Valor no topo -->
          {#if showValues}
            <div class="text-[10px] sm:text-xs text-slate-600 dark:text-slate-400 font-medium mb-1 opacity-0 group-hover:opacity-100 transition-opacity truncate max-w-full">
              {formatValue(item.value)}
            </div>
          {/if}
          
          <!-- Barra -->
          <div 
            class="{barColor} rounded-t-sm w-full transition-all duration-300 hover:opacity-80 cursor-pointer relative"
            style="height: {getBarHeight(item.value)}px;"
            title="{item.label}: {formatValue(item.value)}{item.extra ? ' - ' + item.extra : ''}"
          >
            <!-- Tooltip on hover via title attribute -->
          </div>
          
          <!-- Label embaixo -->
          <div class="text-[9px] sm:text-[10px] text-slate-500 dark:text-slate-400 mt-1.5 truncate max-w-full text-center">
            {item.label}
          </div>
        </div>
      {/each}
    </div>
    
    <!-- Linha base -->
    <div class="border-t border-slate-200 dark:border-slate-600 mt-1"></div>
  {/if}
</div>
