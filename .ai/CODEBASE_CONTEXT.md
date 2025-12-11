# ZELO PDV - Codebase Context & Technical Specification

**Version:** 1.0  
**Last Updated:** 2025-12-10  
**Purpose:** Complete technical reference for AI assistants and developers

---

## 1. PROJECT OVERVIEW

### 1.1 Stack
- **Framework:** SvelteKit (SSR + SPA)
- **Language:** JavaScript (Svelte components)
- **Styling:** Tailwind CSS + Custom CSS Variables
- **Database:** Supabase (PostgreSQL)
- **Auth:** Supabase Auth
- **Deployment:** Static export compatible

### 1.2 Architecture
```
src/
├── lib/
│   ├── supabaseClient.js       # Supabase singleton
│   ├── authStore.js            # Auth state management
│   ├── toastStore.js           # Toast notifications
│   └── components/             # Reusable components
├── routes/
│   ├── +layout.svelte          # Root layout (header, nav, auth)
│   ├── +page.svelte            # Landing page
│   ├── app/+page.svelte        # POS (Point of Sale)
│   ├── admin/                  # Admin pages
│   │   ├── +page.svelte        # Dashboard
│   │   ├── pessoas/            # People management
│   │   ├── fichario/           # Fiado (credit) management
│   │   ├── produtos/           # Product management
│   │   ├── estoque/            # Inventory
│   │   └── caixa/              # Cash register closing
│   ├── relatorios/             # Reports
│   ├── perfil/                 # User profile
│   └── login/                  # Authentication
├── themes/
│   ├── base.css                # Default blue/navy theme
│   └── christmas.css           # Seasonal Christmas theme
├── theme.css                   # Theme orchestrator
└── app.css                     # Global utilities + Tailwind

```

---

## 2. THEMING SYSTEM (CRITICAL)

### 2.1 Architecture
**MODULAR & RECYCLABLE** - Themes are isolated and toggleable.

#### File Structure:
1. **`src/theme.css`** - Orchestrator that imports themes
2. **`src/themes/base.css`** - Default production theme
3. **`src/themes/christmas.css`** - Seasonal theme (activated via `.christmas-theme` class)
4. **`src/app.css`** - Theme-agnostic utilities

### 2.2 CSS Variables (base.css)

```css
/* Backgrounds */
--bg-app: #0F172A;           /* Main app background (slate-900) */
--bg-panel: #1E293B;         /* Panels/cards (slate-800) */
--bg-sidebar: #1E293B;       /* Sidebar (slate-800) */
--bg-header: #0F172A;        /* Header (slate-900) */
--bg-card: #0b1220;          /* Card backgrounds (very dark blue) */
--bg-input: #0f172a;         /* Input fields (slate-900) */

/* Text */
--text-main: #F8FAFC;        /* Primary text - WHITE (slate-50) */
--text-muted: #94A3B8;       /* Secondary text (slate-400) */
--text-inverse: #0F172A;     /* Text on light backgrounds (slate-900) */
--text-label: #cbd5e1;       /* Form labels (slate-300) */

/* Actions */
--primary: #0EA5E9;          /* Primary buttons (sky-500) */
--primary-hover: #0284C7;    /* Primary hover (sky-600) */
--primary-text: #FFFFFF;     /* Text on primary buttons */

/* Accents */
--accent: #0EA5E9;           /* Links, highlights (sky-500) */
--accent-light: rgba(14, 165, 233, 0.1); /* Accent backgrounds */

/* Borders */
--border-subtle: #334155;    /* Subtle borders (slate-700) */
--border-strong: #475569;    /* Strong borders (slate-600) */
--border-card: #1f2937;      /* Card borders (gray-800) */

/* Status Colors */
--error: #ef4444;            /* Error text (red-500) */
--error-bg: #7f1d1d;         /* Error backgrounds (red-900) */
--error-light: #fecaca;      /* Error light (red-200) */
--success: #10b981;          /* Success (green-500) */
--success-bg: #064e3b;       /* Success bg (green-900) */
--success-light: #d1fae5;    /* Success light (green-100) */
--warning: #f59e0b;          /* Warning (amber-500) */

/* Links */
--link: #93c5fd;             /* Link color (blue-300) */
--link-hover: #60a5fa;       /* Link hover (blue-400) */

/* Sidebar */
--sidebar-item-active-bg: #FFFFFF;
--sidebar-item-active-text: #0F172A;
--sidebar-item-hover-bg: #334155;

/* Transitions */
--transition-fast: 200ms ease;
--transition-normal: 300ms ease;
```

### 2.3 Christmas Theme Overrides

**Activation:** Add `.christmas-theme` class to root `<div>` in `+layout.svelte`

**Color Palette:**
```css
--xmas-red: #D42426;
--xmas-dark-red: #8B0000;
--xmas-burgundy: #660000;
--xmas-green: #146B3A;
--xmas-dark-green: #0F4C29;
--xmas-gold: #D4AF37;
--xmas-light-gold: #F4E4C1;
--xmas-cream: #F5F5DC;
```

**Key Overrides:**
- `--bg-app`: Burgundy gradient with texture
- `--bg-panel`: Dark green (#0F4C29)
- `--bg-header`: Cream (#F5F5DC)
- `--text-main`: White (#F8FAFC)
- `--primary`: Green (#146B3A)
- `--accent`: Gold (#D4AF37)

### 2.4 Utility Classes (app.css)

```css
.bg-app-base       /* Uses var(--bg-app) + var(--text-main) */
.bg-sidebar-base   /* Uses var(--bg-sidebar) + var(--text-main) */
.bg-header-base    /* Uses var(--bg-header) + var(--text-main) */
.text-main         /* Uses var(--text-main) */
.text-muted        /* Uses var(--text-muted) */
.text-accent       /* Uses var(--accent) */
.btn-primary       /* Primary button styles */
.btn-secondary     /* Secondary button styles */
.input-form        /* Form input styles */
```

### 2.5 CRITICAL RULES

**❌ NEVER hardcode colors in components:**
```svelte
<!-- BAD -->
<div style="background: #0b1220; color: #e5e7eb">

<!-- GOOD -->
<div style="background: var(--bg-card); color: var(--text-label)">
```

**✅ ALWAYS use CSS variables:**
- For backgrounds: `var(--bg-card)`, `var(--bg-input)`, `var(--bg-panel)`
- For text: `var(--text-main)`, `var(--text-muted)`, `var(--text-label)`
- For borders: `var(--border-card)`, `var(--border-subtle)`
- For status: `var(--error)`, `var(--success)`, `var(--warning)`

**✅ Use utility classes when possible:**
```svelte
<div class="bg-app-base">  <!-- Better than inline styles -->
```

---

## 3. SUBSCRIPTION SYSTEM (STRIPE)

### 3.1 Architecture

**Payment Flow:**
1. User clicks "Assinar" → Opens Stripe checkout (Payment Link or programmatic)
2. User completes payment → Stripe sends webhook event
3. Webhook handler activates subscription in database
4. User gains access to protected routes

**Components:**
- **Frontend:** Subscription page (`/assinatura/+page.svelte`)
- **Backend:** Webhook handler (`/api/billing/webhook/+server.js`)
- **Database:** `subscriptions` table
- **Admin:** Subscription management panel (`admin-dashboard/`)

### 3.2 Database Schema

#### `subscriptions` Table
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
  last_modified_by uuid,
  last_modified_at timestamp with time zone
);

-- Indexes
CREATE INDEX idx_subscriptions_user_id ON public.subscriptions(user_id);
CREATE INDEX idx_subscriptions_stripe_customer_id ON public.subscriptions(stripe_customer_id);
```

**Note:** RLS is DISABLED for webhooks (uses service role key)

### 3.3 Webhook Handler

**File:** `src/routes/api/billing/webhook/+server.js`

**Handles Events:**
- `checkout.session.completed` - Activates subscription after payment
- `customer.subscription.created/updated` - Updates subscription details
- `customer.subscription.deleted` - Marks subscription as canceled
- `invoice.payment_succeeded` - Renews subscription
- `invoice.payment_failed` - Marks as past_due

**Key Features:**
- **Signature verification** for security
- **User lookup by email** (handles Payment Links without metadata)
- **Service role key** (`supabaseAdmin`) to bypass RLS
- **Manual update/insert** (no upsert due to missing UNIQUE constraint)

**Critical Code:**
```javascript
// Find user by email using Auth Admin API
const { data: authData } = await supabaseAdmin.auth.admin.listUsers();
const matchedUser = authData.users.find(u => u.email === customerEmail);

// Update or insert subscription
const { data: existingSub } = await supabaseAdmin
  .from('subscriptions')
  .select('id')
  .eq('user_id', userId)
  .maybeSingle();

if (existingSub) {
  // Update existing
  await supabaseAdmin.from('subscriptions').update(data).eq('id', existingSub.id);
} else {
  // Insert new
  await supabaseAdmin.from('subscriptions').insert(data);
}
```

### 3.4 Server-Side Supabase Client

**File:** `src/lib/server/supabaseAdmin.js`

```javascript
import { createClient } from '@supabase/supabase-js';
import { env } from '$env/dynamic/private';

const supabaseUrl = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
const supabaseServiceKey = env.SUPABASE_SERVICE_ROLE_KEY;

export const supabaseAdmin = (supabaseUrl && supabaseServiceKey) 
  ? createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })
  : null;
```

**Why needed:** Bypasses RLS to allow webhooks to write to database

### 3.5 Environment Variables

**Required for Webhooks:**
```env
# Vercel (Backend)
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJxxx...  # Service role, NOT anon key
STRIPE_SECRET_KEY=sk_live_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx

# Frontend
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJxxx...
STRIPE_PRICE_ID_MONTHLY_59=price_xxx
```

### 3.6 Access Control

**Protected Routes:** `/app`, `/admin/*`, `/relatorios`

**Guard Function:** `ensureActiveSubscription()` in `lib/guards.js`

```javascript
// Checks:
// 1. User is authenticated
// 2. Profile is complete (empresa_perfil)
// 3. Subscription exists and is active
// 4. Not expired (current_period_end OR manually_extended_until)

const isActive = sub.status === 'active' && 
  new Date(sub.manually_extended_until || sub.current_period_end) > now();
```

**Redirect Flow:**
- No auth → `/login`
- No profile → `/perfil?msg=complete`
- No subscription → `/assinatura?msg=expired`

---

## 4. DATABASE SCHEMA (Supabase)

### 3.1 Core Tables

#### `pessoas` (People/Customers)
```sql
id: uuid (PK)
nome: text (NOT NULL)
tipo: text ('cliente' | 'fornecedor')
contato: text
saldo_fiado: numeric (default 0)
created_at: timestamp
id_usuario: uuid (FK -> auth.users)
```

#### `produtos` (Products)
```sql
id: uuid (PK)
nome: text (NOT NULL)
preco: numeric (NOT NULL)
id_categoria: uuid (FK -> categorias)
id_subcategoria: uuid (FK -> subcategorias, nullable)
controla_estoque: boolean (default false)
estoque_atual: numeric (default 0)
estoque_minimo: numeric (default 0)
id_usuario: uuid (FK -> auth.users)
created_at: timestamp
```

#### `categorias` (Categories)
```sql
id: uuid (PK)
nome: text (NOT NULL)
ordem: integer
id_usuario: uuid (FK -> auth.users)
```

#### `subcategorias` (Subcategories)
```sql
id: uuid (PK)
nome: text (NOT NULL)
id_categoria: uuid (FK -> categorias)
ordem: integer
id_usuario: uuid (FK -> auth.users)
```

#### `caixas` (Cash Registers)
```sql
id: uuid (PK)
data_abertura: timestamp (NOT NULL)
data_fechamento: timestamp (nullable)
troco_inicial: numeric (default 0)
id_usuario: uuid (FK -> auth.users)
```

#### `vendas` (Sales)
```sql
id: uuid (PK)
valor_total: numeric (NOT NULL)
forma_pagamento: text ('dinheiro' | 'pix' | 'debito' | 'credito' | 'fiado' | 'multiplo')
id_caixa: uuid (FK -> caixas)
id_usuario: uuid (FK -> auth.users)
id_cliente: uuid (FK -> pessoas, nullable) -- CRITICAL for fiado
created_at: timestamp
```

#### `vendas_itens` (Sale Items)
```sql
id: uuid (PK)
id_venda: uuid (FK -> vendas)
id_produto: uuid (FK -> produtos, nullable)
nome_produto: text (for custom items)
quantidade: numeric (NOT NULL)
preco_unitario: numeric (NOT NULL)
subtotal: numeric (NOT NULL)
```

#### `vendas_pagamentos` (Sale Payments - for multiple payment methods)
```sql
id: uuid (PK)
id_venda: uuid (FK -> vendas)
id_usuario: uuid (FK -> auth.users)
forma_pagamento: text (NOT NULL)
valor: numeric (NOT NULL)
created_at: timestamp
```

#### `movimentacoes_caixa` (Cash Movements)
```sql
id: uuid (PK)
tipo: text ('sangria' | 'suprimento')
valor: numeric (NOT NULL)
motivo: text
id_caixa: uuid (FK -> caixas)
id_usuario: uuid (FK -> auth.users)
created_at: timestamp
```

### 3.2 CRITICAL Database Rules

**Fiado (Credit) Sales:**
- When `forma_pagamento = 'fiado'`, **MUST** set `id_cliente` in `vendas` table
- `id_cliente` references `pessoas.id`
- Updates `pessoas.saldo_fiado` (increases debt)

**Multiple Payments:**
- When `forma_pagamento = 'multiplo'`, create entries in `vendas_pagamentos`
- Each payment method gets a separate row with its value
- If one payment is 'fiado', ensure `id_cliente` is set in `vendas`

**Inventory Control:**
- Only products with `controla_estoque = true` affect `estoque_atual`
- On sale: `estoque_atual -= quantidade`
- Check `estoque_atual >= estoque_minimo` for alerts

### 3.3 RLS (Row Level Security)

All tables use RLS with policies:
```sql
-- Users can only see/modify their own data
auth.uid() = id_usuario
```

---

## 4. AUTHENTICATION & STATE

### 4.1 Supabase Client (`lib/supabaseClient.js`)

```javascript
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
export const hasSupabaseConfig = !!(supabaseUrl && supabaseAnonKey)
```

### 4.2 Auth Store (`lib/authStore.js`)

```javascript
import { writable } from 'svelte/store'

export const authReady = writable(false)
export const waitAuthReady = () => new Promise(resolve => {
  const unsubscribe = authReady.subscribe(ready => {
    if (ready) {
      unsubscribe()
      resolve()
    }
  })
})
```

### 4.3 Auth Flow (`+layout.svelte`)

1. **onMount:** Wait for `supabase.auth.onAuthStateChange`
2. **Check session:** `supabase.auth.getSession()`
3. **Verify subscription:** Check `subscriptions` table
4. **Verify profile:** Check `empresa_perfil` table
5. **Navigate:** Redirect based on auth state

**Protected Routes:** `/app`, `/admin/*`, `/relatorios`  
**Public Routes:** `/`, `/login`, `/cadastro`, `/landing`

---

## 5. KEY COMPONENTS

### 5.1 POS (Point of Sale) - `/app/+page.svelte`

**Layout:**
- **Column 1:** Categories sidebar (vertical)
- **Column 2:** Product grid (scrollable)
- **Column 3:** Comanda (order summary, fixed)

**Key Functions:**
```javascript
adicionarProduto(produto)      // Add product to cart
removerItem(index)             // Remove from cart
confirmarVenda()               // Process sale (single payment)
confirmarVendaMultipla()       // Process sale (multiple payments)
```

**Payment Methods:**
- `dinheiro` (cash)
- `pix`
- `debito` (debit card)
- `credito` (credit card)
- `fiado` (credit - requires `pessoaFiadoId`)
- `multiplo` (multiple methods)

**CRITICAL:** When payment is `fiado` or includes fiado in `multiplo`:
```javascript
// MUST set id_cliente
const vendaPayload = {
  valor_total: total,
  forma_pagamento: 'fiado',
  id_caixa: caixaAberto.id,
  id_usuario: userId,
  id_cliente: pessoaFiadoId  // REQUIRED
}
```

### 5.2 Fichário (Credit Management) - `/admin/fichario/+page.svelte`

**Features:**
- List people with fiado balance
- View purchase history
- Register payments
- Delete transactions

**Payment Registration:**
```javascript
// Updates pessoa.saldo_fiado
// Adds to caixa (cash register)
// Prints receipt
```

### 5.3 Dashboard - `/admin/+page.svelte`

**Displays:**
- Sales today (total, count, average ticket)
- Inventory health (critical items, ruptures)
- Cash register status (open/closed, hours)
- Recent activity
- Alerts

**Data Source:** RPC `dashboard_resumo()` or client-side fallback

---

## 6. STYLING CONVENTIONS

### 6.1 Component Structure

```svelte
<script>
  // Imports
  // State variables
  // Functions
  // Lifecycle (onMount)
</script>

<!-- Markup -->
<section class="wrap">
  <h1 class="pageTitle">Title</h1>
  <!-- Content -->
</section>

<style>
  /* Component-specific styles using CSS variables */
  .wrap { padding: 20px; max-width: 1100px; margin: 0 auto; }
  .card { background: var(--bg-card); border: 1px solid var(--border-card); }
</style>
```

### 6.2 Common Patterns

**Cards:**
```svelte
<div class="card">
  <h2 class="card-title">Title</h2>
  <!-- Content -->
</div>

<style>
  .card {
    background: var(--bg-card);
    border: 1px solid var(--border-card);
    border-radius: 12px;
    padding: 20px;
  }
  .card-title {
    color: var(--text-main);
    font-size: 18px;
    margin-bottom: 10px;
  }
</style>
```

**Buttons:**
```svelte
<button class="btn-primary">Save</button>
<button class="btn-secondary">Cancel</button>

<style>
  .btn-primary {
    background: var(--primary);
    color: white;
    border: none;
    padding: 10px 20px;
    border-radius: 8px;
  }
  .btn-secondary {
    background: transparent;
    color: var(--text-muted);
    border: 1px solid var(--border-card);
  }
</style>
```

**Forms:**
```svelte
<label>
  Name
  <input type="text" class="input-form" bind:value={name} />
</label>

<style>
  label {
    display: flex;
    flex-direction: column;
    color: var(--text-muted);
    font-size: 14px;
    margin-bottom: 12px;
  }
  input {
    margin-top: 6px;
    background: var(--bg-input);
    border: 1px solid var(--border-subtle);
    color: var(--text-main);
    padding: 10px;
    border-radius: 8px;
  }
</style>
```

---

## 7. TOAST NOTIFICATIONS

### 7.1 Usage

```javascript
import { addToast } from '$lib/toastStore'

addToast({
  message: 'Success message',
  type: 'success' // 'success' | 'error' | 'info'
})
```

### 7.2 Confirm Dialogs

```javascript
import { confirmAction } from '$lib/toastStore'

const confirmed = await confirmAction({
  title: 'Confirm Action',
  message: 'Are you sure?',
  confirmText: 'Yes',
  cancelText: 'No'
})

if (confirmed) {
  // Proceed
}
```

---

## 8. COMMON PITFALLS & SOLUTIONS

### 8.1 Fiado Sales Not Showing in History

**Problem:** `id_cliente` not set in `vendas` table  
**Solution:** Ensure schema has `id_cliente` column:
```sql
ALTER TABLE public.vendas
ADD COLUMN IF NOT EXISTS id_cliente uuid REFERENCES public.pessoas(id);

CREATE INDEX IF NOT EXISTS idx_vendas_id_cliente ON public.vendas(id_cliente);
```

### 8.2 Theme Not Applying

**Problem:** Hardcoded colors in components  
**Solution:** Replace all hex colors with CSS variables

### 8.3 Text Overflowing Cards

**Problem:** Fixed height + long text  
**Solution:** Use `min-h-*` + `break-words` + `overflow-hidden`

### 8.4 Christmas Theme Not Toggling

**Problem:** Class not applied to root element  
**Solution:** Check `+layout.svelte` has `class:christmas-theme={isChristmasMode}`

---

## 9. DEVELOPMENT WORKFLOW

### 9.1 Adding New Features

1. **Check theme variables** - Use existing CSS vars
2. **Follow component structure** - Script, markup, style
3. **Use Supabase client** - Import from `$lib/supabaseClient`
4. **Add RLS policies** - Ensure `auth.uid() = id_usuario`
5. **Test both themes** - Toggle Christmas mode

### 9.2 Modifying Styles

1. **Check if variable exists** - Look in `base.css`
2. **Add to both themes** - `base.css` AND `christmas.css`
3. **Use in component** - `var(--variable-name)`
4. **Never hardcode** - Always use variables

### 9.3 Database Changes

1. **Update schema** - Add columns/tables
2. **Add RLS policies** - Security first
3. **Update types** - If using TypeScript
4. **Test queries** - Verify RLS works

---

## 10. ENVIRONMENT VARIABLES

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

**Location:** `.env` (gitignored)

---

## 11. BUILD & DEPLOYMENT

```bash
# Development
npm run dev

# Build
npm run build

# Preview
npm run preview
```

**Output:** Static files in `build/` directory  
**Deployment:** Compatible with Vercel, Netlify, GitHub Pages

---

## 12. CRITICAL REMINDERS

1. **NEVER hardcode colors** - Always use CSS variables
2. **ALWAYS set `id_cliente`** for fiado sales
3. **ALWAYS use RLS** - Security is mandatory
4. **TEST both themes** - Base and Christmas
5. **USE toast notifications** - Better UX than alerts
6. **FOLLOW component structure** - Consistency matters
7. **CHECK auth state** - Use `waitAuthReady()`
8. **VALIDATE inputs** - Client and server side
9. **HANDLE errors gracefully** - Show user-friendly messages
10. **KEEP it modular** - Themes, components, utilities

---

**END OF CODEBASE CONTEXT**
