import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * Campo de preço com máscara monetária brasileira.
 * `value` é sempre a string numérica em reais ("12.50") — pronta para Number().
 * O usuário digita apenas números e a vírgula é posicionada automaticamente.
 */
export function CurrencyInput({
  value,
  onChange,
  className,
  placeholder = "0,00",
  ...rest
}: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
  placeholder?: string;
} & Omit<React.ComponentProps<typeof Input>, "value" | "onChange">) {
  const cents = value === "" || value == null ? null : Math.round(Number(value) * 100);
  const display =
    cents == null || Number.isNaN(cents)
      ? ""
      : (cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className={cn("relative", className)}>
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
        R$
      </span>
      <Input
        {...rest}
        inputMode="numeric"
        className="pl-9 text-right tabular-nums"
        placeholder={placeholder}
        value={display}
        onChange={(e) => {
          const digits = e.target.value.replace(/\D/g, "").slice(0, 9);
          onChange(digits === "" ? "" : (Number(digits) / 100).toFixed(2));
        }}
      />
    </div>
  );
}
