# Configurar Cron Job para Desativar Assinaturas Expiradas

## Opção 1: Supabase pg_cron (Recomendado)

### 1. Habilitar pg_cron no Supabase

1. Vá em **Database** → **Extensions**
2. Procure por `pg_cron`
3. Clique em **Enable**

### 2. Criar o Cron Job

Execute no SQL Editor:

```sql
-- Criar cron job que roda todo dia às 3h da manhã (UTC)
SELECT cron.schedule(
  'deactivate-expired-subscriptions',  -- Nome do job
  '0 3 * * *',                         -- Cron expression (3h UTC = 0h BRT)
  $$SELECT run_subscription_expiration_check()$$
);

-- Verificar se o job foi criado
SELECT * FROM cron.job;

-- Ver logs de execução
SELECT * FROM cron.job_run_details 
WHERE jobname = 'deactivate-expired-subscriptions'
ORDER BY start_time DESC
LIMIT 10;
```

### 3. Testar Manualmente

```sql
-- Executar manualmente para testar
SELECT * FROM deactivate_expired_subscriptions();

-- Ver logs
SELECT * FROM subscription_cron_logs
ORDER BY executed_at DESC
LIMIT 10;
```

---

## Opção 2: GitHub Actions (Alternativa)

Se não tiver acesso ao pg_cron, use GitHub Actions:

### 1. Criar `.github/workflows/deactivate-expired.yml`:

```yaml
name: Deactivate Expired Subscriptions

on:
  schedule:
    # Roda todo dia às 3h UTC (0h BRT)
    - cron: '0 3 * * *'
  workflow_dispatch: # Permite executar manualmente

jobs:
  deactivate:
    runs-on: ubuntu-latest
    steps:
      - name: Call Supabase Function
        run: |
          curl -X POST \
            '${{ secrets.SUPABASE_URL }}/rest/v1/rpc/run_subscription_expiration_check' \
            -H "apikey: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}" \
            -H "Authorization: Bearer ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}" \
            -H "Content-Type: application/json"
```

### 2. Adicionar Secrets no GitHub:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

---

## Opção 3: Executar Manualmente (Temporário)

Enquanto não configura o cron, execute manualmente no admin dashboard:

### Adicionar botão no Dashboard:

```javascript
// Em admin-dashboard/src/routes/+page.svelte
async function runExpirationCheck() {
  const { data, error } = await supabase.rpc('deactivate_expired_subscriptions')
  
  if (error) {
    alert('Erro: ' + error.message)
  } else {
    alert(`Desativadas: ${data[0].deactivated_count} assinaturas`)
    console.log('Usuários desativados:', data[0].deactivated_users)
  }
}
```

---

## Verificar Logs

```sql
-- Ver últimas execuções
SELECT 
  executed_at,
  deactivated_count,
  deactivated_users,
  error
FROM subscription_cron_logs
ORDER BY executed_at DESC
LIMIT 20;

-- Ver apenas erros
SELECT * FROM subscription_cron_logs
WHERE error IS NOT NULL
ORDER BY executed_at DESC;
```

---

## Desabilitar Cron Job (se necessário)

```sql
-- Listar jobs
SELECT * FROM cron.job;

-- Remover job
SELECT cron.unschedule('deactivate-expired-subscriptions');
```
