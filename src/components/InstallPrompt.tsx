import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Download, X } from "lucide-react";

type BIP = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

const DISMISS_KEY = "qf.pwa.dismissed";

export function InstallPrompt() {
  const [evt, setEvt] = useState<BIP | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (localStorage.getItem(DISMISS_KEY)) return;
    const handler = (e: Event) => {
      e.preventDefault();
      setEvt(e as BIP);
      setVisible(true);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  if (!visible || !evt) return null;

  return (
    <div className="fixed bottom-20 left-1/2 z-40 w-[min(92vw,420px)] -translate-x-1/2 rounded-2xl border bg-card p-3 shadow-xl sm:bottom-4">
      <div className="flex items-start gap-3">
        <img src="/icon-192.png" alt="" className="size-10 rounded-xl" width={40} height={40} />
        <div className="flex-1">
          <div className="text-sm font-semibold">Instalar Quintana Food</div>
          <p className="text-xs text-muted-foreground">Acesso rápido pelo ícone no seu celular.</p>
        </div>
        <button
          aria-label="Fechar"
          className="text-muted-foreground hover:text-foreground"
          onClick={() => { localStorage.setItem(DISMISS_KEY, "1"); setVisible(false); }}
        >
          <X className="size-4" />
        </button>
      </div>
      <Button
        className="mt-2 w-full"
        size="sm"
        onClick={async () => {
          await evt.prompt();
          await evt.userChoice;
          setVisible(false);
        }}
      >
        <Download className="mr-2 size-4" /> Instalar app
      </Button>
    </div>
  );
}
