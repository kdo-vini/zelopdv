# Performance do ecossistema Zelo — 2026-09-04

> Medições históricas da primeira rodada. Os valores abaixo mantêm suas datas,
> máquinas e limitações originais; não descrevem as imagens atuais após rollout.
> O estado de correções/publicação está em [ecossistema](2026-09-04-ecossistema.md).

## Complemento após correções — 2026-09-05 UTC

Chat e Menu foram atualizados para Node 24 e executados em imagens Linux reais.
O Menu compila o servidor antes de montar o runtime. O Chat preserva o loader
ESM necessário e suas dependências de execução, roda sem root, limita filas e
deadlines e drena trabalhos antes de encerrar. Cache/fanout/paginação do Menu
e paginação completa do PDV foram corrigidos. As imagens, endpoints e bundles
foram conferidos contra o commit publicado; não foi atribuída melhoria de CPU
ou memória apenas à troca de tag ou ao nome da pasta /app.

Os dois builds PDV/admin passaram integralmente no Linux/GitHub e na Vercel.
O instalador Printer 0.2.0 foi gerado e publicado (78.488.107 bytes no artefato
distribuído), com smoke de instalação/desinstalação isolada. Logo, as antigas
pendências de Node 20, Docker indisponível, Inno ausente e build Linux não
validado foram superadas. EPERM de symlink continua sendo limitação local Windows.

Cadastro deixa de esperar analytics/referral para avançar após criar a sessão.
Não foi medido um novo INP de campo nem certificado que a espera de rede era
a causa da long task observada. A medição PostHog original continua válida
somente para seu recorte, sem alegação de ganho posterior.

## Histórico da primeira rodada

## Conclusão técnica

**A pasta `/app` do container não causa consumo de CPU ou RAM por si só.** No ZeloChat, o problema de carregamento comprovado foi o import estático do AppShell, que levava código de atendimento para landing/login. O patch lazy reduz o grafo inicial de JavaScript. Runtime web + workers no mesmo processo é um risco de contenção e de falha compartilhada; não houve evidência de saturação no instante inspecionado.

Nenhuma mudança de arquitetura, novo broker ou cache distribuído foi introduzido. Tempos de build medidos sob diferentes caches/concorrência não foram vendidos como ganhos. Não houve teste de carga em clientes reais.

## Medições e cobertura

| Produto / método | Evidência | Interpretação |
| --- | --- | --- |
| Chat, build local anterior | Entry 617,90 kB / gzip 175,43 kB | Importava AppShell imediatamente |
| Chat, build local com lazy | Entry 321,30 kB / gzip 97,24 kB; AppShell separado 296,68 kB / gzip 78,78 kB | Reduz entrada pública; usuários que abrem atendimento ainda precisam do módulo |
| Chat, grafo inicial incluindo preloads | 1.121.524 → 727.549 bytes (**−35,1%**); gzip 319.966 → 211.328 bytes (**−34,0%**) | Ganho estático medido; não é redução de RAM do servidor ou prova de LCP no aparelho |
| Chat, Dokploy 04/09 ~19:26 BRT | CPU 0,05%; memória 124,6 MiB; limite exibido 7,755 GiB | Snapshot sem pressão; não revela picos, event-loop delay ou heap retido |
| Chat, logs ~19:28–19:35 | queue_depth=0, queue_oldest_seconds=0, leases_stuck=0; container healthy há cinco horas | Não havia backlog na amostra. Houve erro CRM PGRST202 apesar do health verde |
| Host Dokploy, 22:51:56 UTC | CPU 5%; RAM 2,80/7,75GiB; disco 20,12/95,82GB; Docker20,11GB | Capacidade livre naquele instante; Docker total inclui todos serviços/imagens/volumes, não é tamanho da imagem Chat |
| Chat, deploys Dokploy | Entradas recentes 2–3 s, uma 32 s; várias mudanças documentais | Não equivale a build frio nem prova que imagens grandes deixaram de ser problema |
| Imagens publicadas, Dokploy 22:56–22:57UTC | Chat backend **686MB**, frontend nginx **82,5MB**; Menu **667MB** | Campo Size do Docker remoto; não bytes comprimidos transferidos ou RAM. Sem comparação pós-patch/deploy |
| PDV, build antes/depois funcional | Client 29,77→22,66 s; SSR/fase combinada exibida 50,62→48,95 s | Ambos terminam EPERM no adapter. Sem ganho atribuído: caches e carga variaram |
| PDV, entrada client | app 23,65→23,73 kB, gzip 6,83 kB | Entrada SvelteKit não é o download total de cada rota |
| Menu, build antes/depois | 15,24→16,64 s; Settings ~253 kB, entry ~242 kB, Supabase ~212 kB | Sem aceleração de build; chunking de páginas já existia |
| Menu, última rodada após patch de fotos | Build 7,72 s, unit 466 passes, E2E 40 passes / 4 skips | Cache/workstation diferentes; não atribuir redução de build ao patch de fotos |
| Menu, contexto Docker | `.dockerignore` novo exclui node_modules (~196 MiB), dist (~7 MiB) e arquivos locais sensíveis | Redução potencial de contexto; efeito sobre imagem pós-patch não medido. Publicada atual tem 667 MB |
| Printer, HTTP real local | 500 GETs após aquecimento, p50 3,17 ms / p95 3,56 ms / máximo 7,46 ms | Harness self-contained .NET 8.0.27; não mede spooler físico |
| Printer, WMI | Primeira enumeração 237,9 ms; seguintes 74,4–76,1 ms | Custo local concreto; cache exige preservar hot-plug e dispositivo selecionado |
| Printer, memória/CPU | Harness 104,1 MiB RSS, heap 6,40 MiB; 0 ms CPU em janela idle de 3 s | Não é perfil do tray durante turno ou comparação antes/depois |
| Printer, distribuição | Executável self-contained ~79,2 MiB; build aquecido 1,31 s | Instalador não gerado: Inno ausente; não comparar com build frio de 6,16 s |

Fontes locais detalhadas: relatórios individuais, logs de build e benchmark nativo. Runtime local Node 24.16.0/npm 11.17; Chat/Menu ainda possuem imagens Node 20 e CI com versões diferentes. Node 20 está fora de suporte segundo a [tabela oficial do Node](https://nodejs.org/en/about/previous-releases). A migração da imagem precisa de smoke Linux/Alpine; trocar a tag sem container executável não foi considerado validação.

## PostHog real, no navegador do usuário

Consulta em [Web analytics do ZeloPDV](https://us.posthog.com/project/470628/web), filtro últimos 14 dias, todos os domínios e contas de teste **não excluídas**: 43 visitantes, 114 pageviews, 55 sessões, duração 2m50s e bounce 16%. Houve 37 visitantes mobile e oito desktop; grupos podem sobrepor pessoas. Tracking foi corrigido recentemente, portanto comparação com período anterior zero não demonstra crescimento.

Em [Web Vitals](https://us.posthog.com/project/470628/web/web-vitals), percentil p90: cartões do **último dia** mostravam INP 8 ms, LCP 3,52 s, FCP 1,28 s e nenhum dado de CLS. O breakdown por caminho do recorte indicava INP `/precificacao` 104 ms, `/` 205 ms e `/cadastro` **6,48 s**. São agregações diferentes; não devem ser misturadas. O número de amostras por métrica não foi extraído. Cadastro teve apenas sete visitantes no painel web: exige investigar gravação de performance/long task antes de generalizar.

Painel de erros não tinha eventos correspondentes no recorte; uma rage click apareceu na landing. Isso não comprova ausência de bugs: `posthogClient.js` bloqueia rotas internas `/app`, `/gestao`, `/relatorios`, `/perfil` e `/assinatura`, e gravações de sessão estão desabilitadas no cliente. Analytics disponível não mede a experiência operacional do caixa. Nenhuma coleta invasiva foi ligada nesta auditoria.

## Gargalos prováveis e decisões aceitáveis

### ZeloChat

- **Comprovado:** payload público desnecessário do AppShell; corrigido com boundary lazy e loading acessível.
- **Já corrigido upstream:** polling fixo agressivo de workers; `8db55c9` e sucessores introduzem polling adaptativo/wake, concorrência configurável validada como finita/positiva e ticks sem sobreposição. Não há teto máximo geral comprovado. A base local estava 47 commits atrás; foi atualizada por fast-forward a `e6c7ca4` preservando patches. Não se atribui essa otimização preexistente à auditoria.
- **Risco provável:** servidor e workers compartilham processo; parse grande ou trabalho CPU-bound afeta HTTP/websocket. Separar workers pode ser útil ao escalar, mas não há perfil que justifique um redesenho agora. Driver de impressão roda no Printer do PC, não neste processo.
- **Risco provável:** ferramentas de desenvolvimento no runtime e execução TS por tsx aumentam superfície/imagem/start. Daemon Docker indisponível impediu comparar build/cold start locais; imagem publicada foi consultada no Dokploy: 686 MB.
- **Aceitável:** `/app` é WORKDIR do container e `/app/*` é rota React; fonte está em `src/` e `server/`. Monólito modular com filas persistentes é uma escolha aceitável; nome da pasta não é diagnóstico de performance.

### ZeloMenu

- Materialização repete consultas de catálogo/settings; `loadCatalogFromDb` consulta settings e `getConfig` pode carregar novamente. Próximo passo é medir/evitar repetição por requisição, antes de cache global novo.
- Maps por empresa e caches com TTL não têm todos limite de cardinalidade/remoção de chaves frias. Risco de crescimento existe; vazamento de heap não foi demonstrado.
- Push usa polling e fanout amplo, com até 5.000 linhas e sem claim entre réplicas. Timeout agora limita cada transporte, mas concorrência e envio duplicado continuam riscos.
- Limites de consulta sem paginação podem truncar diretório/métricas. Carga real acima do teto não foi reproduzida.
- Delivery já tem deadline, circuit breaker, L1/L2 e dedupe em voo; remover essas proteções para aparentar rapidez seria regressão. Limite de provedor precisa de coordenação se houver réplicas.

### ZeloPDV e banco compartilhado

Catálogo offline justifica snapshot local, desde que escopado por owner. Cache Workbox de APIs autenticadas foi removido por segurança; isso pode aumentar consultas antes servidas incorretamente do cache. Cache explícito e TTL de listas vazias permanecem.

Estatísticas live acumuladas: `zelochat_messages` ~70.294 tuplas; `vendas_itens` ~36.164; `vendas` ~16.326; `webhook_events_raw` ~11.884. `outbound_jobs` tinha ~2.872.762 index scans, `sessions` ~1.224.764 e `order_outbox` 274 seq scans/zero index scans. Esses contadores não têm denominador de tempo neste relatório e não provam query lenta nem necessidade de índice.

Advisors de performance: 67 FKs sem índice, 87 índices sem uso no período estatístico, seis índices duplicados, 15 policies permissivas múltiplas, três initplans RLS e uma tabela sem PK. Cada item requer workload, plano e frequência antes de DDL. Nenhum índice foi apagado por estar marcado unused.

### ZeloPrinter

Fila agora serializa spool com máximo de 16 pendentes e cache limitado a 1.000 intents/uma hora. Isso limita memória/contenção; não cancela um driver travado nem torna impressão física exactly-once. WMI é o custo mensurável; isolar driver em processo separado só se justifica após demonstrar hangs reais. Logging passou a ter rotação e limite.

## Plano de medição antes de escalar

1. Reproduzir INP do cadastro em Android modesto, coletando interação responsável, long tasks, CPU e número de amostras; separar tempo de rede conta→perfil.
2. Instrumentar duração dos handlers, event-loop delay, heap/RSS, queue age, retries e external-call latency por operação e versão, sem conteúdo de mensagens ou credenciais.
3. Em staging, medir Menu→confirmação→PDV e Chat→pedido com 1/5/20 clientes concorrentes e faults controlados; usar EXPLAIN em queries realmente lentas.
4. Medir cold/warm build, imagem comprimida/descomprimida antes/depois, boot→health e rollout Node suportado no mesmo host e dataset. Size remoto atual 686 MB/667 MB não informa custo de download nem quanto seria removido pelo pruning.
5. Homologar térmica USB/rede com falta de papel, desconexão e resposta perdida. Medir tempo até spool e papel separadamente.

Continuam não medidos: throughput máximo, p95/p99 de APIs em produção, perfil de heap de longa duração, event-loop delay, custo de cada provedor, restart sob carga e benchmark de SQL com dados isolados. A auditoria não os substitui por números de testes unitários.
