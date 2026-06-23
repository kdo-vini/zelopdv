# ZeloPDV.memory

> Memória viva. Guardar só fatos confirmados e úteis para continuidade técnica.
> Atualizado em 2026-06-23.

- O app principal roda em SvelteKit 2 + Svelte 5 e usa `@sveltejs/adapter-vercel` com runtime Node 20.
- Existe um segundo app em `admin-dashboard/`, separado do app principal.
- O backend real do produto é Supabase; service role só existe em código server-side.
- `subscriptions` é a fonte de verdade de acesso/entitlement.
- Trial grátis local vencido usa status `trial_expired`; `past_due` é reservado para falha/atraso de pagamento.
- `billing_payments` registra o fluxo Pix da AbacatePay.
- A camada PDV-owned de publicação do ZeloMenu fica em `zelomenu_product_publications`, `zelomenu_modifier_groups` e `zelomenu_modifier_options`; o catálogo base continua em `produtos`/`categorias`, visibilidade online não usa `produtos.ocultar_no_pdv` e preço base não tem override no v1.
- Em 2026-06-23, a migration de publicação do ZeloMenu foi aplicada no Supabase real como `zelomenu_publication_schema_2026_06_23`; verificado RLS ligado, policies por owner, grants mínimos para `authenticated`/`service_role`, nenhum grant para `anon`, constraints/FKs/índices presentes e acesso anônimo bloqueado por chave pública.
- `src/lib/pricing.js` é o catálogo canônico de planos, add-ons e Stripe price IDs.
- O fluxo offline do PDV é contingência, não offline-first completo.
- O replay offline depende de `client_sale_id` e da RPC `criar_venda_completa`.
- A fila offline Dexie está na versão 4 e guarda `ownerUserId` / `operatorUserId`.
- O onboarding usa Resend para email e ZeloChat interno para WhatsApp.
- O cadastro por senha auto-confirma o usuário via service role, grava sessão no cliente e envia o usuário para `/perfil?msg=complete`; não depende mais de confirmação por e-mail.
- PostHog roda somente em rotas publicas externas via `src/lib/posthogClient.js`; areas internas, onboarding (`/perfil`), billing (`/assinatura`) e callback OAuth ficam bloqueados.
- O purge final de conta agendada não está neste repo; a migration diz que roda em um sweeper do ZeloChat.
- O modelo de subusuário mistura duas camadas: contexto server-side/RLS por owner e gating fino de permissões majoritariamente no cliente.
- `AdminLock`/`pin_admin` hoje é barreira de UI no browser, não proteção forte de segredo.
- O admin dashboard usa anon key no browser e assume tabelas administrativas sem RLS.
- As migrations do projeto ficam em `.ai/migrations/`; não há `supabase/migrations/` versionado.
- A trilha documental principal agora é: `README.md` + docs operacionais na raiz + `pdvObsidian/HOME.md`.
- Em 2026-06-01, `npm test` voltou a 140/140 após alinhar fixtures ao contrato atual de perfil/CPF/telefone.
- Em produção, `subscriptions` usa `provider_customer_id`; o portal Stripe já foi alinhado para esse contrato.
