// Padrão Repository: a aplicação conversa com esta interface, nunca com o banco.
// Há duas implementações: RepositorioPostgres (produção) e RepositorioMemoria (testes).

import type {
  Deposito, Movimentacao, NovaMovimentacao, Produto, Saldo, SaldoDetalhado, Usuario,
} from '../dominio/tipos.ts';

/** Operações que só podem acontecer dentro de uma transação. */
export interface UnidadeDeTrabalho {
  /**
   * Lê o saldo e o BLOQUEIA até o fim da transação (cria com zero se não existir).
   * Duas saídas simultâneas do mesmo produto/depósito esperam uma pela outra,
   * o que impede o saldo de ficar negativo.
   */
  bloquearSaldo(produtoId: string, depositoId: string): Promise<Saldo>;
  gravarSaldo(saldo: Saldo): Promise<void>;
  registrarMovimentacao(m: NovaMovimentacao): Promise<Movimentacao>;
}

export interface AlertaPendente {
  produtoId: string;
  depositoId: string;
  mensagem: string;
  erro: string;
}

export interface RepositorioEstoque {
  buscarUsuarioPorChave(apiKey: string): Promise<Usuario | null>;
  buscarProduto(id: string): Promise<Produto | null>;
  listarProdutos(): Promise<Produto[]>;
  buscarDeposito(id: string): Promise<Deposito | null>;
  listarSaldos(depositoIds: string[]): Promise<SaldoDetalhado[]>;
  extrato(produtoId: string, depositoIds: string[]): Promise<Movimentacao[]>;
  registrarAlertaPendente(alerta: AlertaPendente): Promise<void>;
  /** Executa `trabalho` numa transação: ou tudo é gravado, ou nada. */
  emTransacao<T>(trabalho: (uow: UnidadeDeTrabalho) => Promise<T>): Promise<T>;
  fechar(): Promise<void>;
}
