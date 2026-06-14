<wizard-report>
# PostHog post-wizard report

The wizard has completed a deep integration of PostHog into ZeloPDV. Changes include: initializing the PostHog client in `hooks.client.js` for client-side error tracking; adding `capture`, `identify`, and `captureException` exports to the existing `posthogClient.js` wrapper; creating a server-side PostHog singleton at `src/lib/server/posthog.js` (using `posthog-node`); and instrumenting 13 business-critical events across signup, login, trial activation, Stripe checkout, Pix payment, subscription webhooks, and referral landing. `svelte.config.js` was updated with `paths.relative: false` as required by PostHog session replay. Environment variables `PUBLIC_POSTHOG_KEY` and `PUBLIC_POSTHOG_HOST` are now set in `.env`.

| Event | Description | File |
|---|---|---|
| `user_signed_up` | Client — user completes signup via email form | `src/routes/cadastro/+page.svelte` |
| `user_logged_in` | Client — user logs in successfully | `src/routes/login/+page.svelte` |
| `referral_landing_viewed` | Client — valid referral invite page is loaded | `src/routes/indica/[codigo]/+page.svelte` |
| `subscription_checkout_started` | Client — card checkout button clicked | `src/routes/assinatura/+page.svelte` |
| `pix_payment_initiated` | Client — Pix QR code generated and modal opened | `src/routes/assinatura/+page.svelte` |
| `trial_auto_started` | Client — 30-day trial auto-activated for new user | `src/routes/assinatura/+page.svelte` |
| `user_registered` | Server — new user account created in Supabase | `src/routes/api/auth/signup/+server.js` |
| `trial_started` | Server — trial subscription row inserted in DB | `src/routes/api/billing/start-trial/+server.js` |
| `stripe_checkout_created` | Server — Stripe hosted checkout session created | `src/routes/api/billing/create-subscription/+server.js` |
| `pix_charge_created` | Server — AbacatePay Pix charge created | `src/routes/api/billing/pix/create/+server.js` |
| `subscription_activated` | Server — Stripe webhook confirms active subscription | `src/routes/api/billing/webhook/+server.js` |
| `subscription_canceled` | Server — Stripe webhook confirms subscription cancel | `src/routes/api/billing/webhook/+server.js` |
| `payment_failed` | Server — Stripe webhook reports failed invoice payment | `src/routes/api/billing/webhook/+server.js` |

## LLM analytics

The wizard also instrumented PostHog AI Observability (`$ai_generation` events) on both OpenAI chat routes. The manual-capture approach was chosen over the OTel SDK because these are serverless SSE handlers on Vercel — `NodeSDK.start()` is hostile to cold starts. Token and latency data were already being collected at stream end; the PostHog capture is added there with no overhead to the streaming path.

`captureAiGeneration` was added to `src/lib/server/posthog.js` as a shared helper. It captures model, provider, input/output tokens, latency, time-to-first-token, and error state. It deliberately omits `$ai_input`/`$ai_output_choices` to avoid sending user-generated content or business context data as event properties.

| Event | Description | File |
|---|---|---|
| `$ai_generation` (support_chat) | PostHog AI event for every anonymous support chatbot call | `src/routes/api/chat/support/+server.js` |
| `$ai_generation` (assistant_chat) | PostHog AI event for every authenticated Zelinho assistant call, linked to `user.id` | `src/routes/api/chat/assistant/+server.js` |

## Next steps

We've built some insights and a dashboard for you to keep an eye on user behavior, based on the events we just instrumented:

**Business analytics:**
- [Analytics basics (wizard) — Dashboard](https://us.posthog.com/project/470628/dashboard/1712553)
- [New signups over time](https://us.posthog.com/project/470628/insights/xuj6wLiJ)
- [Signup to trial activation funnel](https://us.posthog.com/project/470628/insights/5Fv8Mt7Q)
- [Trial to paid conversion funnel](https://us.posthog.com/project/470628/insights/WeAuWffP)
- [Subscription activations vs cancellations](https://us.posthog.com/project/470628/insights/ti3EGMiD)
- [Payment method split (Card vs Pix)](https://us.posthog.com/project/470628/insights/Cbaz3Klp)

**LLM analytics:**
- [LLM analytics (wizard) — Dashboard](https://us.posthog.com/project/470628/dashboard/1712557)
- [AI generation volume by chatbot](https://us.posthog.com/project/470628/insights/YNuFl9AG)
- [Median AI response latency](https://us.posthog.com/project/470628/insights/ogNaE9v9)
- [Total tokens used per day](https://us.posthog.com/project/470628/insights/LiofiRYA)
- [AI generation error rate](https://us.posthog.com/project/470628/insights/NvHIcFRG)

You can also explore traces and generations at: [PostHog AI Observability](https://us.posthog.com/project/470628/ai-observability/generations)

### Agent skill

We've left agent skill folders in your project at `.claude/skills/integration-sveltekit/` and `.claude/skills/llm-analytics-setup/`. You can use this context for further agent development when using Claude Code. This will help ensure the model provides the most up-to-date approaches for integrating PostHog.

</wizard-report>
