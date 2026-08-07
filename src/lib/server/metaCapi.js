import { createHash, randomUUID } from 'crypto';

const PIXEL_ID = '904797296018757';
const CAPI_URL = `https://graph.facebook.com/v18.0/${PIXEL_ID}/events`;

function sha256(value) {
  return createHash('sha256').update(value.trim().toLowerCase()).digest('hex');
}

/**
 * Send an event to Meta Conversions API.
 * Requires META_ACCESS_TOKEN env var — skips silently if absent.
 *
 * @param {object} opts
 * @param {string} opts.eventName  - Standard or custom event name
 * @param {string} [opts.email]    - User email (will be hashed)
 * @param {string} [opts.ipAddress]
 * @param {string} [opts.userAgent]
 * @param {string} [opts.eventId]  - For dedup with browser pixel (use same ID there)
 * @param {object} [opts.customData]
 * @returns {Promise<string|null>}  The eventId used, or null if skipped/failed
 */
export async function sendCapiEvent({ eventName, email, ipAddress, userAgent, eventId, customData = {} }) {
  const accessToken = process.env.META_ACCESS_TOKEN;
  if (!accessToken) {
    console.warn('[meta-capi] META_ACCESS_TOKEN not set — skipping CAPI for', eventName);
    return null;
  }

  const id = eventId || randomUUID();

  const userData = {};
  if (email) userData.em = [sha256(email)];
  if (ipAddress) userData.client_ip_address = ipAddress;
  if (userAgent) userData.client_user_agent = userAgent;

  const body = {
    data: [{
      event_name: eventName,
      event_time: Math.floor(Date.now() / 1000),
      action_source: 'website',
      event_id: id,
      user_data: userData,
      custom_data: customData,
    }],
  };

  try {
    const res = await fetch(`${CAPI_URL}?access_token=${accessToken}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const result = await res.json();
    if (!res.ok) {
      console.warn('[meta-capi] error for', eventName, JSON.stringify(result));
      return null;
    }
    return id;
  } catch (err) {
    console.warn('[meta-capi] fetch failed for', eventName, err.message);
    return null;
  }
}
