<!--
  Componente: ModalSucesso.svelte
  Descrição: Modal de sucesso pós-venda com opções de compartilhar (WhatsApp), imprimir ou novo pedido.
-->
<script>
  import { createEventDispatcher, onDestroy } from 'svelte';
  import { buildReceiptText as buildSaleReceiptText } from '$lib/receiptText';
  import { formatMoney } from '$lib/formatMoney';
  import { Check, Copy, MessageCircle, Printer } from 'lucide-svelte';
  import { zeloSurface } from '$lib/theme/surface';
  import { Button } from '$lib/components/ui/button';
  import Kbd from '$lib/components/zelo/Kbd.svelte';
  import MoneyText from '$lib/components/zelo/MoneyText.svelte';
  import { blurSwap, drawStroke, reducedMotion } from '$lib/motion/transitions.js';

  const dispatch = createEventDispatcher();
  
  export let open = false;
  export let venda = {}; // Objeto da venda finalizada
  export let empresa = null; // Dados da empresa
  let copied = false;
  
  // Gera o texto do recibo para WhatsApp ou cópia manual.
  function buildReceiptText() {
    return buildSaleReceiptText({ venda, empresa });
  }

  function getWhatsAppText() {
    return encodeURIComponent(buildReceiptText());
  }

  function shareWhatsApp() {
    const text = getWhatsAppText();
    window.open(`https://wa.me/?text=${text}`, '_blank');
  }

  async function copyReceipt() {
    const text = buildReceiptText();
    if (!text) return;

    try {
      await navigator.clipboard.writeText(text);
      copied = true;
      setTimeout(() => { copied = false; }, 1800);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      copied = true;
      setTimeout(() => { copied = false; }, 1800);
    }
  }
  
  function handleClose() {
    dispatch('close');
  }
  
  function handlePrint() {
    dispatch('imprimir');
  }

  // Zelo surface: the "Venda aprovada" moment. The circle with the check continues the
  // payment button's loader, then the pill grows and the title + amount blur in.
  // Presentation only: buttons and keys work from the first frame.
  const ZS_EXPAND_DELAY_MS = 460;
  let zsExpanded = false;
  let zsShown = false;
  let zsTimer;
  $: zsOpen = open && $zeloSurface;
  $: zsOpen ? beginMoment() : endMoment();

  function beginMoment() {
    if (zsShown) return;
    zsShown = true;
    clearTimeout(zsTimer);
    zsExpanded = reducedMotion();
    if (!zsExpanded) zsTimer = setTimeout(() => { zsExpanded = true; }, ZS_EXPAND_DELAY_MS);
  }

  function endMoment() {
    zsShown = false;
    zsExpanded = false;
    clearTimeout(zsTimer);
  }

  onDestroy(() => clearTimeout(zsTimer));

  function handleKeydown(e) {
      if (e.key === 'Escape') handleClose();
      if (e.key === 'Enter') handleClose(); // Enter starts new order
  }
</script>

{#if open}
  {#if $zeloSurface}
  <!--
    Zelo Design System: the "Venda aprovada · R$ X" moment from the brand motion piece
    (docs/design-system/reference/zelopdv-morph.html). Same props, events and keyboard
    contract as the legacy branch below.
  -->
  <div
    class="zs-backdrop"
    role="button"
    tabindex="0"
    aria-label="Venda Concluída"
    on:keydown={handleKeydown}
    on:click|self={handleClose}
  >
    <div class="zs-sheet" role="dialog" aria-modal="true" aria-label="Venda aprovada">
      <div class="zs-pill" class:zs-full={zsExpanded}>
        <span class="zs-check" aria-hidden="true">
          <svg viewBox="-16 -16 32 32"><path d="M-9 0.5 L-3 6.5 L9.5 -6" in:drawStroke|global={{ delay: 60 }} /></svg>
        </span>
        {#if zsExpanded}
          <span class="zs-pill-body" in:blurSwap>
            <span class="zs-title">Venda aprovada</span>
            <MoneyText value={venda?.total || 0} class="zs-amount" />
          </span>
        {/if}
      </div>

      {#if venda?.numero_venda || Number(venda?.valor_troco) > 0}
        <p class="zs-meta">
          {#if venda?.numero_venda}<span>Venda <span class="zs-mono">nº {venda.numero_venda}</span></span>{/if}
          {#if venda?.numero_venda && Number(venda?.valor_troco) > 0}<span aria-hidden="true">·</span>{/if}
          {#if Number(venda?.valor_troco) > 0}<span>Troco <MoneyText value={venda.valor_troco} size="sm" /></span>{/if}
        </p>
      {/if}

      <div class="zs-actions">
        <Button variant="outlined" size="touch" onclick={shareWhatsApp}>
          <MessageCircle size={18} strokeWidth={1.75} aria-hidden="true" /> WhatsApp
        </Button>
        <Button variant="outlined" size="touch" onclick={copyReceipt}>
          {#if copied}<Check size={18} strokeWidth={1.75} aria-hidden="true" /> Copiado{:else}<Copy size={18} strokeWidth={1.75} aria-hidden="true" /> Copiar recibo{/if}
        </Button>
        <Button variant="outlined" size="touch" class="zs-print" onclick={handlePrint}>
          <Printer size={18} strokeWidth={1.75} aria-hidden="true" /> Imprimir
        </Button>
      </div>

      <Button variant="primary" size="cta" class="on-action zs-next" onclick={handleClose}>
        Novo pedido<Kbd class="zs-kbd">Enter</Kbd>
      </Button>
    </div>
  </div>
  {:else}
  <div
    class="modal-backdrop"
    role="button"
    tabindex="0"
    aria-label="Venda Concluída"
    on:keydown={handleKeydown}
    on:click|self={handleClose}
  >
    <div class="modal-content text-center max-w-sm" role="dialog" aria-modal="true">
      <div class="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-500/20 mb-4">
        <svg class="h-10 w-10 text-green-400" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" />
        </svg>
      </div>
      
      <h3 class="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">Venda Realizada!</h3>
      <p class="text-sm text-gray-500 dark:text-gray-400 mb-6">
        Total: <span class="font-bold text-gray-800 dark:text-gray-200 text-lg">{formatMoney(venda.total || 0)}</span>
      </p>
      
      <div class="grid gap-3">
        <div class="grid grid-cols-2 gap-3">
          <button on:click={shareWhatsApp} class="btn btn-whatsapp flex items-center justify-center gap-2 h-12 text-sm md:text-base">
            <svg class="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/></svg>
            WhatsApp
          </button>
          <button on:click={copyReceipt} class="btn-secondary h-12">
            {copied ? 'Copiado' : 'Copiar recibo'}
          </button>
        </div>
        
        <div class="grid grid-cols-2 gap-3">
          <button on:click={handlePrint} class="btn-secondary h-12">
            Imprimir
          </button>
          <button on:click={handleClose} class="btn-primary h-12">
            Novo Pedido
          </button>
        </div>
      </div>
      <p class="text-xs text-gray-400 mt-4">Pressione Enter para novo pedido</p>
    </div>
  </div>
  {/if}
{/if}

<style>
 .btn { display: inline-flex; align-items: center; justify-content: center; border-radius: 8px; font-weight: 600; cursor: pointer; transition: all 0.2s; }
 .btn-whatsapp {
   background: var(--success);
   color: var(--primary-text);
   border: none;
 }
 .btn-whatsapp:hover {
   opacity: 0.9;
 }

 /* ═══ Zelo Design System (only rendered when $zeloSurface); colour only through tokens ═══ */
 .zs-backdrop {
   position: fixed;
   inset: 0;
   z-index: 1150; /* above MobileBottomNav (1100) */
   display: flex;
   align-items: center;
   justify-content: center;
   padding: 24px;
   background: color-mix(in srgb, var(--shadow-color) 42%, transparent);
   color: var(--text-main);
   font-family: var(--zelo-font-ui);
 }
 .zs-sheet {
   display: flex;
   flex-direction: column;
   gap: 16px;
   width: min(440px, 100%);
   padding: 20px;
   border-radius: var(--zelo-radius-sheet);
   background: var(--bg-panel);
   box-shadow: var(--shadow-modal);
 }
 /* one shape: a 64px circle (the button's loader, now a check) that grows into the pill */
 .zs-pill {
   display: flex;
   align-items: center;
   align-self: center;
   width: 64px;
   height: 64px;
   padding: 0 12px;
   overflow: hidden;
   border-radius: var(--zelo-radius-pill);
   background: var(--primary);
   color: var(--primary-text);
   box-shadow: var(--elevation-float);
   transition: width var(--zelo-dur-slow) var(--zelo-ease-spring), padding var(--zelo-dur-slow) var(--zelo-ease-spring);
 }
 .zs-pill.zs-full { width: 100%; padding-right: 22px; }
 .zs-check {
   display: grid;
   flex: none;
   place-items: center;
   width: 40px;
   height: 40px;
   border-radius: 50%;
   background: var(--primary-text);
   color: var(--primary);
 }
 .zs-check svg { width: 22px; height: 22px; fill: none; stroke: currentColor; stroke-width: 3; stroke-linecap: round; stroke-linejoin: round; }
 .zs-pill-body { display: flex; flex: 1; align-items: center; gap: 12px; min-width: 0; margin-left: 12px; white-space: nowrap; }
 .zs-title { font-size: 17px; font-weight: 600; letter-spacing: -0.01em; }
 .zs-pill :global(.zs-amount) { margin-left: auto; font-size: 20px; }
 .zs-pill :global(.zs-amount small) { color: inherit; opacity: 0.72; }
 .zs-meta {
   display: flex;
   flex-wrap: wrap;
   align-items: baseline;
   justify-content: center;
   gap: 8px;
   margin: -4px 0 0;
   font-size: 13.5px;
   color: var(--text-muted);
 }
 .zs-meta > span { display: inline-flex; align-items: baseline; gap: 6px; }
 .zs-mono { font-family: var(--zelo-font-num); font-variant-numeric: tabular-nums; color: var(--text-main); }
 .zs-meta :global(.money) { color: var(--text-main); }
 .zs-actions { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
 .zs-actions :global(button) { width: 100%; padding: 0 10px; }
 .zs-sheet :global(.zs-next) { justify-content: space-between; }

 @media (max-width: 767px) {
   .zs-backdrop { align-items: flex-end; padding: 0; }
   .zs-sheet {
     width: 100%;
     padding: 20px 16px calc(16px + env(safe-area-inset-bottom));
     border-radius: var(--zelo-radius-sheet) var(--zelo-radius-sheet) 0 0;
   }
   .zs-actions { grid-template-columns: repeat(2, minmax(0, 1fr)); }
   .zs-actions :global(.zs-print) { grid-column: 1 / -1; }
   .zs-sheet :global(.zs-kbd) { display: none; }
   .zs-sheet :global(.zs-next) { justify-content: center; }
 }
</style>
