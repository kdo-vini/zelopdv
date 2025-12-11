# Deployment Guide - Vercel Production

## Table of Contents
1. [Prerequisites](#prerequisites)
2. [Main App Deployment](#main-app-deployment)
3. [Admin Dashboard Deployment](#admin-dashboard-deployment)
4. [Environment Variables Setup](#environment-variables-setup)
5. [Post-Deployment Verification](#post-deployment-verification)
6. [Custom Domain Setup](#custom-domain-setup)
7. [Continuous Deployment](#continuous-deployment)

---

## Prerequisites

- [ ] Vercel account (free tier works)
- [ ] GitHub repository with your code
- [ ] Supabase project configured
- [ ] Stripe account with products configured
- [ ] Domain name (optional but recommended)

---

## Main App Deployment

### Option 1: Deploy via Vercel Dashboard (Recommended)

1. **Import Project**
   - Go to https://vercel.com/new
   - Click **Import Git Repository**
   - Select your GitHub repository
   - **Root Directory:** `./` (project root)

2. **Configure Build Settings**
   - **Framework Preset:** SvelteKit
   - **Build Command:** `npm run build`
   - **Output Directory:** `.svelte-kit` (auto-detected)
   - **Install Command:** `npm install`
   - **Node Version:** 20.x

3. **Add Environment Variables** (see next section)

4. **Deploy**
   - Click **Deploy**
   - Wait 2-3 minutes for build to complete

### Option 2: Deploy via Vercel CLI

```bash
# Install Vercel CLI
npm i -g vercel

# Login
vercel login

# Deploy to production
vercel --prod

# Follow prompts to link project
```

---

## Admin Dashboard Deployment

The admin dashboard should be deployed as a **separate project** for better isolation.

### 1. Create New Vercel Project

1. Vercel Dashboard → **New Project**
2. **Import** same GitHub repository
3. **Root Directory:** `./admin-dashboard` ⚠️ IMPORTANT
4. Configure:
   - **Framework:** SvelteKit
   - **Build Command:** `npm run build`
   - **Output Directory:** `.svelte-kit`
   - **Node Version:** 20.x (add `vercel.json` to force this)

### 2. Node.js Version Fix

Create `admin-dashboard/vercel.json`:

```json
{
  "buildCommand": "npm run build",
  "framework": "sveltekit",
  "outputDirectory": ".svelte-kit",
  "installCommand": "npm install",
  "devCommand": "npm run dev",
  "rewrites": [
    {
      "source": "/(.*)",
      "destination": "/"
    }
  ]
}
```

And in `admin-dashboard/package.json`:

```json
{
  "engines": {
    "node": "20.x"
  }
}
```

### 3. Deploy

1. Click **Deploy**
2. Verify build completes successfully
3. Test the deployed URL

---

## Environment Variables Setup

### Main App (Vercel)

| Variable | Value | Environment |
|----------|-------|-------------|
| `VITE_SUPABASE_URL` | `https://xxxxx.supabase.co` | All |
| `VITE_SUPABASE_ANON_KEY` | `eyJxxx...` | All |
| `SUPABASE_URL` | `https://xxxxx.supabase.co` | All |
| `SUPABASE_SERVICE_ROLE_KEY` | `eyJxxx...` (service role) | All |
| `STRIPE_SECRET_KEY` | `sk_live_xxx` or `sk_test_xxx` | All |
| `STRIPE_WEBHOOK_SECRET` | `whsec_xxx` | Production |
| `STRIPE_PRICE_ID_MONTHLY_59` | `price_xxx` | All |
| `PUBLIC_APP_URL` | `https://www.yourdomain.com` | Production |

### Admin Dashboard (Vercel)

| Variable | Value | Environment |
|----------|-------|-------------|
| `VITE_SUPABASE_URL` | `https://xxxxx.supabase.co` | All |
| `VITE_SUPABASE_ANON_KEY` | `eyJxxx...` | All |
| `VITE_PUBLIC_STRIPE_PAYMENT_LINK_URL` | `https://buy.stripe.com/xxx` | All (optional) |

### How to Add Variables in Vercel

1. Project → **Settings** → **Environment Variables**
2. For each variable:
   - **Name:** Variable name (e.g., `SUPABASE_URL`)
   - **Value:** The actual value
   - **Environments:** Select Production, Preview, Development (usually all)
3. Click **Add**
4. **Redeploy** after adding all variables

---

## Post-Deployment Verification

### 1. Main App Health Check

- [ ] Visit your deployed URL
- [ ] Try to sign up / log in
- [ ] Check console for errors (F12)
- [ ] Test a purchase flow (test mode)
- [ ] Verify webhook receives events

### 2. Webhook Verification

1. Make a test payment
2. Check Stripe Dashboard:
   - **Developers** → **Webhooks** → Your endpoint
   - **Recent deliveries** → Should show **200 OK**
3. Check Vercel Function Logs:
   - **Deployments** → **Functions** → `/api/billing/webhook`
   - Look for success logs

### 3. Database Verification

```sql
-- Check if subscriptions are being created
SELECT * FROM subscriptions 
WHERE created_at > now() - interval '1 hour'
ORDER BY created_at DESC;
```

### 4. Admin Dashboard Check

- [ ] Visit admin URL
- [ ] Log in
- [ ] Check admin-only pages load
- [ ] Test subscription management features

---

## Custom Domain Setup

### Main App Domain

1. **Vercel Dashboard** → Your project → **Settings** → **Domains**
2. Add domain: `yourdomain.com` and `www.yourdomain.com`
3. Configure DNS at your domain provider:
   ```
   Type: CNAME
   Name: www
   Value: cname.vercel-dns.com
   
   Type: A
   Name: @
   Value: 76.76.21.21 (Vercel's IP)
   ```
4. Wait for DNS propagation (5-30 minutes)
5. Vercel will auto-provision SSL certificate

### Admin Dashboard Subdomain

1. **Vercel Dashboard** → Admin project → **Settings** → **Domains**
2. Add domain: `admin.yourdomain.com`
3. Configure DNS:
   ```
   Type: CNAME
   Name: admin
   Value: cname.vercel-dns.com
   ```
4. Wait for DNS propagation
5. Update Stripe webhook URL if needed

### Update Stripe Webhook URL

After domain is configured:
1. Stripe Dashboard → **Developers** → **Webhooks**
2. Edit your endpoint
3. Update **Endpoint URL** to: `https://www.yourdomain.com/api/billing/webhook`
4. **Save**

### Update Supabase Redirect URLs

1. Supabase Dashboard → **Authentication** → **URL Configuration**
2. Add your custom domains:
   ```
   https://yourdomain.com
   https://www.yourdomain.com
   https://admin.yourdomain.com
   ```
3. **Site URL:** `https://www.yourdomain.com`
4. **Save**

---

## Continuous Deployment

### Automatic Deployments

Vercel automatically deploys when you push to GitHub:

- **main branch** → Production deployment
- **other branches** → Preview deployments

### Manual Deployment

If needed to redeploy without code changes:

1. Vercel Dashboard → **Deployments**
2. Click **•••** on latest deployment → **Redeploy**
3. Select **Use existing Build Cache** (faster) or rebuild from scratch

### Environment Variable Updates

When you update environment variables:
1. **Redeploy** is required for changes to take effect
2. You can redeploy without code changes
3. Wait ~2 minutes for deployment to complete

---

## Rollback Strategy

If a deployment breaks production:

1. Vercel Dashboard → **Deployments**
2. Find the last working deployment
3. Click **•••** → **Promote to Production**
4. Previous URLs will redirect to the rolled-back version

---

## Deployment Checklist

### Pre-Deployment
- [ ] All environment variables documented
- [ ] Database migrations completed
- [ ] Stripe products configured
- [ ] Test mode payments working locally

### Main App
- [ ] Vercel project created
- [ ] Environment variables added
- [ ] Build succeeds
- [ ] Production URL accessible
- [ ] Authentication works
- [ ] Webhooks receive events (200 OK)
- [ ] Custom domain configured (optional)
- [ ] SSL certificate provisioned

### Admin Dashboard
- [ ] Separate Vercel project created
- [ ] Root directory set to `admin-dashboard`
- [ ] Node version fixed (20.x)
- [ ] Environment variables added
- [ ] Build succeeds
- [ ] Admin features work
- [ ] Subdomain configured (optional)

### Post-Deployment
- [ ] Test purchase flow end-to-end
- [ ] Ver ify webhook logs
- [ ] Check database for correct data
- [ ] Monitor error tracking (if configured)
- [ ] Update documentation with production URLs

---

## Common Deployment Issues

### Build Fails: "Module not found"

**Cause:** Missing dependency

**Solution:**
```bash
npm install [missing-package]
git add package.json package-lock.json
git commit -m "Add missing dependency"
git push
```

### Build Fails: Node version incompatible

**Cause:** Vercel using wrong Node version

**Solution:** Add `vercel.json` and `engines` in `package.json` (see Admin Dashboard section)

### Environment Variables Not Working

**Cause:** Not redeployed after adding variables

**Solution:** Redeploy the project

### Webhook 404 Error

**Cause:** Webhook handler file not deployed

**Solution:**
- Verify file exists: `src/routes/api/billing/webhook/+server.js`
- Check Vercel build logs
- Redeploy

### Functions Timeout (10s limit)

**Cause:** Vercel Hobby plan has 10s function limit

**Solution:**
- Optimize database queries
- Upgrade to Pro plan if needed
- Use edge functions for faster response

---

## Monitoring & Maintenance

### Check Deployment Health

1. **Vercel Dashboard** → **Analytics**
   - Monitor function invocations
   - Check error rates
   - View response times

2. **Stripe Dashboard** → **Webhooks**
   - Monitor delivery success rate
   - Review failed webhooks

3. **Supabase Dashboard** → **Logs**
   - Check for database errors
   - Monitor API usage

### Logs Access

**Vercel Function Logs:**
1. Deployments → Functions → Select function
2. View realtime logs

**Vercel Build Logs:**
1. Deployments → Click deployment → 

**Build Output**

---

**END OF DEPLOYMENT GUIDE**
