# Documentação Técnica: Zelo PDV

Este documento descreve a arquitetura, as tecnologias e o funcionamento do sistema **Zelo PDV**.

## 🚀 Visão Geral
O Zelo PDV é um sistema de Ponto de Venda (PDV) e Gerenciamento (ERP) moderno, desenvolvido como uma Progressive Web App (PWA) para garantir agilidade no atendimento e suporte a operações offline.

---

## 🛠️ Stack Tecnológica

### Frontend
- **Framework:** [SvelteKit](https://kit.svelte.dev/) (usando Svelte 5).
- **Estilização:** [Tailwind CSS](https://tailwindcss.com/) para design responsivo e moderno.
- **PWA:** `@vite-pwa/sveltekit` para suporte a instalação e funcionamento offline.
- **Gerenciamento de Estado:** Svelte Stores (ex: `authStore.js`) e APIs nativas do Svelte 5.

### Backend & Infraestrutura
- **BaaS (Backend as a Service):** [Supabase](https://supabase.com/).
  - **Autenticação:** Gerenciamento de usuários e sessões.
  - **Banco de Dados:** PostgreSQL (acessado via cliente JS no frontend).
  - **Storage:** Armazenamento de imagens de produtos e logos.
  - **RLS (Row Level Security):** Proteção de dados a nível de banco.

### Pagamentos & Assinaturas
- **Provedor:** [Stripe](https://stripe.com/).
  - Gerenciamento de planos e assinaturas recorrentes.
  - Checkout integrado para novos usuários.

### Persistência Local (Offline)
- **Biblioteca:** [Dexie.js](https://dexie.org/) (Wrapper para IndexedDB).
  - Utilizado para armazenar dados de vendas e produtos localmente, permitindo que o PDV funcione mesmo sem internet e sincronize posteriormente.

---

## 📄 APIs do Sistema

O sistema utiliza duas abordagens para APIs:

### 1. APIs de Integração (Externas)
- **Supabase JS Client:** A maior parte da lógica de dados (CRUD de produtos, vendas, clientes) é feita diretamente do frontend para o Supabase, aproveitando a segurança do RLS.
- **Stripe API:** Utilizada para processar pagamentos e gerenciar o ciclo de vida das assinaturas.

### 2. APIs Internas (SvelteKit Server Routes)
Localizadas em `src/routes/api/`, essas rotas lidam com operações que exigem chaves secretas ou lógica de servidor:

- **`/api/billing/create-checkout-session`**: Cria sessões de pagamento do Stripe para assinatura do plano.
- **`/api/billing/create-portal-session`**: Gera links para o portal do cliente do Stripe (onde o usuário gerencia o cartão de crédito).
- **`/api/billing/webhook` / `/api/stripe/webhook`**: Recebe notificações do Stripe (ex: pagamento aprovado, assinatura cancelada) para atualizar o banco de dados no Supabase.

---

## 📂 Estrutura de Pastas Principal

- `/src/lib`:
  - `supabaseClient.js`: Configuração do cliente Supabase.
  - `offlineDb.js`: Configuração do banco local IndexedDB (Dexie).
  - `authStore.js`: Estado global de autenticação do usuário.
  - `components/`: Componentes reutilizáveis (UI, Managers, POS).
- `/src/routes/`:
  - `(root)`: Landing page e páginas institucionais.
  - `/app`: Rota do PDV principal.
  - `/admin`: Dashboard de gerenciamento (Produtos, Categorias, Relatórios).
  - `/api`: Endpoints de backend em Node.js.

---

## ⚙️ Fluxo de Funcionamento

1. **Autenticação:** O usuário faz login via Supabase. O `authStore` captura a sessão e verifica se a assinatura está ativa.
2. **Sincronização:** Ao abrir o PDV, o sistema busca os produtos do Supabase e os salva no `Dexie.js` (IndexedDB).
3. **Venda:** Durante a venda, os dados são registrados no banco local para velocidade. Assim que há conexão, os dados são enviados para a tabela `vendas` no Postgres (Supabase).
4. **Faturamento:** O acesso às funcionalidades premium é controlado pelo status da assinatura no Stripe, sincronizado via Webhooks para o perfil do usuário no Supabase.

---

## 📊 Relatórios e Exportação
- **PDF:** Gerado via `jsPDF` e `jspdf-autotable`.
- **Excel:** Exportação de planilhas via biblioteca `xlsx`.
