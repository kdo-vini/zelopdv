<!--
  Componente: ModalSucesso.svelte
  Descrição: Modal de sucesso pós-venda com opções de compartilhar (WhatsApp), imprimir ou novo pedido.
-->
<script>
  import { createEventDispatcher } from 'svelte';
  
  const dispatch = createEventDispatcher();
  
  export let open = false;
  export let venda = {}; // Objeto da venda finalizada
  export let empresa = null; // Dados da empresa
  
  // Gera o texto para o WhatsApp
  function getWhatsAppText() {
    if (!venda || !venda.itens) return '';
    
    // Header com Nome da Empresa ou Padrão
    let text = `*${(empresa?.nome_exibicao || 'COMPROVANTE DE PEDIDO').toUpperCase()}*\n`;
    
    if (empresa?.documento) {
        text += `CPF/CNPJ: ${empresa.documento}\n`;
    }
    if (empresa?.endereco) {
        text += `${empresa.endereco}\n`;
    }

    text += `\n ${new Date().toLocaleString()}\n`;
    text += `------------------------------\n`;
    
    venda.itens.forEach(item => {
        const totalItem = (item.quantidade * item.preco).toFixed(2);
        text += `${item.quantidade}x ${item.nome}\n`;
        text += `   R$ ${totalItem}\n`;
    });
    
    text += `------------------------------\n`;
    text += `*TOTAL: R$ ${Number(venda.total || 0).toFixed(2)}*\n`;
    
    if (venda.pagamentos && venda.pagamentos.length > 0) {
        text += `Pgto: ${venda.pagamentos.map(p => `${p.forma} (R$ ${Number(p.valor || 0).toFixed(2)})`).join(', ')}\n`;
    } else if (venda.formaPagamento) {
        text += `Pgto: ${venda.formaPagamento}\n`;
    }

    text += `\n_Obrigado pela preferência!_`;
    text += `\n_ZeloPDV - Sistema de Gestão de Vendas_`;

    return encodeURIComponent(text);
  }

  function shareWhatsApp() {
    const text = getWhatsAppText();
    window.open(`https://wa.me/?text=${text}`, '_blank');
  }
  
  function handleClose() {
    dispatch('close');
  }
  
  function handlePrint() {
    dispatch('imprimir');
  }

  function handleKeydown(e) {
      if (e.key === 'Escape') handleClose();
      if (e.key === 'Enter') handleClose(); // Enter starts new order
  }
</script>

{#if open}
  <div
    class="modal-backdrop"
    role="button"
    tabindex="0"
    aria-label="Venda Concluída"
    on:keydown={handleKeydown}
    on:click|self={handleClose}
  >
    <div class="modal-content text-center max-w-sm" role="dialog" aria-modal="true">
      <div class="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100 mb-4">
        <svg class="h-10 w-10 text-green-600" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" />
        </svg>
      </div>
      
      <h3 class="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">Venda Realizada!</h3>
      <p class="text-sm text-gray-500 dark:text-gray-400 mb-6">
        Total: <span class="font-bold text-gray-800 dark:text-gray-200 text-lg">R$ {Number(venda.total || 0).toFixed(2)}</span>
      </p>
      
      <div class="grid gap-3">
        <button on:click={shareWhatsApp} class="btn flex items-center justify-center gap-2 bg-[#25D366] hover:bg-[#128C7E] text-white border-none h-12 text-lg">
           <svg class="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/></svg>
           Enviar no WhatsApp
        </button>
        
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

<style>
 .btn { display: inline-flex; align-items: center; justify-content: center; border-radius: 8px; font-weight: 600; cursor: pointer; transition: all 0.2s; }
</style>
