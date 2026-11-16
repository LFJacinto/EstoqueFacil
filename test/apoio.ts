// Monta o sistema completo com o repositório em memória para os testes.

import { criarApi } from '../src/interface/api.ts';
import { ControleAcesso } from '../src/seguranca/controle-acesso.ts';
import { ServicoMovimentacao } from '../src/aplicacao/servico-movimentacao.ts';
import { ServicoConsulta } from '../src/aplicacao/servico-consulta.ts';
import { CustoMedioPonderado, type EstrategiaCusto } from '../src/dominio/custo/estrategia-custo.ts';
import type { AlertaEstoque, GatewayNotificacao } from '../src/integracao/gateway-notificacao.ts';
import type { RepositorioEstoque } from '../src/persistencia/repositorio-estoque.ts';
import { RepositorioMemoria, dadosDeExemplo } from '../src/persistencia/repositorio-memoria.ts';

export class NotificacaoFalsa implements GatewayNotificacao {
  enviados: AlertaEstoque[] = [];
  falhar = false;
  async enviarAlertaEstoqueMinimo(a: AlertaEstoque) {
    if (this.falhar) throw new Error('serviço de alertas fora do ar');
    this.enviados.push(a);
  }
}

export function montar(opcoes: { repositorio?: RepositorioEstoque; custo?: EstrategiaCusto } = {}) {
  const repositorio = opcoes.repositorio ?? new RepositorioMemoria(dadosDeExemplo());
  const notificacao = new NotificacaoFalsa();
  const controleAcesso = new ControleAcesso(repositorio);
  const movimentacao = new ServicoMovimentacao(repositorio, opcoes.custo ?? new CustoMedioPonderado(), notificacao);
  const consulta = new ServicoConsulta(repositorio);
  return { repositorio, notificacao, controleAcesso, movimentacao, consulta, app: criarApi({ controleAcesso, movimentacao, consulta }) };
}

export async function usuario(sistema: ReturnType<typeof montar>, chave: string) {
  return sistema.controleAcesso.autenticar(chave);
}
