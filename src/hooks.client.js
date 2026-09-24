import { updated } from '$app/state';
import { capturePostHogException } from '$lib/posthogClient';
import { isStaleModuleImportError } from '$lib/staleModuleError';

/** @type {import('@sveltejs/kit').HandleClientError} */
export const handleError = async ({ error }) => {
  // Preload por hover pode tentar importar um chunk que sumiu após um
  // deploy. Se houver de fato uma versão nova, isso é ruído esperado e não
  // deve poluir o PostHog; se não houver versão nova, é um erro real.
  if (isStaleModuleImportError(error)) {
    try {
      const hasNewVersion = await updated.check();
      if (hasNewVersion) return;
    } catch {
      // não foi possível confirmar; segue e reporta como erro real
    }
  }

  capturePostHogException(error);
};
