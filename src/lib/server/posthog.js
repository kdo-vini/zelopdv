import { PostHog } from 'posthog-node';
import { env as publicEnv } from '$env/dynamic/public';

const DEFAULT_POSTHOG_HOST = 'https://us.i.posthog.com';

let posthogClient = null;

export function getPostHogClient() {
  const posthogKey = publicEnv.PUBLIC_POSTHOG_KEY || '';
  if (!posthogKey) return null;
  if (!posthogClient) {
    posthogClient = new PostHog(posthogKey, {
      host: publicEnv.PUBLIC_POSTHOG_HOST || DEFAULT_POSTHOG_HOST,
      flushAt: 1,
      flushInterval: 0,
    });
  }
  return posthogClient;
}

/**
 * Captures a $ai_generation event for an LLM call.
 * Intentionally omits $ai_input / $ai_output_choices to avoid sending
 * user-generated content or business data in event properties.
 */
export async function captureAiGeneration({
  distinctId,
  traceId,
  spanName,
  model,
  provider = 'openai',
  inputTokens,
  outputTokens,
  latencySeconds,
  timeToFirstTokenSeconds = null,
  isStream = true,
  isError = false,
  errorMessage = null,
}) {
  const posthog = getPostHogClient();
  if (!posthog) return;

  const props = {
    $ai_trace_id: traceId,
    $ai_span_name: spanName,
    $ai_model: model,
    $ai_provider: provider,
    $ai_input_tokens: inputTokens,
    $ai_output_tokens: outputTokens,
    $ai_latency: latencySeconds,
    $ai_stream: isStream,
  };

  if (timeToFirstTokenSeconds !== null) {
    props.$ai_time_to_first_token = timeToFirstTokenSeconds;
  }
  if (isError) {
    props.$ai_is_error = true;
    if (errorMessage) props.$ai_error = errorMessage;
  }

  posthog.capture({ distinctId, event: '$ai_generation', properties: props });
  await posthog.flush();
}
