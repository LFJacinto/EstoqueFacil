// Camada de segurança: autenticação (quem é você?) e autorização (o que pode fazer?).
// Regra geral: falha fechada. Na dúvida, o acesso é negado.

import type { Usuario } from '../dominio/tipos.ts';
import { acessoNegado, naoAutenticado } from '../dominio/erros.ts';
import type { RepositorioEstoque } from '../persistencia/repositorio-estoque.ts';

export class ControleAcesso {
  constructor(private readonly repositorio: RepositorioEstoque) {}

  /** Identifica o usuário pela chave de acesso. Sem chave válida, nada passa. */
  async autenticar(apiKey: string | undefined): Promise<Usuario> {
    if (!apiKey) throw naoAutenticado();
    const usuario = await this.repositorio.buscarUsuarioPorChave(apiKey);
    if (!usuario) throw naoAutenticado();
    return usuario;
  }
}

/** Só o perfil operador pode registrar movimentações. */
export function exigirOperador(usuario: Usuario): void {
  if (usuario.perfil !== 'operador') {
    throw acessoNegado(`O perfil "${usuario.perfil}" só pode consultar o estoque.`);
  }
}

/** O usuário precisa ter acesso explícito ao depósito. */
export function exigirDeposito(usuario: Usuario, depositoId: string): void {
  if (!usuario.depositosPermitidos.includes(depositoId)) {
    throw acessoNegado(`Sem acesso ao depósito ${depositoId}.`);
  }
}

/**
 * Depósitos que a consulta pode ler: o pedido, se permitido, ou todos os
 * permitidos. Nunca devolve um depósito fora da permissão do usuário.
 */
export function depositosVisiveis(usuario: Usuario, pedido?: string): string[] {
  if (pedido) {
    exigirDeposito(usuario, pedido);
    return [pedido];
  }
  return [...usuario.depositosPermitidos];
}
