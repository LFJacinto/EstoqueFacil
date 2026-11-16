# EstoqueFácil

API de controle de estoque com entradas, saídas, transferências entre depósitos, saldo, extrato (kardex) e alerta de estoque mínimo. Projeto da questão 5 do trabalho de Arquitetura de Software: a arquitetura inicial aplica padrões estudados no GBrain.

## Como rodar

**Opção 1 — sem banco (mais rápida).** Precisa só do Node.js 20 ou mais novo.

```bash
npm install
npm start          # abra http://localhost:3000 no navegador (dados em memória)
npm test           # 16 testes de regras de negócio e da API
```

**Opção 2 — com PostgreSQL via Docker.**

```bash
docker compose up --build    # sobe o banco (schema + dados de exemplo) e a API
```

**Opção 3 — com um PostgreSQL seu.** Rode `db/schema.sql` e `db/seed.sql` no banco e depois:

```bash
DATABASE_URL=postgres://usuario:senha@localhost:5432/estoque npm start
```

Testes de integração com o banco (apagam os dados do banco indicado):

```bash
DATABASE_URL_TESTE=postgres://usuario:senha@localhost:5432/estoque_teste npm test
```

**Deixe o terminal aberto enquanto usa o sistema.** No Windows, Ctrl+C no terminal desliga o servidor (para copiar texto, selecione com o mouse e clique com o botão direito).

## Página web de demonstração

Abra `http://localhost:3000` no navegador. A página mostra os saldos e o extrato, registra entradas, saídas e transferências e permite trocar de usuário (Ana ou Bruno) para ver o controle de acesso funcionando. Ela é só mais um cliente da API: envia a chave em cada chamada e não contém nenhuma regra de negócio.

Para chamar a API direto, há exemplos em `requisicoes.http` (extensão REST Client do VS Code, Postman ou Insomnia). Usuários de exemplo:

| Chave (`x-api-key`) | Usuário | Perfil | Depósitos |
| --- | --- | --- | --- |
| `chave-ana` | Ana (almoxarifado) | operador: consulta e movimenta | D1, D2 |
| `chave-bruno` | Bruno (compras) | consulta: só lê | D1 |

## Endpoints

| Método e rota | O que faz |
| --- | --- |
| `GET /` | Página web de demonstração (sem chave) |
| `GET /saude` | Verifica se a API está no ar (sem chave) |
| `GET /produtos` | Lista os produtos |
| `GET /saldos?depositoId=D1` | Saldos dos depósitos que o usuário pode ver |
| `GET /produtos/:id/extrato?depositoId=D1` | Histórico de movimentações (kardex) |
| `POST /movimentacoes/entrada` | Registra uma entrada (compra, devolução) e recalcula o custo |
| `POST /movimentacoes/saida` | Registra uma saída; recusa se não houver saldo |
| `POST /movimentacoes/transferencia` | Saída de um depósito + entrada em outro, na mesma transação |

Erros seguem um formato único: `{ "erro": "saldo_insuficiente", "mensagem": "..." }` com status 400, 401, 403, 404 ou 422.

## Arquitetura

```
src/
  interface/api.ts                 Camada de interface: API REST (Express). Só traduz HTTP.
  seguranca/controle-acesso.ts     Autenticação por chave, perfis e depósitos permitidos.
  aplicacao/
    servico-movimentacao.ts        Casos de uso: entrada, saída, transferência.
    servico-consulta.ts            Casos de uso: produtos, saldos, extrato.
  dominio/
    tipos.ts, erros.ts             Entidades e erros de negócio (sem dependências externas).
    custo/estrategia-custo.ts      Strategy: custo médio ponderado ou último custo.
  integracao/gateway-notificacao.ts  Gateway: alertas de estoque mínimo (console ou webhook).
  persistencia/
    repositorio-estoque.ts         Interface do repositório (o que a aplicação enxerga).
    repositorio-postgres.ts        Implementação em PostgreSQL.
    repositorio-memoria.ts         Implementação em memória (testes e demonstração).
  main.ts                          Composition root: cria e injeta as dependências.
public/index.html                  Página web de demonstração (cliente da API).
db/schema.sql, db/seed.sql         Modelo de dados e dados de exemplo.
```

Cada camada só conhece a de baixo, por meio de interfaces. `main.ts` é o único arquivo que sabe quais implementações concretas estão em uso.

### Padrões aplicados

| Padrão | Onde | Por quê |
| --- | --- | --- |
| Camadas | Pastas de `src/` | Cada parte tem uma responsabilidade e pode mudar sozinha |
| Repository | `persistencia/` | Trocar o banco não afeta as regras de negócio; os testes rodam sem banco |
| Strategy | `dominio/custo/` | O método de custeio é escolhido por configuração (`CUSTEIO`) |
| Gateway | `integracao/` | O canal de alerta (console, webhook, e-mail) é isolado |
| Injeção de dependência | `main.ts` e `test/apoio.ts` | As implementações são passadas no construtor |
| Unidade de trabalho (transação) | `emTransacao` | Movimentação e saldo são gravados juntos, ou nada é gravado |
| Livro-razão imutável | `movimentacoes` + trigger | Rastreabilidade: nenhum movimento é alterado ou apagado |
| Degradação graciosa | `alertarSeAbaixoDoMinimo` | Se o alerta falhar, a movimentação vale e o alerta vai para a fila |

### Atributos de qualidade e como verificar

| Atributo | Como o projeto atende | Como medir |
| --- | --- | --- |
| Integridade do saldo | Bloqueio da linha de saldo na transação (`SELECT ... FOR UPDATE`) e `CHECK (quantidade >= 0)` | Teste com 10 saídas simultâneas; teste que compara o saldo com a soma do livro-razão |
| Rastreabilidade | Toda movimentação guarda usuário, motivo, data e saldo após; o banco proíbe UPDATE e DELETE | Teste de imutabilidade; % de movimentos com usuário e motivo (100%) |
| Segurança | Chave obrigatória, perfis e filtro de depósito em toda consulta (falha fechada) | Testes de 401 e 403 |
| Confiabilidade | Falha no serviço de alertas não impede a movimentação | Teste com o serviço de alertas fora do ar |
| Desempenho | Tabela de saldos resumida e índice no livro-razão | Cabeçalho `Server-Timing` em cada resposta (p50/p95) |
| Manutenibilidade | Interfaces entre camadas e composition root | Trocar o custeio ou o banco altera um único módulo |
