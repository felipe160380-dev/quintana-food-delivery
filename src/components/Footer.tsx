import { Link } from "@tanstack/react-router";
import { UtensilsCrossed, Instagram, Facebook, Twitter } from "lucide-react";

export function Footer() {
  return (
    <footer className="mt-10 border-t bg-card">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <div className="flex items-center gap-2 font-bold">
            <span className="grid size-8 place-items-center rounded-xl bg-primary text-primary-foreground">
              <UtensilsCrossed className="size-4" />
            </span>
            <span className="text-lg">Quintana<span className="text-primary">Food</span></span>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            Peça comida das melhores lojas da sua região. Rápido, fácil e do jeito que você quer pagar.
          </p>
        </div>

        <div>
          <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Cliente</div>
          <ul className="space-y-2 text-sm">
            <li><Link to="/" className="hover:text-primary">Lojas</Link></li>
            <li><Link to="/pedidos" className="hover:text-primary">Meus pedidos</Link></li>
            <li><Link to="/enderecos" className="hover:text-primary">Endereços</Link></li>
            <li><Link to="/checkout" className="hover:text-primary">Carrinho</Link></li>
          </ul>
        </div>

        <div>
          <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Siga a gente</div>
          <div className="flex gap-2">
            <a href="#" aria-label="Instagram" className="grid size-9 place-items-center rounded-lg border hover:bg-accent"><Instagram className="size-4" /></a>
            <a href="#" aria-label="Facebook" className="grid size-9 place-items-center rounded-lg border hover:bg-accent"><Facebook className="size-4" /></a>
            <Link to="/adm-login" aria-label="Twitter" className="grid size-9 place-items-center rounded-lg border hover:bg-accent"><Twitter className="size-4" /></Link>
          </div>
        </div>
      </div>
      <div className="border-t">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-4 py-4 text-xs text-muted-foreground sm:flex-row">
          <div>© {new Date().getFullYear()} QuintanaFood. Todos os direitos reservados.</div>
          <div className="flex gap-4">
            <a href="#" className="hover:text-primary">Termos</a>
            <a href="#" className="hover:text-primary">Privacidade</a>
            <a href="#" className="hover:text-primary">Ajuda</a>
          </div>
        </div>
      </div>
    </footer>
  );
}
