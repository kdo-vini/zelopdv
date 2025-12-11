# Stripe Integration - Complete Setup Guide

## Table of Contents
1. [Overview](#overview)
2. [Stripe Dashboard Configuration](#stripe-dashboard-configuration)
3. [Environment Variables](#environment-variables)
4. [Webhook Setup](#webhook-setup)
5. [Database Schema](#database-schema)
6. [Implementation](#implementation)
7. [Testing](#testing)
8. [Troubleshooting](#troubleshooting)

---

## Overview

This SaaS uses Stripe for subscription billing with the following architecture:

- **Payment Method:** Payment Links (simple) or Programmatic Checkout (advanced)
- **Billing Model:** Monthly recurring subscriptions
- **Webhook Events:** Automatic subscription activation/cancellation
- **Admin Features:** Manual payment registration, subscription management

---

## Stripe Dashboard Configuration

### 1. Create a Product

1. Go to **Products** in Stripe Dashboard
2. Click **Add Product**
3. Configure:
   - **Name:** Your Product Name (e.g., "Zelo PDV - Assinatura Mensal")
   - **Description:** Brief description
   - **Pricing:** 
     - Model: Recurring
     - Price: R$ 59.00 (or your price)
     - Billing period: Monthly
     - Currency: BRL

4. **Save** and copy the **Price ID** (format: `price_XXXXXXXXXXXXX`)

### 2. Update Business Information

1. **Settings** → **Business settings** → **Business details**
2. Update:
   - **Business name:** Your Company Name
   - **Statement descriptor:** Your short name (max 22 chars, appears on credit cards)
3. **Save**

### 3. Create Payment Link (Optional - for simple setup)

1. **Payment Links** → **Create payment link**
2. Select your product
3. Configure success/cancel URLs (or use defaults)
4. **Save** and copy the Payment Link URL

### 4. Get API Keys

1. **Developers** → **API keys**
2. Copy:
   - **Publishable key** (starts with `pk_live_` or `pk_test_`)
   - **Secret key** (starts with `sk_live_` or `sk_test_`)
   - **Service Role Key** - Get from **Restricted keys** → Create key with full access

---

## Environment Variables

### Frontend (.env)
```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_PUBLIC_STRIPE_PAYMENT_LINK_URL=https://buy.stripe.com/XXXXXXX  # Optional
STRIPE_PRICE_ID_MONTHLY_59=price_XXXXXXXXXXXXX  # For programmatic checkout
```

### Backend (Vercel Environment Variables)
```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
STRIPE_SECRET_KEY=sk_live_XXXXXXXXXXXXXXXX
STRIPE_WEBHOOK_SECRET=whsec_XXXXXXXXXXXXXXXX
```

**⚠️ Critical:** 
- Frontend variables start with `VITE_` or `PUBLIC_`
- Backend variables (Vercel) do NOT have prefixes
- `SUPABASE_SERVICE_ROLE_KEY` is required for webhooks to bypass RLS

---

## Webhook Setup

### 1. Create Webhook Endpoint in Stripe

1. **Developers** → **Webhooks** → **Add endpoint**
2. **Endpoint URL:** `https://www.yourdomain.com/api/billing/webhook`
   - ⚠️ Must include `www.` if your domain uses it (to avoid 307 redirects)
3. **Events to send:**
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`
4. **Add endpoint**
5. **Copy the Signing Secret** (`whsec_XXXXX`)

### 2. Add Webhook Secret to Vercel

1. Vercel Dashboard → Your Project → **Settings** → **Environment Variables**
2. Add:
   - **Name:** `STRIPE_WEBHOOK_SECRET`
   - **Value:** `whsec_XXXXXXXXXXXXX`
   - **Environments:** Production, Preview, Development
3. **Redeploy** the application

### 3. Update Supabase Allowed URLs

1. Supabase Dashboard → **Authentication** → **URL Configuration**
2. **Redirect URLs:** Add:
   ```
   https://yourdomain.com
   https://yourdomain.com/**
   https://www.yourdomain.com
   https://www.yourdomain.com/**
   ```
3. **Site URL:** `https://www.yourdomain.com`

---

## Database Schema

### `subscriptions` Table

```sql
CREATE TABLE public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id),
  stripe_customer_id text,
  stripe_subscription_id text,
  status text,  -- 'active', 'canceled', 'past_due'
  current_period_end timestamp with time zone,
  cancel_at_period_end boolean DEFAULT false,
  price_id text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  manually_extended_until timestamp with time zone,
  admin_notes text,
  last_modified_by uuid REFERENCES super_admins(id),
  last_modified_at timestamp with time zone
);

-- Index for faster lookups
CREATE INDEX idx_subscriptions_user_id ON public.subscriptions(user_id);
CREATE INDEX idx_subscriptions_stripe_customer_id ON public.subscriptions(stripe_customer_id);
CREATE INDEX idx_subscriptions_stripe_subscription_id ON public.subscriptions(stripe_subscription_id);
```

### RLS Policies

```sql
-- Disable RLS for subscriptions (webhooks need access)
ALTER TABLE public.subscriptions DISABLE ROW LEVEL SECURITY;

-- Or if you want RLS enabled, allow service role:
CREATE POLICY "Service role has full access" ON public.subscriptions
  FOR ALL USING (auth.jwt()->>'role' = 'service_role');

CREATE POLICY "Users can view own subscription" ON public.subscriptions
  FOR SELECT USING (auth.uid() = user_id);
```

---

## Implementation

### Webhook Handler (`src/routes/api/billing/webhook/+server.js`)

**Key Features:**
- Verifies Stripe signature for security
- Finds users by email (handles Payment Links without metadata)
- Updates/creates subscriptions automatically
- Logs all actions for debugging

**Critical Points:**
1. **Uses `supabaseAdmin`** (service role key) to bypass RLS
2. **Looks up users via `auth.users`** API (not empresa_perfil)
3. **Handles missing fields** (current_period_start doesn't exist in DB)
4. **Manual update/insert** (no upsert due to missing UNIQUE constraint)

### Server-Side Supabase Client (`src/lib/server/supabaseAdmin.js`)

```javascript
import { createClient } from '@supabase/supabase-js';
import { env } from '$env/dynamic/private';

const supabaseUrl = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
const supabaseServiceKey = env.SUPABASE_SERVICE_ROLE_KEY;

export const supabaseAdmin = (supabaseUrl && supabaseServiceKey) 
  ? createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })
  : null;
```

**Why this is needed:**
- RLS blocks regular Supabase client
- Service role key bypasses RLS
- Required for webhooks to write to database

---

## Testing

### 1. Test Webhook Locally (Stripe CLI)

```bash
# Install Stripe CLI
# https://stripe.com/docs/stripe-cli

# Login
stripe login

# Forward events to local server
stripe listen --forward-to localhost:5173/api/billing/webhook

# Trigger test event
stripe trigger checkout.session.completed
```

### 2. Test in Production

1. Use Stripe's test mode
2. Create a test payment
3. Check webhook logs in Stripe Dashboard:
   - **Developers** → **Webhooks** → Your endpoint → **Recent deliveries**
4. Verify response is **200 OK**
5. Check database for updated subscription

### 3. Manual Resend

If a webhook failed, you can resend it:
1. Stripe Dashboard → **Developers** → **Webhooks**
2. Click your endpoint → **Recent deliveries**
3. Click on a failed event → **Resend**

---

## Troubleshooting

### Webhook Returns 404

**Cause:** Endpoint URL is wrong or file doesn't exist

**Solution:**
- Verify file exists at `src/routes/api/billing/webhook/+server.js`
- Check Vercel deployment includes the file
- Ensure URL in Stripe matches deployed URL

### Webhook Returns 307 (Redirect)

**Cause:** URL mismatch (`www` vs non-`www`)

**Solution:** Update webhook URL in Stripe to match your domain exactly (include or remove `www`)

### Webhook Returns 500

**Possible Causes:**
1. Missing `SUPABASE_SERVICE_ROLE_KEY` environment variable
2. Missing `STRIPE_WEBHOOK_SECRET` environment variable
3. Database error (RLS, missing columns)

**Solution:**
- Check Vercel logs (Deployments → Functions → `/api/billing/webhook`)
- Verify all environment variables are set
- Check error message for specific issue

### "Could not identify user"

**Cause:** Payment Link doesn't include user_id metadata

**Solution:** Webhook now finds users by email using `supabaseAdmin.auth.admin.listUsers()`

### "Could not find column 'current_period_start'"

**Cause:** Database schema mismatch

**Solution:** Remove `current_period_start` from webhook code (already fixed)

### "No unique constraint matching ON CONFLICT"

**Cause:** `user_id` column doesn't have UNIQUE constraint

**Solution:** Use manual SELECT → UPDATE/INSERT pattern (already implemented)

---

## Payment Link vs Programmatic Checkout

### Payment Link (Simpler)
✅ **Pros:**
- No backend code needed
- Easy to set up
- Shareable URL

❌ **Cons:**
- No custom metadata (can't pass `user_id`)
- Webhook must find user by email

**Use when:** Simple subscription, don't need tight integration

### Programmatic Checkout (Advanced)
✅ **Pros:**
- Full control
- Can pass `user_id` in metadata
- Custom success/cancel URLs

❌ **Cons:**
- Requires backend endpoint
- More complex setup

**Use when:** Need custom flows, want metadata for tracking

---

## Summary Checklist

- [ ] Product created in Stripe with monthly pricing
- [ ] Price ID copied and added to env vars
- [ ] Webhook endpoint created in Stripe
- [ ] Webhook secret added to Vercel
- [ ] `SUPABASE_URL` added to Vercel
- [ ] `SUPABASE_SERVICE_ROLE_KEY` added to Vercel
- [ ] `subscriptions` table exists in database
- [ ] Webhook handler file deployed
- [ ] Test payment successful
- [ ] Webhook returns 200 OK
- [ ] Subscription appears in database with correct data

---

**END OF STRIPE SETUP GUIDE**
