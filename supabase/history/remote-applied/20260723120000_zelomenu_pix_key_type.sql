-- ZeloMenu — tipo declarado da chave Pix (cpf/cnpj/phone/email/random).
-- A chave em si já existe em empresa_perfil.chave_pix (compartilhada com o
-- ZeloChat) — não mexemos nela. Sem esta coluna, uma chave de 11 dígitos
-- crus é ambígua entre cpf e celular; o merchant declara o tipo no admin do
-- ZeloMenu para montar o Pix Copia e Cola corretamente.
alter table public.empresa_perfil
  add column if not exists zelomenu_pix_key_type text;
comment on column public.empresa_perfil.zelomenu_pix_key_type is
  'ZeloMenu: tipo declarado da chave Pix em chave_pix (cpf|cnpj|phone|email|random). Usado para montar o BR Code do Pix Copia e Cola do pedido.';
