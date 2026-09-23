"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

const modulos = [
  { href: "/eventos", titulo: "Eventos", descricao: "Shows e agenda", icon: "📅" },
  { href: "/fechamento", titulo: "Fechamento", descricao: "Fechamento de eventos", icon: "✓" },
  { href: "/caixa", titulo: "Caixa", descricao: "Entradas e saídas", icon: "▣" },
  { href: "/relatorios", titulo: "Relatórios", descricao: "Resultados e estatísticas", icon: "▥" },
  { href: "/bonificacoes", titulo: "Bonificação", descricao: "Controle de benefícios", icon: "★" },
  { href: "/musicos", titulo: "Músicos", descricao: "Cadastro e controle", icon: "♟" },
  { href: "/instrumentos", titulo: "Instrumentos", descricao: "Controle de equipamentos", icon: "♪" },
];

export default function Home() {
  const [foto, setFoto] = useState("/viromania-logo.png");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const salva = localStorage.getItem("viromania_foto");
    if (salva) setFoto(salva);
  }, []);

  function alterarFoto(file?: File) {
    if (!file) return;

    const reader = new FileReader();

    reader.onload = () => {
      const imagem = String(reader.result);
      setFoto(imagem);
      localStorage.setItem("viromania_foto", imagem);
    };

    reader.readAsDataURL(file);
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-5 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-5xl">
        <header className="mb-6 flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:mb-8 sm:p-6">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="group relative h-20 w-20 shrink-0 overflow-hidden rounded-full border border-slate-200 bg-slate-100 sm:h-24 sm:w-24"
            title="Alterar foto"
          >
            <img
              src={foto}
              alt="ViroMania"
              className="h-full w-full object-cover"
            />

            <span className="absolute inset-0 hidden items-center justify-center bg-black/40 text-xs font-bold text-white group-hover:flex">
              Alterar
            </span>
          </button>

          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => alterarFoto(e.target.files?.[0])}
          />

          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
              ViroMania
            </h1>

            <p className="mt-1 text-sm text-slate-500 sm:text-base">
              Gestão da banda
            </p>

            <p className="mt-1 text-xs text-slate-400">
              Toque na foto para alterar
            </p>
          </div>
        </header>

        <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-5 lg:grid-cols-4">
          {modulos.map((modulo) => (
            <Link
              key={modulo.href}
              href={modulo.href}
              className="flex min-h-[165px] flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white p-4 text-center shadow-sm transition hover:-translate-y-0.5 hover:shadow-md active:scale-[0.98] sm:min-h-[190px] sm:p-6"
            >
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100 text-3xl text-slate-700 sm:h-20 sm:w-20 sm:text-4xl">
                {modulo.icon}
              </div>

              <h2 className="text-base font-bold text-slate-800 sm:text-lg">
                {modulo.titulo}
              </h2>

              <p className="mt-1 text-xs leading-5 text-slate-500 sm:text-sm">
                {modulo.descricao}
              </p>
            </Link>
          ))}
        </section>
      </div>
    </main>
  );
}
