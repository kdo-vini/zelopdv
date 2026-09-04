import { trackLead } from '$lib/metaPixel';
import { trackGa4Event, trackGoogleAdsInscricao, waitForGtag } from '$lib/googleAds';
import { claimStoredReferral } from '$lib/referrals/client';
import { capturePostHogEvent, identifyPostHogUser } from '$lib/posthogClient';

// The caller starts this task without awaiting it and navigates inside the SPA.
// A blocked analytics vendor must never turn a created account into an error.
export function startSignupFollowUp({ session, userId, email, hasReferral }) {
  return Promise.allSettled([
    Promise.resolve().then(() => identifyPostHogUser(userId, { email })),
    Promise.resolve().then(() => capturePostHogEvent('user_signed_up', { method: 'email', has_referral: hasReferral })),
    Promise.resolve().then(() => trackLead()),
    Promise.resolve().then(async () => {
      await waitForGtag();
      trackGa4Event('sign_up', { method: 'email' });
      await trackGoogleAdsInscricao({ email, transactionId: userId });
    }),
    Promise.resolve().then(() => claimStoredReferral(session, 'signup-password')),
  ]);
}
