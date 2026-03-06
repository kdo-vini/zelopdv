<script>
  /**
   * OnboardingTour.svelte
   *
   * Tour interativo para novos usuários no /app.
   * Exibe um overlay com balão de dica posicionado próximo ao elemento alvo
   * de cada passo. Ao final, salva 'zelo_onboarding_done=true' no localStorage.
   *
   * Props:
   *   onComplete  - callback chamado quando o tour é concluído ou pulado
   */
  import { onMount, onDestroy, tick } from 'svelte';

  export let onComplete = () => {};

  // --- PASSOS DO TOUR ---
  // selector: seletor CSS do elemento a destacar (null = centro da tela)
  // position: onde o balão fica em relação ao elemento ('top' | 'bottom' | 'left' | 'right')
  const steps = [
    {
      title: 'Bem-vindo ao Zelo PDV! 👋',
      body: 'Este é o seu sistema de frente de caixa. Em poucos passos vamos mostrar como usar as principais funcionalidades.',
      selector: null,
      position: 'center',
    },
    {
      title: 'Grade de Produtos',
      body: 'Aqui ficam todos os seus produtos. Clique em um produto para adicioná-lo à comanda do cliente.',
      selector: '[data-testid="product-grid"], .product-grid',
      position: 'right',
    },
    {
      title: 'Busca Rápida',
      body: 'Use a busca para encontrar produtos por nome. Dica: pressione "/" em qualquer lugar para focar a busca instantaneamente.',
      selector: 'input[placeholder*="buscar"], input[placeholder*="pesquisar"]',
      position: 'bottom',
    },
    {
      title: 'Categorias',
      body: 'Filtre os produtos por categoria clicando nas abas. Isso ajuda a encontrar itens rapidamente durante o atendimento.',
      selector: '[data-testid="category-tab"], .category-btn',
      position: 'bottom',
    },
    {
      title: 'Carrinho (Comanda)',
      body: 'Os produtos adicionados aparecem aqui. Você pode alterar quantidades, aplicar descontos e remover itens antes de fechar a venda.',
      selector: '[data-testid="cart"], [data-testid="comanda"], .cart-panel',
      position: 'left',
    },
    {
      title: 'Item Avulso',
      body: 'Precisa cobrar algo que não está cadastrado? Use o botão "Item Avulso" para inserir um valor e descrição personalizados.',
      selector: 'button[data-testid="btn-avulso"]',
      position: 'top',
    },
    {
      title: 'Cobrar / Fechar Venda',
      body: 'Quando a comanda estiver pronta, clique em "Cobrar" para escolher a forma de pagamento: dinheiro, cartão, Pix, fiado ou múltiplos meios.',
      selector: 'button[data-testid="btn-cobrar"]',
      position: 'top',
    },
    {
      title: 'Gestão e Relatórios',
      body: 'Na barra lateral à esquerda você acessa Gestão (produtos, clientes, estoque, despesas) e Relatórios de vendas. No mobile ela fica recolhida — toque no ícone ☰ para abrir.',
      selector: null,
      position: 'center',
    },
    {
      title: 'Suporte',
      body: 'Ficou com dúvida? No rodapé da barra lateral há um link direto para o nosso suporte pelo WhatsApp. Estamos sempre prontos para ajudar! 💙',
      selector: null,
      position: 'center',
    },
  ];

  let currentStep = 0;
  $: totalSteps = steps.length;
  $: step = steps[currentStep];
  $: isFirst = currentStep === 0;
  $: isLast = currentStep === totalSteps - 1;

  // Posição calculada do balão e do highlight
  let tooltipStyle = '';
  let highlightStyle = 'display:none';
  let tooltipEl;

  async function updatePosition() {
    await tick();
    if (!step.selector) {
      // Centro da tela
      tooltipStyle = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%)';
      highlightStyle = 'display:none';
      return;
    }

    const target = document.querySelector(step.selector);
    if (!target) {
      tooltipStyle = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%)';
      highlightStyle = 'display:none';
      return;
    }

    const r = target.getBoundingClientRect();
    const pad = 8;

    // Highlight box
    highlightStyle = `
      position:fixed;
      top:${r.top - pad}px;
      left:${r.left - pad}px;
      width:${r.width + pad * 2}px;
      height:${r.height + pad * 2}px;
      border-radius:8px;
      pointer-events:none;
      box-shadow:0 0 0 9999px rgba(0,0,0,0.55), 0 0 0 2px var(--primary, #3b82f6);
      z-index:9998;
      transition:all 0.3s ease;
    `;

    // Tooltip placement
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const tipW = 320;
    const tipH = 180;
    const gap = 12;
    let top, left;

    switch (step.position) {
      case 'bottom':
        top = r.bottom + gap;
        left = r.left + r.width / 2 - tipW / 2;
        break;
      case 'top':
        top = r.top - tipH - gap;
        left = r.left + r.width / 2 - tipW / 2;
        break;
      case 'right':
        top = r.top + r.height / 2 - tipH / 2;
        left = r.right + gap;
        break;
      case 'left':
        top = r.top + r.height / 2 - tipH / 2;
        left = r.left - tipW - gap;
        break;
      default:
        top = vh / 2 - tipH / 2;
        left = vw / 2 - tipW / 2;
    }

    // Clamp within viewport
    top = Math.max(8, Math.min(top, vh - tipH - 8));
    left = Math.max(8, Math.min(left, vw - tipW - 8));

    tooltipStyle = `position:fixed;top:${top}px;left:${left}px;width:${tipW}px;z-index:9999;`;
  }

  $: if (step) updatePosition();

  function next() {
    if (isLast) {
      finish();
    } else {
      currentStep += 1;
    }
  }

  function prev() {
    if (!isFirst) currentStep -= 1;
  }

  function skip() {
    finish();
  }

  function finish() {
    if (typeof window !== 'undefined') {
      localStorage.setItem('zelo_onboarding_done', 'true');
    }
    onComplete();
  }

  let resizeHandler;
  onMount(() => {
    updatePosition();
    resizeHandler = () => updatePosition();
    window.addEventListener('resize', resizeHandler);
  });

  onDestroy(() => {
    if (resizeHandler) window.removeEventListener('resize', resizeHandler);
  });
</script>

<!-- Highlight overlay -->
<div
  data-testid="onboarding-highlight"
  style={highlightStyle}
  aria-hidden="true"
></div>

<!-- Tooltip card -->
<!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
<div
  data-testid="onboarding-tour"
  role="dialog"
  aria-modal="true"
  aria-label="Tour de boas-vindas"
  style={tooltipStyle}
  bind:this={tooltipEl}
  class="onboarding-card"
>
  <!-- Header -->
  <div class="onboarding-header">
    <span class="onboarding-title">{step.title}</span>
    <button
      class="onboarding-skip"
      on:click={skip}
      aria-label="Pular tour"
      title="Pular tour"
    >
      ✕
    </button>
  </div>

  <!-- Body -->
  <p class="onboarding-body">{step.body}</p>

  <!-- Footer -->
  <div class="onboarding-footer">
    <!-- Step indicator -->
    <span
      data-testid="onboarding-step-indicator"
      class="onboarding-indicator"
    >
      {currentStep + 1} / {totalSteps}
    </span>

    <div class="onboarding-actions">
      {#if !isFirst}
        <button class="onboarding-btn-secondary" on:click={prev}>
          Anterior
        </button>
      {/if}

      <button class="onboarding-btn-skip" on:click={skip}>
        Pular
      </button>

      <button class="onboarding-btn-primary" on:click={next}>
        {isLast ? 'Concluir' : 'Próximo'}
      </button>
    </div>
  </div>
</div>

<style>
  .onboarding-card {
    background: var(--bg-panel, #1e293b);
    border: 1px solid var(--border-card, #334155);
    border-radius: 12px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.45);
    padding: 20px;
    color: var(--text-main, #f1f5f9);
    font-family: inherit;
    animation: onboarding-pop 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
  }

  @keyframes onboarding-pop {
    from {
      opacity: 0;
      transform: scale(0.92);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }

  .onboarding-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 10px;
    gap: 8px;
  }

  .onboarding-title {
    font-size: 15px;
    font-weight: 700;
    color: var(--text-main, #f1f5f9);
    line-height: 1.3;
  }

  .onboarding-skip {
    background: none;
    border: none;
    color: var(--text-muted, #94a3b8);
    cursor: pointer;
    font-size: 14px;
    line-height: 1;
    padding: 2px 4px;
    border-radius: 4px;
    flex-shrink: 0;
    transition: color 0.15s;
  }
  .onboarding-skip:hover {
    color: var(--text-main, #f1f5f9);
  }

  .onboarding-body {
    font-size: 13.5px;
    color: var(--text-label, #cbd5e1);
    line-height: 1.55;
    margin: 0 0 16px;
  }

  .onboarding-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
  }

  .onboarding-indicator {
    font-size: 12px;
    color: var(--text-muted, #64748b);
    white-space: nowrap;
  }

  .onboarding-actions {
    display: flex;
    gap: 6px;
    align-items: center;
  }

  .onboarding-btn-primary {
    background: var(--primary, #3b82f6);
    color: #fff;
    border: none;
    border-radius: 6px;
    padding: 7px 16px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.15s;
  }
  .onboarding-btn-primary:hover {
    background: var(--primary-hover, #2563eb);
  }

  .onboarding-btn-secondary {
    background: transparent;
    color: var(--text-label, #cbd5e1);
    border: 1px solid var(--border-subtle, #334155);
    border-radius: 6px;
    padding: 7px 12px;
    font-size: 13px;
    cursor: pointer;
    transition: background 0.15s;
  }
  .onboarding-btn-secondary:hover {
    background: var(--bg-card, #0f172a);
  }

  .onboarding-btn-skip {
    background: transparent;
    color: var(--text-muted, #64748b);
    border: none;
    padding: 7px 10px;
    font-size: 13px;
    cursor: pointer;
    border-radius: 6px;
    transition: color 0.15s;
  }
  .onboarding-btn-skip:hover {
    color: var(--text-main, #f1f5f9);
  }
</style>
