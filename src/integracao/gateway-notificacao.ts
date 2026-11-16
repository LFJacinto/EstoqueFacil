export interface AlertaEstoque {
  produtoId: string;
  produtoNome: string;
  depositoId: string;
  quantidade: number;
  estoqueMinimo: number;
}

export interface GatewayNotificacao {
  enviarAlertaEstoqueMinimo(alerta: AlertaEstoque): Promise<void>;
}

export function mensagemDoAlerta(a: AlertaEstoque): string {
  return `Estoque abaixo do mínimo: ${a.produtoNome} (${a.produtoId}) no depósito ${a.depositoId} ` +
    `tem ${a.quantidade}; mínimo ${a.estoqueMinimo}.`;
}

export class NotificacaoConsole implements GatewayNotificacao {
  async enviarAlertaEstoqueMinimo(alerta: AlertaEstoque): Promise<void> {
    console.log(`[ALERTA] ${mensagemDoAlerta(alerta)}`);
  }
}

export class NotificacaoWebhook implements GatewayNotificacao {
  constructor(private readonly url: string, private readonly timeoutMs = 3000) {}

  async enviarAlertaEstoqueMinimo(alerta: AlertaEstoque): Promise<void> {
    const resposta = await fetch(this.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: mensagemDoAlerta(alerta), alerta }),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!resposta.ok) throw new Error(`webhook respondeu ${resposta.status}`);
  }
}
