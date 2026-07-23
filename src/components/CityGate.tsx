import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { MapPin } from "lucide-react";
import type { City } from "@/hooks/use-current-city";

/**
 * Modal exibido na primeira visita quando há ≥2 cidades ativas.
 * Salva a escolha em localStorage (via hook) e some.
 * Não altera layout — Dialog do shadcn já usado no projeto.
 */
export function CityGate({
  open,
  cities,
  onPick,
}: {
  open: boolean;
  cities: City[];
  onPick: (id: string) => void;
}) {
  return (
    <Dialog open={open}>
      <DialogContent className="max-w-sm" onEscapeKeyDown={(e) => e.preventDefault()} onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="size-5 text-primary" />
            Escolha sua cidade
          </DialogTitle>
          <DialogDescription>
            Para mostrar as lojas certas para você.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          {cities.map((c) => (
            <Button
              key={c.id}
              variant="outline"
              className="h-auto justify-between py-3"
              onClick={() => onPick(c.id)}
            >
              <span className="font-medium">{c.name}</span>
              <span className="text-xs text-muted-foreground">{c.state}</span>
            </Button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
