export async function runRemotePrintStationCycle(dependencies) {
  if (!dependencies.enabled) return { state: 'disabled', processed: 0 };

  const detection = await dependencies.detectAgent();
  const available = detection?.running === true && detection?.paired === true;
  if (dependencies.shouldHeartbeat !== false) {
    await dependencies.heartbeat({
      id: dependencies.stationId,
      label: dependencies.stationLabel || 'Computador de impressão',
      enabled: available,
    });
  }
  if (!available) return { state: 'waiting_agent', processed: 0 };

  const jobs = await dependencies.claim(dependencies.stationId, 3);
  let processed = 0;
  for (const job of jobs) {
    try {
      await dependencies.send(job.payload);
      processed += 1;
      await dependencies.finish({ stationId: dependencies.stationId, jobId: job.id, outcome: 'spooled' });
    } catch (error) {
      processed += 1;
      const unknown = error?.code === 'PRINT_OUTCOME_UNKNOWN' || error?.retrySafe === false;
      await dependencies.finish({
        stationId: dependencies.stationId,
        jobId: job.id,
        outcome: unknown ? 'unknown' : 'retry',
        errorCode: error?.code,
        errorMessage: error?.message,
      });
      if (unknown) return { state: 'uncertain', processed };
    }
  }
  return { state: 'ready', processed };
}
