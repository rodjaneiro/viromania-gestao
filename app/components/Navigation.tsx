"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const nomes: Record<string, string> = {
  "/eventos": "Eventos",
  "/fechamento": "Fechamento",
  "/caixa": "Caixa",
  "/relatorios": "Relatórios",
  "/bonificacoes": "Bonificação",
  "/musicos": "Músicos",
  "/instrumentos": "Instrumentos",
};

export default function Navigation() {
  const pathname = usePathname();

  if (pathname === "/") return null;

  const rota = Object.keys(nomes).find((item) =>
    pathname.startsWith(item)
  );

  return (
    <nav className="sticky top-0 z-50 border-b border-slate-200 bg-white shadow-sm">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
        <Link
          href="/"
          className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-100"
        >
          <span className="text-xl">←</span>
          <span>Início</span>
        </Link>

        <span className="text-base font-bold text-slate-800 sm:text-lg">
          {rota ? nomes[rota] : "ViroMania"}
        </span>

        <Link
          href="/"
          className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-200"
        >
          ViroMania
        </Link>
      </div>
    </nav>
  );
}
