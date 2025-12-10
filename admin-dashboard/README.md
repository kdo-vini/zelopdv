# Zelo PDV - Super Admin Dashboard

Painel administrativo para gerenciar todas as assinaturas e usuários do Zelo PDV.

## 🚀 Setup

1. **Executar Schema SQL:**
   ```bash
   # Abra Supabase SQL Editor e execute:
   # .ai/admin_schema.sql
   ```

2. **Criar Primeiro Super Admin:**
   
   **Método Recomendado (via Dashboard):**
   
   a) Abra Supabase Dashboard → Authentication → Users
   
   b) Clique em "Add User"
   - Email: `admin@zelopdv.com.br` (ou seu email)
   - Password: Crie uma senha forte
   - Auto Confirm User: ✅ SIM
   
   c) Copie o `user_id` que aparece na lista de usuários
   
   d) Execute no SQL Editor:
   ```sql
   INSERT INTO super_admins (user_id, email, role, permissions)
   VALUES (
     'COLE_O_USER_ID_AQUI',
     'admin@zelopdv.com.br',
     'super_admin',
     '["view_dashboard", "manage_subscriptions", "manage_users"]'::jsonb
   );
   ```
   
   **Alternativa:** Veja `.ai/create_first_admin.sql` para outras opções

3. **Instalar Dependências:**
   ```bash
   cd admin-dashboard
   npm install
   ```

4. **Configurar .env:**
   - Copie `env.example.txt` para `.env`
   - Adicione credenciais Supabase
   
   **⚠️ IMPORTANTE:** Use a **Service Role Key** (não a Anon Key):
   ```env
   VITE_SUPABASE_URL=https://seu-projeto.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=sua-service-role-key-aqui
   PUBLIC_APP_URL=http://localhost:5174
   ```
   
   **Onde encontrar a Service Role Key:**
   - Supabase Dashboard → Settings → API
   - Copie a chave "service_role" (não a "anon"!)
   - ⚠️ **NUNCA** exponha essa chave no frontend!

5. **Rodar em Desenvolvimento:**
   ```bash
   npm run dev
   ```

## 🔐 Segurança

- ✅ Autenticação obrigatória
- ✅ RLS no banco de dados
- ✅ Logs de todas as ações
- ✅ Permissões granulares
- ✅ Session timeout (30 min)

## 📁 Estrutura

```
admin-dashboard/
├── src/
│   ├── lib/
│   │   ├── supabaseAdmin.js    # Cliente Supabase
│   │   ├── adminAuth.js        # Autenticação admin
│   │   └── logger.js           # Sistema de logs
│   ├── routes/
│   │   ├── +layout.svelte      # Layout global
│   │   ├── login/              # Login admin
│   │   ├── dashboard/          # Dashboard principal
│   │   ├── subscriptions/      # Gerenciar assinaturas
│   │   ├── users/              # Gerenciar usuários
│   │   ├── analytics/          # Analytics e relatórios
│   │   └── logs/               # Logs de atividade
│   └── app.css                 # Estilos globais
└── .env                        # Variáveis de ambiente
```

## 🌐 Deploy

Este projeto deve ser deployado em um subdomain separado:
- **URL:** `admin.zelopdv.com.br`
- **Plataforma:** Vercel/Netlify
- **DNS:** Configurar A record ou CNAME

## 📊 Funcionalidades

### Fase 1 (Atual)
- [x] Autenticação admin
- [x] Dashboard básico
- [x] Logs de atividade

### Fase 2
- [ ] Gerenciar assinaturas
- [ ] Estender períodos
- [ ] Cancelar/reativar

### Fase 3
- [ ] Gerenciar usuários
- [ ] Reset de senhas
- [ ] Ver atividade

### Fase 4
- [ ] Analytics (MRR, churn)
- [ ] Gráficos de receita
- [ ] Exportar relatórios

### Fase 5
- [ ] Enviar emails
- [ ] Campanhas automáticas
- [ ] Avisos de expiração
