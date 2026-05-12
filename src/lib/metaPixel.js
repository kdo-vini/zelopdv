export const META_EVENTS = {
  lead: 'Lead',
  startTrial: 'StartTrial',
  subscribe: 'Subscribe',
  viewContent: 'ViewContent',
};

export function trackMetaEvent(eventName, params = {}, eventId = null) {
  if (typeof window === 'undefined' || typeof window.fbq !== 'function') return false;

  window.fbq('track', eventName, params, eventId ? { eventID: eventId } : undefined);
  return true;
}

export function trackLead(params = {}) {
  return trackMetaEvent(META_EVENTS.lead, params);
}

export function trackStartTrial(params = {}, eventId = null) {
  const payload = {
    value: 0,
    currency: 'BRL',
    plan_id: 'zelo_pdv_trial_30d',
    trial_days: 30,
    ...params,
  };

  return trackMetaEvent(META_EVENTS.startTrial, payload, eventId);
}

export function trackSubscribe(params = {}) {
  const payload = {
    currency: 'BRL',
    plan_id: 'zelo_paid_subscription',
    ...params,
  };

  return trackMetaEvent(META_EVENTS.subscribe, payload);
}

export function trackViewContent(params = {}) {
  return trackMetaEvent(META_EVENTS.viewContent, params);
}
