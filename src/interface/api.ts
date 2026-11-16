import express, { type NextFunction, type Request, type Response } from 'express';
import { fileURLToPath } from 'node:url';
import type { Usuario } from '../dominio/tipos.ts';
import { ErroDominio, dadosInvalidos } from '../dominio/erros.ts';
import type { ServicoMovimentacao } from '../aplicacao/servico-movimentacao.ts';
import type { ServicoConsulta } from '../aplicacao/servico-consulta.ts';
import type { ControleAcesso } from '../seguranca/controle-acesso.ts';

export interface DependenciasApi {
  controleAcesso: ControleAcesso;
  movimentacao: ServicoMovimentacao;
  consulta: ServicoConsulta;
}

type ReqAutenticada = Request & { usuario?: Usuario };

const texto = (corpo: any, campo: string): string => {
  const v = corpo?.[campo];
  if (typeof v !== 'string' || v.trim() === '') throw dadosInvalidos(`Campo "${campo}" é obrigatório.`);
  return v.trim();
};
const numero = (corpo: any, campo: string): number => {
  const v = corpo?.[campo];
  if (typeof v !== 'number') throw dadosInvalidos(`Campo "${campo}" deve ser numérico.`);
  return v;
};
const usuarioDe = (req: ReqAutenticada) => req.usuario!;
const opcional = (v: unknown) => (typeof v === 'string' && v !== '' ? v : undefined);

const rota = (fn: (req: ReqAutenticada, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => { fn(req, res).catch(next); };

export function criarApi(deps: DependenciasApi) {
  const app = express();
  app.use(express.json());

  app.use((_req, res, next) => {
    const inicio = process.hrtime.bigint();
    const writeHead = res.writeHead;
    res.writeHead = function (this: Response, ...args: any[]) {
      const ms = Number(process.hrtime.bigint() - inicio) / 1e6;
      this.setHeader('Server-Timing', `total;dur=${ms.toFixed(1)}`);
      return (writeHead as any).apply(this, args);
    } as any;
    next();
  });

  app.get('/saude', (_req, res) => { res.json({ status: 'ok' }); });

  app.use(express.static(fileURLToPath(new URL('../../public', import.meta.url))));

  app.use((req: ReqAutenticada, _res: Response, next: NextFunction) => {
    deps.controleAcesso.autenticar(req.header('x-api-key'))
      .then((usuario) => { req.usuario = usuario; next(); })
      .catch(next);
  });

  app.get('/produtos', rota(async (_req, res) => {
    res.json(await deps.consulta.listarProdutos());
  }));

  app.get('/saldos', rota(async (req, res) => {
    res.json(await deps.consulta.saldos(usuarioDe(req), opcional(req.query.depositoId)));
  }));

  app.get('/produtos/:id/extrato', rota(async (req, res) => {
    res.json(await deps.consulta.extrato(usuarioDe(req), req.params.id!, opcional(req.query.depositoId)));
  }));

  app.post('/movimentacoes/entrada', rota(async (req, res) => {
    const b = req.body;
    res.status(201).json(await deps.movimentacao.registrarEntrada(usuarioDe(req), {
      produtoId: texto(b, 'produtoId'), depositoId: texto(b, 'depositoId'),
      quantidade: numero(b, 'quantidade'), custoUnitario: numero(b, 'custoUnitario'), motivo: texto(b, 'motivo'),
    }));
  }));

  app.post('/movimentacoes/saida', rota(async (req, res) => {
    const b = req.body;
    res.status(201).json(await deps.movimentacao.registrarSaida(usuarioDe(req), {
      produtoId: texto(b, 'produtoId'), depositoId: texto(b, 'depositoId'),
      quantidade: numero(b, 'quantidade'), motivo: texto(b, 'motivo'),
    }));
  }));

  app.post('/movimentacoes/transferencia', rota(async (req, res) => {
    const b = req.body;
    res.status(201).json(await deps.movimentacao.transferir(usuarioDe(req), {
      produtoId: texto(b, 'produtoId'), origemId: texto(b, 'origemId'), destinoId: texto(b, 'destinoId'),
      quantidade: numero(b, 'quantidade'), motivo: texto(b, 'motivo'),
    }));
  }));

  app.use((erro: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (erro instanceof ErroDominio) {
      res.status(erro.status).json({ erro: erro.codigo, mensagem: erro.message });
      return;
    }
    if (erro instanceof SyntaxError) {
      res.status(400).json({ erro: 'json_invalido', mensagem: 'Corpo da requisição não é um JSON válido.' });
      return;
    }
    console.error(erro);
    res.status(500).json({ erro: 'erro_interno', mensagem: 'Erro inesperado. Tente novamente.' });
  });

  return app;
}
