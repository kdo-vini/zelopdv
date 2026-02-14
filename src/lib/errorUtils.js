/**
 * Mapeia códigos e mensagens de erro do Supabase/Auth para mensagens amigáveis em português.
 * @param {Error|Object|string} error - O objeto de erro retornado pelo Supabase ou uma string.
 * @returns {string} Mensagem amigável para o usuário.
 */
export function getFriendlyErrorMessage(error) {
    if (!error) return 'Ocorreu um erro desconhecido.';

    // Se for string, tenta usar direto ou mapear
    let msg = typeof error === 'string' ? error : (error.message || error.error_description || '');

    if (!msg) return 'Ocorreu um erro inesperado.';

    msg = msg.toLowerCase();

    // Mapeamento de erros comuns do Supabase Auth
    if (msg.includes('invalid login credentials')) {
        return 'E-mail ou senha incorretos. Verifique e tente novamente.';
    }
    if (msg.includes('email not confirmed')) {
        return 'Seu e-mail ainda não foi confirmado. Verifique sua caixa de entrada.';
    }
    if (msg.includes('user not found')) {
        return 'Usuário não encontrado.';
    }
    if (msg.includes('already registered') || msg.includes('user already exists')) {
        return 'Este e-mail já está cadastrado. Tente fazer login.';
    }
    if (msg.includes('password should be at least')) {
        return 'A senha deve ter pelo menos 6 caracteres.';
    }
    if (msg.includes('weak password')) {
        return 'A senha é muito fraca. Tente uma combinação mais forte.';
    }
    if (msg.includes('rate limit') || msg.includes('too many requests')) {
        return 'Muitas tentativas. Aguarde alguns instantes antes de tentar novamente.';
    }
    if (msg.includes('captcha')) {
        return 'Erro na verificação de segurança (Captcha). Tente recarregar a página.';
    }

    // Erros de Rede / Fetch
    if (msg.includes('fetch') || msg.includes('network') || msg.includes('connection')) {
        return 'Erro de conexão. Verifique sua internet e tente novamente.';
    }

    // Fallback: retorna a mensagem original se não houver mapeamento específico, 
    // mas traduzindo prefixos comuns se possível.
    if (msg.startsWith('auth api error: ')) {
        return 'Erro de autenticação: ' + msg.replace('auth api error: ', '');
    }

    return error.message || msg; // Retorna original se não casar com nada
}

/**
 * Traduz status da assinatura do Stripe para português.
 * @param {string} status 
 * @returns {string}
 */
export function translateSubscriptionStatus(status) {
    const map = {
        'active': 'Ativa',
        'trialing': 'Período de Testes',
        'past_due': 'Pagamento Pendente',
        'canceled': 'Cancelada',
        'unpaid': 'Não Paga',
        'incomplete': 'Incompleta',
        'incomplete_expired': 'Expirada',
        'paused': 'Pausada'
    };
    return map[status] || status || 'Desconhecido';
}
