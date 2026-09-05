import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  claimRemotePrintJobs,
  enqueueRemotePrintJob,
  finishRemotePrintJob,
  heartbeatPrintStation,
} from '../src/lib/remotePrintQueue.js';
import {
  getPrintStationId,
  isPrintStationEnabled,
  setPrintStationOwner,
  setPrintStationEnabled,
} from '../src/lib/printStationPreference.js';

describe('remote print queue', () => {
  beforeEach(() => {
    const values = new Map();
    vi.stubGlobal('localStorage', {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, String(value)),
      clear: () => values.clear(),
    });
    setPrintStationOwner('owner-1');
  });

  it('keeps one stable browser station id and an opt-in preference', () => {
    const first = getPrintStationId();
    expect(first).toMatch(/^[0-9a-f-]{36}$/i);
    expect(getPrintStationId()).toBe(first);
    expect(isPrintStationEnabled()).toBe(false);
    setPrintStationEnabled(true);
    expect(isPrintStationEnabled()).toBe(true);
    setPrintStationOwner('owner-2');
    expect(isPrintStationEnabled()).toBe(false);
    expect(getPrintStationId()).not.toBe(first);
  });

  it('enqueues the exact envelope with a two-hour expiry', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{ job_id: 'server-id', job_status: 'pending', station_online: true }],
      error: null,
    });
    const now = new Date('2026-09-05T12:00:00.000Z');
    const envelope = {
      jobId: 'b693f14c-6741-44d4-8d61-f7a935aa3870',
      type: 'receipt',
      content: { format: 'raw_escpos_base64', base64: 'AA==' },
    };

    await expect(enqueueRemotePrintJob({ rpc }, envelope, { now: () => now })).resolves.toEqual({
      id: 'server-id', status: 'pending', stationOnline: true,
    });
    expect(rpc).toHaveBeenCalledWith('enqueue_zelo_print_job_v1', {
      p_client_job_id: envelope.jobId,
      p_job_type: 'receipt',
      p_payload: envelope,
      p_expires_at: '2026-09-05T14:00:00.000Z',
    });
  });

  it('caps claims and sanitizes completion errors', async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data: [], error: null })
      .mockResolvedValueOnce({ data: [{ job_id: 'job-1', job_status: 'failed' }], error: null });
    await claimRemotePrintJobs({ rpc }, 'station-1', 100);
    expect(rpc).toHaveBeenNthCalledWith(1, 'claim_zelo_print_jobs_v1', {
      p_station_id: 'station-1', p_limit: 3,
    });
    await finishRemotePrintJob({ rpc }, {
      stationId: 'station-1', jobId: 'job-1', outcome: 'failed',
      errorCode: ' X '.repeat(100), errorMessage: ' Y '.repeat(300),
    });
    const finishArgs = rpc.mock.calls[1][1];
    expect(finishArgs.p_error_code.length).toBeLessThanOrEqual(80);
    expect(finishArgs.p_error_message.length).toBeLessThanOrEqual(500);
  });

  it('propagates RPC failures and sends station heartbeats', async () => {
    const failure = { message: 'database unavailable' };
    await expect(enqueueRemotePrintJob({ rpc: vi.fn().mockResolvedValue({ error: failure }) }, {
      jobId: crypto.randomUUID(), type: 'receipt', content: {},
    })).rejects.toMatchObject({ message: 'database unavailable' });

    const rpc = vi.fn().mockResolvedValue({ data: [{ station_id: 'station-1' }], error: null });
    await heartbeatPrintStation({ rpc }, { id: 'station-1', label: 'Caixa', enabled: true });
    expect(rpc).toHaveBeenCalledWith('heartbeat_zelo_print_station_v1', {
      p_station_id: 'station-1', p_label: 'Caixa', p_enabled: true,
    });
  });
});
