import { TRIAL_DAYS } from '$lib/pricing';

export const META_EVENTS = {
  lead: 'Lead',
  startTrial: 'StartTrial',
  viewContent: 'ViewContent',
};

export const META_CUSTOM_EVENTS = {
  startTrial: 'ZeloStartTrial',
};

/**
 * @param {string} eventName
 * @param {Record<string, unknown>} [params]
 * @param {{ eventID?: string }} [options] Meta Pixel eventID for CAPI dedup
 */
export function trackMetaEvent(eventName, params = {}, options = {}) {
  if (typeof window === 'undefined' || typeof window.fbq !== 'function') return false;

  const eventID = typeof options.eventID === 'string' && options.eventID
    ? options.eventID
    : (typeof params.eventID === 'string' ? params.eventID : null);

  const payload = { ...params };
  delete payload.eventID;

  if (eventID) {
    window.fbq('track', eventName, payload, { eventID });
  } else {
    window.fbq('track', eventName, payload);
  }
  return true;
}

/**
 * @param {string} eventName
 * @param {Record<string, unknown>} [params]
 * @param {{ eventID?: string }} [options]
 */
export function trackMetaCustomEvent(eventName, params = {}, options = {}) {
  if (typeof window === 'undefined' || typeof window.fbq !== 'function') return false;

  const eventID = typeof options.eventID === 'string' && options.eventID
    ? options.eventID
    : (typeof params.eventID === 'string' ? params.eventID : null);

  const payload = { ...params };
  delete payload.eventID;

  if (eventID) {
    window.fbq('trackCustom', eventName, payload, { eventID });
  } else {
    window.fbq('trackCustom', eventName, payload);
  }
  return true;
}

export function trackLead(params = {}) {
  return trackMetaEvent(META_EVENTS.lead, params);
}

export function trackStartTrial(params = {}) {
  const eventID = typeof params.eventID === 'string' ? params.eventID : undefined;
  const { eventID: _drop, ...rest } = params;
  const payload = {
    value: 0,
    currency: 'BRL',
    plan_id: `zelo_pdv_trial_${TRIAL_DAYS}d`,
    trial_days: TRIAL_DAYS,
    ...rest,
  };

  const trackedStandard = trackMetaEvent(META_EVENTS.startTrial, payload, { eventID });
  const trackedCustom = trackMetaCustomEvent(META_CUSTOM_EVENTS.startTrial, payload, { eventID });

  return trackedStandard || trackedCustom;
}

export function trackViewContent(params = {}) {
  return trackMetaEvent(META_EVENTS.viewContent, params);
}
