import { describe, expect, it } from 'vitest';
import { getApiBase } from '../admin-dashboard/src/lib/apiBase.js';

describe('admin API base URL', () => {
  it('uses the canonical production origin without a redirecting preflight', () => {
    expect(getApiBase({ dev: false })).toBe('https://zelopdv.com.br');
  });

  it('keeps the local admin pointed at the local app API', () => {
    expect(getApiBase({ dev: true })).toBe('http://localhost:5173');
  });
});
