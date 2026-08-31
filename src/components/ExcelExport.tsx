import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { adminReport, merchantReport } from "@/lib/reports.functions";
import { buildReportSheets, periodRange, type PeriodKey } from "@/lib/report-workbook";
import { downloadXlsx } from "@/lib/xlsx";
import { slugify } from "@/lib/format";

const PERIODS: { k: PeriodKey; label: string }[] = [
  { k: "today", label: "Hoje" },
  { k: "7d", label: "Últimos 7 dias" },
  { k: "30d", label: "Últimos 30 dias" },
  { k: "month", label: "Este mês" },
  { k: "custom", label: "Período personalizado" },
];

type Props = {
  audience: "admin" | "merchant";
  /** Lojas disponíveis para seleção (admin: todas; lojista: somente as suas). */
  stores: { id: string; name: string }[];
  /** Permite o relatório geral da plataforma (somente admin). */
  allowAllStores?: boolean;
  title?: string;
};

export function ExcelExport({ audience, stores, allowAllStores = false, title = "Exportar Excel" }: Props) {
  const [storeId, setStoreId] = useState<string>(allowAllStores ? "all" : stores[0]?.id ?? "");
  const [period, setPeriod] = useState<PeriodKey>("30d");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!storeId && stores[0]) setStoreId(stores[0].id);
  }, [stores, storeId]);

  const runAdmin = useServerFn(adminReport);
  const runMerchant = useServerFn(merchantReport);

  async function exportNow() {
    if (period === "custom" && (!from || !to)) {
      toast.error("Informe a data inicial e a data final.");
      return;
    }
    setLoading(true);
    try {
      const range = periodRange(period, from, to);
      const data =
        audience === "admin"
          ? await runAdmin({ data: { storeId: storeId === "all" ? null : storeId, ...range } })
          : await runMerchant({ data: { storeId: storeId || null, ...range } });

      if (!data.orders.length && !data.withdrawals.length) {
        toast.error("Nenhum dado encontrado neste período.");
        return;
      }
      downloadXlsx(
        buildReportSheets(data, audience),
        `relatorio-${slugify(data.title)}-${new Date().toISOString().slice(0, 10)}.xlsx`,
      );
      toast.success("Relatório gerado!");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível gerar o relatório.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <FileSpreadsheet className="size-4" /> {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {(stores.length > 1 || allowAllStores) && (
          <div className="flex flex-wrap gap-2">
            {allowAllStores && (
              <Button size="sm" variant={storeId === "all" ? "default" : "outline"} onClick={() => setStoreId("all")}>
                Todas as lojas
              </Button>
            )}
            {stores.map((s) => (
              <Button key={s.id} size="sm" variant={storeId === s.id ? "default" : "outline"} onClick={() => setStoreId(s.id)}>
                {s.name}
              </Button>
            ))}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {PERIODS.map((p) => (
            <Button key={p.k} size="sm" variant={period === p.k ? "default" : "outline"} onClick={() => setPeriod(p.k)}>
              {p.label}
            </Button>
          ))}
        </div>

        {period === "custom" && (
          <div className="grid gap-2 sm:grid-cols-2">
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        )}

        <Button onClick={exportNow} disabled={loading || (!storeId && !allowAllStores)}>
          {loading ? (<><Loader2 className="mr-1 size-4 animate-spin" /> Gerando relatório...</>) : "Exportar Excel"}
        </Button>
        <p className="text-[11px] text-muted-foreground">
          Abas: Resumo, Pedidos, Itens, Produtos, Entregas, Financeiro e Saques.
        </p>
      </CardContent>
    </Card>
  );
}
