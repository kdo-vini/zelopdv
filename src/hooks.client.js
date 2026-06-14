import { capturePostHogException } from '$lib/posthogClient';

/** @type {import('@sveltejs/kit').HandleClientError} */
export const handleError = async ({ error }) => {
  capturePostHogException(error);
};
