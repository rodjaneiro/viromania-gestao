"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function BackToHome() {
  const pathname = usePathname();

  // Não mostra o botão na tela principal nem no login
  if (pathname === "/" || pathname === "/login") {
    return null;
  }

  return (
    // "sticky": o botão fica no mesmo lugar (topo) mesmo ao rolar a tela.
    // pointer-events-none na faixa para não bloquear cliques no conteúdo ao lado.
    <div className="pointer-events-none sticky top-0 z-50 mx-auto max-w-7xl px-4 pt-4 sm:px-6">
      <Link
        href="/"
        className="pointer-events-auto inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-md transition hover:bg-slate-50 hover:shadow-lg"
      >
        ← Voltar ao início
      </Link>
    </div>
  );
}
