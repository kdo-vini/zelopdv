# DEV_SETUP.md — Zelo PDV

Guia de configuração do ambiente Linux de desenvolvimento para o projeto Zelo PDV.

---

## Stack do Projeto

| Camada | Tecnologia |
|---|---|
| Framework | SvelteKit 2 + Svelte 5 + Vite 6 |
| Admin Dashboard | SvelteKit 2 + Svelte 4 + Vite 5 (subdiretório `admin-dashboard/`) |
| Backend | Supabase (cloud) — auth, database, storage |
| Pagamentos | Stripe |
| Email | Resend |
| IA | OpenAI |
| Testes unitários | Vitest |
| Testes E2E | Playwright (Chromium) |
| CSS | Tailwind CSS 3 + PostCSS |
| PWA | @vite-pwa/sveltekit |
| Deploy | Vercel (`adapter-vercel`, runtime `nodejs20.x`) |
| Package manager | npm (usa `package-lock.json`) |

---

## Requisitos do Sistema

- **OS**: Ubuntu 24.04 / Zorin OS 18.x (base noble)
- **Node.js**: `20.x` (obrigatório — definido em `.nvmrc` e `engines.node`)
- **npm**: `10.x` (incluído com Node 20)
- **NVM**: para gerenciar versões Node

---

## Configuração Inicial (uma vez por máquina)

### 1. Pacotes de sistema (requer sudo)

```bash
sudo apt-get update && sudo apt-get install -y git build-essential
```

```bash
# Dependências de sistema do Playwright (Chromium headless)
cd /home/vinicius/code/zelopdv
npx playwright install-deps chromium
```

### 2. NVM + Node 20

NVM já instalado em `~/.nvm`. Se precisar reinstalar:

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
```

O `.bashrc` já contém:
```bash
unset npm_config_prefix   # evita conflito com Zed editor
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
```

Node 20 é o alias default do NVM:
```bash
nvm alias default 20   # já configurado
```

Para ativar em um terminal novo:
```bash
nvm use 20   # ou apenas abra um novo terminal (carregado pelo .bashrc)
```

### 3. Instalar dependências

```bash
# App principal
cd /home/vinicius/code/zelopdv
npm install

# Admin Dashboard
cd admin-dashboard
npm install
```

### 4. Playwright browsers

```bash
cd /home/vinicius/code/zelopdv
npx playwright install chromium
```

---

## Variáveis de Ambiente

Copie `.env` para o diretório raiz (já existe). Variáveis necessárias:

| Variável | Descrição |
|---|---|
| `SUPABASE_URL` | URL do projeto Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (backend only) |
| `VITE_PUBLIC_SUPABASE_URL` | URL pública (client-side) |
| `VITE_PUBLIC_SUPABASE_ANON_KEY` | Anon key pública (client-side) |
| `STRIPE_SECRET_KEY` | Secret key do Stripe |
| `STRIPE_WEBHOOK_SECRET` | Secret para verificar webhooks Stripe |
| `STRIPE_PRICE_ID_MONTHLY_59` | ID do price mensal |
| `STRIPE_BILLING_PORTAL_CONFIGURATION_ID` | Config ID do portal de billing |
| `VITE_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Publishable key (client-side) |
| `ABACATEPAY_API_KEY` | Chave privada da AbacatePay para Pix (backend only) |
| `ABACATEPAY_WEBHOOK_SECRET` | Secret enviado pela AbacatePay na query `webhookSecret` |
| `ABACATEPAY_BASE_URL` | Base da API AbacatePay, default `https://api.abacatepay.com/v2` |
| `OPENAI_API_KEY` | API key da OpenAI |
| `RESEND_API_KEY` | API key do Resend |
| `RESEND_FROM_EMAIL` | Email remetente |
| `PUBLIC_APP_URL` | URL pública do app |

Para testes E2E (não obrigatórias para dev normal):

| Variável | Descrição |
|---|---|
| `E2E_BASE_URL` | URL base dos testes (default: `http://localhost:5173`) |
| `E2E_TEST_EMAIL` | Email do usuário de teste no Supabase |
| `E2E_TEST_PASSWORD` | Senha do usuário de teste |

---

## Comandos de Desenvolvimento

### App principal (porta 5173)
```bash
cd /home/vinicius/code/zelopdv
npm run dev
```

### Admin Dashboard (porta 5174)
```bash
cd /home/vinicius/code/zelopdv/admin-dashboard
npm run dev
```

### Build de produção
```bash
npm run build
npm run preview   # preview local do build
```

### Testes
```bash
npm test                  # Vitest (unitários) — 17 suites, 105 testes
npm run test:e2e          # Playwright E2E (precisa de .env com vars E2E_*)
npm run test:e2e:ui       # Playwright com UI interativa
```

---

## Estado do Ambiente (após setup)

| Item | Status | Detalhe |
|---|---|---|
| Node.js | OK | v20.20.2 via NVM |
| npm | OK | v10.8.2 |
| NVM | OK | v0.40.3, default=20 |
| node_modules (main) | OK | 596 pacotes |
| node_modules (admin) | OK | 167 pacotes |
| Build | OK | `vite build` sem erros |
| Testes unitários | OK | 105/105 passando |
| Playwright (Chromium) | OK | browser baixado |
| git | PENDENTE | `sudo apt install git` |
| build-essential | PENDENTE | `sudo apt install build-essential` |
| Playwright system deps | PENDENTE | `npx playwright install-deps chromium` (requer sudo) |

---

## Vulnerabilidades npm

25 vulnerabilidades encontradas nas dependências dev (resultado de `npm audit`):

| Severidade | Quantidade | Pacotes notáveis |
|---|---|---|
| Critical | 1 | `jspdf` |
| High | 14 | `vite`, `rollup`, `@sveltejs/kit`, `xlsx`, `tar`, `lodash` |
| Moderate | 8 | `svelte`, `postcss`, `dompurify`, `@sveltejs/adapter-vercel` |
| Low | 2 | `cookie`, `qs` |

**Recomendação:** A maioria está em `devDependencies` de build. Não use `npm audit fix --force` sem testar — pode quebrar o build. Avalie caso a caso quando atualizar dependências.

---

## Avisos de Build (não-críticos)

1. **`src/routes/+layout.svelte:21`** — prop `params` exportada sem uso (refactor futuro)
2. **A11y warnings em `src/routes/app/+page.svelte`** — botões sem `aria-label`
3. **`resend` missing `@react-email/render`** — esperado; o projeto não usa React Email templates
4. **Glob pattern PWA workbox** — sem páginas pré-renderizadas (esperado para app SPA)

---

## Gargalos de Performance DX (Linux)

### Watchers do sistema de arquivos

SvelteKit/Vite usa inotify para hot-reload. No Linux, o limite padrão pode ser baixo para projetos grandes.

Verifique e aumente se necessário:
```bash
cat /proc/sys/fs/inotify/max_user_watches   # padrão: 8192

# Aumentar permanentemente:
echo fs.inotify.max_user_watches=524288 | sudo tee -a /etc/sysctl.conf
sudo sysctl -p
```

### Node.js memória heap

Para builds grandes com Vite + PWA workbox:
```bash
export NODE_OPTIONS="--max-old-space-size=4096"
```

Adicione ao `.bashrc` se encontrar `JavaScript heap out of memory`.

---

## Estrutura do Projeto

```
zelopdv/
├── src/                    # App principal SvelteKit
│   ├── routes/             # Páginas e API routes
│   │   ├── app/            # POS (PDV) — rota crítica
│   │   ├── api/            # Endpoints server-side
│   │   └── gestao/         # Área administrativa
│   ├── lib/                # Componentes e utilitários
│   └── hooks.server.js     # Middleware SSR
├── admin-dashboard/        # Dashboard admin (app Svelte separado)
├── tests/                  # Vitest — testes unitários
├── e2e/                    # Playwright — testes E2E
├── static/                 # Assets públicos
├── .nvmrc                  # Node version: 20
├── .env                    # Variáveis de ambiente (não commitado)
└── package.json            # engines.node: "20.x"
```

---

## Melhorias Futuras

- [ ] Criar `.env.example` com todas as variáveis (sem valores) para onboarding
- [ ] Adicionar `lint` script ao `package.json` (ESLint/Prettier não configurados)
- [ ] Criar `Makefile` com targets: `setup`, `dev`, `test`, `build`
- [ ] Considerar migração para `pnpm` (instala mais rápido, usa menos disco com hardlinks)
- [ ] Avaliar atualização de `jspdf` (vulnerabilidade crítica) quando compatível
- [ ] Adicionar `admin-dashboard` como workspace npm para gerenciar dependências unificadas
- [ ] Configurar `eslint.config.js` para SvelteKit (o projeto não tem linter configurado)

---

*Gerado em: 2026-05-21 | Node: v20.20.2 | npm: v10.8.2 | NVM: v0.40.3*
