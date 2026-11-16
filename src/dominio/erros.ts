// Erros de domínio. A camada de interface traduz cada um para um status HTTP.

export class ErroDominio extends Error {
  constructor(
    public readonly codigo: string,
    mensagem: string,
    public readonly status: number,
  ) {
    super(mensagem);
    this.name = 'ErroDominio';
  }
}

export const dadosInvalidos = (msg: string) => new ErroDominio('dados_invalidos', msg, 400);
export const naoAutenticado = () =>
  new ErroDominio('nao_autenticado', 'Informe uma chave de acesso válida no cabeçalho x-api-key.', 401);
export const acessoNegado = (msg: string) => new ErroDominio('acesso_negado', msg, 403);
export const naoEncontrado = (msg: string) => new ErroDominio('nao_encontrado', msg, 404);
export const saldoInsuficiente = (disponivel: number, pedido: number) =>
  new ErroDominio(
    'saldo_insuficiente',
    `Saldo insuficiente: disponível ${disponivel}, solicitado ${pedido}.`,
    422,
  );
