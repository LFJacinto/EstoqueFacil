import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { RepositorioPostgres } from '../src/persistencia/repositorio-postgres.ts';
import { montar, usuario } from './apoio.ts';

const url = process.env.DATABASE_URL_TESTE;
const opcoes = { skip: url ? false : 'defina DATABASE_URL_TESTE para rodar' };

let pool: pg.Pool;
let sistema: ReturnType<typeof montar>;

before(async () => {
  if (!url) return;
  pool = new pg.Pool({ connectionString: url });
  await pool.query('DROP TABLE IF EXISTS alertas_pendentes, saldos, movimentacoes, usuario_depositos, usuarios, depositos, produtos CASCADE');
  await pool.query(await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8'));
  await pool.query(await readFile(new URL('../db/seed.sql', import.meta.url), 'utf8'));
  sistema = montar({ repositorio: new RepositorioPostgres(pool) });
});

after(async () => { if (pool) await pool.end(); });

test('Postgres: entrada, saída e saldo', opcoes, async () => {
  const ana = await usuario(sistema, 'chave-ana');
  await sistema.movimentacao.registrarEntrada(ana, { produtoId: 'P001', depositoId: 'D1', quantidade: 100, custoUnitario: 1, motivo: 'NF 1' });
  await sistema.movimentacao.registrarEntrada(ana, { produtoId: 'P001', depositoId: 'D1', quantidade: 300, custoUnitario: 2, motivo: 'NF 2' });
  const r = await sistema.movimentacao.registrarSaida(ana, { produtoId: 'P001', depositoId: 'D1', quantidade: 50, motivo: 'OP 1' });
  assert.equal(r.saldos[0]!.quantidade, 350);
  assert.equal(r.saldos[0]!.custoMedio, 1.75);
});

test('Postgres: 10 saídas simultâneas respeitam o saldo (bloqueio de linha)', opcoes, async () => {
  const ana = await usuario(sistema, 'chave-ana');
  await sistema.movimentacao.registrarEntrada(ana, { produtoId: 'P002', depositoId: 'D2', quantidade: 100, custoUnitario: 3, motivo: 'NF 3' });
  const tentativas = await Promise.allSettled(Array.from({ length: 10 }, () =>
    sistema.movimentacao.registrarSaida(ana, { produtoId: 'P002', depositoId: 'D2', quantidade: 30, motivo: 'OP 2' })));
  assert.equal(tentativas.filter((t) => t.status === 'fulfilled').length, 3);
  const saldo = (await sistema.consulta.saldos(ana, 'D2')).find((s) => s.produtoId === 'P002')!;
  assert.equal(saldo.quantidade, 10);
});

test('Postgres: o livro-razão é imutável', opcoes, async () => {
  await assert.rejects(pool.query(`UPDATE movimentacoes SET quantidade = 999`), /imutável/);
  await assert.rejects(pool.query(`DELETE FROM movimentacoes`), /imutável/);
});

test('Postgres: saldo resumido confere com a soma do livro-razão', opcoes, async () => {
  const { rows } = await pool.query(`
    SELECT s.produto_id, s.deposito_id, s.quantidade,
           COALESCE(SUM(CASE m.tipo WHEN 'ENTRADA' THEN m.quantidade ELSE -m.quantidade END), 0) AS soma
      FROM saldos s LEFT JOIN movimentacoes m
        ON m.produto_id = s.produto_id AND m.deposito_id = s.deposito_id
     GROUP BY s.produto_id, s.deposito_id, s.quantidade`);
  for (const r of rows) assert.equal(r.quantidade, r.soma, `${r.produto_id}/${r.deposito_id}`);
});
