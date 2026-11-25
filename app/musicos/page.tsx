"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Musico = {
  id: string;
  name: string;
  type: string;
  cache: number;
  pix: string;
  active: boolean;
  instrumentos: string[];
};

export default function MusicosPage() {
  const [musicos, setMusicos] = useState<Musico[]>([]);
  const [loading, setLoading] = useState(true);

  const [nome, setNome] = useState("");
  const [tipo, setTipo] = useState("Fixo");
  const [cache, setCache] = useState("");
  const [pix, setPix] = useState("");
  const [instrumentos, setInstrumentos] = useState<{ id: string; name: string }[]>([]);
const [instrumentosSelecionados, setInstrumentosSelecionados] = useState<string[]>([]);
const [musicoEditando, setMusicoEditando] = useState<Musico | null>(null);
const [sucessoCadastro, setSucessoCadastro] = useState("");

const [editNome, setEditNome] = useState("");
const [editTipo, setEditTipo] = useState("Fixo");
const [editCache, setEditCache] = useState("");
const [editPix, setEditPix] = useState("");
const [editInstrumentosSelecionados, setEditInstrumentosSelecionados] =
  useState<string[]>([]);

// Novo instrumento (direto do cadastro de músicos)
const [novoInstrumento, setNovoInstrumento] = useState("");
const [novoInstrumentoEdit, setNovoInstrumentoEdit] = useState("");
const [salvandoInstrumento, setSalvandoInstrumento] = useState(false);

async function adicionarNovoInstrumento(modo: "novo" | "edicao") {
  const nomeInstrumento = (
    modo === "novo" ? novoInstrumento : novoInstrumentoEdit
  ).trim();

  if (!nomeInstrumento) {
    alert("Digite o nome do novo instrumento.");
    return;
  }

  const selecionar = (id: string) => {
    if (modo === "novo") {
      setInstrumentosSelecionados((atual) =>
        atual.includes(id) ? atual : [...atual, id]
      );
      setNovoInstrumento("");
    } else {
      setEditInstrumentosSelecionados((atual) =>
        atual.includes(id) ? atual : [...atual, id]
      );
      setNovoInstrumentoEdit("");
    }
  };

  // Se já existir, apenas marca
  const existente = instrumentos.find(
    (item) => item.name.trim().toLowerCase() === nomeInstrumento.toLowerCase()
  );

  if (existente) {
    selecionar(existente.id);
    return;
  }

  setSalvandoInstrumento(true);

  const { data: criado, error } = await supabase
    .from("instruments")
    .insert({ name: nomeInstrumento })
    .select("id, name")
    .single();

  setSalvandoInstrumento(false);

  if (error) {
    alert("Erro ao adicionar instrumento: " + error.message);
    return;
  }

  setInstrumentos((atual) =>
    [...atual, criado].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
  );
  selecionar(criado.id);
}

function campoNovoInstrumento(modo: "novo" | "edicao") {
  const valor = modo === "novo" ? novoInstrumento : novoInstrumentoEdit;
  const setValor = modo === "novo" ? setNovoInstrumento : setNovoInstrumentoEdit;

  return (
    <div className="mt-2 flex gap-2">
      <input
        value={valor}
        onChange={(e) => setValor(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            adicionarNovoInstrumento(modo);
          }
        }}
        placeholder="Não achou? Digite um novo instrumento"
        className="w-full rounded-xl border border-slate-400 bg-white p-2 text-sm text-slate-900 outline-none focus:border-[#751515]"
      />
      <button
        type="button"
        disabled={salvandoInstrumento}
        onClick={() => adicionarNovoInstrumento(modo)}
        className="whitespace-nowrap rounded-xl border border-[#751515] px-4 py-2 text-sm font-semibold text-[#751515] hover:bg-[#751515] hover:text-white disabled:opacity-50"
      >
        {salvandoInstrumento ? "Salvando..." : "+ Novo instrumento"}
      </button>
    </div>
  );
}

async function carregarMusicos() {
  setLoading(true);

  // Carregar instrumentos
  const {
    data: instrumentosData,
    error: instrumentosError,
  } = await supabase
    .from("instruments")
    .select("id, name")
    .order("name");

  if (instrumentosError) {
    console.error("Erro ao carregar instrumentos:", instrumentosError);
  } else {
    setInstrumentos(instrumentosData || []);
  }

  // Carregar músicos
  const { data: musicosData, error: musicosError } = await supabase
    .from("musicians")
    .select("*")
    .order("name");

  if (musicosError) {
    console.error("Erro ao carregar músicos:", musicosError);
    setLoading(false);
    return;
  }

  // Carregar instrumentos vinculados aos músicos
  const { data: vinculos, error: vinculosError } = await supabase
    .from("musician_instruments")
    .select("musician_id, instrument_id");

  if (vinculosError) {
    console.error(
      "Erro ao carregar instrumentos dos músicos:",
      vinculosError
    );
  }

  // Montar a lista final de músicos com seus instrumentos
  const musicosComInstrumentos = (musicosData || []).map((musico) => {
    const instrumentosDoMusico = (vinculos || [])
      .filter((vinculo) => vinculo.musician_id === musico.id)
      .map((vinculo) => {
        const instrumento = (instrumentosData || []).find(
          (item) => item.id === vinculo.instrument_id
        );

        return instrumento?.name || "";
      })
      .filter(Boolean);

    return {
      ...musico,
      instrumentos: instrumentosDoMusico,
    };
  });

  setMusicos(musicosComInstrumentos);
  setLoading(false);
}

  async function cadastrarMusico(e: React.FormEvent) {
    e.preventDefault();

    if (!nome || !cache) {
      alert("Preencha o nome e o cachê.");
      return;
    }

    const { data: novoMusico, error } = await supabase
  .from("musicians")
  .insert({
    name: nome,
    type: tipo,
    cache: Number(cache),
    pix: pix,
    active: true,
  })
  .select("id")
  .single();

if (error) {
  alert("Erro ao cadastrar músico: " + error.message);
  return;
}

// Salvar os instrumentos selecionados
if (instrumentosSelecionados.length > 0) {
  const relacoes = instrumentosSelecionados.map((instrumentoId) => ({
    musician_id: novoMusico.id,
    instrument_id: instrumentoId,
  }));

  const { error: instrumentosError } = await supabase
    .from("musician_instruments")
    .insert(relacoes);

  if (instrumentosError) {
    alert(
      "Músico cadastrado, mas houve erro ao salvar os instrumentos: " +
        instrumentosError.message
    );
    return;
  }
}

    setNome("");
    setTipo("Fixo");
    setCache("");
    setPix("");
    setInstrumentosSelecionados([]);

    // Sobe a tela para cadastrar o próximo
    setSucessoCadastro(`${nome} cadastrado com sucesso! Pode cadastrar o próximo.`);
    window.scrollTo({ top: 0, behavior: "smooth" });
    window.setTimeout(() => {
      document.getElementById("novo-musico-nome")?.focus({ preventScroll: true });
    }, 400);
    window.setTimeout(() => setSucessoCadastro(""), 6000);

    carregarMusicos();
  }
  async function excluirMusico(id: string, nome: string) {
  const confirmar = window.confirm(
    `Tem certeza que deseja excluir o músico "${nome}"?`
  );

  if (!confirmar) {
    return;
  }

  const { error } = await supabase
    .from("musicians")
    .delete()
    .eq("id", id);

  if (error) {
    alert("Erro ao excluir músico: " + error.message);
    return;
  }

  alert("Músico excluído com sucesso!");

  carregarMusicos();
}
function editarMusico(musico: Musico) {
  setMusicoEditando(musico);

  setEditNome(musico.name);
  setEditTipo(musico.type);
  setEditCache(String(musico.cache));
  setEditPix(musico.pix || "");

  const idsDosInstrumentos = (musico.instrumentos || [])
    .map((nomeInstrumento) => {
      const instrumento = instrumentos.find(
        (item) =>
          item.name.toLowerCase() === nomeInstrumento.toLowerCase()
      );

      return instrumento?.id;
    })
    .filter((id): id is string => Boolean(id));

  setEditInstrumentosSelecionados(idsDosInstrumentos);
}

async function salvarEdicaoMusico() {
  if (!musicoEditando) return;

  if (!editNome || !editCache) {
    alert("Preencha o nome e o cachê.");
    return;
  }

  const { error } = await supabase
    .from("musicians")
    .update({
      name: editNome,
      type: editTipo,
      cache: Number(editCache),
      pix: editPix,
    })
    .eq("id", musicoEditando.id);

  if (error) {
    alert("Erro ao atualizar músico: " + error.message);
    return;
  }

  // Remover instrumentos antigos
  const { error: erroRemover } = await supabase
    .from("musician_instruments")
    .delete()
    .eq("musician_id", musicoEditando.id);

  if (erroRemover) {
    alert(
      "Músico atualizado, mas houve erro ao atualizar os instrumentos: " +
        erroRemover.message
    );
    return;
  }

  // Adicionar novos instrumentos
  if (editInstrumentosSelecionados.length > 0) {
    const relacoes = editInstrumentosSelecionados.map((instrumentoId) => ({
      musician_id: musicoEditando.id,
      instrument_id: instrumentoId,
    }));

    const { error: erroInstrumentos } = await supabase
      .from("musician_instruments")
      .insert(relacoes);

    if (erroInstrumentos) {
      alert(
        "Músico atualizado, mas houve erro ao salvar os instrumentos: " +
          erroInstrumentos.message
      );
      return;
    }
  }

  alert("Músico atualizado com sucesso!");

  setMusicoEditando(null);
  carregarMusicos();
}

  useEffect(() => {
    carregarMusicos();
  }, []);

  return (
    <main className="min-h-screen bg-slate-50">

      <header className="border-b bg-white px-6 py-5 md:px-10">
        <h1 className="text-3xl font-bold">
          Músicos
        </h1>

        <p className="mt-1 text-slate-600">
          Cadastro e gerenciamento dos músicos da ViroMania
        </p>
      </header>

      <div className="p-3 sm:p-6 md:p-10">

        {/* FORMULÁRIO */}
        {sucessoCadastro && (
          <div className="mb-3 rounded-xl border border-green-300 bg-green-50 p-3 text-sm font-semibold text-green-800">
            {sucessoCadastro}
          </div>
        )}

        <section id="novo-musico" className="scroll-mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">

          <h2 className="text-xl font-bold">
            Novo músico
          </h2>

          <form
            onSubmit={cadastrarMusico}
            className="mt-6 grid gap-4 md:grid-cols-2"
          >

            <div>
              <label className="text-sm font-semibold text-slate-800">
                Nome
              </label>

              <input
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                id="novo-musico-nome"
                placeholder="Nome do músico"
                className="mt-2 w-full rounded-xl border border-slate-400 p-3 text-base text-slate-900 outline-none focus:border-[#751515]"
              />
            </div>

            <div>
              <label className="text-sm font-semibold text-slate-800">
                Tipo
              </label>

              <select
                value={tipo}
                onChange={(e) => setTipo(e.target.value)}
                className="mt-2 w-full rounded-xl border border-slate-400 p-3 text-base text-slate-900"
              >
                <option>Fixo</option>
                <option>Freelancer</option>
              </select>
            </div>
            <div>
  <label className="text-sm font-semibold text-slate-800">
    Instrumentos
  </label>

  <div className="mt-2 grid grid-cols-2 gap-2 rounded-xl border border-slate-400 p-3 text-base text-slate-900 md:grid-cols-3">
    {instrumentos.map((instrumento) => (
      <label
        key={instrumento.id}
        className="flex cursor-pointer items-center gap-2 rounded-lg p-2 hover:bg-slate-50"
      >
        <input
          type="checkbox"
          checked={instrumentosSelecionados.includes(instrumento.id)}
          onChange={(e) => {
            if (e.target.checked) {
              setInstrumentosSelecionados([
                ...instrumentosSelecionados,
                instrumento.id,
              ]);
            } else {
              setInstrumentosSelecionados(
                instrumentosSelecionados.filter(
                  (id) => id !== instrumento.id
                )
              );
            }
          }}
        />

        <span className="text-sm font-medium text-slate-800">
          {instrumento.name}
        </span>
      </label>
    ))}
  </div>

  {campoNovoInstrumento("novo")}
</div>

            <div>
              <label className="text-sm font-semibold text-slate-800">
                Cachê padrão
              </label>

              <input
                type="number"
                step="0.01"
                value={cache}
                onChange={(e) => setCache(e.target.value)}
                placeholder="Ex.: 300"
                className="mt-2 w-full rounded-xl border border-slate-400 p-3 text-base text-slate-900"
              />
            </div>

            <div>
              <label className="text-sm font-semibold text-slate-800">
                Chave PIX
              </label>

              <input
                value={pix}
                onChange={(e) => setPix(e.target.value)}
                placeholder="CPF, telefone, e-mail ou chave aleatória"
                className="mt-2 w-full rounded-xl border border-slate-400 p-3 text-base text-slate-900"
              />
            </div>

            <div className="md:col-span-2">

              <button
                type="submit"
                className="rounded-xl bg-[#751515] px-6 py-3 font-semibold text-white hover:bg-[#5f1010]"
              >
                + Cadastrar músico
              </button>

            </div>

          </form>

        </section>

        {/* EDIÇÃO DO MÚSICO */}
{musicoEditando && (
  <section id="editar-musico" className="mb-8 mt-8 scroll-mt-4 rounded-2xl border border-yellow-300 bg-yellow-50 p-4 shadow-sm sm:p-6">
    <div className="flex items-center justify-between">
      <h2 className="text-xl font-bold">
        Editar músico
      </h2>

      <button
        type="button"
        onClick={() => setMusicoEditando(null)}
        className="rounded-lg bg-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-300"
      >
        Cancelar
      </button>
    </div>

    <form
      onSubmit={(e) => {
        e.preventDefault();
        salvarEdicaoMusico();
      }}
      className="mt-6 grid gap-4 md:grid-cols-2"
    >
      <div>
        <label className="text-sm font-semibold text-slate-800">
          Nome
        </label>

        <input
          value={editNome}
          onChange={(e) => setEditNome(e.target.value)}
          className="mt-2 w-full rounded-xl border border-slate-400 p-3 text-base text-slate-900"
          placeholder="Nome do músico"
        />
      </div>

      <div>
        <label className="text-sm font-semibold text-slate-800">
          Tipo
        </label>

        <select
          value={editTipo}
          onChange={(e) => setEditTipo(e.target.value)}
          className="mt-2 w-full rounded-xl border border-slate-400 p-3 text-base text-slate-900"
        >
          <option>Fixo</option>
          <option>Freelancer</option>
        </select>
      </div>

      <div>
        <label className="text-sm font-semibold text-slate-800">
          Cachê padrão
        </label>

        <input
          type="number"
          step="0.01"
          value={editCache}
          onChange={(e) => setEditCache(e.target.value)}
          className="mt-2 w-full rounded-xl border border-slate-400 p-3 text-base text-slate-900"
          placeholder="Ex.: 300"
        />
      </div>

      <div>
        <label className="text-sm font-semibold text-slate-800">
          Chave PIX
        </label>

        <input
          value={editPix}
          onChange={(e) => setEditPix(e.target.value)}
          className="mt-2 w-full rounded-xl border border-slate-400 p-3 text-base text-slate-900"
          placeholder="CPF, telefone, e-mail ou chave aleatória"
        />
      </div>

      <div className="md:col-span-2">
        <label className="text-sm font-semibold text-slate-800">
          Instrumentos
        </label>

        <div className="mt-2 grid grid-cols-2 gap-1 rounded-xl border border-slate-400 p-2 md:grid-cols-3">
          {instrumentos.map((instrumento) => (
            <label
              key={instrumento.id}
              className="flex cursor-pointer items-center gap-2 rounded-lg p-2 hover:bg-slate-50"
            >
              <input
                type="checkbox"
                checked={editInstrumentosSelecionados.includes(instrumento.id)}
                onChange={(e) => {
                  if (e.target.checked) {
                    setEditInstrumentosSelecionados([
                      ...editInstrumentosSelecionados,
                      instrumento.id,
                    ]);
                  } else {
                    setEditInstrumentosSelecionados(
                      editInstrumentosSelecionados.filter(
                        (id) => id !== instrumento.id
                      )
                    );
                  }
                }}
              />

              <span className="text-sm font-medium text-slate-800">
                {instrumento.name}
              </span>
            </label>
          ))}
        </div>

        {campoNovoInstrumento("edicao")}
      </div>

      <div className="md:col-span-2">
        <button
          type="submit"
          className="rounded-xl bg-[#751515] px-6 py-3 font-semibold text-white hover:bg-[#5f1010]"
        >
          Salvar alterações
        </button>
      </div>
    </form>
  </section>
)}

        {/* LISTA */}
        <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">

          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold">
              Músicos cadastrados
            </h2>

            <span className="rounded-full bg-slate-100 px-3 py-1 text-sm">
              {musicos.length}
            </span>
          </div>

          <div className="mt-6 overflow-x-auto">

            {loading ? (
              <p className="text-slate-500">
                Carregando...
              </p>
            ) : musicos.length === 0 ? (
              <div className="rounded-xl border border-dashed p-10 text-center text-slate-500">
                Nenhum músico cadastrado.
              </div>
            ) : (
              <>
              <div className="divide-y divide-slate-100 md:hidden">
                {musicos.map((musico) => (
                  <div key={`m-${musico.id}`} className="py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-semibold">{musico.name}</div>
                        <div className="text-xs text-slate-700">
                          {musico.type} · R$ {Number(musico.cache).toFixed(2).replace(".", ",")}
                        </div>
                        <div className="mt-0.5 text-xs text-slate-700">
                          {musico.instrumentos?.length > 0 ? musico.instrumentos.join(", ") : "Sem instrumento"}
                        </div>
                        {musico.pix && (
                          <div className="mt-0.5 break-all text-xs text-slate-600">PIX: {musico.pix}</div>
                        )}
                      </div>
                      <div className="flex shrink-0 gap-2">
                        <button
                          onClick={() => {
                            editarMusico(musico);
                            setTimeout(() => document.getElementById("editar-musico")?.scrollIntoView({ behavior: "smooth" }), 50);
                          }}
                          className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700"
                        >
                          Editar
                        </button>
                        <button
                          onClick={() => excluirMusico(musico.id, musico.name)}
                          className="rounded-lg bg-red-100 px-3 py-2 text-xs font-semibold text-red-700"
                        >
                          Excluir
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <table className="hidden w-full text-left md:table">

                <thead>
                  <tr className="border-b text-sm text-slate-500">
                    <th className="px-4 py-3">Nome</th>
                    <th className="px-4 py-3">Instrumentos</th>
                    <th className="px-4 py-3">Tipo</th>
                    <th className="px-4 py-3">Cachê</th>
                    <th className="px-4 py-3">PIX</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-left">Ações</th>
                  </tr>
                </thead>

                <tbody>
                  {musicos.map((musico) => (
                    <tr
                      key={musico.id}
                      className="border-b last:border-0"
                    >
                      <td className="px-4 py-4 font-semibold">
                        {musico.name}
                      </td>

                      <td className="px-4 py-4">
  {musico.instrumentos?.length > 0
    ? musico.instrumentos.join(", ")
    : "-"}
</td>

                      <td className="px-4 py-4">
                        {musico.type}
                      </td>

                      <td className="px-4 py-4">
                        R$ {Number(musico.cache).toFixed(2).replace(".", ",")}
                      </td>

                      <td className="px-4 py-4 text-sm text-slate-500">
                        {musico.pix || "-"}
                      </td>

                      <td className="px-4 py-4">
                        <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-700">
                          Ativo
                        </span>
                        </td>
                        <td className="px-4 py-4">
  <div className="flex gap-2">
    <button
      onClick={() => editarMusico(musico)}
      className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-200"
    >
      Editar
    </button>

    <button
      onClick={() => excluirMusico(musico.id, musico.name)}
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
              </>
            )}

          </div>

        </section>

      </div>
    </main>
  );
}
