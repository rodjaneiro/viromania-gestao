"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type CaixaConfig = {
  id: string;
  start_date: string;
  initial_balance: number;
  notes: string | null;
};

type Lancamento = {
  id: string;
  transaction_date: string;
  description: string;
  transaction_type: string;
  amount: number;
  direction: "entrada" | "saida";
  notes: string | null;
};

const tipos = [
  { value: "receita", label: "Receita" },
  { value: "despesa", label: "Despesa" },
  { value: "rendimento", label: "Rendimento" },
  { value: "ajuste", label: "Ajuste" },
];

function moeda(valor: number) {
  return Number(valor || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function dataBR(data: string) {
  if (!data) return "-";
  return new Date(`${data}T12:00:00`).toLocaleDateString("pt-BR");
}

function tipoLabel(tipo: string) {
  const encontrado = tipos.find((t) => t.value === tipo);
  if (encontrado) return encontrado.label;

  const mapa: Record<string, string> = {
    saldo_inicial: "Saldo inicial",
    pagamento_musico: "Pagamento músico",
    distribuicao: "Distribuição",
    bonificacao: "Bonificação",
  };

  return mapa[tipo] || tipo;
}

export default function CaixaPage() {
  const [config, setConfig] = useState<CaixaConfig | null>(null);
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [salvandoConfig, setSalvandoConfig] = useState(false);
  const [salvandoLancamento, setSalvandoLancamento] = useState(false);

  const [dataInicio, setDataInicio] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [saldoInicial, setSaldoInicial] = useState("");
  const [observacaoInicial, setObservacaoInicial] = useState("");

  const [mostrarLancamento, setMostrarLancamento] = useState(false);
  const [dataLancamento, setDataLancamento] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [descricao, setDescricao] = useState("");
  const [tipo, setTipo] = useState("receita");
  const [direcao, setDirecao] = useState<"entrada" | "saida">("entrada");
  const [valor, setValor] = useState("");
  const [observacao, setObservacao] = useState("");

  async function carregar() {
    setCarregando(true);

    const [{ data: configData, error: configError }, { data: caixaData, error: caixaError }] =
      await Promise.all([
        supabase.from("cash_setup").select("*").limit(1).maybeSingle(),
        supabase
          .from("cash_transactions")
          .select(
            "id,transaction_date,description,transaction_type,amount,direction,notes"
          )
          .order("transaction_date", { ascending: false })
          .order("created_at", { ascending: false }),
      ]);

    if (configError) console.error(configError);
    if (caixaError) console.error(caixaError);

    if (configData) {
      setConfig({
        ...configData,
        initial_balance: Number(configData.initial_balance || 0),
      });
      setDataInicio(configData.start_date);
      setSaldoInicial(String(Number(configData.initial_balance || 0)));
      setObservacaoInicial(configData.notes || "");
    }

    setLancamentos(
      (caixaData || []).map((item) => ({
        ...item,
        amount: Number(item.amount || 0),
      }))
    );

    setCarregando(false);
  }

  useEffect(() => {
    carregar();
  }, []);

  const entradas = useMemo(
    () =>
      lancamentos
        .filter((l) => l.direction === "entrada")
        .reduce((s, l) => s + l.amount, 0),
    [lancamentos]
  );

  const saidas = useMemo(
    () =>
      lancamentos
        .filter((l) => l.direction === "saida")
        .reduce((s, l) => s + l.amount, 0),
    [lancamentos]
  );

  const saldoAtual = entradas - saidas;

  async function salvarConfiguracaoInicial() {
    const valorNumerico = Number(saldoInicial || 0);

    if (!dataInicio) {
      alert("Informe a data de início.");
      return;
    }

    if (valorNumerico < 0) {
      alert("O saldo inicial não pode ser negativo.");
      return;
    }

    setSalvandoConfig(true);

    try {
      const payload = {
        start_date: dataInicio,
        initial_balance: valorNumerico,
        notes: observacaoInicial || null,
      };

      const { error } = config
        ? await supabase.from("cash_setup").update(payload).eq("id", config.id)
        : await supabase.from("cash_setup").insert(payload);

      if (error) throw error;

      alert("Configuração inicial salva!");
      await carregar();
    } catch (error: any) {
      console.error(error);
      alert(`Erro ao salvar o caixa inicial: ${error.message || "erro desconhecido"}`);
    } finally {
      setSalvandoConfig(false);
    }
  }

  async function salvarLancamento() {
    const valorNumerico = Number(valor || 0);

    if (!descricao.trim()) {
      alert("Informe a descrição.");
      return;
    }

    if (valorNumerico <= 0) {
      alert("Informe um valor maior que zero.");
      return;
    }

    setSalvandoLancamento(true);

    try {
      const { error } = await supabase.from("cash_transactions").insert({
        transaction_date: dataLancamento,
        description: descricao.trim(),
        transaction_type: tipo,
        amount: valorNumerico,
        direction: direcao,
        notes: observacao || null,
      });

      if (error) throw error;

      setDescricao("");
      setValor("");
      setObservacao("");
      setMostrarLancamento(false);
      await carregar();
    } catch (error: any) {
      console.error(error);
      alert(`Erro ao lançar no caixa: ${error.message || "erro desconhecido"}`);
    } finally {
      setSalvandoLancamento(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-100">
      <div className="mx-auto max-w-7xl px-4 py-8">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              Financeiro
            </p>
            <h1 className="text-3xl font-extrabold text-slate-900">Caixa</h1>
            <p className="mt-1 text-sm text-slate-500">
              Controle do dinheiro que realmente entrou e saiu.
            </p>
          </div>

          <button
            onClick={() => setMostrarLancamento((v) => !v)}
            className="rounded-xl bg-slate-900 px-5 py-3 text-sm font-bold text-white hover:bg-slate-800"
          >
            {mostrarLancamento ? "Fechar lançamento" : "+ Lançamento manual"}
          </button>
        </div>

        <section className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-bold uppercase text-slate-500">Saldo atual</p>
            <p className={`mt-2 text-3xl font-extrabold ${saldoAtual >= 0 ? "text-slate-900" : "text-red-600"}`}>
              {moeda(saldoAtual)}
            </p>
          </div>

          <div className="rounded-2xl border border-green-200 bg-green-50 p-5 shadow-sm">
            <p className="text-xs font-bold uppercase text-green-700">Entradas</p>
            <p className="mt-2 text-2xl font-extrabold text-green-700">{moeda(entradas)}</p>
          </div>

          <div className="rounded-2xl border border-red-200 bg-red-50 p-5 shadow-sm">
            <p className="text-xs font-bold uppercase text-red-700">Saídas</p>
            <p className="mt-2 text-2xl font-extrabold text-red-700">{moeda(saidas)}</p>
          </div>
        </section>

        <section className="mb-6 rounded-2xl border border-blue-200 bg-white shadow-sm">
          <div className="border-b border-blue-100 bg-blue-50 px-5 py-4">
            <h2 className="text-lg font-bold text-slate-800">Implantação do caixa</h2>
            <p className="mt-1 text-sm text-slate-500">
              Cadastre aqui o valor que já existe no caixa/conta no dia em que o sistema começa.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 p-5 md:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-bold uppercase text-slate-500">
                Data de início
              </label>
              <input
                type="date"
                value={dataInicio}
                onChange={(e) => setDataInicio(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-3"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-bold uppercase text-slate-500">
                Saldo existente
              </label>
              <input
                type="number"
                step="0.01"
                value={saldoInicial}
                onChange={(e) => setSaldoInicial(e.target.value)}
                placeholder="0,00"
                className="w-full rounded-lg border border-slate-300 px-3 py-3"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-bold uppercase text-slate-500">
                Observação
              </label>
              <input
                value={observacaoInicial}
                onChange={(e) => setObservacaoInicial(e.target.value)}
                placeholder="Ex.: saldo da conta + dinheiro em caixa"
                className="w-full rounded-lg border border-slate-300 px-3 py-3"
              />
            </div>
          </div>

          <div className="flex items-center justify-between border-t border-slate-100 px-5 py-4">
            <div className="text-sm text-slate-500">
              {config
                ? `Implantado em ${dataBR(config.start_date)}`
                : "Ainda não configurado"}
            </div>

            <button
              onClick={salvarConfiguracaoInicial}
              disabled={salvandoConfig}
              className="rounded-lg bg-blue-600 px-5 py-3 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {salvandoConfig ? "Salvando..." : "Salvar saldo inicial"}
            </button>
          </div>
        </section>

        {mostrarLancamento && (
          <section className="mb-6 rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-5 py-4">
              <h2 className="text-lg font-bold text-slate-800">Lançamento manual</h2>
            </div>

            <div className="grid grid-cols-1 gap-4 p-5 md:grid-cols-2 lg:grid-cols-5">
              <div>
                <label className="mb-1 block text-xs font-bold uppercase text-slate-500">Data</label>
                <input
                  type="date"
                  value={dataLancamento}
                  onChange={(e) => setDataLancamento(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-3"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-bold uppercase text-slate-500">Descrição</label>
                <input
                  value={descricao}
                  onChange={(e) => setDescricao(e.target.value)}
                  placeholder="Ex.: rendimento"
                  className="w-full rounded-lg border border-slate-300 px-3 py-3"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-bold uppercase text-slate-500">Tipo</label>
                <select
                  value={tipo}
                  onChange={(e) => setTipo(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-3"
                >
                  {tipos.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-bold uppercase text-slate-500">Movimento</label>
                <select
                  value={direcao}
                  onChange={(e) => setDirecao(e.target.value as "entrada" | "saida")}
                  className="w-full rounded-lg border border-slate-300 px-3 py-3"
                >
                  <option value="entrada">Entrada</option>
                  <option value="saida">Saída</option>
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-bold uppercase text-slate-500">Valor</label>
                <input
                  type="number"
                  step="0.01"
                  value={valor}
                  onChange={(e) => setValor(e.target.value)}
                  placeholder="0,00"
                  className="w-full rounded-lg border border-slate-300 px-3 py-3"
                />
              </div>

              <div className="md:col-span-2 lg:col-span-4">
                <label className="mb-1 block text-xs font-bold uppercase text-slate-500">Observação</label>
                <input
                  value={observacao}
                  onChange={(e) => setObservacao(e.target.value)}
                  placeholder="Opcional"
                  className="w-full rounded-lg border border-slate-300 px-3 py-3"
                />
              </div>

              <div className="flex items-end">
                <button
                  onClick={salvarLancamento}
                  disabled={salvandoLancamento}
                  className="w-full rounded-lg bg-green-600 px-5 py-3 font-bold text-white hover:bg-green-700 disabled:opacity-50"
                >
                  {salvandoLancamento ? "Salvando..." : "Lançar"}
                </button>
              </div>
            </div>
          </section>
        )}

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
            <div>
              <h2 className="text-lg font-bold text-slate-800">Histórico do caixa</h2>
              <p className="text-sm text-slate-500">
                Recebimentos, pagamentos, distribuições, bonificações e ajustes.
              </p>
            </div>

            <button
              onClick={carregar}
              className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-200"
            >
              Atualizar
            </button>
          </div>

          {carregando ? (
            <div className="p-10 text-center text-slate-500">Carregando...</div>
          ) : lancamentos.length === 0 ? (
            <div className="p-10 text-center text-slate-500">
              Nenhum lançamento no caixa.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-5 py-4">Data</th>
                    <th className="px-5 py-4">Descrição</th>
                    <th className="px-5 py-4">Tipo</th>
                    <th className="px-5 py-4 text-right">Valor</th>
                    <th className="px-5 py-4">Observação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {lancamentos.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50">
                      <td className="px-5 py-4 text-slate-600">{dataBR(item.transaction_date)}</td>
                      <td className="px-5 py-4 font-semibold text-slate-800">{item.description}</td>
                      <td className="px-5 py-4">
                        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                          {tipoLabel(item.transaction_type)}
                        </span>
                      </td>
                      <td
                        className={`px-5 py-4 text-right font-bold ${
                          item.direction === "entrada" ? "text-green-600" : "text-red-600"
                        }`}
                      >
                        {item.direction === "entrada" ? "+" : "-"} {moeda(item.amount)}
                      </td>
                      <td className="px-5 py-4 text-slate-500">{item.notes || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
