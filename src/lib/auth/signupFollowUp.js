import { trackLead } from '$lib/metaPixel';
import { trackGa4Event, trackGoogleAdsInscricao, waitForGtag } from '$lib/googleAds';
import { claimStoredReferral } from '$lib/referrals/client';
import { identifyPostHogUser } from '$lib/posthogClient';

// The caller starts this task without awaiting it and navigates inside the SPA.
// A blocked analytics vendor must never turn a created account into an error.
//
// PostHog signup event lives server-side only (see POST /api/auth/signup, which
// fires `user_registered`). We used to also fire a client-side `user_signed_up`
// here, but it fired once in 180+ days of production traffic: this call races
// the redirect to /perfil right below, `/perfil` is in posthogClient's
// BLOCKED_PREFIXES, and the client SDK is also the first thing an ad blocker
// kills. The server event is the reliable, complete one (has $set email,
// has_referral, acquisition) — don't re-add a client-side duplicate here.
export function startSignupFollowUp({ session, userId, email, hasReferral }) {
  return Promise.allSettled([
    Promise.resolve().then(() => identifyPostHogUser(userId, { email })),
    Promise.resolve().then(() => trackLead()),
    Promise.resolve().then(async () => {
      await waitForGtag();
      trackGa4Event('sign_up', { method: 'email' });
      await trackGoogleAdsInscricao({ email, transactionId: userId });
    }),
    Promise.resolve().then(() => claimStoredReferral(session, 'signup-password')),
  ]);
}
