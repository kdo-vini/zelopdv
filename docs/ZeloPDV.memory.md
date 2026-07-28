# ZeloPDV.memory

- O catalogo canonico de precos esta em `src/lib/pricing.js`: ZeloMenu custa R$40 como add-on do ZeloPDV, e e incluido no ZeloChat/Pacote Gestao + Atendimento. O espelho do Admin precisa manter essa regra.

- O add-on `pedidos` (Pedidos + Cozinha) foi removido do codigo e do schema em 2026-07-28. ZeloMenu, ZeloChat e a copia `delivery-frontend` ja nao leem `has_pedidos_addon`; a view `user_entitlements` e as colunas legadas foram recriadas/removidas na migration de aposentadoria. O historico da flag financeira nao foi preservado por decisao do dono do produto.

- A assinatura do usuario `d5625be9` ficou em `bundle + Mesas` apos reconciliacao de billing em 2026-07-28: `has_acessos_addon=false`, `monthly_value_cents=22800`, sem `provider_subscription_id` ativo. Nao alterar historico de pagamentos nem emitir estorno sem nova evidencia.

- `source='mesa'` e o contrato comum do QR publico de mesa e do botao "Enviar pra cozinha" da comanda. QR chega sem `fulfillment.comandaItemId` e baixa estoque ao aceitar; item da comanda ja consumiu estoque, carrega esse campo e nao deve ser restaurado em cancelamento. Pedidos mesa nunca criam venda por `ensure_zelo_order_sale`/`close_zelo_order`; a venda e do fechamento da comanda.

- As chaves de permissao de subusuario `pedidos.*` (`pedidos.acessar`, `pedidos.cozinha`, `pedidos.receber`, `pedidos.cancelar`) ficam com o prefixo antigo de proposito: estao persistidas no JSON de `access_roles` e renomea-las apaga silenciosamente a permissao de quem ja esta cadastrado.

- `/app/pedidos` e `/app/pedidos/cozinha` leem **so** `zelo_orders` (motor canonico). No painel de cozinha o preparo conclui o pedido inteiro via `mark_ready`; nao existe estado por item.

- `subscriptions.monthly_value_cents` e nullable e guarda o valor mensal real em centavos; a coluna foi aplicada no Supabase real em 2026-07-24 apos o ZeloAdmin zerar consultas por coluna ausente. Linhas antigas ainda usam fallback por `plan_tier` no admin ate o backfill.

> Memória viva. Guardar só fatos confirmados e úteis para continuidade técnica.
> Atualizado em 2026-07-28.

- O app principal roda em SvelteKit 2 + Svelte 5 e usa `@sveltejs/adapter-vercel` com runtime Node 20.
- Existe um segundo app em `admin-dashboard/`, separado do app principal.
- O backend real do produto é Supabase; service role só existe em código server-side.
- `subscriptions` é a fonte de verdade de acesso/entitlement.
- Trial grátis local vencido usa status `trial_expired`; `past_due` é reservado para falha/atraso de pagamento.
- `billing_payments` registra o fluxo Pix da AbacatePay.
- A camada PDV-owned de publicação do ZeloMenu fica em `zelomenu_product_publications`, `zelomenu_modifier_groups` e `zelomenu_modifier_options`; o catálogo base continua em `produtos`/`categorias`, visibilidade online não usa `produtos.ocultar_no_pdv` e preço base não tem override no v1.
- A tela `/app/pedidos` é uma superfície operacional client-side: assina/poll `zelo_orders` e, para pedidos canônicos novos, envia um job `kitchen_order` de texto ao Zelo Impressão. O auto-print usa reconciliação de 15 minutos, dedupe persistente de 48 horas e preserva `zelo_order_items.modifiers` no bilhete.
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
