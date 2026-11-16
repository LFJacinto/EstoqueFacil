import { test } from 'node:test';
import assert from 'node:assert/strict';
import { montar, usuario } from './apoio.ts';
import { CustoMedioPonderado, UltimoCusto } from '../src/dominio/custo/estrategia-custo.ts';
import { ErroDominio } from '../src/dominio/erros.ts';

const codigo = (e: unknown) => (e instanceof ErroDominio ? e.codigo : String(e));

test('entrada aumenta o saldo e calcula o custo médio ponderado', async () => {
  const s = montar();
  const ana = await usuario(s, 'chave-ana');
  await s.movimentacao.registrarEntrada(ana, { produtoId: 'P001', depositoId: 'D1', quantidade: 100, custoUnitario: 1, motivo: 'NF 101' });
  const r = await s.movimentacao.registrarEntrada(ana, { produtoId: 'P001', depositoId: 'D1', quantidade: 300, custoUnitario: 2, motivo: 'NF 102' });
  assert.equal(r.saldos[0]!.quantidade, 400);
  assert.equal(r.saldos[0]!.custoMedio, 1.75);
});

test('estratégia de custo é substituível (Strategy)', () => {
  const saldo = { produtoId: 'P', depositoId: 'D', quantidade: 100, custoMedio: 1 };
  assert.equal(new CustoMedioPonderado().custoAposEntrada(saldo, 100, 3), 2);
  assert.equal(new UltimoCusto().custoAposEntrada(saldo, 100, 3), 3);
});

test('saída maior que o saldo é recusada e nada é gravado', async () => {
  const s = montar();
  const ana = await usuario(s, 'chave-ana');
  await s.movimentacao.registrarEntrada(ana, { produtoId: 'P001', depositoId: 'D1', quantidade: 10, custoUnitario: 1, motivo: 'NF 1' });
  await assert.rejects(
    s.movimentacao.registrarSaida(ana, { produtoId: 'P001', depositoId: 'D1', quantidade: 11, motivo: 'OP 5' }),
    (e) => codigo(e) === 'saldo_insuficiente',
  );
  const extrato = await s.consulta.extrato(ana, 'P001', 'D1');
  assert.equal(extrato.length, 1);
  assert.equal((await s.consulta.saldos(ana, 'D1'))[0]!.quantidade, 10);
});

test('duas saídas simultâneas não deixam o saldo negativo', async () => {
  const s = montar();
  const ana = await usuario(s, 'chave-ana');
  await s.movimentacao.registrarEntrada(ana, { produtoId: 'P002', depositoId: 'D1', quantidade: 100, custoUnitario: 5, motivo: 'NF 7' });
  const saida = () => s.movimentacao.registrarSaida(ana, { produtoId: 'P002', depositoId: 'D1', quantidade: 60, motivo: 'OP 9' });
  const resultados = await Promise.allSettled([saida(), saida()]);
  assert.equal(resultados.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(resultados.filter((r) => r.status === 'rejected').length, 1);
  assert.equal((await s.consulta.saldos(ana, 'D1'))[0]!.quantidade, 40);
});

test('transferência move o saldo entre depósitos com o mesmo custo', async () => {
  const s = montar();
  const ana = await usuario(s, 'chave-ana');
  await s.movimentacao.registrarEntrada(ana, { produtoId: 'P003', depositoId: 'D1', quantidade: 50, custoUnitario: 40, motivo: 'NF 9' });
  const r = await s.movimentacao.transferir(ana, { produtoId: 'P003', origemId: 'D1', destinoId: 'D2', quantidade: 20, motivo: 'Reposição filial' });
  assert.deepEqual(r.saldos.map((x) => [x.depositoId, x.quantidade, x.custoMedio]), [['D1', 30, 40], ['D2', 20, 40]]);
  assert.equal(r.movimentacoes[0]!.transferenciaId, r.movimentacoes[1]!.transferenciaId);
});

test('transferência sem saldo não grava nada em nenhum depósito', async () => {
  const s = montar();
  const ana = await usuario(s, 'chave-ana');
  await assert.rejects(
    s.movimentacao.transferir(ana, { produtoId: 'P003', origemId: 'D1', destinoId: 'D2', quantidade: 1, motivo: 'Reposição' }),
    (e) => codigo(e) === 'saldo_insuficiente',
  );
  assert.equal((await s.consulta.extrato(ana, 'P003')).length, 0);
});

test('saída abaixo do mínimo envia alerta', async () => {
  const s = montar();
  const ana = await usuario(s, 'chave-ana');
  await s.movimentacao.registrarEntrada(ana, { produtoId: 'P001', depositoId: 'D1', quantidade: 150, custoUnitario: 1, motivo: 'NF 1' });
  const r = await s.movimentacao.registrarSaida(ana, { produtoId: 'P001', depositoId: 'D1', quantidade: 100, motivo: 'OP 1' });
  assert.equal(s.notificacao.enviados.length, 1);
  assert.deepEqual(r.avisos, []);
  assert.equal(r.alertas.length, 1);
  assert.match(r.alertas[0]!, /Alerta de estoque mínimo enviado/);
});

test('falha no serviço de alertas não impede a saída (degradação graciosa)', async () => {
  const s = montar();
  const ana = await usuario(s, 'chave-ana');
  s.notificacao.falhar = true;
  await s.movimentacao.registrarEntrada(ana, { produtoId: 'P001', depositoId: 'D1', quantidade: 150, custoUnitario: 1, motivo: 'NF 1' });
  const r = await s.movimentacao.registrarSaida(ana, { produtoId: 'P001', depositoId: 'D1', quantidade: 100, motivo: 'OP 1' });
  assert.equal(r.saldos[0]!.quantidade, 50);
  assert.equal(r.avisos[0]!.codigo, 'alerta_nao_enviado');
  assert.deepEqual(r.alertas, []);
  assert.equal((s.repositorio as any).alertasPendentes.length, 1);
});

test('perfil consulta não pode movimentar e ninguém acessa depósito sem permissão', async () => {
  const s = montar();
  const bruno = await usuario(s, 'chave-bruno');
  await assert.rejects(
    s.movimentacao.registrarEntrada(bruno, { produtoId: 'P001', depositoId: 'D1', quantidade: 1, custoUnitario: 1, motivo: 'teste' }),
    (e) => codigo(e) === 'acesso_negado',
  );
  await assert.rejects(s.consulta.saldos(bruno, 'D2'), (e) => codigo(e) === 'acesso_negado');
});
