# Processar a integração iFood em worker dedicado

O MVP do iFood usará um worker Node sempre ativo no Dokploy, implantado separadamente do ZeloPDV e do ZeloChat, com inbox e comandos duráveis no Supabase. Escolhemos esse desenho em vez de concentrar a integração em funções serverless da Vercel ou do Supabase porque pedidos têm SLA, webhook com entrega pelo menos uma vez, polling de reconciliação, presença e retentativas; o custo de operar um processo adicional é aceito para manter essa complexidade atrás de um único módulo e fora das telas do PDV.
