import pg from 'pg';
import type {
  Deposito, Movimentacao, NovaMovimentacao, Produto, Saldo, SaldoDetalhado, Usuario,
} from '../dominio/tipos.ts';
import type { AlertaPendente, RepositorioEstoque, UnidadeDeTrabalho } from './repositorio-estoque.ts';

pg.types.setTypeParser(1700, (v) => Number(v));

type Executor = Pick<pg.PoolClient, 'query'>;

const paraMovimentacao = (r: any): Movimentacao => ({
  id: Number(r.id),
  produtoId: r.produto_id,
  depositoId: r.deposito_id,
  tipo: r.tipo,
  quantidade: r.quantidade,
  custoUnitario: r.custo_unitario,
  saldoApos: r.saldo_apos,
  usuarioId: r.usuario_id,
  motivo: r.motivo,
  transferenciaId: r.transferencia_id,
  criadaEm: new Date(r.criada_em),
});

class UnidadePostgres implements UnidadeDeTrabalho {
  constructor(private readonly db: Executor) {}

  async bloquearSaldo(produtoId: string, depositoId: string): Promise<Saldo> {
    await this.db.query(
      `INSERT INTO saldos (produto_id, deposito_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [produtoId, depositoId],
    );
    const { rows } = await this.db.query(
      `SELECT quantidade, custo_medio FROM saldos
        WHERE produto_id = $1 AND deposito_id = $2 FOR UPDATE`,
      [produtoId, depositoId],
    );
    return { produtoId, depositoId, quantidade: rows[0].quantidade, custoMedio: rows[0].custo_medio };
  }

  async gravarSaldo(s: Saldo): Promise<void> {
    await this.db.query(
      `UPDATE saldos SET quantidade = $3, custo_medio = $4
        WHERE produto_id = $1 AND deposito_id = $2`,
      [s.produtoId, s.depositoId, s.quantidade, s.custoMedio],
    );
  }

  async registrarMovimentacao(m: NovaMovimentacao): Promise<Movimentacao> {
    const { rows } = await this.db.query(
      `INSERT INTO movimentacoes
         (produto_id, deposito_id, tipo, quantidade, custo_unitario, saldo_apos, usuario_id, motivo, transferencia_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [m.produtoId, m.depositoId, m.tipo, m.quantidade, m.custoUnitario, m.saldoApos, m.usuarioId, m.motivo, m.transferenciaId],
    );
    return paraMovimentacao(rows[0]);
  }
}

export class RepositorioPostgres implements RepositorioEstoque {
  constructor(private readonly pool: pg.Pool) {}

  static conectar(url: string): RepositorioPostgres {
    return new RepositorioPostgres(new pg.Pool({ connectionString: url }));
  }

  async buscarUsuarioPorChave(apiKey: string): Promise<Usuario | null> {
    const { rows } = await this.pool.query(
      `SELECT u.id, u.nome, u.perfil,
              COALESCE(array_agg(ud.deposito_id) FILTER (WHERE ud.deposito_id IS NOT NULL), '{}') AS depositos
         FROM usuarios u LEFT JOIN usuario_depositos ud ON ud.usuario_id = u.id
        WHERE u.api_key = $1
        GROUP BY u.id`,
      [apiKey],
    );
    if (rows.length === 0) return null;
    const r = rows[0];
    return { id: r.id, nome: r.nome, perfil: r.perfil, depositosPermitidos: r.depositos };
  }

  async buscarProduto(id: string): Promise<Produto | null> {
    const { rows } = await this.pool.query(`SELECT * FROM produtos WHERE id = $1`, [id]);
    return rows[0] ? { id: rows[0].id, nome: rows[0].nome, unidade: rows[0].unidade, estoqueMinimo: rows[0].estoque_minimo } : null;
  }

  async listarProdutos(): Promise<Produto[]> {
    const { rows } = await this.pool.query(`SELECT * FROM produtos ORDER BY id`);
    return rows.map((r) => ({ id: r.id, nome: r.nome, unidade: r.unidade, estoqueMinimo: r.estoque_minimo }));
  }

  async buscarDeposito(id: string): Promise<Deposito | null> {
    const { rows } = await this.pool.query(`SELECT id, nome FROM depositos WHERE id = $1`, [id]);
    return rows[0] ?? null;
  }

  async listarSaldos(depositoIds: string[]): Promise<SaldoDetalhado[]> {
    const { rows } = await this.pool.query(
      `SELECT s.produto_id, s.deposito_id, s.quantidade, s.custo_medio,
              p.nome, p.unidade, p.estoque_minimo
         FROM saldos s JOIN produtos p ON p.id = s.produto_id
        WHERE s.deposito_id = ANY($1)
        ORDER BY s.deposito_id, s.produto_id`,
      [depositoIds],
    );
    return rows.map((r) => ({
      produtoId: r.produto_id,
      depositoId: r.deposito_id,
      quantidade: r.quantidade,
      custoMedio: r.custo_medio,
      produtoNome: r.nome,
      unidade: r.unidade,
      estoqueMinimo: r.estoque_minimo,
      abaixoDoMinimo: r.quantidade < r.estoque_minimo,
    }));
  }

  async extrato(produtoId: string, depositoIds: string[]): Promise<Movimentacao[]> {
    const { rows } = await this.pool.query(
      `SELECT * FROM movimentacoes
        WHERE produto_id = $1 AND deposito_id = ANY($2)
        ORDER BY id`,
      [produtoId, depositoIds],
    );
    return rows.map(paraMovimentacao);
  }

  async registrarAlertaPendente(a: AlertaPendente): Promise<void> {
    await this.pool.query(
      `INSERT INTO alertas_pendentes (produto_id, deposito_id, mensagem, erro) VALUES ($1, $2, $3, $4)`,
      [a.produtoId, a.depositoId, a.mensagem, a.erro],
    );
  }

  async emTransacao<T>(trabalho: (uow: UnidadeDeTrabalho) => Promise<T>): Promise<T> {
    const cliente = await this.pool.connect();
    try {
      await cliente.query('BEGIN');
      const resultado = await trabalho(new UnidadePostgres(cliente));
      await cliente.query('COMMIT');
      return resultado;
    } catch (erro) {
      await cliente.query('ROLLBACK');
      throw erro;
    } finally {
      cliente.release();
    }
  }

  async fechar(): Promise<void> {
    await this.pool.end();
  }
}
