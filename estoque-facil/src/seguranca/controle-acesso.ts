import type { Usuario } from '../dominio/tipos.ts';
import { acessoNegado, naoAutenticado } from '../dominio/erros.ts';
import type { RepositorioEstoque } from '../persistencia/repositorio-estoque.ts';

export class ControleAcesso {
  constructor(private readonly repositorio: RepositorioEstoque) {}

  async autenticar(apiKey: string | undefined): Promise<Usuario> {
    if (!apiKey) throw naoAutenticado();
    const usuario = await this.repositorio.buscarUsuarioPorChave(apiKey);
    if (!usuario) throw naoAutenticado();
    return usuario;
  }
}

export function exigirOperador(usuario: Usuario): void {
  if (usuario.perfil !== 'operador') {
    throw acessoNegado(`O perfil "${usuario.perfil}" só pode consultar o estoque.`);
  }
}

export function exigirDeposito(usuario: Usuario, depositoId: string): void {
  if (!usuario.depositosPermitidos.includes(depositoId)) {
    throw acessoNegado(`Sem acesso ao depósito ${depositoId}.`);
  }
}

export function depositosVisiveis(usuario: Usuario, pedido?: string): string[] {
  if (pedido) {
    exigirDeposito(usuario, pedido);
    return [pedido];
  }
  return [...usuario.depositosPermitidos];
}
