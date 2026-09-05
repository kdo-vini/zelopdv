<script>
  import { onDestroy, onMount } from 'svelte';
  import { get } from 'svelte/store';
  import { supabase } from '$lib/supabaseClient.js';
  import { getAccessContext } from '$lib/accessControl.js';
  import { detectZeloImpressao, sendPrintJob } from '$lib/zeloImpressaoClient.js';
  import { claimRemotePrintJobs, finishRemotePrintJob, heartbeatPrintStation } from '$lib/remotePrintQueue.js';
  import { getPrintStationId, printStationEnabled, setPrintStationOwner } from '$lib/printStationPreference.js';
  import { runRemotePrintStationCycle } from '$lib/remotePrintStation.js';
  import { printStationStatus } from '$lib/stores/printStation.js';

  let timer;
  let running = false;
  let destroyed = false;
  let lastHeartbeatAt = 0;
  let unsubscribePreference;
  let stationId = '';

  async function cycle() {
    if (running || destroyed || !stationId || !supabase || document.hidden || !navigator.onLine) return;
    running = true;
    try {
      const now = Date.now();
      const result = await runRemotePrintStationCycle({
        enabled: get(printStationEnabled),
        stationId,
        stationLabel: 'Computador de impressão',
        shouldHeartbeat: now - lastHeartbeatAt >= 15000,
        detectAgent: detectZeloImpressao,
        heartbeat: async (station) => {
          await heartbeatPrintStation(supabase, station);
          lastHeartbeatAt = now;
        },
        claim: (id, limit) => claimRemotePrintJobs(supabase, id, limit),
        send: sendPrintJob,
        finish: (result) => finishRemotePrintJob(supabase, result),
      });
      $printStationStatus = result.state;
    } catch (error) {
      console.warn('[print-station] ciclo falhou:', error?.message || error);
      $printStationStatus = 'error';
    } finally {
      running = false;
    }
  }

  onMount(() => {
    void getAccessContext().then((access) => {
      if (destroyed || !access?.ownerUserId || access.isSubUser) return;
      setPrintStationOwner(access.ownerUserId);
      stationId = getPrintStationId();
      unsubscribePreference = printStationEnabled.subscribe((enabled) => {
        if (enabled) {
          void cycle();
          return;
        }
        $printStationStatus = 'disabled';
        if (supabase && lastHeartbeatAt) {
          void heartbeatPrintStation(supabase, {
            id: stationId, label: 'Computador de impressão', enabled: false,
          }).catch(() => {});
          lastHeartbeatAt = 0;
        }
      });
      void cycle();
    });
    timer = setInterval(cycle, 2000);
    document.addEventListener('visibilitychange', cycle);
    window.addEventListener('online', cycle);
  });

  onDestroy(() => {
    destroyed = true;
    unsubscribePreference?.();
    clearInterval(timer);
    document.removeEventListener('visibilitychange', cycle);
    window.removeEventListener('online', cycle);
    if (supabase && stationId && get(printStationEnabled)) {
      void heartbeatPrintStation(supabase, {
        id: stationId, label: 'Computador de impressão', enabled: false,
      }).catch(() => {});
    }
    $printStationStatus = 'disabled';
  });
</script>
