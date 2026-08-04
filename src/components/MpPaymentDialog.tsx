import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import {
  createCardForOrder,
  createPixForOrder,
  getMpPublicKey,
} from "@/lib/mercadopago.functions";
import { brl } from "@/lib/format";
import { Copy, Loader2 } from "lucide-react";

declare global {
  interface Window {
    MercadoPago?: any;
  }
}

let mpSdkPromise: Promise<void> | null = null;
function loadMpSdk(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.MercadoPago) return Promise.resolve();
  if (mpSdkPromise) return mpSdkPromise;
  mpSdkPromise = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://sdk.mercadopago.com/js/v2";
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Falha ao carregar SDK Mercado Pago"));
    document.head.appendChild(s);
  });
  return mpSdkPromise;
}

export type MpMode = "pix" | "card";

export function MpPaymentDialog({
  orderId,
  amount,
  mode,
  onPaid,
  onClose,
}: {
  orderId: string;
  amount: number;
  mode: MpMode;
  onPaid: () => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div
        className="sheet-panel safe-bottom max-w-md rounded-t-2xl bg-card p-4 sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-lg font-bold">Pagamento — {brl(amount)}</h3>
          <button className="text-sm text-muted-foreground" onClick={onClose}>Fechar</button>
        </div>
        {mode === "pix" ? (
          <PixBox orderId={orderId} onPaid={onPaid} />
        ) : (
          <CardBox orderId={orderId} amount={amount} onPaid={onPaid} />
        )}
      </div>
    </div>
  );
}

function PixBox({ orderId, onPaid }: { orderId: string; onPaid: () => void }) {
  const runPix = useServerFn(createPixForOrder);
  const [qr, setQr] = useState<{ code: string; base64: string; url?: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<"pending" | "paid" | "failed">("pending");

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await runPix({ data: { orderId } });
        if (!mounted) return;
        setQr({ code: res.qr_code, base64: res.qr_code_base64, url: res.ticket_url });
      } catch (e: any) {
        { console.error(e); toast.error("Não foi possível gerar o Pix. Tente novamente."); }
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [orderId, runPix]);

  // Realtime: quando o webhook atualizar o pedido, confirma.
  useEffect(() => {
    const ch = supabase
      .channel(`pay-order-${orderId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "orders", filter: `id=eq.${orderId}` },
        (p: any) => {
          const st = p.new?.payment_status as string | undefined;
          if (st === "paid") {
            setStatus("paid");
            toast.success("Pagamento confirmado!");
            setTimeout(onPaid, 800);
          } else if (st === "failed") {
            setStatus("failed");
            toast.error("Pagamento recusado");
          }
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [orderId, onPaid]);

  const copy = async () => {
    if (!qr?.code) return;
    await navigator.clipboard.writeText(qr.code);
    toast.success("Código Pix copiado");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 p-8 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Gerando QR Code Pix...
      </div>
    );
  }
  if (!qr) return <p className="text-sm text-destructive">Não foi possível gerar o Pix.</p>;
  return (
    <div className="space-y-3 text-center">
      {status === "paid" ? (
        <div className="rounded-lg bg-emerald-500/10 p-6 text-emerald-700">
          ✅ Pagamento confirmado!
        </div>
      ) : (
        <>
          {qr.base64 && (
            <img
              src={`data:image/png;base64,${qr.base64}`}
              alt="QR Code Pix"
              className="mx-auto size-56 rounded-lg border bg-white p-2"
            />
          )}
          <div>
            <Label className="text-xs">Copia e cola</Label>
            <div className="mt-1 flex gap-2">
              <Input readOnly value={qr.code} className="font-mono text-xs" />
              <Button size="icon" variant="outline" onClick={copy}>
                <Copy className="size-4" />
              </Button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Aguardando confirmação do pagamento. Você pode fechar esta janela — avisaremos assim que
            o Pix for identificado.
          </p>
        </>
      )}
    </div>
  );
}

function CardBox({
  orderId,
  amount,
  onPaid,
}: {
  orderId: string;
  amount: number;
  onPaid: () => void;
}) {
  const runCard = useServerFn(createCardForOrder);
  const runKey = useServerFn(getMpPublicKey);
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    cardNumber: "",
    holder: "",
    exp: "",
    cvv: "",
    docType: "CPF",
    docNumber: "",
    email: "",
    installments: 1,
  });
  const mpRef = useRef<any>(null);

  useEffect(() => {
    (async () => {
      const [{ publicKey }] = await Promise.all([runKey(), loadMpSdk()]);
      if (!publicKey) {
        toast.error("Public Key do Mercado Pago não configurada");
        return;
      }
      setPublicKey(publicKey);
      mpRef.current = new window.MercadoPago(publicKey, { locale: "pt-BR" });
      supabase.auth.getUser().then(({ data }) => {
        setForm((f) => ({ ...f, email: f.email || data.user?.email || "" }));
      });
      setReady(true);
    })().catch((e) => { console.error(e); toast.error("Não foi possível iniciar o pagamento com cartão. Tente novamente."); });
  }, [runKey]);

  const installmentsOpts = useMemo(() => [1, 2, 3, 4, 5, 6], []);

  const submit = async () => {
    if (!mpRef.current) return;
    const [mm, yy] = form.exp.split("/").map((s) => s.trim());
    if (!mm || !yy || mm.length !== 2 || yy.length < 2) {
      return toast.error("Validade inválida (use MM/AA)");
    }
    setSubmitting(true);
    try {
      const cardNumber = form.cardNumber.replace(/\s+/g, "");
      const bin = cardNumber.slice(0, 8);
      // Identifica bandeira/emissor
      const methodsRes = await fetch(
        `https://api.mercadopago.com/v1/payment_methods/search?public_key=${publicKey}&bin=${bin}`,
      ).then((r) => r.json());
      const method = methodsRes?.results?.[0];
      if (!method?.id) throw new Error("Bandeira do cartão não identificada");

      const tokenRes = await mpRef.current.createCardToken({
        cardNumber,
        cardholderName: form.holder,
        cardExpirationMonth: mm,
        cardExpirationYear: yy.length === 2 ? `20${yy}` : yy,
        securityCode: form.cvv,
        identificationType: form.docType,
        identificationNumber: form.docNumber.replace(/\D/g, ""),
      });
      if (!tokenRes?.id) throw new Error(tokenRes?.error || "Falha ao gerar token do cartão");

      const res = await runCard({
        data: {
          orderId,
          token: tokenRes.id,
          installments: Number(form.installments) || 1,
          payment_method_id: method.id,
          issuer_id: method.issuer?.id,
          payer_email: form.email,
          identification_type: form.docType,
          identification_number: form.docNumber.replace(/\D/g, ""),
        },
      });
      if (res.status === "paid") {
        toast.success("Pagamento aprovado!");
        onPaid();
      } else if (res.status === "pending") {
        toast.message("Pagamento em análise. Avisaremos quando for aprovado.");
        onPaid();
      } else {
        { console.error("MP recusado:", res.status_detail ?? res.mp_status); toast.error("Pagamento recusado. Verifique os dados do cartão ou escolha outra forma de pagamento."); }
      }
    } catch (e: any) {
      { console.error(e); toast.error("Não foi possível concluir o pagamento. Tente novamente."); }
    } finally {
      setSubmitting(false);
    }
  };

  if (!ready) {
    return (
      <div className="flex items-center justify-center gap-2 p-8 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Carregando cartão seguro...
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label>Número do cartão</Label>
        <Input
          inputMode="numeric"
          placeholder="0000 0000 0000 0000"
          value={form.cardNumber}
          onChange={(e) => setForm({ ...form, cardNumber: e.target.value })}
        />
      </div>
      <div className="space-y-1.5">
        <Label>Titular (como impresso)</Label>
        <Input value={form.holder} onChange={(e) => setForm({ ...form, holder: e.target.value })} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Validade (MM/AA)</Label>
          <Input value={form.exp} onChange={(e) => setForm({ ...form, exp: e.target.value })} placeholder="12/29" />
        </div>
        <div className="space-y-1.5">
          <Label>CVV</Label>
          <Input inputMode="numeric" value={form.cvv} onChange={(e) => setForm({ ...form, cvv: e.target.value })} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Documento</Label>
          <select
            className="h-10 w-full rounded-md border bg-background px-2 text-sm"
            value={form.docType}
            onChange={(e) => setForm({ ...form, docType: e.target.value })}
          >
            <option value="CPF">CPF</option>
            <option value="CNPJ">CNPJ</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <Label>Número do documento</Label>
          <Input value={form.docNumber} onChange={(e) => setForm({ ...form, docNumber: e.target.value })} />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>E-mail</Label>
        <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
      </div>
      <div className="space-y-1.5">
        <Label>Parcelas</Label>
        <select
          className="h-10 w-full rounded-md border bg-background px-2 text-sm"
          value={form.installments}
          onChange={(e) => setForm({ ...form, installments: Number(e.target.value) })}
        >
          {installmentsOpts.map((n) => (
            <option key={n} value={n}>
              {n}x de {brl(amount / n)}
            </option>
          ))}
        </select>
      </div>
      <Button className="w-full" size="lg" onClick={submit} disabled={submitting}>
        {submitting ? "Processando..." : `Pagar ${brl(amount)}`}
      </Button>
      <p className="text-[11px] text-muted-foreground">
        Dados do cartão são enviados diretamente ao Mercado Pago (checkout transparente). O
        MiPede nunca vê o número completo nem o CVV.
      </p>
    </div>
  );
}
