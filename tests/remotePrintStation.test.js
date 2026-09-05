import { describe, expect, it, vi } from 'vitest';
import { runRemotePrintStationCycle } from '../src/lib/remotePrintStation.js';

function dependencies(overrides = {}) {
  return {
    enabled: true,
    stationId: 'station-1',
    detectAgent: vi.fn().mockResolvedValue({ running: true, paired: true }),
    heartbeat: vi.fn().mockResolvedValue(undefined),
    claim: vi.fn().mockResolvedValue([]),
    send: vi.fn().mockResolvedValue({ ok: true }),
    finish: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('remote print station cycle', () => {
  it('does nothing while disabled', async () => {
    const deps = dependencies({ enabled: false });
    expect(await runRemotePrintStationCycle(deps)).toEqual({ state: 'disabled', processed: 0 });
    expect(deps.detectAgent).not.toHaveBeenCalled();
  });

  it('does not claim when the local agent is unavailable', async () => {
    const deps = dependencies({ detectAgent: vi.fn().mockResolvedValue({ running: false, paired: false }) });
    expect(await runRemotePrintStationCycle(deps)).toMatchObject({ state: 'waiting_agent' });
    expect(deps.claim).not.toHaveBeenCalled();
  });

  it('prints claimed jobs sequentially and completes them', async () => {
    const events = [];
    const deps = dependencies({
      claim: vi.fn().mockResolvedValue([
        { id: 'job-1', payload: { type: 'receipt', content: {} } },
        { id: 'job-2', payload: { type: 'kitchen_order', content: {} } },
      ]),
      send: vi.fn(async (payload) => events.push(`send:${payload.type}`)),
      finish: vi.fn(async (result) => events.push(`finish:${result.jobId}:${result.outcome}`)),
    });
    expect(await runRemotePrintStationCycle(deps)).toEqual({ state: 'ready', processed: 2 });
    expect(events).toEqual([
      'send:receipt', 'finish:job-1:spooled',
      'send:kitchen_order', 'finish:job-2:spooled',
    ]);
  });

  it('releases safe failures but stops after an uncertain result', async () => {
    const safe = Object.assign(new Error('offline'), { retrySafe: true, code: 'PRINTER_OFFLINE' });
    const unknown = Object.assign(new Error('timeout'), { retrySafe: false, code: 'PRINT_OUTCOME_UNKNOWN' });
    const deps = dependencies({
      claim: vi.fn().mockResolvedValue([
        { id: 'job-1', payload: {} }, { id: 'job-2', payload: {} }, { id: 'job-3', payload: {} },
      ]),
      send: vi.fn().mockRejectedValueOnce(safe).mockRejectedValueOnce(unknown),
    });
    expect(await runRemotePrintStationCycle(deps)).toEqual({ state: 'uncertain', processed: 2 });
    expect(deps.finish).toHaveBeenNthCalledWith(1, expect.objectContaining({ jobId: 'job-1', outcome: 'retry' }));
    expect(deps.finish).toHaveBeenNthCalledWith(2, expect.objectContaining({ jobId: 'job-2', outcome: 'unknown' }));
    expect(deps.send).toHaveBeenCalledTimes(2);
  });
});
