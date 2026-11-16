import { arredondarCusto, type Saldo } from '../tipos.ts';

export interface EstrategiaCusto {
  readonly nome: string;
  custoAposEntrada(saldoAtual: Saldo, quantidade: number, custoUnitario: number): number;
}

export class CustoMedioPonderado implements EstrategiaCusto {
  readonly nome = 'custo-medio';
  custoAposEntrada(saldo: Saldo, quantidade: number, custoUnitario: number): number {
    const total = saldo.quantidade + quantidade;
    if (total === 0) return 0;
    const valor = saldo.quantidade * saldo.custoMedio + quantidade * custoUnitario;
    return arredondarCusto(valor / total);
  }
}

export class UltimoCusto implements EstrategiaCusto {
  readonly nome = 'ultimo-custo';
  custoAposEntrada(_saldo: Saldo, _quantidade: number, custoUnitario: number): number {
    return arredondarCusto(custoUnitario);
  }
}

export function criarEstrategiaCusto(nome: string | undefined): EstrategiaCusto {
  if (nome === 'ultimo-custo') return new UltimoCusto();
  return new CustoMedioPonderado();
}
