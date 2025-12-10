# Guia de Teste - Admin Dashboard

## ✅ Checklist Pré-Teste

### 1. Banco de Dados
- [ ] Executou `admin_schema.sql` no Supabase SQL Editor
- [ ] Criou usuário admin no Supabase Dashboard (Authentication > Users)
- [ ] Inseriu registro na tabela `super_admins` com o user_id

### 2. Configuração do Projeto
- [ ] Instalou dependências: `npm install`
- [ ] Criou arquivo `.env` com credenciais Supabase
- [ ] Verificou que as variáveis estão corretas

### 3. Variáveis de Ambiente (.env)
```env
VITE_SUPABASE_URL=https://seu-projeto.supabase.co
VITE_SUPABASE_ANON_KEY=sua-anon-key
SUPABASE_SERVICE_ROLE_KEY=sua-service-role-key
PUBLIC_APP_URL=http://localhost:5174
VITE_SESSION_TIMEOUT_MINUTES=30
```

---

## 🧪 Roteiro de Testes

### Teste 1: Login
1. Rode o projeto: `npm run dev`
2. Acesse: `http://localhost:5174`
3. Deve redirecionar para `/login`
4. Entre com email/senha do admin criado
5. ✅ Deve redirecionar para dashboard

**Possíveis erros:**
- "Acesso negado": Verifique se inseriu na tabela `super_admins`
- "Email ou senha incorretos": Verifique credenciais no Supabase

---

### Teste 2: Dashboard
1. Após login, deve ver:
   - ✅ Header com email e role
   - ✅ Menu de navegação
   - ✅ 4 cards de estatísticas (Assinaturas Ativas, MRR, Expirando, Novos)
   - ✅ Ações rápidas (3 botões)
   - ✅ Alertas (se houver assinaturas expirando)

**Verificar:**
- Os números estão corretos?
- MRR = Assinaturas Ativas × R$59,00?

---

### Teste 3: Assinaturas
1. Clique em "Gerenciar Assinaturas" ou menu "📋 Assinaturas"
2. Deve ver lista de todas as assinaturas

**Testar:**
- ✅ Busca por nome/email
- ✅ Filtro "Ativas"
- ✅ Filtro "Canceladas"
- ✅ Filtro "Expirando (7 dias)"

**Testar Estender:**
1. Clique em "➕ Estender" em uma assinatura ativa
2. Selecione período (1, 3, 6, 12 meses)
3. Preencha motivo (obrigatório)
4. Clique "Estender"
5. ✅ Deve mostrar nova data de expiração
6. ✅ Deve aparecer em "Notas" no card

**Testar Cancelar:**
1. Clique em "❌ Cancelar"
2. Confirme
3. ✅ Status deve mudar para "Cancelada"
4. ✅ Botão deve mudar para "✅ Reativar"

**Testar Reativar:**
1. Em assinatura cancelada, clique "✅ Reativar"
2. ✅ Status deve voltar para "Ativa"

---

### Teste 4: Usuários
1. Clique em menu "👥 Usuários"
2. Deve ver lista de empresas cadastradas

**Testar:**
- ✅ Busca por nome/email/documento
- ✅ Ver detalhes (cadastro, assinatura, bobina)

**Testar Reset de Senha:**
1. Clique "🔑 Reset Senha"
2. Confirme
3. ✅ Deve enviar email para o usuário
4. ✅ Verifique inbox do email (pode ir para spam)

---

### Teste 5: Logs
1. Clique em menu "📝 Logs"
2. Deve ver histórico de todas as ações

**Verificar:**
- ✅ Ações de estender assinatura aparecem
- ✅ Ações de cancelar/reativar aparecem
- ✅ Ações de reset de senha aparecem
- ✅ Data/hora corretas
- ✅ Email do admin correto
- ✅ Detalhes expandem ao clicar

**Testar Filtros:**
- Altere entre "Últimos 50", "100", "200"
- ✅ Deve carregar mais/menos logs

---

### Teste 6: Logout
1. Clique em "Sair" no header
2. ✅ Deve redirecionar para `/login`
3. Tente acessar `/` sem login
4. ✅ Deve redirecionar para `/login`

---

## 🐛 Troubleshooting

### Erro: "Supabase credentials missing"
**Solução:** Verifique arquivo `.env` e reinicie o servidor

### Erro: "Failed to fetch subscriptions"
**Solução:** 
1. Verifique RLS policies no Supabase
2. Confirme que `super_admins` tem registro do seu user_id

### Erro: "admin_extend_subscription function not found"
**Solução:** Execute `admin_schema.sql` novamente no Supabase

### Logs não aparecem
**Solução:** 
1. Faça alguma ação (estender, cancelar)
2. Atualize a página de logs
3. Verifique tabela `admin_activity_logs` no Supabase

### Reset de senha não envia email
**Solução:**
1. Verifique configuração de email no Supabase (Settings > Auth)
2. Confirme que email está confirmado no auth.users

---

## 📊 Dados de Teste

Se não tiver dados reais, crie alguns para testar:

### Criar Assinatura de Teste (SQL):
```sql
-- 1. Criar usuário de teste
INSERT INTO auth.users (email, encrypted_password)
VALUES ('teste@empresa.com', crypt('senha123', gen_salt('bf')));

-- 2. Pegar o user_id criado
SELECT id FROM auth.users WHERE email = 'teste@empresa.com';

-- 3. Criar perfil
INSERT INTO empresa_perfil (user_id, nome_exibicao, contato, documento, largura_bobina)
VALUES (
  'USER_ID_ACIMA',
  'Empresa Teste',
  'teste@empresa.com',
  '12.345.678/0001-90',
  '80mm'
);

-- 4. Criar assinatura
INSERT INTO subscriptions (user_id, status, current_period_end, stripe_customer_id, stripe_subscription_id)
VALUES (
  'USER_ID_ACIMA',
  'active',
  now() + interval '30 days',
  'cus_test_123',
  'sub_test_123'
);
```

---

## ✅ Checklist Final

Após todos os testes:
- [ ] Login funciona
- [ ] Dashboard mostra estatísticas corretas
- [ ] Pode estender assinaturas
- [ ] Pode cancelar/reativar assinaturas
- [ ] Pode resetar senhas
- [ ] Logs registram todas as ações
- [ ] Navegação funciona
- [ ] Logout funciona

**Tudo OK?** Pronto para Fase 3 (Analytics)! 🎉
