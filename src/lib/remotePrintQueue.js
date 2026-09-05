const MAX_CLAIM_LIMIT = 3;
const JOB_TTL_MS = 2 * 60 * 60 * 1000;

function unwrap(result) {
  if (result?.error) throw Object.assign(new Error(result.error.message || 'Falha na fila de impressão.'), result.error);
  return Array.isArray(result?.data) ? result.data : [];
}

export async function enqueueRemotePrintJob(client, envelope, { now = () => new Date() } = {}) {
  if (!envelope?.jobId || !envelope?.type || !envelope?.content) {
    throw new Error('Envelope de impressão inválido.');
  }
  const current = now();
  const currentMs = current instanceof Date ? current.getTime() : Number(current);
  const rows = unwrap(await client.rpc('enqueue_zelo_print_job_v1', {
    p_client_job_id: envelope.jobId,
    p_job_type: envelope.type,
    p_payload: envelope,
    p_expires_at: new Date(currentMs + JOB_TTL_MS).toISOString(),
  }));
  const row = rows[0] || {};
  return { id: row.job_id, status: row.job_status, stationOnline: row.station_online === true };
}

export async function heartbeatPrintStation(client, station) {
  return unwrap(await client.rpc('heartbeat_zelo_print_station_v1', {
    p_station_id: station.id,
    p_label: String(station.label || 'Computador de impressão').slice(0, 80),
    p_enabled: station.enabled !== false,
  }))[0] || null;
}

export async function claimRemotePrintJobs(client, stationId, limit = MAX_CLAIM_LIMIT) {
  return unwrap(await client.rpc('claim_zelo_print_jobs_v1', {
    p_station_id: stationId,
    p_limit: Math.min(MAX_CLAIM_LIMIT, Math.max(1, Number(limit) || MAX_CLAIM_LIMIT)),
  }));
}

export async function finishRemotePrintJob(client, result) {
  const rows = unwrap(await client.rpc('finish_zelo_print_job_v1', {
    p_station_id: result.stationId,
    p_job_id: result.jobId,
    p_outcome: result.outcome,
    p_error_code: String(result.errorCode || '').trim().slice(0, 80) || null,
    p_error_message: String(result.errorMessage || '').trim().slice(0, 500) || null,
  }));
  return rows[0] || null;
}

export { JOB_TTL_MS, MAX_CLAIM_LIMIT };
