import { randomUUID } from 'node:crypto';
import {
  arredondarQtd, type Aviso, type Movimentacao, type Produto, type Saldo, type Usuario,
} from '../dominio/tipos.ts';
import { dadosInvalidos, naoEncontrado, saldoInsuficiente } from '../dominio/erros.ts';
import type { EstrategiaCusto } from '../dominio/custo/estrategia-custo.ts';
import type { GatewayNotificacao } from '../integracao/gateway-notificacao.ts';
import { mensagemDoAlerta } from '../integracao/gateway-notificacao.ts';
import type { RepositorioEstoque, UnidadeDeTrabalho } from '../persistencia/repositorio-estoque.ts';
import { exigirDeposito, exigirOperador } from '../seguranca/controle-acesso.ts';

export interface PedidoEntrada {
  produtoId: string;
  depositoId: string;
  quantidade: number;
  custoUnitario: number;
  motivo: string;
}

export interface PedidoSaida {
  produtoId: string;
  depositoId: string;
  quantidade: number;
  motivo: string;
}

export interface PedidoTransferencia {
  produtoId: string;
  origemId: string;
  destinoId: string;
  quantidade: number;
  motivo: string;
}

export interface Resultado {
  movimentacoes: Movimentacao[];
  saldos: Saldo[];
  avisos: Aviso[];
}

export class ServicoMovimentacao {
  constructor(
    private readonly repositorio: RepositorioEstoque,
    private readonly estrategiaCusto: EstrategiaCusto,
    private readonly notificacao: GatewayNotificacao,
  ) {}

  async registrarEntrada(usuario: Usuario, p: PedidoEntrada): Promise<Resultado> {
    exigirOperador(usuario);
    exigirDeposito(usuario, p.depositoId);
    validarQuantidade(p.quantidade);
    if (!(p.custoUnitario >= 0)) throw dadosInvalidos('custoUnitario deve ser maior ou igual a zero.');
    exigirMotivo(p.motivo);
    await this.exigirCadastro(p.produtoId, p.depositoId);

    return this.repositorio.emTransacao(async (uow) => {
      const { mov, saldo } = await this.entrada(uow, usuario, p.produtoId, p.depositoId, p.quantidade, p.custoUnitario, p.motivo, null);
      return { movimentacoes: [mov], saldos: [saldo], avisos: [] };
    });
  }

  async registrarSaida(usuario: Usuario, p: PedidoSaida): Promise<Resultado> {
    exigirOperador(usuario);
    exigirDeposito(usuario, p.depositoId);
    validarQuantidade(p.quantidade);
    exigirMotivo(p.motivo);
    const produto = await this.exigirCadastro(p.produtoId, p.depositoId);

    const resultado = await this.repositorio.emTransacao(async (uow) => {
      const { mov, saldo } = await this.saida(uow, usuario, p.produtoId, p.depositoId, p.quantidade, p.motivo, null);
      return { movimentacoes: [mov], saldos: [saldo], avisos: [] as Aviso[] };
    });
    resultado.avisos.push(...(await this.alertarSeAbaixoDoMinimo(produto, resultado.saldos[0]!)));
    return resultado;
  }

  async transferir(usuario: Usuario, p: PedidoTransferencia): Promise<Resultado> {
    exigirOperador(usuario);
    exigirDeposito(usuario, p.origemId);
    exigirDeposito(usuario, p.destinoId);
    if (p.origemId === p.destinoId) throw dadosInvalidos('Origem e destino devem ser diferentes.');
    validarQuantidade(p.quantidade);
    exigirMotivo(p.motivo);
    const produto = await this.exigirCadastro(p.produtoId, p.origemId);
    await this.exigirCadastro(p.produtoId, p.destinoId);

    const transferenciaId = randomUUID();
    const resultado = await this.repositorio.emTransacao(async (uow) => {
      for (const dep of [p.origemId, p.destinoId].sort()) await uow.bloquearSaldo(p.produtoId, dep);
      const s = await this.saida(uow, usuario, p.produtoId, p.origemId, p.quantidade, p.motivo, transferenciaId);
      const e = await this.entrada(uow, usuario, p.produtoId, p.destinoId, p.quantidade, s.mov.custoUnitario, p.motivo, transferenciaId);
      return { movimentacoes: [s.mov, e.mov], saldos: [s.saldo, e.saldo], avisos: [] as Aviso[] };
    });
    resultado.avisos.push(...(await this.alertarSeAbaixoDoMinimo(produto, resultado.saldos[0]!)));
    return resultado;
  }

  private async entrada(
    uow: UnidadeDeTrabalho, usuario: Usuario, produtoId: string, depositoId: string,
    quantidade: number, custoUnitario: number, motivo: string, transferenciaId: string | null,
  ) {
    const atual = await uow.bloquearSaldo(produtoId, depositoId);
    const saldo: Saldo = {
      ...atual,
      quantidade: arredondarQtd(atual.quantidade + quantidade),
      custoMedio: this.estrategiaCusto.custoAposEntrada(atual, quantidade, custoUnitario),
    };
    await uow.gravarSaldo(saldo);
    const mov = await uow.registrarMovimentacao({
      produtoId, depositoId, tipo: 'ENTRADA', quantidade, custoUnitario,
      saldoApos: saldo.quantidade, usuarioId: usuario.id, motivo, transferenciaId,
    });
    return { mov, saldo };
  }

  private async saida(
    uow: UnidadeDeTrabalho, usuario: Usuario, produtoId: string, depositoId: string,
    quantidade: number, motivo: string, transferenciaId: string | null,
  ) {
    const atual = await uow.bloquearSaldo(produtoId, depositoId);
    if (atual.quantidade < quantidade) throw saldoInsuficiente(atual.quantidade, quantidade);
    const saldo: Saldo = { ...atual, quantidade: arredondarQtd(atual.quantidade - quantidade) };
    await uow.gravarSaldo(saldo);
    const mov = await uow.registrarMovimentacao({
      produtoId, depositoId, tipo: 'SAIDA', quantidade, custoUnitario: atual.custoMedio,
      saldoApos: saldo.quantidade, usuarioId: usuario.id, motivo, transferenciaId,
    });
    return { mov, saldo };
  }

  private async exigirCadastro(produtoId: string, depositoId: string): Promise<Produto> {
    const produto = await this.repositorio.buscarProduto(produtoId);
    if (!produto) throw naoEncontrado(`Produto ${produtoId} não cadastrado.`);
    if (!(await this.repositorio.buscarDeposito(depositoId))) throw naoEncontrado(`Depósito ${depositoId} não cadastrado.`);
    return produto;
  }

  private async alertarSeAbaixoDoMinimo(produto: Produto, saldo: Saldo): Promise<Aviso[]> {
    if (saldo.quantidade >= produto.estoqueMinimo) return [];
    const alerta = {
      produtoId: produto.id, produtoNome: produto.nome, depositoId: saldo.depositoId,
      quantidade: saldo.quantidade, estoqueMinimo: produto.estoqueMinimo,
    };
    try {
      await this.notificacao.enviarAlertaEstoqueMinimo(alerta);
      return [];
    } catch (erro) {
      const motivo = erro instanceof Error ? erro.message : String(erro);
      try {
        await this.repositorio.registrarAlertaPendente({
          produtoId: produto.id, depositoId: saldo.depositoId, mensagem: mensagemDoAlerta(alerta), erro: motivo,
        });
      } catch {}
      return [{ codigo: 'alerta_nao_enviado', mensagem: `Estoque abaixo do mínimo, mas o alerta não foi enviado (${motivo}). Ficou na fila de pendentes.` }];
    }
  }
}

function validarQuantidade(q: number): void {
  if (typeof q !== 'number' || !Number.isFinite(q) || q <= 0) {
    throw dadosInvalidos('quantidade deve ser um número maior que zero.');
  }
}

function exigirMotivo(motivo: string): void {
  if (typeof motivo !== 'string' || motivo.trim().length < 3) {
    throw dadosInvalidos('Informe o motivo da movimentação (mínimo 3 caracteres).');
  }
}
