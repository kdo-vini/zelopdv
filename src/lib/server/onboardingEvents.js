import { supabaseAdmin } from '$lib/server/supabaseAdmin';

const VALID_STATUSES = new Set(['attempted', 'sent', 'failed', 'skipped']);

export async function logOnboardingCommunication({
  userId,
  channel,
  messageDay,
  status,
  recipient = null,
  provider = null,
  error = null,
  metadata = {},
}) {
  if (!supabaseAdmin || !userId || !channel || messageDay == null) return;

  const safeStatus = VALID_STATUSES.has(status) ? status : 'failed';
  const payload = {
    user_id: userId,
    channel,
    message_day: messageDay,
    status: safeStatus,
    recipient,
    provider,
    error_message: error ? String(error).slice(0, 2000) : null,
    metadata: metadata && typeof metadata === 'object' ? metadata : {},
  };

  try {
    const { error: insertError } = await supabaseAdmin
      .from('onboarding_communication_events')
      .insert(payload);

    if (insertError) {
      console.warn('[onboarding-events] insert failed:', insertError.message);
    }
  } catch (err) {
    console.warn('[onboarding-events] insert exception:', err?.message || err);
  }
}
