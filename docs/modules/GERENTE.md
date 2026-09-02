# Zelinho Gerente — contrato operacional

## Canais
- App: painel Zelinho → `POST /api/gerente/agent` (JWT, só dono).
- WhatsApp: ZeloChat (empresa interna em `zelochat_mode='manager'`) → `POST /api/gerente/channel`
  com header `X-Gerente-Channel-Key`. Telefone → owner via `gerente_phone_links`.

## Pareamento
1. Dono gera código em Gestão > Zelinho Gerente > Preferências (`POST /api/gerente/pair/start`).
2. Manda o código para o número do Zelinho (`GERENTE_WHATSAPP_NUMBER`).
3. `completePairing` vincula; um telefone por empresa e uma empresa por telefone.
4. Desvincular: botão na mesma tela (`DELETE /api/gerente/pair`).

## Ferramentas
Leitura: `buscar_produto`, `listar_categorias`, `estoque_produto`, `resumo_periodo`, `sinais_ativos`.
Escrita (com confirmação): `pausar_no_cardapio`, `ocultar_no_pdv`, `criar_categoria`, `criar_produto`, `alterar_preco`.
Desfazer: só pausa e ocultar.

## Envs
`GERENTE_AGENT_ENABLED`, `GERENTE_AGENT_MODEL`, `GERENTE_CHANNEL_INTERNAL_KEY`, `GERENTE_WHATSAPP_NUMBER`.

## Falhas
- Sem `OPENAI_API_KEY` ou kill switch: 503 no app; no WhatsApp o ZeloChat responde indisponibilidade.
- Assinatura inativa: canal responde `INACTIVE_REPLY` e não chama o modelo.
