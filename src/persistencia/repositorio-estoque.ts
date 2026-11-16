import type {
  Deposito, Movimentacao, NovaMovimentacao, Produto, Saldo, SaldoDetalhado, Usuario,
} from '../dominio/tipos.ts';

export interface UnidadeDeTrabalho {
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
  emTransacao<T>(trabalho: (uow: UnidadeDeTrabalho) => Promise<T>): Promise<T>;
  fechar(): Promise<void>;
}
