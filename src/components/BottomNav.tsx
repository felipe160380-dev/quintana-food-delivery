import { Link, useRouterState } from "@tanstack/react-router";
import { Home, ClipboardList, MapPin, ShoppingBag } from "lucide-react";
import { useCart } from "@/lib/cart";
import { Badge } from "@/components/ui/badge";

const items = [
  { to: "/" as const, label: "Início", icon: Home },
  { to: "/pedidos" as const, label: "Pedidos", icon: ClipboardList },
  { to: "/enderecos" as const, label: "Endereços", icon: MapPin },
  { to: "/checkout" as const, label: "Carrinho", icon: ShoppingBag, badge: true },
];

export function BottomNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { count } = useCart();
  if (pathname.startsWith("/auth")) return null;
  if (pathname.startsWith("/lojista") || pathname.startsWith("/entregador")) return null;

  return (
    <nav className="sticky bottom-0 z-30 border-t bg-background/95 backdrop-blur sm:hidden">
      <ul className="mx-auto grid max-w-6xl grid-cols-4">
        {items.map((it) => {
          const active =
            it.to === "/" ? pathname === "/" : pathname.startsWith(it.to);
          const Icon = it.icon;
          return (
            <li key={it.to}>
              <Link
                to={it.to}
                className={`relative flex flex-col items-center gap-0.5 py-2 text-[11px] ${
                  active ? "text-primary" : "text-muted-foreground"
                }`}
              >
                <Icon className="size-5" />
                <span>{it.label}</span>
                {it.badge && count > 0 && (
                  <Badge className="absolute right-6 top-1 size-4 rounded-full p-0 text-[9px]">{count}</Badge>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
