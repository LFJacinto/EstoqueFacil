import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { montar } from './apoio.ts';

const sistema = montar();
const servidor = sistema.app.listen(0);
const base = `http://localhost:${(servidor.address() as AddressInfo).port}`;
after(() => servidor.close());

const chamar = (metodo: string, caminho: string, chave?: string, corpo?: unknown) =>
  fetch(base + caminho, {
    method: metodo,
    headers: { 'content-type': 'application/json', ...(chave ? { 'x-api-key': chave } : {}) },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });

test('a página web abre sem chave em /', async () => {
  const r = await chamar('GET', '/');
  assert.equal(r.status, 200);
  assert.match(await r.text(), /EstoqueFácil|Estoque<span>Fácil/);
});

test('sem chave de acesso a API responde 401', async () => {
  const r = await chamar('GET', '/saldos');
  assert.equal(r.status, 401);
});

test('chave inválida responde 401', async () => {
  assert.equal((await chamar('GET', '/saldos', 'chave-errada')).status, 401);
});

test('fluxo completo: entrada, saída, saldo e extrato', async () => {
  const e = await chamar('POST', '/movimentacoes/entrada', 'chave-ana',
    { produtoId: 'P002', depositoId: 'D1', quantidade: 80, custoUnitario: 12.5, motivo: 'NF 555' });
  assert.equal(e.status, 201);
  assert.match(e.headers.get('server-timing') ?? '', /total;dur=/);

  const s = await chamar('POST', '/movimentacoes/saida', 'chave-ana',
    { produtoId: 'P002', depositoId: 'D1', quantidade: 30, motivo: 'OP 12' });
  assert.equal(s.status, 201);
  const corpo = await s.json();
  assert.equal(corpo.saldos[0].quantidade, 50);

  const saldos = await (await chamar('GET', '/saldos?depositoId=D1', 'chave-bruno')).json();
  assert.equal(saldos.find((x: any) => x.produtoId === 'P002').quantidade, 50);

  const extrato = await (await chamar('GET', '/produtos/P002/extrato', 'chave-ana')).json();
  assert.deepEqual(extrato.map((m: any) => m.tipo), ['ENTRADA', 'SAIDA']);
});

test('saldo insuficiente responde 422', async () => {
  const r = await chamar('POST', '/movimentacoes/saida', 'chave-ana',
    { produtoId: 'P003', depositoId: 'D2', quantidade: 5, motivo: 'OP 99' });
  assert.equal(r.status, 422);
  assert.equal((await r.json()).erro, 'saldo_insuficiente');
});

test('consulta a depósito sem permissão responde 403', async () => {
  assert.equal((await chamar('GET', '/saldos?depositoId=D2', 'chave-bruno')).status, 403);
});

test('dados inválidos respondem 400', async () => {
  const r = await chamar('POST', '/movimentacoes/entrada', 'chave-ana',
    { produtoId: 'P001', depositoId: 'D1', quantidade: '10', custoUnitario: 1, motivo: 'NF' });
  assert.equal(r.status, 400);
});
