# Orquestração dos agentes do Design System

> Canal entre os agentes e o revisor, sem o dono como intermediário.
> Branch `claude/admiring-thompson-1jk0tr`. O revisor confere cada commit
> automaticamente (de hora em hora) e responde **neste arquivo**.

## Protocolo (obrigatório para os dois agentes)

1. Antes de começar cada tarefa e depois de cada push:
   `git pull --rebase origin claude/admiring-thompson-1jk0tr` e releia **a sua fila** abaixo.
2. Faça as tarefas da sua fila em ordem. Item com `[revisão]` vem antes dos demais.
3. Ao terminar um item: commit + push e, no mesmo commit, marque o item como
   `[entregue <hash curto do commit anterior ou "neste commit">]` e escreva uma linha em
   "Log" (o que fez, como provou o legado, o que ficou de fora).
4. Nunca apague nem reescreva itens: o revisor marca `[aprovado]` ou cria um item
   `[revisão]` novo com o que corrigir.
5. Pare e escreva `BLOQUEADO: <motivo>` no Log quando precisar de decisão do dono
   (mockup novo, regra de cobrança, `LIVE_SURFACES.brand`, Fase 6, vetores, `npm ci`
   na pasta principal, matar processo que não é seu). Depois siga para o próximo item
   não bloqueado.
6. Não edite a fila do outro agente nem os arquivos que ela reserva.
7. Fila vazia → escreva `FILA VAZIA` no Log e pare.

Regras de sempre: `docs/HANDOFF-conta-design-system.md` (regras do dono, verificação,
máquina de 4 CPUs, paridade do legado com `compare-screens`).

## Fila — Agente A (conta / telas internas)

Arquivos reservados: `src/routes/assinatura/**`, `src/routes/relatorios/**`,
`src/routes/gestao/{empresas,extensoes,indicacoes,gerente}/**`, `src/routes/gestao/acessos/**`.

- [ ] A1 `/gestao/empresas`
- [ ] A2 `/gestao/extensoes`
- [ ] A3 `/gestao/indicacoes`
- [ ] A4 Zelinho: `/gestao/gerente`, `/semana`, `/preferencias` (layout novo → mockup e BLOQUEADO)
- [ ] A5 Relatórios no celular: "Vendas do caixa" sem rolagem lateral (cartões, como Acessos)
- [ ] A6 Ajustes: (a) Assinatura, pacote selecionado branco com borda navy (mockup);
      (b) Assinatura, barra fixa do celular com o valor encostando no Continuar;
      (c) Acessos no celular, sem cartão dentro de cartão e selo de status na largura do texto

Não mexer em `/extensoes` nem `/indica/[codigo]` (públicas, dependem de `LIVE_SURFACES.brand`).

## Fila — Agente B (onboarding → revisão de celular)

Arquivos reservados: tudo o que não está reservado para o Agente A. Achou problema numa
tela do A → só anote no Log.

- [ ] B1 Revisão de celular 390×844 com `?tema=novo`: `/app` (carrinho, pagamento,
      sucesso, Abrir Caixa), `/app/mesas` + detalhe, `/app/pedidos`, `/app/pedidos/cozinha`,
      `/gestao`, `/gestao/{produtos,pessoas,estoque,despesas,fichario,mesas,caixa}`,
      `/perfil` (todas as abas), `/ferramentas/**`, `/cadastro`, `/login`. Procurar:
      sobreposição com a bottom nav, campo < 16px, alvo < 44px, rolagem lateral, texto
      cortado. Um commit por tela; tabela rota → problema → corrigido/anotado em
      `docs/DESIGN_SYSTEM.md`.
- [ ] B2 Coachmark no legado: no harness (`EMPTY=1`, sem `?tema=novo`) cadastrar o primeiro
      produto pelo cadastro rápido e ver se a dica aparece. Não corrigir; registrar o
      resultado em `docs/CODE_REVIEW.md`.

## Pendências do dono (os agentes não fazem)

- Vetores do mascote (favicon, PWA, OG, logos).
- `LIVE_SURFACES.brand = true` (inclui `/extensoes` e `/indica`).
- Capturas da landing com a UI nova (por último).
- Fase 6 (App padrão, remover legado) e PR.

## Log

- 2026-09-26 revisor: assinatura corrigida (51b157f); acessos (977d81c) e checklist
  (75ff6b6) aprovados. Filas A e B abertas.
