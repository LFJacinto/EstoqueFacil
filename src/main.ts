import type { Server } from 'node:http';
import { criarApi } from './interface/api.ts';
import { ControleAcesso } from './seguranca/controle-acesso.ts';
import { ServicoMovimentacao } from './aplicacao/servico-movimentacao.ts';
import { ServicoConsulta } from './aplicacao/servico-consulta.ts';
import { criarEstrategiaCusto } from './dominio/custo/estrategia-custo.ts';
import { NotificacaoConsole, NotificacaoWebhook, type GatewayNotificacao } from './integracao/gateway-notificacao.ts';
import type { RepositorioEstoque } from './persistencia/repositorio-estoque.ts';
import { RepositorioPostgres } from './persistencia/repositorio-postgres.ts';
import { RepositorioMemoria, dadosDeExemplo } from './persistencia/repositorio-memoria.ts';

const porta = Number(process.env.PORT ?? 3000);

const repositorio: RepositorioEstoque = process.env.DATABASE_URL
  ? RepositorioPostgres.conectar(process.env.DATABASE_URL)
  : new RepositorioMemoria(dadosDeExemplo());

const notificacao: GatewayNotificacao = process.env.WEBHOOK_URL
  ? new NotificacaoWebhook(process.env.WEBHOOK_URL)
  : new NotificacaoConsole();

const estrategiaCusto = criarEstrategiaCusto(process.env.CUSTEIO);

const app = criarApi({
  controleAcesso: new ControleAcesso(repositorio),
  movimentacao: new ServicoMovimentacao(repositorio, estrategiaCusto, notificacao),
  consulta: new ServicoConsulta(repositorio),
});

function iniciar(porta: number, tentativas = 10): Server {
  const servidor = app.listen(porta, () => {
    console.log(`EstoqueFácil rodando em http://localhost:${porta}  (abra no navegador; não feche este terminal)`);
    console.log(`  banco: ${process.env.DATABASE_URL ? 'PostgreSQL' : 'memória (dados de exemplo; defina DATABASE_URL para usar o Postgres)'}`);
    console.log(`  custeio: ${estrategiaCusto.nome} | alertas: ${process.env.WEBHOOK_URL ? 'webhook' : 'console'}`);
  });
  servidor.on('error', (erro: NodeJS.ErrnoException) => {
    if (erro.code === 'EADDRINUSE' && tentativas > 1) {
      console.log(`Porta ${porta} ocupada (outro servidor já está rodando nela). Tentando ${porta + 1}...`);
      atual = iniciar(porta + 1, tentativas - 1);
      return;
    }
    console.error(`Não foi possível iniciar o servidor: ${erro.message}`);
    process.exit(1);
  });
  return servidor;
}

let atual = iniciar(porta);

const encerrar = () => atual.close(() => { repositorio.fechar().finally(() => process.exit(0)); });
process.on('SIGINT', encerrar);
process.on('SIGTERM', encerrar);
