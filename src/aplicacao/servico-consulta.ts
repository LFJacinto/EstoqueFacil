import type { Movimentacao, Produto, SaldoDetalhado, Usuario } from '../dominio/tipos.ts';
import { naoEncontrado } from '../dominio/erros.ts';
import type { RepositorioEstoque } from '../persistencia/repositorio-estoque.ts';
import { depositosVisiveis } from '../seguranca/controle-acesso.ts';

export class ServicoConsulta {
  constructor(private readonly repositorio: RepositorioEstoque) {}

  async listarProdutos(): Promise<Produto[]> {
    return this.repositorio.listarProdutos();
  }

  async saldos(usuario: Usuario, depositoId?: string): Promise<SaldoDetalhado[]> {
    return this.repositorio.listarSaldos(depositosVisiveis(usuario, depositoId));
  }

  async extrato(usuario: Usuario, produtoId: string, depositoId?: string): Promise<Movimentacao[]> {
    if (!(await this.repositorio.buscarProduto(produtoId))) throw naoEncontrado(`Produto ${produtoId} não cadastrado.`);
    return this.repositorio.extrato(produtoId, depositosVisiveis(usuario, depositoId));
  }
}
