INSERT INTO produtos (id, nome, unidade, estoque_minimo) VALUES
  ('P001', 'Produto 1', 'UN', 100),
  ('P002', 'Produto 2', 'UN', 50),
  ('P003', 'Produto 3', 'UN', 10)
ON CONFLICT (id) DO NOTHING;

INSERT INTO depositos (id, nome) VALUES
  ('D1', 'Matriz'),
  ('D2', 'Filial')
ON CONFLICT (id) DO NOTHING;

INSERT INTO usuarios (id, nome, api_key, perfil) VALUES
  ('ana',   'Ana (almoxarifado)', 'chave-ana',   'operador'),
  ('bruno', 'Bruno (compras)',    'chave-bruno', 'consulta')
ON CONFLICT (id) DO NOTHING;

INSERT INTO usuario_depositos (usuario_id, deposito_id) VALUES
  ('ana', 'D1'), ('ana', 'D2'),
  ('bruno', 'D1')
ON CONFLICT DO NOTHING;
