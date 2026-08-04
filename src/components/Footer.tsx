import { Link, useRouterState } from "@tanstack/react-router";
import { UtensilsCrossed, Instagram, Facebook, Twitter } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { primaryRole } from "@/lib/profile";
import logo from "@/assets/mipede-logo.png.asset.json";

export function Footer() {
  const { roles } = useAuth();
  const role = primaryRole(roles);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  if (pathname.startsWith("/auth") || pathname.startsWith("/adm-login")) return null;

  const shopper = role === "customer";

  return (
    <footer className="mt-10 border-t bg-card">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <div className="flex items-center gap-2 font-bold">
            <img src={logo.url} alt="MiPede" className="h-7 w-auto" />
          </div>
          <p className="mt-2 max-w-xs text-sm leading-relaxed text-muted-foreground">
            Peça comida das melhores lojas da sua região. Rápido, fácil e do jeito que você quer pagar.
          </p>
        </div>

        <div>
          <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {shopper ? "Cliente" : role === "merchant" ? "Lojista" : role === "courier" ? "Entregador" : "Administração"}
          </div>
          <ul className="space-y-2 text-sm">
            {shopper && (
              <>
                <li><Link to="/" className="text-muted-foreground transition-colors hover:text-primary">Lojas</Link></li>
                <li><Link to="/pedidos" className="text-muted-foreground transition-colors hover:text-primary">Meus pedidos</Link></li>
                <li><Link to="/enderecos" className="text-muted-foreground transition-colors hover:text-primary">Endereços</Link></li>
                <li><Link to="/pagamentos" className="text-muted-foreground transition-colors hover:text-primary">Formas de pagamento</Link></li>
              </>
            )}
            {role === "merchant" && (
              <li><Link to="/lojista" className="text-muted-foreground transition-colors hover:text-primary">Painel da loja</Link></li>
            )}
            {role === "courier" && (
              <li><Link to="/entregador" className="text-muted-foreground transition-colors hover:text-primary">Minhas entregas</Link></li>
            )}
            {role === "admin" && (
              <li><Link to="/adm" className="text-muted-foreground transition-colors hover:text-primary">Painel administrativo</Link></li>
            )}
          </ul>
        </div>

        <div>
          <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Siga a gente</div>
          <div className="flex gap-2">
            <a href="#" aria-label="Instagram" className="grid size-9 place-items-center rounded-lg border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"><Instagram className="size-4" /></a>
            <a href="#" aria-label="Facebook" className="grid size-9 place-items-center rounded-lg border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"><Facebook className="size-4" /></a>
            <Link to="/adm-login" aria-label="Twitter" className="grid size-9 place-items-center rounded-lg border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"><Twitter className="size-4" /></Link>
          </div>
        </div>
      </div>
      <div className="border-t">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-4 py-4 text-xs text-muted-foreground sm:flex-row">
          <div>© {new Date().getFullYear()} MiPede. Todos os direitos reservados.</div>
          <div className="flex gap-4">
            <a href="#" className="transition-colors hover:text-primary">Termos</a>
            <a href="#" className="transition-colors hover:text-primary">Privacidade</a>
            <a href="#" className="transition-colors hover:text-primary">Ajuda</a>
          </div>
        </div>
      </div>
    </footer>
  );
}
