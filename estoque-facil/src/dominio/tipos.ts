export interface Produto {
  id: string;
  nome: string;
  unidade: string;
  estoqueMinimo: number;
}

export interface Deposito {
  id: string;
  nome: string;
}

export type Perfil = 'operador' | 'consulta';

export interface Usuario {
  id: string;
  nome: string;
  perfil: Perfil;
  depositosPermitidos: string[];
}

export type TipoMovimentacao = 'ENTRADA' | 'SAIDA';

export interface Movimentacao {
  id: number;
  produtoId: string;
  depositoId: string;
  tipo: TipoMovimentacao;
  quantidade: number;
  custoUnitario: number;
  saldoApos: number;
  usuarioId: string;
  motivo: string;
  transferenciaId: string | null;
  criadaEm: Date;
}

export type NovaMovimentacao = Omit<Movimentacao, 'id' | 'criadaEm'>;

export interface Saldo {
  produtoId: string;
  depositoId: string;
  quantidade: number;
  custoMedio: number;
}

export interface SaldoDetalhado extends Saldo {
  produtoNome: string;
  unidade: string;
  estoqueMinimo: number;
  abaixoDoMinimo: boolean;
}

export interface Aviso {
  codigo: 'alerta_nao_enviado';
  mensagem: string;
}

export const arredondarQtd = (n: number) => Math.round(n * 1000) / 1000;
export const arredondarCusto = (n: number) => Math.round(n * 10000) / 10000;
