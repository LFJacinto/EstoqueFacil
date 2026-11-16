-- EstoqueFácil — modelo de dados
-- Decisão central: o histórico de movimentações (livro-razão) é imutável e é a
-- fonte da verdade. A tabela `saldos` é um resumo atualizado na MESMA transação
-- de cada movimentação, para consultas rápidas.

CREATE TABLE IF NOT EXISTS produtos (
  id              TEXT PRIMARY KEY,
  nome            TEXT NOT NULL,
  unidade         TEXT NOT NULL DEFAULT 'UN',
  estoque_minimo  NUMERIC(14,3) NOT NULL DEFAULT 0 CHECK (estoque_minimo >= 0)
);

CREATE TABLE IF NOT EXISTS depositos (
  id    TEXT PRIMARY KEY,
  nome  TEXT NOT NULL
);

-- Usuários da API: chave de acesso, perfil e depósitos permitidos.
CREATE TABLE IF NOT EXISTS usuarios (
  id       TEXT PRIMARY KEY,
  nome     TEXT NOT NULL,
  api_key  TEXT NOT NULL UNIQUE,
  perfil   TEXT NOT NULL CHECK (perfil IN ('operador', 'consulta'))
);

CREATE TABLE IF NOT EXISTS usuario_depositos (
  usuario_id  TEXT NOT NULL REFERENCES usuarios(id),
  deposito_id TEXT NOT NULL REFERENCES depositos(id),
  PRIMARY KEY (usuario_id, deposito_id)
);

-- Livro-razão: cada linha é uma movimentação. Nunca é alterada nem apagada.
CREATE TABLE IF NOT EXISTS movimentacoes (
  id               BIGSERIAL PRIMARY KEY,
  produto_id       TEXT NOT NULL REFERENCES produtos(id),
  deposito_id      TEXT NOT NULL REFERENCES depositos(id),
  tipo             TEXT NOT NULL CHECK (tipo IN ('ENTRADA', 'SAIDA')),
  quantidade       NUMERIC(14,3) NOT NULL CHECK (quantidade > 0),
  custo_unitario   NUMERIC(14,4) NOT NULL CHECK (custo_unitario >= 0),
  saldo_apos       NUMERIC(14,3) NOT NULL CHECK (saldo_apos >= 0),
  usuario_id       TEXT NOT NULL REFERENCES usuarios(id),
  motivo           TEXT NOT NULL,
  transferencia_id TEXT,
  criada_em        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mov_produto_deposito
  ON movimentacoes (produto_id, deposito_id, id);

-- Rastreabilidade garantida pelo banco: UPDATE e DELETE são proibidos.
CREATE OR REPLACE FUNCTION impedir_alteracao_movimentacao() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'movimentacoes é imutável: registre uma nova movimentação de estorno';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_movimentacoes_imutavel ON movimentacoes;
CREATE TRIGGER trg_movimentacoes_imutavel
  BEFORE UPDATE OR DELETE ON movimentacoes
  FOR EACH ROW EXECUTE FUNCTION impedir_alteracao_movimentacao();

-- Saldo atual por produto e depósito (resumo do livro-razão).
CREATE TABLE IF NOT EXISTS saldos (
  produto_id   TEXT NOT NULL REFERENCES produtos(id),
  deposito_id  TEXT NOT NULL REFERENCES depositos(id),
  quantidade   NUMERIC(14,3) NOT NULL DEFAULT 0 CHECK (quantidade >= 0),
  custo_medio  NUMERIC(14,4) NOT NULL DEFAULT 0,
  PRIMARY KEY (produto_id, deposito_id)
);

-- Fila de alertas que não puderam ser enviados (reenvio posterior).
CREATE TABLE IF NOT EXISTS alertas_pendentes (
  id          BIGSERIAL PRIMARY KEY,
  produto_id  TEXT NOT NULL,
  deposito_id TEXT NOT NULL,
  mensagem    TEXT NOT NULL,
  erro        TEXT NOT NULL,
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT now()
);
