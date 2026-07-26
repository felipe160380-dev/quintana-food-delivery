export type AppRole = "customer" | "merchant" | "courier" | "admin";

/**
 * Perfil ativo da sessão (apenas para decidir o que a interface mostra).
 * Não altera permissões — RLS continua sendo a fonte da verdade.
 */
export function primaryRole(roles: string[]): AppRole {
  if (roles.includes("admin")) return "admin";
  if (roles.includes("merchant")) return "merchant";
  if (roles.includes("courier")) return "courier";
  return "customer";
}

/** Somente clientes (e visitantes) veem catálogo, busca, carrinho e favoritos. */
export function isShopper(roles: string[]) {
  return primaryRole(roles) === "customer";
}
