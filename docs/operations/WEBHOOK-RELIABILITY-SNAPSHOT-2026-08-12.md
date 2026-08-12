# Webhook reliability snapshot — 2026-08-12

This is the pre-change snapshot for the second, webhook-only reliability round.
It is intentionally separate from the P0 security-containment migration.

## Production schema verified before the change

- `billing_webhook_events` has a unique `(provider, event_id)` constraint and
  stores `received`, `processed`, `ignored`, or `failed` state.
- `webhook_events_processed` has a primary key `(provider, event_id)` and only
  stores successful-event timestamps; it has no retry state.
- `billing_payments` has a unique `(provider, provider_payment_id)` constraint
  and a partial unique index allowing one pending AbacatePay Pix per user.
- `subscriptions` has a unique `provider_subscription_id`, but no unique
  `user_id`; the application currently selects the latest row for a user.
- The new `settle_pix_payment` routine did not exist in production at snapshot
  time. Existing table grants and constraints were read with the Supabase CLI
  before creating it.
- Transactional migration verification returned `anon=false`,
  `authenticated=false`, `service_role=true` for the new routine's EXECUTE
  privilege. The function body was also exercised against the live pending Pix
  row inside a rollback-only transaction; a second settlement did not extend
  the subscription again.

## Existing consumers and blast radius

| Surface | Consumers | Execution context | Change impact |
| --- | --- | --- | --- |
| Stripe webhook | `src/routes/api/billing/webhook/+server.js` | provider request, service role | retries remain provider-facing; successful subscription updates are unchanged |
| AbacatePay webhook | `src/routes/api/webhooks/abacatepay/+server.js` | provider request, service role | failed/received event rows can be retried; processed/ignored rows still acknowledge duplicates |
| Pix polling | `src/routes/api/billing/pix/status/[paymentId]/+server.js` | authenticated owner request, service role lookup | paid settlement uses the same transaction as the webhook |
| Pix creation | `src/routes/api/billing/pix/create/+server.js` and admin renewal endpoint | authenticated owner or super-admin request, service role | unchanged in this round |

## Confirmed current failure modes

1. Stripe inserted `webhook_events_processed` before applying side effects.
   A later DB/update/provider error returned 500, but the next delivery saw the
   event as already processed and skipped it. Subscription update errors were
   also logged and swallowed.
2. AbacatePay treated every duplicate event key as permanently idempotent,
   including rows left in `received` or `failed`. A retry could therefore never
   re-run a failed payment synchronization.
3. Pix settlement selected/updated `subscriptions` and `billing_payments` in
   separate requests. Concurrent webhook + polling confirmation could both see
   `paid_at = null` and renew/insert before either payment update committed.
4. AbacatePay acknowledged a completed event as `ignored` when its local
   payment row was not visible yet (the charge is created remotely before the
   local insert). That made the timing race permanently lose the activation.

## Intentionally not changed

- Stripe event types, plan/add-on mapping, invoice behavior, and external API
  contracts.
- Pix charge creation, cancellation, provider calls, sales/offline flows, UI,
  RBAC, logging, and architecture-wide cleanup.
- The existing table grants. The new routine is explicitly executable only by
  `service_role`; browser roles do not call it.

## Rollback

1. Revert the application commit so paid Pix synchronization returns to direct
   updates and webhook handlers use the prior flow.
2. In a separately reviewed migration, `revoke all on function
   public.settle_pix_payment(uuid, text, text, integer, timestamptz,
   timestamptz, text) from public, anon, authenticated, service_role;`.
3. Drop the routine only after the reverted application is deployed:
   `drop function if exists public.settle_pix_payment(uuid, text, text,
   integer, timestamptz, timestamptz, text);`.

The migration was applied to production on 2026-08-12 after a bounded
metadata-only migration-history reconciliation. The post-apply smoke used the
existing pending Pix row inside a rollback-only transaction; no payment or
subscription data was changed by the verification.
