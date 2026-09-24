"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const itens = [
  { href: "/", label: "Painel", icon: "⌂" },
  { href: "/eventos", label: "Eventos", icon: "📅" },
  { href: "/fechamento", label: "Fechamento", icon: "✓" },
  { href: "/pagamentos", label: "Pagamentos", icon: "💰" },
  { href: "/caixa", label: "Caixa", icon: "▣" },
  { href: "/relatorios", label: "Relatórios", icon: "▥" },
  { href: "/bonificacoes", label: "Bonificação", icon: "★" },
  { href: "/musicos", label: "Músicos", icon: "♟" },
  { href: "/instrumentos", label: "Instrumentos", icon: "♪" },
];

export default function Navigation() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-slate-200 bg-white/95 shadow-[0_-4px_15px_rgba(0,0,0,0.08)] backdrop-blur">
      <div className="mx-auto flex max-w-7xl overflow-x-auto px-2 py-2">
        <div className="flex min-w-max flex-1 items-stretch justify-center gap-1">
          {itens.map((item) => {
            const ativo =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex min-w-[82px] flex-col items-center justify-center rounded-xl px-2 py-2 transition ${
                  ativo
                    ? "bg-slate-900 text-white shadow-sm"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                }`}
              >
                <span
                  className={`flex h-8 w-8 items-center justify-center rounded-lg text-xl ${
                    ativo ? "bg-white/10" : "bg-slate-100"
                  }`}
                >
                  {item.icon}
                </span>

                <span className="mt-1 whitespace-nowrap text-[11px] font-semibold">
                  {item.label}
                </span>
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}