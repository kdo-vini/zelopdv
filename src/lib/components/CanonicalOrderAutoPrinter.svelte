<script>
  import { onDestroy, onMount } from 'svelte';
  import { get } from 'svelte/store';
  import { supabase } from '$lib/supabaseClient.js';
  import { getAccessContext } from '$lib/accessControl.js';
  import { loadCanonicalOrders, subscribeCanonicalOrderUpdates } from '$lib/onlineOrders.js';
  import { createPrintedOrderStore } from '$lib/orderAutoPrint.js';
  import { printOrder } from '$lib/printService.js';
  import { printStationEnabled, setPrintStationOwner } from '$lib/printStationPreference.js';
  import { createCanonicalOrderAutoPrintRuntime } from '$lib/canonicalOrderAutoPrintRuntime.js';
  import { addToast } from '$lib/stores/ui.js';
  import { getZeloImpressaoFriendlyMessage } from '$lib/zeloImpressaoClient.js';

  let runtime = null;
  let unsubscribePreference = null;
  let starting = false;
  const printed = createPrintedOrderStore();

  async function start() {
    if (runtime || starting || !supabase) return;
    starting = true;
    try {
      const access = await getAccessContext();
      if (!access?.ownerUserId || access.isSubUser) return;
      setPrintStationOwner(access.ownerUserId);
      const { data: company, error } = await supabase
        .from('empresa_perfil')
        .select('id, nome_exibicao, razao_social')
        .eq('user_id', access.ownerUserId)
        .maybeSingle();
      if (error || !company?.id) return;
      if (!get(printStationEnabled)) return;

      runtime = createCanonicalOrderAutoPrintRuntime({
        loadOrders: () => loadCanonicalOrders(supabase, company.id),
        subscribe: (callback) => {
          const channel = subscribeCanonicalOrderUpdates(supabase, company.id, callback);
          return () => { if (channel) void supabase.removeChannel(channel); };
        },
        print: (order) => printOrder(
          order,
          company.nome_exibicao || company.razao_social || 'Zelo PDV',
          access.ownerUserId,
          { automatic: true },
        ),
        reserve: printed.reserve,
        release: printed.release,
        onError: (printError, order) => {
          console.warn('[canonical-auto-print] pedido', order?.id, printError?.message || printError);
          addToast(getZeloImpressaoFriendlyMessage(printError), 'warning', 7000);
        },
        scheduleInterval: setInterval,
        clearScheduledInterval: clearInterval,
      });
      await runtime.start();
    } catch (startError) {
      console.warn('[canonical-auto-print] inicialização falhou:', startError?.message || startError);
      runtime?.stop();
      runtime = null;
    } finally {
      starting = false;
    }
  }

  function stop() {
    runtime?.stop();
    runtime = null;
  }

  onMount(() => {
    unsubscribePreference = printStationEnabled.subscribe((enabled) => {
      if (enabled) void start();
      else stop();
    });
  });

  onDestroy(() => {
    unsubscribePreference?.();
    stop();
  });
</script>
