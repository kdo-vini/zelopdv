# 📋 Sugestões de Melhoria - Zelo PDV

> Documento centralizado de melhorias identificadas para implementação gradual.
> Última atualização: 16/01/2026

---

## 🎯 Legenda de Prioridade

- 🔴 **Alta** - Implementar assim que possível
- 🟡 **Média** - Próximo ciclo de desenvolvimento
- 🟢 **Baixa** - Quando houver disponibilidade

## ✅ Status

- `[ ]` Pendente
- `[/]` Em progresso
- `[x]` Concluído

---

## 1. 📱 Experiência do Usuário (UX)

| # | Prioridade | Sugestão | Status |
|---|------------|----------|--------|
| 1.1 | 🔴 Alta | **Modo Offline (PWA)** - Permitir operações básicas offline com sincronização automática | `[ ]` |
| 1.2 | 🔴 Alta | **Atalhos de teclado avançados** - Numpad shortcuts (Enter confirmar, Escape cancelar, F1-F4 formas de pagamento) | `[ ]` |
| 1.3 | 🟡 Média | **Busca por código de barras** - Leitura via câmera ou scanner USB | `[ ]` |
| 1.4 | 🟡 Média | **Histórico de vendas recentes no PDV** - Últimas 5 vendas visíveis para correções rápidas | `[ ]` |
| 1.5 | 🟢 Baixa | **Som de feedback** - Bip ao adicionar item (configurável) | `[ ]` |

---

## 2. 📊 Relatórios e Analytics

| # | Prioridade | Sugestão | Status |
|---|------------|----------|--------|
| 2.1 | 🔴 Alta | **Gráficos visuais** - Chart.js para vendas diárias (linha/barra). Série diária já existe como tabela | `[ ]` |
| 2.2 | 🔴 Alta | **Comparativo de períodos** - "Este mês vs anterior", "Esta semana vs semana passada" | `[ ]` |
| 2.3 | 🟡 Média | **Margem de lucro** - Campo de custo em produtos + cálculo automático de margem | `[ ]` |
| 2.4 | 🟡 Média | **Horário de pico** - Análise de quais horas do dia vendem mais | `[ ]` |
| 2.5 | 🟢 Baixa | **Exportação PDF** - Relatório formatado para impressão/contabilidade | `[ ]` |

---

## 3. 💾 Performance e Arquitetura

| # | Prioridade | Sugestão | Status |
|---|------------|----------|--------|
| 3.1 | 🔴 Alta | **Paginação virtual** - Lazy loading para listas grandes de produtos | `[/]` |
| 3.2 | 🔴 Alta | **Componentização do PDV** - Extrair modais (pagamento, fiado, movimentação) para arquivos separados. O `app/+page.svelte` tem 1756 linhas | `[/]` |
| 3.3 | 🟡 Média | **Real-time updates** - Supabase subscriptions para sincronizar estoque entre dispositivos | `[ ]` |
| 3.4 | 🟡 Média | **Aumentar TTL do cache** - Categorias mudam pouco, cache pode ser maior que 5 min | `[ ]` |
| 3.5 | 🟢 Baixa | **Skeleton loaders** - Trocar "Carregando..." por skeletons animados | `[ ]` |

---

## 4. 📦 Funcionalidades de Negócio

| # | Prioridade | Sugestão | Status |
|---|------------|----------|--------|
| 4.1 | 🔴 Alta | **Alertas de estoque (WhatsApp/Email)** - Notificar quando produto atingir estoque mínimo | `[ ]` |
| 4.2 | 🔴 Alta | **Vendas por peso** - Suporte a produtos por kg com integração de balança | `[ ]` |
| 4.3 | 🟡 Média | **Promoções e descontos** - Criar promoções automáticas (leve 3 pague 2) | `[ ]` |
| 4.4 | 🟡 Média | **Clientes cadastrados** - Cadastro com histórico de compras (além do fiado) | `[ ]` |
| 4.5 | 🟡 Média | **Multi-filiais** - Gerenciar vários pontos de venda na mesma conta | `[ ]` |
| 4.6 | 🟢 Baixa | **Combos de produtos** - Cadastrar combos com preço especial | `[ ]` |

---

## 5. 🔒 Segurança e Confiabilidade

| # | Prioridade | Sugestão | Status |
|---|------------|----------|--------|
| 5.1 | 🔴 Alta | **Backup automático** - Exportar dados periodicamente para email do cliente | `[ ]` |
| 5.2 | 🔴 Alta | **Log de auditoria** - Registrar quem editou/excluiu produtos e vendas | `[ ]` |
| 5.3 | 🟡 Média | **Níveis de permissão** - Operador só vende, admin edita produtos | `[ ]` |
| 5.4 | 🟡 Média | **2FA no login** - Autenticação em dois fatores opcional | `[ ]` |
| 5.5 | 🟢 Baixa | **Sessão com timeout** - Deslogar após X minutos de inatividade | `[ ]` |

---

## 6. 🎨 Interface e Design

| # | Prioridade | Sugestão | Status |
|---|------------|----------|--------|
| 6.1 | 🟡 Média | **Temas personalizáveis** - Cliente escolhe cor principal do sistema | `[ ]` |
| 6.2 | 🟡 Média | **Foto de produto** - Exibir imagem do produto no PDV para visual scanning | `[ ]` |
| 6.3 | 🟢 Baixa | **Onboarding interativo** - Tour guiado para novos usuários | `[ ]` |
| 6.4 | 🟢 Baixa | **Impressão personalizada** - Logo da empresa no recibo | `[ ]` |

---

## 7. 🧪 Qualidade de Código

| # | Prioridade | Sugestão | Status |
|---|------------|----------|--------|
| 7.1 | 🟡 Média | **Mais testes unitários** - Cobertura para `pdvCache.js` e lógica de comanda | `[ ]` |
| 7.2 | 🟡 Média | **Migração para TypeScript** - Gradual, Svelte 4 suporta bem | `[ ]` |
| 7.3 | 🟢 Baixa | **Documentação de API** - Documentar endpoints em `/api` | `[ ]` |

---

## 📝 Notas de Implementação

### Item 3.1 - Paginação Virtual
- Considerar `svelte-virtual-list` ou implementação customizada
- Foco inicial: grid de produtos no PDV
- Meta: renderizar apenas itens visíveis + buffer

### Item 3.2 - Componentização do PDV
Modais a extrair de `app/+page.svelte`:
1. `ModalPagamento.svelte` - Fluxo de finalização de venda
2. `ModalFiado.svelte` - Gestão de vendas a prazo
3. `ModalQuantidade.svelte` - Input de quantidade para itens unitários
4. `ModalMovCaixa.svelte` - Sangria e suprimento
5. `ModalAbrirCaixa.svelte` - Abertura de caixa
6. `ModalFecharCaixa.svelte` - Fechamento de caixa

### Item 2.1 - Gráficos
- Usar Chart.js ou lightweight alternatives (uPlot, Frappe Charts)
- Integrar na página de relatórios existente
- Tipos: linha (vendas diárias), barras (comparativo), pizza (formas de pagamento)

---

## 🔄 Histórico de Mudanças

| Data | Mudança |
|------|---------|
| 16/01/2026 | Documento criado com análise inicial do codebase |
