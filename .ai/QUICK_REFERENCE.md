# Quick Reference - SaaS Development Checklist

Use this as a **quick start guide** when building similar SaaS projects.

---

## 📋 Pre-Development Checklist

- [ ] Define product/service clearly
- [ ] Choose tech stack (SvelteKit + Supabase + Stripe recommended)
- [ ] Set up version control (GitHub)
- [ ] Plan database schema
- [ ] Design user flow (signup → payment → access)

---

## 🎨 Frontend Setup

### 1. Initialize Project
```bash
npm create svelte@latest my-saas
cd my-saas
npm install
```

### 2. Install Dependencies
```bash
npm install @supabase/supabase-js stripe
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p
```

### 3. Configure Theming
- Create `src/themes/` folder
- Define CSS variables in `base.css`
- Never hardcode colors - always use `var(--variable-name)`
- Test with multiple themes

### 4. Set Up Authentication
- Create `src/lib/supabaseClient.js`
- Create `src/lib/authStore.js`
- Implement auth guard in `+layout.svelte`
- Add protected routes logic

---

## 🗄️ Database Setup (Supabase)

### 1. Create Project
- Go to https://supabase.com
- New project → Choose region, password
- Wait for provisioning (~2 min)

### 2. Create Tables
```sql
-- Users table (auto-created by Supabase Auth)
-- Create your custom tables:

CREATE TABLE public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id),
  stripe_customer_id text,
  stripe_subscription_id text,
  status text,
  current_period_end timestamp with time zone,
  cancel_at_period_end boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Add indexes
CREATE INDEX idx_subscriptions_user_id ON public.subscriptions(user_id);
```

### 3. Configure RLS
```sql
-- Option 1: Disable for service role only
ALTER TABLE public.subscriptions DISABLE ROW LEVEL SECURITY;

-- Option 2: Enable with policies
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own subscription" 
ON public.subscriptions FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Service role full access" 
ON public.subscriptions FOR ALL 
USING (auth.jwt()->>'role' = 'service_role');
```

### 4. Get API Keys
- Settings → API
- Copy:
  - Project URL
  - `anon` key (public)
  - `service_role` key (secret - for webhooks)

---

## 💳 Stripe Setup

### 1. Create Account
- Go to https://stripe.com
- Complete business verification
- Enable test mode for development

### 2. Create Product
- Products → Add Product
- Set name, price, billing period
- Copy **Price ID** (`price_XXXXXX`)

### 3. Get API Keys
- Developers → API keys
- Copy:
  - Publishable key (`pk_test_` or `pk_live_`)
  - Secret key (`sk_test_` or `sk_live_`)

### 4. Create Webhook
- Developers → Webhooks → Add endpoint
- URL: `https://yourdomain.com/api/billing/webhook`
- Events:
  - `checkout.session.completed`
  - `customer.subscription.*`
  - `invoice.payment_*`
- Copy **Signing Secret** (`whsec_XXXXX`)

---

## 🔌 Webhook Implementation

### 1. Create Server-Side Supabase Client
**File:** `src/lib/server/supabaseAdmin.js`
```javascript
import { createClient } from '@supabase/supabase-js';
import { env } from '$env/dynamic/private';

const url = env.SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;

export const supabaseAdmin = (url && key) 
  ? createClient(url, key, {
      auth: { autoRefreshToken: false, persistSession: false }
    })
  : null;
```

### 2. Create Webhook Handler
**File:** `src/routes/api/billing/webhook/+server.js`

```javascript
import { json } from '@sveltejs/kit';
import { stripe } from '$lib/server/stripe';
import { supabaseAdmin } from '$lib/server/supabaseAdmin';
import { env } from '$env/dynamic/private';

export async function POST({ request }) {
  const body = await request.text();
  const signature = request.headers.get('stripe-signature');
  
  // Verify signature
  const event = stripe.webhooks.constructEvent(
    body, 
    signature, 
    env.STRIPE_WEBHOOK_SECRET
  );
  
  // Handle events
  switch (event.type) {
    case 'checkout.session.completed':
      await handleCheckout(event.data.object);
      break;
    // ... other events
  }
  
  return json({ received: true });
}

async function handleCheckout(session) {
  // Get user by email
  const { data } = await supabaseAdmin.auth.admin.listUsers();
  const user = data.users.find(u => u.email === session.customer_details.email);
  
  // Update subscription
  await supabaseAdmin.from('subscriptions').upsert({
    user_id: user.id,
    stripe_customer_id: session.customer,
    stripe_subscription_id: session.subscription,
    status: 'active',
    current_period_end: new Date(Date.now() + 30*24*60*60*1000)
  });
}
```

### 3. Test Webhook
```bash
# Install Stripe CLI
stripe listen --forward-to localhost:5173/api/billing/webhook

# Trigger test event
stripe trigger checkout.session.completed
```

---

## 🌍 Environment Variables

### Development (.env)
```env
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJxxx...
STRIPE_PRICE_ID_MONTHLY=price_xxx
```

### Production (Vercel)
```env
# Frontend & Backend
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJxxx...

# Backend Only
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJxxx...
STRIPE_SECRET_KEY=sk_live_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx
```

---

## 🚀 Deployment (Vercel)

### 1. Connect Repository
- Vercel Dashboard → New Project
- Import from GitHub
- Select repository

### 2. Configure Build
- Framework: SvelteKit (auto-detected)
- Build Command: `npm run build`
- Output Directory: `.svelte-kit`
- Node Version: 20.x (add to `package.json`)

### 3. Add Environment Variables
- Settings → Environment Variables
- Add all production variables
- Select all environments (Production, Preview, Development)

### 4. Deploy
- Click Deploy
- Wait ~2 minutes
- Test production URL

### 5. Configure Custom Domain
- Settings → Domains
- Add domain (e.g., `www.yourdomain.com`)
- Update DNS at registrar:
  ```
  CNAME → www → cname.vercel-dns.com
  A → @ → 76.76.21.21
  ```

### 6. Update Stripe Webhook
- Change URL to production domain
- Test with real payment (test mode)

---

## ✅ Post-Launch Checklist

- [ ] Test complete user flow (signup → payment → access)
- [ ] Verify webhook events return 200 OK
- [ ] Check subscriptions appear in database
- [ ] Test subscription cancellation
- [ ] Test subscription renewal
- [ ] Monitor Vercel function logs
- [ ] Monitor Stripe webhook deliveries
- [ ] Set up error tracking (Sentry recommended)
- [ ] Configure domain SSL (auto with Vercel)
- [ ] Add privacy policy & terms of service
- [ ] Set up customer support system

---

## 🐛 Common Issues & Solutions

| Issue | Solution |
|-------|----------|
| Webhook 404 | Check file exists, verify Vercel deployment |
| Webhook 307 | URL mismatch (`www` vs non-`www`) |
| Webhook 500 | Check environment variables, view logs |
| "Could not identify user" | Email mismatch or no user found |
| RLS blocks queries | Use service role key (`supabaseAdmin`) |
| Build fails | Check Node version, missing dependencies |
| Functions timeout | Optimize queries, upgrade Vercel plan |

---

## 📚 Documentation Structure

For your  SaaS, maintain these docs:

```
.ai/
├── CODEBASE_CONTEXT.md    # Complete reference
├── STRIPE_SETUP.md        # Stripe integration guide
├── DEPLOYMENT.md          # Deployment instructions
├── QUICK_REFERENCE.md     # This file
└── admin_schema.sql       # Admin database schema
```

Update these docs whenever you:
- Add new features
- Change database schema
- Update environment variables
- Solve complex bugs

---

## 🎯 Key Principles

1. **Never hardcode** - Use environment variables and CSS variables
2. **Always verify webhooks** - Check signatures for security
3. **Use service role wisely** - Only in server-side code, never expose
4. **Test both environments** - Test mode first, then production
5. **Monitor everything** - Logs, webhooks, database, errors
6. **Document as you go** - Future you will thank present you
7. **Keep it modular** - Separate concerns (theme, auth, billing)
8. **Error handling** - Always assume things can fail
9. **User experience** - Clear messages, loading states, error states
10. **Security first** - RLS, input validation, rate limiting

---

**Last Updated:** 2025-12-10  
**Based on:** Zelo PDV successful implementation

---

**Happy SaaS Building! 🚀**
