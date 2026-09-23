"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Instrumento = {
  id: string;
  name: string;
};

export default function InstrumentosPage() {
  const [instrumentos, setInstrumentos] = useState<Instrumento[]>([]);
  const [nome, setNome] = useState("");
  const [loading, setLoading] = useState(true);

  async function carregarInstrumentos() {
    setLoading(true);

    const { data, error } = await supabase
      .from("instruments")
      .select("*")
      .order("name");

    if (error) {
      alert("Erro ao carregar instrumentos: " + error.message);
      return;
    }

    setInstrumentos(data || []);
    setLoading(false);
  }

  async function adicionarInstrumento(e: React.FormEvent) {
    e.preventDefault();

    if (!nome.trim()) {
      alert("Digite o nome do instrumento.");
      return;
    }

    const { error } = await supabase
      .from("instruments")
      .insert({
        name: nome.trim(),
      });

    if (error) {
      alert("Erro ao adicionar instrumento: " + error.message);
      return;
    }

    setNome("");
    carregarInstrumentos();
  }

  async function editarInstrumento(instrumento: Instrumento) {
    const novoNome = window.prompt(
      "Nome do instrumento:",
      instrumento.name
    );

    if (novoNome === null) return;

    if (!novoNome.trim()) {
      alert("O nome não pode ficar vazio.");
      return;
    }

    const { error } = await supabase
      .from("instruments")
      .update({
        name: novoNome.trim(),
      })
      .eq("id", instrumento.id);

    if (error) {
      alert("Erro ao editar instrumento: " + error.message);
      return;
    }

    carregarInstrumentos();
  }

  async function excluirInstrumento(instrumento: Instrumento) {
    const confirmar = window.confirm(
      `Tem certeza que deseja excluir o instrumento "${instrumento.name}"?`
    );

    if (!confirmar) return;

    const { error } = await supabase
      .from("instruments")
      .delete()
      .eq("id", instrumento.id);

    if (error) {
      alert("Erro ao excluir instrumento: " + error.message);
      return;
    }

    carregarInstrumentos();
  }

  useEffect(() => {
    carregarInstrumentos();
  }, []);

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="border-b bg-white px-6 py-5 md:px-10">
        <h1 className="text-3xl font-bold">
          Instrumentos
        </h1>

        <p className="mt-1 text-slate-500">
          Cadastro e gerenciamento dos instrumentos da ViroMania
        </p>
      </header>

      <div className="mx-auto max-w-6xl p-6 md:p-10">

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-bold">
            Novo instrumento
          </h2>

          <form
            onSubmit={adicionarInstrumento}
            className="mt-6 flex flex-col gap-4 md:flex-row"
          >
            <input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Nome do instrumento"
              className="w-full rounded-xl border p-3 outline-none focus:border-[#751515]"
            />

            <button
              type="submit"
              className="rounded-xl bg-[#751515] px-6 py-3 font-semibold text-white hover:bg-[#5f1111]"
            >
              + Adicionar instrumento
            </button>
          </form>
        </section>

        <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold">
              Instrumentos cadastrados
            </h2>

            <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold">
              {instrumentos.length}
            </span>
          </div>

          <div className="mt-6 overflow-x-auto">
            {loading ? (
              <p className="text-slate-500">
                Carregando...
              </p>
            ) : instrumentos.length === 0 ? (
              <div className="rounded-xl border border-dashed p-10 text-center text-slate-500">
                Nenhum instrumento cadastrado.
              </div>
            ) : (
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b text-sm text-slate-500">
                    <th className="px-4 py-3">
                      Instrumento
                    </th>

                    <th className="px-4 py-3 text-left">
                      Ações
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {instrumentos.map((instrumento) => (
                    <tr
                      key={instrumento.id}
                      className="border-b last:border-0"
                    >
                      <td className="px-4 py-4 font-semibold">
                        {instrumento.name}
                      </td>

                      <td className="px-4 py-4">
                        <div className="flex gap-2">
                          <button
                            onClick={() =>
                              editarInstrumento(instrumento)
                            }
                            className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-200"
                          >
                            Editar
                          </button>

                          <button
                            onClick={() =>
                              excluirInstrumento(instrumento)
                            }
                            className="rounded-lg bg-red-100 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-200"
                          >
                            Excluir
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>

      </div>
    </main>
  );
}