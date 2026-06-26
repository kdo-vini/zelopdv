-- Adiciona status 'preparando' ao fluxo de cozinha
-- Novo fluxo: aberto → preparando → pronto → fechado
-- Contexto: pedidos zelomenu chegam como 'aberto'; cozinheiro move para 'preparando'
-- ao iniciar o preparo, e 'pronto' ao terminar.

ALTER TABLE pedidos
  DROP CONSTRAINT IF EXISTS pedidos_status_check;

ALTER TABLE pedidos
  ADD CONSTRAINT pedidos_status_check
  CHECK (status IN ('aberto', 'preparando', 'pronto', 'fechado'));
