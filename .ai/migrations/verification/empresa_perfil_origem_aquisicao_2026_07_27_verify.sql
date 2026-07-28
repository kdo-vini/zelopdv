-- Verificação da migration empresa_perfil_origem_aquisicao_2026_07_27.
-- Rodar depois de aplicar. As duas primeiras conferem o schema; as outras são as
-- consultas de canal que a coluna existe para responder.

-- 1) Coluna e índice existem
select
  (select count(*) from information_schema.columns
    where table_schema = 'public'
      and table_name = 'empresa_perfil'
      and column_name = 'origem_aquisicao'
      and data_type = 'jsonb') as coluna_ok,
  (select count(*) from pg_indexes
    where schemaname = 'public'
      and indexname = 'empresa_perfil_origem_aquisicao_idx') as indice_ok;

-- 2) Cobertura: quantos perfis já têm origem gravada.
-- Logo após o deploy isso vai ser ~0 e sobe conforme entram cadastros novos.
select
  count(*)                                            as perfis_total,
  count(*) filter (where origem_aquisicao is not null) as com_origem,
  count(*) filter (where origem_aquisicao is null)     as sem_origem
from public.empresa_perfil;

-- 3) DE ONDE VEIO CADA VENDA PAGA.
-- Esta é a consulta principal. Um cliente pagante por linha, com o canal.
select
  p.user_id,
  p.nome_exibicao,
  s.status,
  s.plan_tier,
  s.monthly_value_cents / 100.0 as mensalidade,
  coalesce(
    case
      when p.origem_aquisicao ? 'gclid'      then 'google_ads'
      when p.origem_aquisicao ? 'fbclid'     then 'meta_ads'
      when p.origem_aquisicao ? 'utm_source' then p.origem_aquisicao ->> 'utm_source'
      when p.origem_aquisicao ? 'origem'     then p.origem_aquisicao ->> 'origem'
      when coalesce(p.origem_aquisicao ->> 'referrer', '') <> ''
        then split_part(p.origem_aquisicao ->> 'referrer', '/', 1)
      when p.origem_aquisicao is not null    then 'direto'
    end,
    case when r.id is not null then 'indicacao' else 'nao_registrado' end
  ) as canal,
  p.origem_aquisicao ->> 'landing'     as pagina_de_entrada,
  p.origem_aquisicao ->> 'captured_at' as primeiro_toque
from public.empresa_perfil p
join public.subscriptions s on s.user_id = p.user_id
left join public.referrals r
  on r.referred_user_id = p.user_id and r.status = 'converted'
where s.status = 'active'
order by primeiro_toque desc nulls last;

-- 4) Resumo por canal: a tabela que decide onde investir o próximo mês.
-- `nao_registrado` = conta anterior ao rastreamento. Esse número deve encolher com o
-- tempo; se não encolher, a captura não está funcionando.
with pagantes as (
  select
    coalesce(
      case
        when p.origem_aquisicao ? 'gclid'      then 'google_ads'
        when p.origem_aquisicao ? 'fbclid'     then 'meta_ads'
        when p.origem_aquisicao ? 'utm_source' then p.origem_aquisicao ->> 'utm_source'
        when p.origem_aquisicao ? 'origem'     then p.origem_aquisicao ->> 'origem'
        when coalesce(p.origem_aquisicao ->> 'referrer', '') <> ''
          then split_part(p.origem_aquisicao ->> 'referrer', '/', 1)
        when p.origem_aquisicao is not null    then 'direto'
      end,
      case when r.id is not null then 'indicacao' else 'nao_registrado' end
    ) as canal,
    s.monthly_value_cents
  from public.empresa_perfil p
  join public.subscriptions s on s.user_id = p.user_id
  left join public.referrals r
    on r.referred_empresa_id = p.user_id and r.status <> 'rejected'
  where s.status = 'active'
)
select
  canal,
  count(*)                                        as clientes,
  sum(coalesce(monthly_value_cents, 0)) / 100.0   as mrr
from pagantes
group by canal
order by mrr desc;

-- 5) Contas que cadastraram e nunca completaram o perfil.
-- A origem delas fica em auth.users, não em empresa_perfil. Mostra qual canal traz
-- gente que desiste antes de configurar.
select
  raw_user_meta_data -> 'acquisition' ->> 'utm_source' as utm_source,
  raw_user_meta_data -> 'acquisition' ->> 'referrer'   as referrer,
  count(*)                                             as contas
from auth.users u
where u.raw_user_meta_data ? 'acquisition'
  and not exists (select 1 from public.empresa_perfil p where p.user_id = u.id)
group by 1, 2
order by contas desc;
