"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function BackToHome() {
  const pathname = usePathname();

  // Não mostra o botão na tela principal
  if (pathname === "/") {
    return null;
  }

  return (
    <div className="mx-auto max-w-7xl px-4 pt-4 sm:px-6">
      <Link
        href="/"
        className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 hover:shadow"
      >
        ← Voltar ao início
      </Link>
    </div>
  );
}