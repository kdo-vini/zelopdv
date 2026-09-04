# Confiabilidade do ecossistema — plano de execução

> **For agentic workers:** usar superpowers:subagent-driven-development ou superpowers:executing-plans; execução autorizada pelo pedido do usuário de 2026-09-04.

**Goal:** corrigir os achados remanescentes e publicar PDV, Chat, Menu e Printer com impressão única e versão verificável.

**Architecture:** Printer arbitra a impressão automática pelo owner, pedido canônico e finalidade. Git é a origem de cada artefato; Docker compila fonte limpa e identifica a revisão servida. Escritas de pedido/cupom preservam atomicidade e revisão no PostgreSQL.

**Tech Stack:** SvelteKit, React/Vite, Node 24, PostgreSQL/Supabase, .NET 8, Dokploy e Vercel.

**Spec:** `docs/audits/2026-09-04-integracao.md`, `docs/audits/2026-09-04-ecossistema.md` e `docs/INCIDENTS.md`; instrução atual prioriza pareamento simultâneo e elimina deploy antigo.

## Restrições

- Preservar commits e trabalho existente; nenhuma exclusão de dados de negócio.
- Usar o navegador Brave Pessoal indicado para Dokploy. Supabase CLI primeiro.
- Manter identidade visual e funcionamento financeiro; nenhuma mensagem a clientes.
- Segunda via é manual; resultado desconhecido nunca gera fallback automático.

## 1. Printer e consumidores

Arquivos: `src/lib/zeloImpressaoClient.js`, `src/lib/printService.js`, `src/routes/app/pedidos/+page.svelte`; SDK/hook Chat e dispatcher/config do repositório Printer.

Contrato: `intent: {mode:'automatic', orderId, purpose:'order_ticket'}` com `companyStoreId=owner_user_id`; manual usa `{mode:'manual'}` e jobId novo. Health anuncia `capabilities.canonicalAutoPrint`; cliente antigo continua manual. Cliente automático exige suporte antes do POST. Preferência inicial PDV, configurável no Printer; outro canal aguarda 1500 ms e pode assumir se preferido não chegar.

- [ ] Cobrir dois canais, inversão de chegada, owners distintos, conteúdo distinto, segunda via, falha segura e resposta perdida.
- [ ] Persistir reserva antes do spool; restart de reserva incompleta retorna resultado desconhecido; capacidade cheia não expulsa chaves vigentes.
- [ ] Alinhar o owner nos consumidores e testar que agente antigo não recebe impressão automática.
- [ ] Construir release/SDK/instalador; validar artefato e documentar limites físicos.

## 2. Menu e integridade de pedido

Arquivos: `server/cartSessions.ts` e serviços de entrega/cupons do Menu; migration forward-only no ledger PDV.

- [ ] Backup restrito dos patches; merge explícito de upstream preservando commit local; reconciliar stock já corrigido remotamente.
- [ ] Cupom e pedido na mesma transação; confirmação repetida recupera pedido antes de rejeitar revisão antiga.
- [ ] Atualizações de cotação usam revisão esperada e incremento; falha não sobrescreve atualização concorrente.
- [ ] Testar rollback, confirmação repetida, CAS concorrente e erros de transporte.
- [ ] Limitar caches/fanout/deadlines identificados e executar unit, check, build e E2E local.

## 3. Chat e publicação Docker

Arquivos: Dockerfiles, workflows, configuração Nginx, entrypoint server e schedulers Chat; Dockerfile/entrypoint Menu.

- [ ] Node suportado, compilação limpa, runtime sem ferramentas de desenvolvimento desnecessárias.
- [ ] Shutdown com bloqueio de novos ticks e drain limitado; concorrência com teto e sem sobreposição.
- [ ] Artefato expõe SHA de build; HTML revalida e assets com hash mantêm cache próprio.
- [ ] Inventariar domínios/serviços/volumes no Dokploy; remover rota concorrente somente quando comprovadamente legada.
- [ ] Publicar a revisão testada e comparar Git → deploy → versão HTTP de cada domínio.

## 4. PDV/admin e gates finais

Arquivos: manifests/locks dos dois apps, `src/routes/api/admin/billing/update-user-subscription/+server.js`, testes operacionais e workflow Linux.

- [ ] Atualizar adapter e dependências vulneráveis com verificação do export Excel e compatibilidade admin.
- [ ] Editor admin altera assinatura selecionada, confirma persistência e exige prazo explícito ao reativar acesso expirado.
- [ ] Executar unit/check/build; resolver build Windows ou obter build Linux íntegro sem chamar compilação parcial de sucesso.
- [ ] Atualizar relatórios/CURRENT/FIXES_PROGRESS/INCIDENTS com correções publicadas e limites verificáveis.

## Aceite de produção

Uma única rota ativa por domínio, versão HTTP correspondente à revisão testada, health saudável após rollout e nenhuma necessidade de copiar `dist` manualmente. Dois navegadores pareados permanecem autorizados; duas notificações do mesmo pedido produzem uma única submissão ao spool. O teste de spool não comprova saída física de papel.
