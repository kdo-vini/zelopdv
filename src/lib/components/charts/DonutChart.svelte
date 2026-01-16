<!--
  Componente: DonutChart.svelte
  Gráfico de rosca/pizza usando CSS puro com conic-gradient
  Ideal para distribuição de formas de pagamento
-->
<script>
  /** @type {Array<{label: string, value: number, color: string}>} */
  export let data = [];
  
  /** @type {string} Título do gráfico */
  export let title = '';
  
  /** @type {number} Tamanho do gráfico em pixels */
  export let size = 180;
  
  /** @type {string} Formato do valor */
  export let valuePrefix = 'R$ ';
  
  /** @type {boolean} Mostrar legenda */
  export let showLegend = true;
  
  // Calcula total e percentuais
  $: total = data.reduce((acc, d) => acc + Number(d.value || 0), 0);
  
  $: segments = (() => {
    let cumulative = 0;
    return data.map(d => {
      const pct = total > 0 ? (d.value / total) * 100 : 0;
      const start = cumulative;
      cumulative += pct;
      return { ...d, pct, start, end: cumulative };
    });
  })();
  
  // Gera o conic-gradient CSS
  $: gradientStyle = (() => {
    if (!segments.length || total === 0) return 'background: #e2e8f0';
    
    const stops = segments.map(s => {
      return `${s.color} ${s.start}% ${s.end}%`;
    }).join(', ');
    
    return `background: conic-gradient(${stops})`;
  })();
  
  function formatValue(v) {
    return valuePrefix + Number(v || 0).toFixed(2);
  }
  
  function formatPct(pct) {
    return pct.toFixed(1) + '%';
  }
</script>

<div class="w-full">
  {#if title}
    <h3 class="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">{title}</h3>
  {/if}
  
  {#if data.length === 0 || total === 0}
    <div class="text-sm text-slate-500 dark:text-slate-400 text-center py-8">
      Sem dados para exibir
    </div>
  {:else}
    <div class="flex flex-col sm:flex-row items-center gap-4">
      <!-- Gráfico de rosca -->
      <div 
        class="rounded-full relative flex items-center justify-center shrink-0"
        style="width: {size}px; height: {size}px; {gradientStyle}"
      >
        <!-- Centro branco para formar rosca -->
        <div 
          class="bg-white dark:bg-slate-800 rounded-full flex flex-col items-center justify-center"
          style="width: {size * 0.6}px; height: {size * 0.6}px;"
        >
          <span class="text-xs text-slate-500 dark:text-slate-400">Total</span>
          <span class="text-sm font-bold text-slate-700 dark:text-slate-200">{formatValue(total)}</span>
        </div>
      </div>
      
      <!-- Legenda -->
      {#if showLegend}
        <div class="flex flex-col gap-2 text-sm">
          {#each segments as seg}
            <div class="flex items-center gap-2">
              <div class="w-3 h-3 rounded-sm shrink-0" style="background-color: {seg.color}"></div>
              <span class="text-slate-600 dark:text-slate-300 flex-1">{seg.label}</span>
              <span class="text-slate-500 dark:text-slate-400 font-medium">{formatPct(seg.pct)}</span>
              <span class="text-slate-700 dark:text-slate-200 font-medium">{formatValue(seg.value)}</span>
            </div>
          {/each}
        </div>
      {/if}
    </div>
  {/if}
</div>
