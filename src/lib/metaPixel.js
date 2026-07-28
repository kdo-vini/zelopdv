import { TRIAL_DAYS } from '$lib/pricing';

export const META_EVENTS = {
  lead: 'Lead',
  startTrial: 'StartTrial',
  viewContent: 'ViewContent',
};

export const META_CUSTOM_EVENTS = {
  startTrial: 'ZeloStartTrial',
};

export function trackMetaEvent(eventName, params = {}) {
  if (typeof window === 'undefined' || typeof window.fbq !== 'function') return false;

  window.fbq('track', eventName, params);
  return true;
}

export function trackMetaCustomEvent(eventName, params = {}) {
  if (typeof window === 'undefined' || typeof window.fbq !== 'function') return false;

  window.fbq('trackCustom', eventName, params);
  return true;
}

export function trackLead(params = {}) {
  return trackMetaEvent(META_EVENTS.lead, params);
}

export function trackStartTrial(params = {}) {
  const payload = {
    value: 0,
    currency: 'BRL',
    plan_id: `zelo_pdv_trial_${TRIAL_DAYS}d`,
    trial_days: TRIAL_DAYS,
    ...params,
  };

  const trackedStandard = trackMetaEvent(META_EVENTS.startTrial, payload);
  const trackedCustom = trackMetaCustomEvent(META_CUSTOM_EVENTS.startTrial, payload);

  return trackedStandard || trackedCustom;
}

export function trackViewContent(params = {}) {
  return trackMetaEvent(META_EVENTS.viewContent, params);
}
