export default {
  async fetch(request, env) {
    const { pathname, search } = new URL(request.url);

    // 1. Rota de Teste de IP
    if (pathname === '/ip-check') {
      const ipRes = await fetch('https://ipv4.icanhazip.com');
      const ip = await ipRes.text();
      return new Response(JSON.stringify({ ip: ip.trim() }), { 
        headers: { 'Content-Type': 'application/json' } 
      });
    }

    // 2. Rota de Diagnóstico (Página inicial)
    if (pathname === '/' || pathname === '') {
      return new Response(JSON.stringify({ 
        status: "Online", 
        message: "Proxy do Zelo PDV funcionando!",
        instrucao: "Use /v3/... para chamadas de API ou /ip-check para ver o IP."
      }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 3. Montagem da URL do Asaas
    // IMPORTANTE: Use a variável ASAAS_BASE_URL do painel ou a fixa abaixo
    const baseUrl = env.ASAAS_BASE_URL || "https://api.asaas.com"; 
    const cleanPath = pathname.replace(/^\//, ''); 
    const asaasUrl = `${baseUrl}/${cleanPath}${search}`.replace('/api/v3', '/v3').replace('//', '/');

    try {
      const token = env.ASAAS_API_KEY ? env.ASAAS_API_KEY.trim() : "";
      
      // Capturamos o User-Agent que veio do nosso servidor para repassar ao Asaas
      const userAgent = request.headers.get('User-Agent') || 'ZeloPDV-Proxy';

      const asaasReq = new Request(asaasUrl, {
        method: request.method,
        headers: {
          'Content-Type': 'application/json',
          'access_token': token,
          'User-Agent': userAgent,
        },
        body: !['GET', 'HEAD', 'DELETE'].includes(request.method) ? request.body : undefined,
      });

      const res = await fetch(asaasReq);
      const text = await res.text();
      
      return new Response(text, { 
          status: res.status, 
          headers: { 
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*' // Permite chamadas de qualquer origem se necessário
          } 
      });
    } catch (err) {
      return new Response(JSON.stringify({ 
        error: 'Erro no Proxy Cloudflare', 
        details: err.message, 
        urlTentada: asaasUrl 
      }), { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  },
};
