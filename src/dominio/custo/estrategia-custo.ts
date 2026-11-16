// Padrão Strategy: a forma de calcular o custo do estoque é substituível.
// Trocar o método de custeio altera só este arquivo e a configuração em main.ts.

import { arredondarCusto, type Saldo } from '../tipos.ts';

export interface EstrategiaCusto {
  readonly nome: string;
  /** Novo custo unitário do saldo depois de uma ENTRADA. */
  custoAposEntrada(saldoAtual: Saldo, quantidade: number, custoUnitario: number): number;
}

/** Custo médio ponderado: o método mais usado no Brasil (aceito pelo fisco). */
export class CustoMedioPonderado implements EstrategiaCusto {
  readonly nome = 'custo-medio';
  custoAposEntrada(saldo: Saldo, quantidade: number, custoUnitario: number): number {
    const total = saldo.quantidade + quantidade;
    if (total === 0) return 0;
    const valor = saldo.quantidade * saldo.custoMedio + quantidade * custoUnitario;
    return arredondarCusto(valor / total);
  }
}

/** Último custo: o estoque passa a valer o preço da compra mais recente. */
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
