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

type Fechamento = {
  week_start: string;
  week_end: string;
  total_musicians: number;
  total_other_expenses: number;
  rodrigo_amount: number;
  marlon_amount: number;
  rodrigo_paid: boolean;
  marlon_paid: boolean;
};

type Participacao = {
  event_id: string;
  event_cache: number;
};

type Recebimento = {
  event_revenue_id: string;
  actual_amount: number;
  actual_receipt_date: string | null;
  status: string;
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
  const [ano, mes, dia] = data.split("-");
  return `${dia}/${mes}/${ano}`;
}

function descricaoAutomatica(descricao: string) {
  const d = descricao.toLowerCase().trim();

  return (
    d === "sinal" ||
    d === "saldo final" ||
    d === "receita do evento" ||
    d.includes("recebimento legado") ||
    d.includes("recebimento do fechamento") ||
    d.includes("pagamento músico") ||
    d.includes("pagamento musico") ||
    d.includes("distribuição") ||
    d.includes("distribuicao")
  );
}

export default function CaixaPage() {
  const [config, setConfig] = useState<CaixaConfig | null>(null);
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([]);
  const [recebimentos, setRecebimentos] = useState<Recebimento[]>([]);
  const [participacoes, setParticipacoes] = useState<Participacao[]>([]);
  const [fechamentos, setFechamentos] = useState<Fechamento[]>([]);
  const [carregando, setCarregando] = useState(true);

  const [dataInicio, setDataInicio] = useState(new Date().toISOString().slice(0, 10));
  const [saldoInicial, setSaldoInicial] = useState("");
  const [observacaoInicial, setObservacaoInicial] = useState("");
  const [mostrarLancamento, setMostrarLancamento] = useState(false);
  const [dataLancamento, setDataLancamento] = useState(new Date().toISOString().slice(0, 10));
  const [descricao, setDescricao] = useState("");
  const [tipo, setTipo] = useState("receita");
  const [direcao, setDirecao] = useState<"entrada" | "saida">("entrada");
  const [valor, setValor] = useState("");
  const [observacao, setObservacao] = useState("");
  const [salvandoConfig, setSalvandoConfig] = useState(false);
  const [salvandoLancamento, setSalvandoLancamento] = useState(false);

  async function carregar() {
    try {
      setCarregando(true);

      const [
        configRes,
        lancamentosRes,
        recebimentosRes,
        participacoesRes,
        fechamentosRes,
      ] = await Promise.all([
        supabase.from("cash_setup").select("*").limit(1).maybeSingle(),
        supabase
          .from("cash_transactions")
          .select("id,transaction_date,description,transaction_type,amount,direction,notes")
          .order("transaction_date", { ascending: false })
          .order("created_at", { ascending: false }),
        supabase
          .from("event_revenue_receipts")
          .select("event_revenue_id,actual_amount,actual_receipt_date,status")
          .eq("status", "recebido"),
        supabase
          .from("event_musicians")
          .select("event_id,event_cache,payment_status"),
        supabase
          .from("weekly_closings")
          .select("week_start,week_end,total_musicians,total_other_expenses,rodrigo_amount,marlon_amount,rodrigo_paid,marlon_paid")
          .order("week_start", { ascending: true }),
      ]);

      if (configRes.error) throw configRes.error;
      if (lancamentosRes.error) throw lancamentosRes.error;
      if (recebimentosRes.error) throw recebimentosRes.error;
      if (participacoesRes.error) throw participacoesRes.error;
      if (fechamentosRes.error) throw fechamentosRes.error;

      if (configRes.data) {
        const c = {
          ...configRes.data,
          initial_balance: Number(configRes.data.initial_balance || 0),
        };
        setConfig(c);
        setDataInicio(c.start_date);
        setSaldoInicial(String(c.initial_balance));
        setObservacaoInicial(c.notes || "");
      }

      setLancamentos(
        (lancamentosRes.data || []).map((x: any) => ({
          ...x,
          amount: Number(x.amount || 0),
        }))
      );

      setRecebimentos(
        (recebimentosRes.data || []).map((x: any) => ({
          event_revenue_id: x.event_revenue_id,
          actual_amount: Number(x.actual_amount || 0),
          actual_receipt_date: x.actual_receipt_date || null,
          status: x.status,
        }))
      );

      setParticipacoes(
        (participacoesRes.data || []).map((x: any) => ({
          event_id: x.event_id,
          event_cache: Number(x.event_cache || 0),
        }))
      );

      setFechamentos(
        (fechamentosRes.data || []).map((x: any) => ({
          ...x,
          rodrigo_amount: Number(x.rodrigo_amount || 0),
          marlon_amount: Number(x.marlon_amount || 0),
        }))
      );
    } catch (error) {
      console.error(error);
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    carregar();
  }, []);

  // O caixa só é atualizado por semanas FECHADAS.
  // Uma semana futura/aberta não pode alterar saldo, entradas ou saídas.
  const ultimoFechamento = useMemo(
    () =>
      [...fechamentos]
        .sort((a, b) => a.week_end.localeCompare(b.week_end))
        .at(-1) || null,
    [fechamentos]
  );

  const dataLimiteCaixa = ultimoFechamento?.week_end || config?.start_date || "1900-01-01";

  const lancamentosManuais = useMemo(
    () =>
      lancamentos.filter(
        (l) =>
          !descricaoAutomatica(l.description) &&
          l.transaction_date >= (config?.start_date || "1900-01-01") &&
          l.transaction_date <= dataLimiteCaixa
      ),
    [lancamentos, config, dataLimiteCaixa]
  );

  const entradasManuais = useMemo(
    () =>
      lancamentosManuais
        .filter((l) => l.direction === "entrada")
        .reduce((s, l) => s + l.amount, 0),
    [lancamentosManuais]
  );

  const saidasManuais = useMemo(
    () =>
      lancamentosManuais
        .filter((l) => l.direction === "saida")
        .reduce((s, l) => s + l.amount, 0),
    [lancamentosManuais]
  );

  const recibosValidos = useMemo(
    () =>
      recebimentos.filter(
        (r) =>
          r.status === "recebido" &&
          r.actual_receipt_date &&
          r.actual_receipt_date >= (config?.start_date || "1900-01-01") &&
          r.actual_receipt_date <= dataLimiteCaixa
      ),
    [recebimentos, config, dataLimiteCaixa]
  );

  const entradasEventos = useMemo(
    () =>
      recibosValidos.reduce((s, r) => s + Number(r.actual_amount || 0), 0),
    [recibosValidos]
  );

  const obrigacoesFechadas = useMemo(
    () =>
      fechamentos.reduce(
        (s, f) =>
          s +
          Number(f.total_musicians || 0) +
          Number(f.total_other_expenses || 0) +
          Number(f.rodrigo_amount || 0) +
          Number(f.marlon_amount || 0),
        0
      ),
    [fechamentos]
  );

  const entradas = entradasEventos + entradasManuais;
  const saidas = obrigacoesFechadas + saidasManuais;

  const saldoProjetado =
    Number(config?.initial_balance || 0) +
    entradas -
    saidas;

  async function salvarConfiguracaoInicial() {
    const valorNumerico = Number(saldoInicial || 0);
    if (!dataInicio) return alert("Informe a data de início.");
    if (valorNumerico < 0) return alert("O saldo inicial não pode ser negativo.");

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

      await carregar();
      alert("Configuração inicial salva!");
    } catch (error: any) {
      alert(error.message || "Erro ao salvar o caixa.");
    } finally {
      setSalvandoConfig(false);
    }
  }

  async function salvarLancamento() {
    const valorNumerico = Number(valor || 0);

    if (!descricao.trim()) return alert("Informe a descrição.");
    if (valorNumerico <= 0) return alert("Informe um valor maior que zero.");

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
      alert(error.message || "Erro ao lançar no caixa.");
    } finally {
      setSalvandoLancamento(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-100">
      <div className="mx-auto max-w-7xl px-4 py-8">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">Financeiro</p>
            <h1 className="text-3xl font-extrabold text-slate-900">Caixa</h1>
            <p className="mt-1 text-sm text-slate-500">Controle do dinheiro que realmente entrou e saiu.</p>
          </div>
          <button
            onClick={() => setMostrarLancamento((v) => !v)}
            className="rounded-xl bg-slate-900 px-5 py-3 text-sm font-bold text-white"
          >
            {mostrarLancamento ? "Fechar lançamento" : "+ Lançamento manual"}
          </button>
        </div>

        {carregando ? (
          <div className="rounded-2xl bg-white p-10 text-center">Carregando caixa...</div>
        ) : (
          <>
            <section className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="rounded-2xl border bg-white p-5 shadow-sm">
                <p className="text-xs font-bold uppercase text-slate-500">Saldo atual</p>
                <p className={`mt-2 text-3xl font-extrabold ${saldoProjetado >= 0 ? "text-slate-900" : "text-red-600"}`}>
                  {moeda(saldoProjetado)}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Somente semanas fechadas: saldo inicial + recebimentos reais − custos
                </p>
              </div>

              <div className="rounded-2xl border border-green-200 bg-green-50 p-5 shadow-sm">
                <p className="text-xs font-bold uppercase text-green-700">Entradas</p>
                <p className="mt-2 text-2xl font-extrabold text-green-700">{moeda(entradas)}</p>
                <p className="mt-1 text-xs text-green-700">Recebimentos reais até o último fechamento + entradas manuais</p>
              </div>

              <div className="rounded-2xl border border-red-200 bg-red-50 p-5 shadow-sm">
                <p className="text-xs font-bold uppercase text-red-700">Saídas</p>
                <p className="mt-2 text-2xl font-extrabold text-red-700">{moeda(saidas)}</p>
                <p className="mt-1 text-xs text-red-700">Músicos + despesas + sócios das semanas fechadas</p>
              </div>
            </section>

            <section className="mb-6 rounded-2xl border border-blue-200 bg-white shadow-sm">
              <div className="border-b border-blue-100 bg-blue-50 px-5 py-4">
                <h2 className="text-lg font-bold">Implantação do caixa</h2>
                <p className="mt-1 text-sm text-slate-500">Valor que já existia no caixa quando o sistema começou.</p>
              </div>
              <div className="grid grid-cols-1 gap-4 p-5 md:grid-cols-3">
                <div>
                  <label className="mb-1 block text-xs font-bold uppercase text-slate-500">Data de início</label>
                  <input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} className="w-full rounded-lg border px-3 py-3" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold uppercase text-slate-500">Saldo existente</label>
                  <input type="number" step="0.01" value={saldoInicial} onChange={(e) => setSaldoInicial(e.target.value)} className="w-full rounded-lg border px-3 py-3" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold uppercase text-slate-500">Observação</label>
                  <input value={observacaoInicial} onChange={(e) => setObservacaoInicial(e.target.value)} className="w-full rounded-lg border px-3 py-3" />
                </div>
              </div>
              <div className="flex items-center justify-between border-t p-5">
                <span className="text-sm text-slate-500">Implantado em {dataBR(config?.start_date || dataInicio)}</span>
                <button onClick={salvarConfiguracaoInicial} disabled={salvandoConfig} className="rounded-lg bg-blue-600 px-5 py-3 text-sm font-bold text-white">
                  {salvandoConfig ? "Salvando..." : "Salvar saldo inicial"}
                </button>
              </div>
            </section>

            {mostrarLancamento && (
              <section className="mb-6 rounded-2xl border bg-white p-5 shadow-sm">
                <h2 className="text-lg font-bold">Lançamento manual</h2>
                <div className="mt-4 grid gap-4 md:grid-cols-5">
                  <input type="date" value={dataLancamento} onChange={(e) => setDataLancamento(e.target.value)} className="rounded-lg border px-3 py-3" />
                  <input value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Descrição" className="rounded-lg border px-3 py-3" />
                  <select value={tipo} onChange={(e) => setTipo(e.target.value)} className="rounded-lg border px-3 py-3">
                    {tipos.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                  <select value={direcao} onChange={(e) => setDirecao(e.target.value as any)} className="rounded-lg border px-3 py-3">
                    <option value="entrada">Entrada</option>
                    <option value="saida">Saída</option>
                  </select>
                  <input type="number" step="0.01" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="Valor" className="rounded-lg border px-3 py-3" />
                </div>
                <textarea value={observacao} onChange={(e) => setObservacao(e.target.value)} placeholder="Observação" className="mt-4 w-full rounded-lg border px-3 py-3" />
                <button onClick={salvarLancamento} disabled={salvandoLancamento} className="mt-4 rounded-lg bg-slate-900 px-5 py-3 text-sm font-bold text-white">
                  {salvandoLancamento ? "Salvando..." : "Salvar lançamento"}
                </button>
              </section>
            )}

            <section className="rounded-2xl border bg-white shadow-sm">
              <div className="border-b p-5">
                <h2 className="text-lg font-bold">Histórico do caixa</h2>
                <p className="text-sm text-slate-500">Os recebimentos dos eventos aparecem pelo histórico real de recebimento.</p>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 text-left text-xs font-bold uppercase text-slate-500">
                    <tr>
                      <th className="px-5 py-3">Data</th>
                      <th className="px-5 py-3">Descrição</th>
                      <th className="px-5 py-3">Tipo</th>
                      <th className="px-5 py-3">Valor</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {lancamentosManuais.map((l) => (
                      <tr key={l.id}>
                        <td className="px-5 py-3">{dataBR(l.transaction_date)}</td>
                        <td className="px-5 py-3 font-semibold">{l.description}</td>
                        <td className="px-5 py-3">{l.direction === "entrada" ? "Entrada" : "Saída"}</td>
                        <td className={`px-5 py-3 font-bold ${l.direction === "entrada" ? "text-green-700" : "text-red-700"}`}>
                          {l.direction === "entrada" ? "+" : "-"} {moeda(l.amount)}
                        </td>
                      </tr>
                    ))}
                    {lancamentosManuais.length === 0 && (
                      <tr><td colSpan={4} className="px-5 py-10 text-center text-slate-500">Nenhum lançamento manual.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
