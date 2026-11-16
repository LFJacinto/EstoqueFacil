// Implementação do repositório em memória, usada nos testes e na demonstração
// sem banco. Cumpre o mesmo contrato do RepositorioPostgres, inclusive transações:
// uma transação por vez (como o bloqueio do banco) e desfaz tudo em caso de erro.

import type {
  Deposito, Movimentacao, NovaMovimentacao, Produto, Saldo, SaldoDetalhado, Usuario,
} from '../dominio/tipos.ts';
import type { AlertaPendente, RepositorioEstoque, UnidadeDeTrabalho } from './repositorio-estoque.ts';

interface UsuarioComChave extends Usuario { apiKey: string }

export interface DadosIniciais {
  produtos: Produto[];
  depositos: Deposito[];
  usuarios: UsuarioComChave[];
}

const chave = (produtoId: string, depositoId: string) => `${produtoId}|${depositoId}`;

export class RepositorioMemoria implements RepositorioEstoque {
  private saldos = new Map<string, Saldo>();
  private movimentacoes: Movimentacao[] = [];
  readonly alertasPendentes: AlertaPendente[] = [];
  private fila: Promise<unknown> = Promise.resolve();

  constructor(private readonly dados: DadosIniciais) {}

  async buscarUsuarioPorChave(apiKey: string): Promise<Usuario | null> {
    const u = this.dados.usuarios.find((x) => x.apiKey === apiKey);
    if (!u) return null;
    const { apiKey: _omitida, ...usuario } = u;
    return usuario;
  }

  async buscarProduto(id: string) { return this.dados.produtos.find((p) => p.id === id) ?? null; }
  async listarProdutos() { return [...this.dados.produtos]; }
  async buscarDeposito(id: string) { return this.dados.depositos.find((d) => d.id === id) ?? null; }

  async listarSaldos(depositoIds: string[]): Promise<SaldoDetalhado[]> {
    return [...this.saldos.values()]
      .filter((s) => depositoIds.includes(s.depositoId))
      .map((s) => {
        const p = this.dados.produtos.find((x) => x.id === s.produtoId)!;
        return { ...s, produtoNome: p.nome, unidade: p.unidade, estoqueMinimo: p.estoqueMinimo, abaixoDoMinimo: s.quantidade < p.estoqueMinimo };
      });
  }

  async extrato(produtoId: string, depositoIds: string[]): Promise<Movimentacao[]> {
    return this.movimentacoes.filter((m) => m.produtoId === produtoId && depositoIds.includes(m.depositoId));
  }

  async registrarAlertaPendente(a: AlertaPendente): Promise<void> {
    this.alertasPendentes.push(a);
  }

  emTransacao<T>(trabalho: (uow: UnidadeDeTrabalho) => Promise<T>): Promise<T> {
    const executar = async () => {
      const copiaSaldos = new Map([...this.saldos].map(([k, v]) => [k, { ...v }]));
      const copiaMovs = [...this.movimentacoes];
      const uow: UnidadeDeTrabalho = {
        bloquearSaldo: async (produtoId, depositoId) => {
          const k = chave(produtoId, depositoId);
          if (!this.saldos.has(k)) this.saldos.set(k, { produtoId, depositoId, quantidade: 0, custoMedio: 0 });
          return { ...this.saldos.get(k)! };
        },
        gravarSaldo: async (s) => { this.saldos.set(chave(s.produtoId, s.depositoId), { ...s }); },
        registrarMovimentacao: async (m: NovaMovimentacao) => {
          const mov: Movimentacao = { ...m, id: this.movimentacoes.length + 1, criadaEm: new Date() };
          this.movimentacoes.push(mov);
          return mov;
        },
      };
      try {
        return await trabalho(uow);
      } catch (erro) {
        this.saldos = copiaSaldos;
        this.movimentacoes = copiaMovs;
        throw erro;
      }
    };
    const resultado = this.fila.then(executar, executar);
    this.fila = resultado.catch(() => undefined);
    return resultado;
  }

  async fechar(): Promise<void> {}
}

/** Mesmos dados de db/seed.sql, para rodar sem banco. */
export function dadosDeExemplo(): DadosIniciais {
  return {
    produtos: [
      { id: 'P001', nome: 'Produto 1', unidade: 'UN', estoqueMinimo: 100 },
      { id: 'P002', nome: 'Produto 2', unidade: 'UN', estoqueMinimo: 50 },
      { id: 'P003', nome: 'Produto 3', unidade: 'UN', estoqueMinimo: 10 },
    ],
    depositos: [{ id: 'D1', nome: 'Matriz' }, { id: 'D2', nome: 'Filial' }],
    usuarios: [
      { id: 'ana', nome: 'Ana (almoxarifado)', perfil: 'operador', depositosPermitidos: ['D1', 'D2'], apiKey: 'chave-ana' },
      { id: 'bruno', nome: 'Bruno (compras)', perfil: 'consulta', depositosPermitidos: ['D1'], apiKey: 'chave-bruno' },
    ],
  };
}
