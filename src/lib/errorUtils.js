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
        return 'A senha deve ter pelo menos 8 caracteres.';
    }
    if (msg.includes('weak password')) {
        return 'A senha é muito fraca. Tente uma combinação mais forte.';
    }
    if (msg.includes('new password should be different')) {
        return 'A nova senha deve ser diferente da senha anterior.';
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

    // Erros de banco (Supabase/Postgres)
    if (msg.includes('violates row-level security') || msg.includes('row-level security')) {
        return 'Sem permissão para realizar esta ação. Verifique suas credenciais.';
    }
    if (msg.includes('unique constraint') || msg.includes('duplicate key')) {
        return 'Este registro já existe. Verifique os dados e tente novamente.';
    }
    if (msg.includes('foreign key constraint') || msg.includes('violates foreign key')) {
        return 'Não é possível completar: há dados vinculados a este registro.';
    }
    if (msg.includes('not null constraint') || msg.includes('null value in column')) {
        return 'Um campo obrigatório não foi preenchido.';
    }

    // Erros de timeout
    if (msg.includes('timeout') || msg.includes('timed out') || msg.includes('aborted')) {
        return 'A operação demorou demais. Verifique sua conexão e tente novamente.';
    }

    // Erros de pagamento / Stripe
    if (msg.includes('card_declined') || msg.includes('card declined')) {
        return 'Cartão recusado. Verifique os dados ou tente outro cartão.';
    }
    if (msg.includes('expired_card')) {
        return 'Cartão expirado. Atualize os dados do seu cartão.';
    }
    if (msg.includes('insufficient_funds')) {
        return 'Saldo insuficiente no cartão. Tente outro meio de pagamento.';
    }
    if (msg.includes('processing_error') || msg.includes('payment_failed')) {
        return 'Erro ao processar pagamento. Tente novamente em instantes.';
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
