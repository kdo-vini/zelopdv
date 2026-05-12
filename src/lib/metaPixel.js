export const META_EVENTS = {
  lead: 'Lead',
  startTrial: 'StartTrial',
  subscribe: 'Subscribe',
  viewContent: 'ViewContent',
};

export function trackMetaEvent(eventName, params = {}) {
  if (typeof window === 'undefined' || typeof window.fbq !== 'function') return false;

  window.fbq('track', eventName, params);
  return true;
}

export function trackLead(params = {}) {
  return trackMetaEvent(META_EVENTS.lead, params);
}

export function trackStartTrial(params = {}) {
  return trackMetaEvent(META_EVENTS.startTrial, {
    value: 0,
    currency: 'BRL',
    ...params,
  });
}

export function trackSubscribe(params = {}) {
  return trackMetaEvent(META_EVENTS.subscribe, {
    currency: 'BRL',
    ...params,
  });
}

export function trackViewContent(params = {}) {
  return trackMetaEvent(META_EVENTS.viewContent, params);
}
