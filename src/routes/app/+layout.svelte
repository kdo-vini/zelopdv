<script>
  import { onMount } from 'svelte';
  import GestaoSidebar from '$lib/components/GestaoSidebar.svelte';
  import AssistantChat from '$lib/components/AssistantChat.svelte';
  import { supabase } from '$lib/supabaseClient';
  import { addToast } from '$lib/stores/ui';
  import { waitAuthReady } from '$lib/authStore';

  const ESTOQUE_BAIXO_LIMITE = 5;

  onMount(async () => {
    try {
      await waitAuthReady();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const userId = session.user.id;

      // --- Alerta de estoque baixo ---
      if (localStorage.getItem('zelo_notif_estoque') === 'true' && !sessionStorage.getItem('zelo_notif_estoque_shown')) {
        const { data: baixos, error } = await supabase
          .from('produtos')
          .select('id')
          .eq('id_usuario', userId)
          .eq('controlar_estoque', true)
          .lt('estoque_atual', ESTOQUE_BAIXO_LIMITE)
          .limit(50);
        if (error) {
          console.warn('[Notificacoes] Erro ao verificar estoque:', error.message);
        } else {
          sessionStorage.setItem('zelo_notif_estoque_shown', '1');
          if (baixos.length > 0) {
            addToast(
              `${baixos.length} produto${baixos.length > 1 ? 's' : ''} com estoque baixo (< ${ESTOQUE_BAIXO_LIMITE} unidades). Verifique em Gestão → Estoque.`,
              'warning',
              8000
            );
          }
        }
      }

      // --- Lembrete de fechamento de caixa ---
      // Nota: este check só dispara se a primeira visita à sessão for após 20h,
      // pois o layout persiste entre navegações dentro de /app.
      if (localStorage.getItem('zelo_notif_caixa') === 'true' && !sessionStorage.getItem('zelo_notif_caixa_shown')) {
        const hora = new Date().getHours();
        if (hora >= 20) {
          const { data: caixas, error } = await supabase
            .from('caixas')
            .select('id')
            .eq('id_usuario', userId)
            .is('data_fechamento', null)
            .limit(1);
          if (error) {
            console.warn('[Notificacoes] Erro ao verificar caixa:', error.message);
          } else {
            sessionStorage.setItem('zelo_notif_caixa_shown', '1');
            if (caixas.length > 0) {
              addToast('O caixa ainda está aberto. Não esqueça de fechar antes de encerrar o dia!', 'warning', 8000);
            }
          }
        }
      }
    } catch (err) {
      console.warn('[Notificacoes] Erro inesperado:', err?.message || err);
    }
  });
</script>

<div class="flex h-screen overflow-hidden" style="background: var(--bg-app);">
  <GestaoSidebar />
  <div class="flex-1 flex flex-col overflow-hidden min-w-0">
    <slot />
  </div>
</div>
<AssistantChat />
