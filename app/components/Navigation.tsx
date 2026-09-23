"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";

const itens = [
  { href: "/", label: "Painel" },
  { href: "/eventos", label: "Eventos" },
  { href: "/fechamento", label: "Fechamento" },
  { href: "/caixa", label: "Caixa" },
  { href: "/relatorios", label: "Relatórios" },
  { href: "/bonificacoes", label: "Bonificações" },
  { href: "/musicos", label: "Músicos" },
  { href: "/instrumentos", label: "Instrumentos" },
];

export default function Navigation() {
  const pathname = usePathname();

  useEffect(() => {
    if (pathname === "/fechamento") {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });

      const timer = window.setTimeout(() => {
        window.scrollTo({ top: 0, left: 0, behavior: "auto" });
      }, 100);

      return () => window.clearTimeout(timer);
    }
  }, [pathname]);

  return (
    <nav className="sticky top-0 z-50 border-b border-slate-200 bg-white/95 shadow-sm backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center gap-2 overflow-x-auto px-4 py-3">
        <Link
          href="/"
          className="mr-3 shrink-0 text-lg font-extrabold text-slate-900"
        >
          VIROMANIA
        </Link>

        <div className="flex min-w-max gap-1">
          {itens.map((item) => {
            const ativo =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${
                  ativo
                    ? "bg-slate-900 text-white"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
