import { describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ ads: vi.fn(), wait: vi.fn(), referral: vi.fn(), identify: vi.fn(), capture: vi.fn(), lead: vi.fn(), ga: vi.fn() }));
vi.mock('$lib/googleAds', () => ({ trackGoogleAdsInscricao: mocks.ads, waitForGtag: mocks.wait, trackGa4Event: mocks.ga }));
vi.mock('$lib/referrals/client', () => ({ claimStoredReferral: mocks.referral }));
vi.mock('$lib/posthogClient', () => ({ identifyPostHogUser: mocks.identify, capturePostHogEvent: mocks.capture }));
vi.mock('$lib/metaPixel', () => ({ trackLead: mocks.lead }));
import { startSignupFollowUp } from '../src/lib/auth/signupFollowUp.js';
describe('signup follow-up', () => {
  it('keeps referral independent of a blocked analytics vendor and retains conversion identity', async () => {
    let release;
    mocks.wait.mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));
    mocks.identify.mockImplementationOnce(() => { throw new Error('tracking blocked'); });
    const session = { access_token: 'fixture-session' };
    const followUp = startSignupFollowUp({ session, userId: 'owner-1', email: 'fixture@example.test', hasReferral: true });
    await Promise.resolve();
    expect(mocks.referral).toHaveBeenCalledWith(session, 'signup-password');
    expect(mocks.ads).not.toHaveBeenCalled();
    release(true);
    const outcomes = await followUp;
    expect(outcomes[0].status).toBe('rejected');
    expect(mocks.ads).toHaveBeenCalledWith({ email: 'fixture@example.test', transactionId: 'owner-1' });
  });

  // O evento de cadastro e server-side (POST /api/auth/signup -> `user_registered`).
  // A captura client-side daqui foi removida em f5c0dbe porque corria contra o
  // redirect pra /perfil e morria no `before_send`. Re-adicionar duplicaria o
  // cadastro no funil, entao a ausencia da chamada e a invariante.
  it('does not duplicate the signup event on the client', async () => {
    mocks.capture.mockClear();
    mocks.wait.mockImplementationOnce(() => Promise.resolve(true));
    await startSignupFollowUp({
      session: { access_token: 'fixture-session' },
      userId: 'owner-2',
      email: 'fixture2@example.test',
      hasReferral: false,
    });
    expect(mocks.capture).not.toHaveBeenCalled();
  });
});
