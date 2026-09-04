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
    expect(mocks.capture).toHaveBeenCalledWith('user_signed_up', { method: 'email', has_referral: true });
  });
});
