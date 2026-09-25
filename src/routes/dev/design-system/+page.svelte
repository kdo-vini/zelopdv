<script>
  import { onMount } from 'svelte';
  import { ShoppingBag, Bike, Plus, ArrowLeftRight, Trash2, Printer } from 'lucide-svelte';
  import { Button } from '$lib/components/ui/button';
  import { Kbd, MoneyText, StatusPill, QtyBadge, Segmented, UnderlineTabs, Stepper, ProductTile, SearchField, MorphButton } from '$lib/components/zelo';
  import { blurSwap, springStep, springSettleTime, SPRING_SHAPE, SPRING_LEAD, SPRING_TRAIL, SPRING_EXIT, SPRING_COUNT } from '$lib/motion';

  const SURFACES = [
    { id: 'app', title: 'App', note: 'Sistema interno · superfície clara, ações navy' },
    { id: 'brand', title: 'Brand', note: 'Cliente final · navy, ações brancas' },
  ];
  const SWATCHES = [
    ['--bg-app', 'Fundo'], ['--bg-panel', 'Painel'], ['--bg-sunken', 'Rebaixado'], ['--text-main', 'Tinta'],
    ['--text-label', 'Rótulo'], ['--text-muted', 'Apoio'], ['--border-subtle', 'Linha'], ['--primary', 'Ação'],
    ['--status-success-text', 'Sucesso'], ['--status-warning-text', 'Atenção'], ['--status-error-text', 'Erro'],
  ];
  // Type roles (docs/DESIGN_SYSTEM.md → Tipografia): [utility, font, spec, sample].
  // Full class names on purpose: Tailwind only emits utilities it finds as literal strings.
  const TYPE = [
    ['type-display', 'Mono', '40–56 / 500 / 1.05 / −0.03em', 'Venda aprovada'],
    ['type-title', 'Mono', '22 / 600 / 1.1 / −0.02em', 'Frente de Caixa'],
    ['type-heading', 'Geist', '18 / 600 / 1.2 / −0.015em', 'Comanda'],
    ['type-eyebrow', 'Mono', '10.5 / 500 / 0.12em, maiúsculas', 'PDV / Frente de caixa'],
    ['type-body', 'Geist', '14.5 / 400 / 1.4', 'Toque em um produto para somar na venda.'],
    ['type-body-strong', 'Geist', '14.5 / 500 / 1.3', 'Bolo de cenoura (fatia)'],
    ['type-label', 'Geist', '13.5 / 500 / 1.2', 'Movimentar caixa'],
    ['type-caption', 'Geist', '12 / 400 / 1.4', 'Dinheiro, Pix, cartão ou fiado'],
    ['type-num-sm', 'Mono', '13 / 500 · tabular', 'R$ 29,90 × 2'],
    ['type-num-md', 'Mono', '14.5 / 500 · tabular', 'R$ 1.418,50'],
    ['type-num-lg', 'Mono', '20 / 500 · tabular', 'R$ 84,70'],
    ['type-num-xl', 'Mono', '32 / 500 · tabular', 'R$ 2.418,00'],
    ['type-kbd', 'Mono', '11 / 500', 'Ctrl ↵'],
  ];

  let resolved = $state({});
  let tipo = $state({ app: 'retirada', brand: 'retirada' });
  let tabela = $state({ app: 'balcao', brand: 'balcao' });
  let cat = $state({ app: 'todos', brand: 'todos' });
  let qty = $state({ app: 2, brand: 2 });
  let boards = {};

  // ── Movimento demos ──
  let morph = $state('idle');
  let morphFail = $state('idle');
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  async function runMorph(fail = false) {
    const set = (v) => (fail ? (morphFail = v) : (morph = v));
    set('loading');
    await wait(1400);
    set(fail ? 'error' : 'success');
    await wait(fail ? 1800 : 1200);
    set('idle');
  }
  let total = $state(29.9);
  let badge = $state(0);
  const LINE_NAMES = ['X-Bacon', 'Coca-Cola lata', 'Pão de queijo', 'Coxinha', 'Brigadeiro', 'Suco de laranja'];
  let lines = $state([{ id: 1, name: 'X-Bacon', price: 29.9 }]);
  let nextId = 2;
  function addLine() {
    const price = [29.9, 6.5, 5, 7.5, 3.5, 9.9][nextId % 6];
    lines = [...lines, { id: nextId, name: LINE_NAMES[nextId % 6], price }];
    nextId += 1;
    total = Number((total + price).toFixed(2));
    badge += 1;
  }
  function removeLine(id) {
    const line = lines.find((l) => l.id === id);
    lines = lines.filter((l) => l.id !== id);
    if (line) total = Math.max(0, Number((total - line.price).toFixed(2)));
    badge = Math.max(0, badge - 1);
  }
  const CURVES = [
    ['Forma · ω 18 ζ .84', SPRING_SHAPE],
    ['Borda que lidera · ω 34', SPRING_LEAD],
    ['Borda que segue · ω 15', SPRING_TRAIL],
    ['Saída · ω 55 ζ 1', SPRING_EXIT],
    ['Números · ω 16 ζ 1', SPRING_COUNT],
  ];
  const curvePath = ({ omega, zeta }) => {
    const pts = [];
    for (let i = 0; i <= 60; i += 1) {
      const t = (i / 60) * 0.6;
      pts.push(`${(i / 60) * 200},${56 - springStep(t, omega, zeta) * 48}`);
    }
    return `M${pts.join(' L')}`;
  };

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
    <p class="type-caption muted">Os mesmos componentes e tokens, renderizados em cada superfície. Documentação: <code>docs/DESIGN_SYSTEM.md</code>. Esta página não existe em produção.</p>
  </header>

  <section class="board motion" data-surface="app" aria-labelledby="h-motion">
    <div class="board-head">
      <h2 id="h-motion">Movimento</h2>
      <p class="type-caption muted">Molas em forma fechada (<code>src/lib/motion/</code>) · referência: <code>zelopdv-morph.html</code></p>
    </div>

    <h3 class="type-eyebrow">MorphButton · botão → carregando → check</h3>
    <div class="morph-row">
      <MorphButton state={morph} size="cta" loadingLabel="Registrando venda…" successLabel="Venda registrada" onclick={() => runMorph(false)}>Confirmar<Kbd>Enter</Kbd></MorphButton>
      <MorphButton state={morphFail} size="touch" loadingLabel="Enviando…" errorLabel="Falhou. Tente de novo" onclick={() => runMorph(true)}>Simular erro</MorphButton>
    </div>
    <p class="type-caption muted">Estado atual: <code>{morph}</code> · <code>{morphFail}</code>. Clique para rodar o ciclo.</p>

    <h3 class="type-eyebrow">Troca com blur · contagem · pop</h3>
    <div class="demo-cols">
      <div class="demo-list">
        <div class="row">
          <Button variant="outlined" size="md" onclick={addLine}><Plus strokeWidth={1.75} />Adicionar item</Button>
          <QtyBadge count={badge} />
        </div>
        <ul>
          {#each lines as line (line.id)}
            <li in:blurSwap={{ collapse: true }} out:blurSwap={{ collapse: true }}>
              <span>{line.name}</span>
              <MoneyText value={line.price} size="sm" />
              <Button variant="quiet" size="md" onclick={() => removeLine(line.id)}>Remover</Button>
            </li>
          {/each}
        </ul>
      </div>
      <div class="demo-total">
        <span class="type-caption muted">Total (conta com mola, sem overshoot)</span>
        <MoneyText value={total} size="lg" animate />
      </div>
    </div>

    <h3 class="type-eyebrow">Curvas das molas · 0 → 600 ms</h3>
    <div class="curves">
      {#each CURVES as [name, spring] (name)}
        <figure>
          <svg viewBox="0 0 200 64" aria-hidden="true"><line x1="0" x2="200" y1="8" y2="8" class="guide" /><path d={curvePath(spring)} /></svg>
          <figcaption class="type-caption muted">{name} · assenta em {Math.round(springSettleTime(spring.omega, spring.zeta) * 1000)} ms</figcaption>
        </figure>
      {/each}
    </div>
    <p class="type-caption muted">Indicador líquido: troque as abas e os segmentos abaixo. Aperto (squash): pressione qualquer botão ou produto.</p>
  </section>

  <div class="grid">
    {#each SURFACES as s (s.id)}
      <section class="board" data-surface={s.id} bind:this={boards[s.id]} aria-labelledby="h-{s.id}">
        <div class="board-head">
          <h2 id="h-{s.id}">{s.title}</h2>
          <p class="type-caption muted">{s.note}</p>
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
          {#each TYPE as [role, family, spec, sample] (role)}
            <div class="type-row"><span class="type-caption muted"><code>{role}</code><br />{family} · {spec}</span><span class={role}>{sample}</span></div>
          {/each}
          <div class="type-row"><span class="type-caption muted">Dinheiro (<code>MoneyText</code>)</span><MoneyText value={85.4} size="lg" /></div>
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
  h2 { margin: 0; font: var(--type-title); letter-spacing: var(--type-title-tracking); }
  h3 { margin: 12px 0 0; }
  h1, p { margin: 0; }
  .muted { color: var(--text-muted); }
  .intro .type-eyebrow, h3.type-eyebrow { color: var(--text-muted); }
  .num { font-family: var(--zelo-font-num); font-weight: 600; color: var(--text-main); }
  code { font: var(--type-kbd); color: var(--text-muted); }
  .swatches { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 8px; }
  .sw { display: flex; gap: 10px; align-items: center; padding: 8px; border-radius: var(--zelo-radius-control); background: var(--bg-panel); border: 1px solid var(--border-card); }
  .sw > span:last-child { display: flex; flex-direction: column; gap: 2px; min-width: 0; font-size: 12.5px; }
  .chip { width: 34px; height: 34px; border-radius: 9px; flex: none; box-shadow: inset 0 0 0 1px var(--border-strong); }
  .val { color: var(--text-label); }
  .stack { display: flex; flex-direction: column; gap: 10px; }
  .row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
  .type-row { display: grid; grid-template-columns: 220px 1fr; align-items: baseline; gap: 12px; }
  .tiles { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
  .icons { color: var(--text-label); gap: 16px; }
  .motion { max-width: 1280px; margin: 0 auto 20px; }
  .morph-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 12px; align-items: center; }
  .demo-cols { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 280px), 1fr)); gap: 16px; align-items: start; }
  .demo-list ul { list-style: none; margin: 10px 0 0; padding: 0; border: 1px solid var(--border-card); border-radius: var(--zelo-radius-card); background: var(--bg-panel); min-height: 12px; }
  .demo-list li { display: grid; grid-template-columns: 1fr auto auto; gap: 10px; align-items: center; padding: 6px 6px 6px 14px; border-bottom: 1px solid var(--border-subtle); font-size: 14px; }
  .demo-list li:last-child { border-bottom: 0; }
  .demo-total { display: flex; flex-direction: column; gap: 8px; padding: 16px; border-radius: var(--zelo-radius-card); background: var(--bg-panel); border: 1px solid var(--border-card); }
  .curves { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 10px; }
  .curves figure { margin: 0; padding: 10px; border-radius: var(--zelo-radius-control); background: var(--bg-panel); border: 1px solid var(--border-card); display: flex; flex-direction: column; gap: 6px; }
  .curves svg { width: 100%; height: 64px; fill: none; stroke: var(--primary); stroke-width: 2; }
  .curves .guide { stroke: var(--border-strong); stroke-width: 1; stroke-dasharray: 3 3; }
  .board :global(.cta-total) { margin-left: auto; font-size: 19px; }
  .board :global(.cta-total small) { color: inherit; opacity: 0.7; }
</style>
