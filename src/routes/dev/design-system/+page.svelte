<script>
  import { onMount } from 'svelte';
  import { ShoppingBag, Bike, Plus, ArrowLeftRight, Trash2, Printer } from 'lucide-svelte';
  import { Button } from '$lib/components/ui/button';
  import { Kbd, MoneyText, StatusPill, QtyBadge, Segmented, UnderlineTabs, Stepper, ProductTile, SearchField } from '$lib/components/zelo';

  const SURFACES = [
    { id: 'app', title: 'App', note: 'Sistema interno · superfície clara, ações navy' },
    { id: 'brand', title: 'Brand', note: 'Cliente final · navy, ações brancas' },
  ];
  const SWATCHES = [
    ['--bg-app', 'Fundo'], ['--bg-panel', 'Painel'], ['--bg-sunken', 'Rebaixado'], ['--text-main', 'Tinta'],
    ['--text-label', 'Rótulo'], ['--text-muted', 'Apoio'], ['--border-subtle', 'Linha'], ['--primary', 'Ação'],
    ['--status-success-text', 'Sucesso'], ['--status-warning-text', 'Atenção'], ['--status-error-text', 'Erro'],
  ];
  const TYPE = [
    ['Título de página', 'type-title', 'Frente de Caixa'],
    ['Seção', 'type-eyebrow', 'PDV / Frente de caixa'],
    ['Corpo', 'type-body', 'Toque em um produto para somar na venda.'],
    ['Apoio', 'type-muted', 'Dinheiro, Pix, cartão ou fiado'],
  ];

  let resolved = $state({});
  let tipo = $state({ app: 'retirada', brand: 'retirada' });
  let tabela = $state({ app: 'balcao', brand: 'balcao' });
  let cat = $state({ app: 'todos', brand: 'todos' });
  let qty = $state({ app: 2, brand: 2 });
  let boards = {};

  onMount(() => {
    const next = {};
    for (const s of SURFACES) {
      const style = getComputedStyle(boards[s.id]);
      next[s.id] = Object.fromEntries(SWATCHES.map(([token]) => [token, style.getPropertyValue(token).trim()]));
    }
    resolved = next;
  });
</script>

<svelte:head>
  <title>Design System Zelo</title>
  <meta name="robots" content="noindex, nofollow" />
</svelte:head>

<div class="page" data-surface="app">
  <header class="intro">
    <p class="type-eyebrow">Zelo Design System · referência viva</p>
    <h1 class="type-display">Um vocabulário, duas superfícies</h1>
    <p class="type-muted">Os mesmos componentes e tokens, renderizados em cada superfície. Documentação: <code>docs/DESIGN_SYSTEM.md</code>. Esta página não existe em produção.</p>
  </header>

  <div class="grid">
    {#each SURFACES as s (s.id)}
      <section class="board" data-surface={s.id} bind:this={boards[s.id]} aria-labelledby="h-{s.id}">
        <div class="board-head">
          <h2 id="h-{s.id}">{s.title}</h2>
          <p class="type-muted">{s.note}</p>
        </div>

        <h3 class="type-eyebrow">Cores</h3>
        <div class="swatches">
          {#each SWATCHES as [token, name] (token)}
            <div class="sw">
              <span class="chip" style="background: var({token})"></span>
              <span><b>{name}</b><code>{token}</code><code class="val">{resolved[s.id]?.[token] ?? ''}</code></span>
            </div>
          {/each}
        </div>

        <h3 class="type-eyebrow">Tipografia</h3>
        <div class="stack">
          {#each TYPE as [label, cls, sample] (cls)}
            <div class="type-row"><span class="type-muted">{label}</span><span class={cls}>{sample}</span></div>
          {/each}
          <div class="type-row"><span class="type-muted">Números</span><MoneyText value={85.4} size="lg" /></div>
        </div>

        <h3 class="type-eyebrow">Botões</h3>
        <div class="row">
          <Button variant="primary" size="md">Confirmar</Button>
          <Button variant="outlined" size="md"><Plus strokeWidth={1.75} />Item avulso<Kbd>F4</Kbd></Button>
          <Button variant="quiet" size="md">Cancelar</Button>
          <Button variant="danger" size="md"><Trash2 strokeWidth={1.75} />Limpar</Button>
          <Button variant="outlined" size="icon-md" aria-label="Imprimir"><Printer strokeWidth={1.75} /></Button>
        </div>
        <Button variant="primary" size="cta" class="on-action">Receber<Kbd>F9</Kbd><MoneyText value={85.4} class="cta-total" /></Button>

        <h3 class="type-eyebrow">Campos e navegação</h3>
        <div class="stack">
          <SearchField placeholder="Buscar produto ou código de barras" shortcut="F2" />
          <div class="row">
            <Segmented label="Tipo de pedido" bind:value={tipo[s.id]} options={[{ value: 'retirada', label: 'Retirada', icon: ShoppingBag }, { value: 'delivery', label: 'Delivery', icon: Bike }]} />
            <Segmented label="Tabela de preço" bind:value={tabela[s.id]} options={[{ value: 'balcao', label: 'Balcão' }, { value: 'ifood', label: 'iFood' }, { value: 'atacado', label: 'Atacado' }]} />
          </div>
          <UnderlineTabs label="Categorias" bind:value={cat[s.id]} tabs={[{ value: 'todos', label: 'Todos', count: 17 }, { value: 'lanches', label: 'Lanches', count: 5 }, { value: 'bebidas', label: 'Bebidas', count: 5 }, { value: 'doces', label: 'Doces', count: 3 }]} />
        </div>

        <h3 class="type-eyebrow">Produto</h3>
        <div class="tiles">
          <ProductTile name="X-Bacon" price={29.9} quantity={1} />
          <ProductTile name="Pão de queijo" meta="por unidade" price={5} />
          <ProductTile name="Esfiha de carne" price={6.5} lowStock={3} />
        </div>

        <h3 class="type-eyebrow">Estado e quantidade</h3>
        <div class="row">
          <StatusPill dot>Caixa <b class="num">#12</b> aberto</StatusPill>
          <StatusPill tone="warn">1 venda offline</StatusPill>
          <StatusPill tone="ok">Sincronizado</StatusPill>
          <StatusPill tone="danger">Falha no Pix</StatusPill>
          <QtyBadge count={4} />
          <Stepper bind:value={qty[s.id]} />
          <Stepper bind:value={qty[s.id]} size="lg" />
        </div>

        <h3 class="type-eyebrow">Ícones · Lucide, traço 1,75</h3>
        <div class="row icons"><ShoppingBag strokeWidth={1.75} /><Bike strokeWidth={1.75} /><ArrowLeftRight strokeWidth={1.75} /><Trash2 strokeWidth={1.75} /><Printer strokeWidth={1.75} /><Plus strokeWidth={1.75} /></div>
      </section>
    {/each}
  </div>
</div>

<style>
  .page { min-height: 100vh; background: var(--bg-app); color: var(--text-main); padding: 40px 24px 64px; }
  .intro { max-width: 1280px; margin: 0 auto 28px; display: flex; flex-direction: column; gap: 8px; }
  .grid { max-width: 1280px; margin: 0 auto; display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 560px), 1fr)); gap: 20px; }
  .board { background: var(--bg-app); color: var(--text-main); font-family: var(--zelo-font-ui); border: 1px solid var(--border-card); border-radius: var(--zelo-radius-sheet); padding: 24px; display: flex; flex-direction: column; gap: 14px; min-width: 0; }
  .board-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
  h2 { margin: 0; font: 600 22px/1 var(--zelo-font-ui); letter-spacing: -0.02em; }
  h3 { margin: 12px 0 0; }
  .type-display { margin: 0; font: 600 32px/1.1 var(--zelo-font-ui); letter-spacing: -0.03em; }
  .type-title { font: 600 22px/1.1 var(--zelo-font-ui); letter-spacing: -0.02em; }
  .type-eyebrow { font: 600 10.5px/1 var(--zelo-font-ui); letter-spacing: 0.12em; text-transform: uppercase; color: var(--text-muted); }
  .type-body { font: 400 14.5px/1.4 var(--zelo-font-ui); }
  .type-muted { font: 400 13px/1.4 var(--zelo-font-ui); color: var(--text-muted); margin: 0; }
  .num { font-family: var(--zelo-font-num); font-weight: 600; color: var(--text-main); }
  code { font: 500 11px/1.3 var(--zelo-font-num); color: var(--text-muted); }
  .swatches { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 8px; }
  .sw { display: flex; gap: 10px; align-items: center; padding: 8px; border-radius: var(--zelo-radius-control); background: var(--bg-panel); border: 1px solid var(--border-card); }
  .sw > span:last-child { display: flex; flex-direction: column; gap: 2px; min-width: 0; font-size: 12.5px; }
  .chip { width: 34px; height: 34px; border-radius: 9px; flex: none; box-shadow: inset 0 0 0 1px var(--border-strong); }
  .val { color: var(--text-label); }
  .stack { display: flex; flex-direction: column; gap: 10px; }
  .row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
  .type-row { display: grid; grid-template-columns: 120px 1fr; align-items: baseline; gap: 12px; }
  .tiles { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
  .icons { color: var(--text-label); gap: 16px; }
  .board :global(.cta-total) { margin-left: auto; font-size: 19px; }
  .board :global(.cta-total small) { color: inherit; opacity: 0.7; }
</style>
