"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  MANUAL_PREFIX,
  calcularCaixa,
  registrarAjusteSaldo,
  ehAjusteSaldo,
} from "@/lib/caixa";

type AnyRow = Record<string, any>;

function brl(v: number) {
  return Number(v || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function iso(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
    2,
    "0"
  )}-${String(d.getDate()).padStart(2, "0")}`;
}

function parseValor(v: string) {
  const s = String(v || "").trim();
  if (!s) return NaN;
  // Aceita "12.345,67", "12345,67" e "12345.67"
  const normalizado = s.includes(",")
    ? s.replace(/\./g, "").replace(",", ".")
    : s;
  return Number(normalizado);
}

function dataBR(d: string) {
  if (!d || d.startsWith("1900")) return "-";
  return new Date(`${d.slice(0, 10)}T12:00:00`).toLocaleDateString("pt-BR");
}

export default function CaixaPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [data, setData] = useState<AnyRow | null>(null);
  const [showForm, setShowForm] = useState(false);

  // Ajuste de saldo (fica registrado no histórico)
  const [showAjuste, setShowAjuste] = useState(false);
  const [ajuste, setAjuste] = useState({ valor: "", motivo: "" });

  const [form, setForm] = useState({
    direction: "entrada",
    transaction_date: iso(new Date()),
    amount: "",
    description: "",
    notes: "",
  });

  async function runTest() {
    try {
      setLoading(true);
      setError("");
      setData(await calcularCaixa());
    } catch (e: any) {
      console.error(e);
      setError(e?.message || "Erro ao calcular o caixa.");
    } finally {
      setLoading(false);
    }
  }

  async function salvarAjuste() {
    try {
      setSaving(true);
      setError("");
      setSuccess("");

      const valor = parseValor(ajuste.valor);

      if (!Number.isFinite(valor)) {
        throw new Error("Informe o saldo real que está no caixa.");
      }

      if (!ajuste.motivo.trim()) {
        throw new Error("Informe o motivo do ajuste (ex.: rendimento da conta, correção).");
      }

      const { saldoAnterior, diferenca } = await registrarAjusteSaldo({
        saldoNovo: valor,
        motivo: ajuste.motivo,
      });

      setSuccess(
        `Ajuste registrado: saldo de ${brl(saldoAnterior)} para ${brl(valor)} (${diferenca > 0 ? "+" : "−"}${brl(Math.abs(diferenca))}).`
      );
      setShowAjuste(false);
      setAjuste({ valor: "", motivo: "" });

      await runTest();
    } catch (e: any) {
      console.error(e);
      setError(e?.message || "Não foi possível ajustar o saldo do caixa.");
    } finally {
      setSaving(false);
    }
  }

  // =========================================================
  // SALVAR MOVIMENTAÇÃO
  // =========================================================
  async function saveMovement() {
    try {
      setSaving(true);
      setError("");
      setSuccess("");

      // Aceita "1.500,00", "1500,00" e "1500.00"
      const amount = Math.round(parseValor(form.amount) * 100) / 100;

      if (!form.transaction_date) {
        throw new Error(
          "Informe a data da movimentação."
        );
      }

      // Lançamentos antes do início do caixa não entrariam no saldo
      if (data?.startDate && form.transaction_date < String(data.startDate)) {
        throw new Error(
          `A data não pode ser anterior a ${dataBR(String(data.startDate))}, quando o saldo atual do caixa começou a ser contado.`
        );
      }

      if (!Number.isFinite(amount) || amount <= 0) {
        throw new Error(
          "Informe um valor válido."
        );
      }

      if (!form.description.trim()) {
        throw new Error(
          "Informe a descrição da movimentação."
        );
      }

      const cleanNotes =
        form.notes.trim();

      const finalNotes = cleanNotes
        ? `${MANUAL_PREFIX} | ${cleanNotes}`
        : MANUAL_PREFIX;

      const { error: insertError } =
        await supabase
          .from("cash_transactions")
          .insert({
            transaction_date:
              form.transaction_date,

            description:
              form.description.trim(),

            // A tabela atual aceita "receita".
            transaction_type:
              "receita",

            amount,

            direction:
              form.direction,

            notes: finalNotes,
          });

      if (insertError) {
        throw insertError;
      }

      setSuccess(
        "Movimentação registrada com sucesso."
      );

      setForm({
        direction: "entrada",
        transaction_date: iso(new Date()),
        amount: "",
        description: "",
        notes: "",
      });

      setShowForm(false);

      await runTest();
    } catch (e: any) {
      console.error(e);

      setError(
        e?.message ||
          "Não foi possível salvar a movimentação."
      );
    } finally {
      setSaving(false);
    }
  }

  // =========================================================
  // CARREGAMENTO
  // =========================================================
  useEffect(() => {
    runTest();
  }, []);

  // =========================================================
  // INTERFACE
  // =========================================================
  return (
    <main className="min-h-screen bg-slate-100 p-4 text-slate-900">
      <div className="mx-auto max-w-6xl">

        {/* CABEÇALHO */}
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">

          <div>
            <div className="text-xs font-semibold uppercase text-blue-700">
              Financeiro
            </div>

            <h1 className="text-2xl sm:text-3xl font-bold">
              Caixa ViroMania
            </h1>

            <p className="text-sm text-slate-500">
              Controle de entradas e saídas reais do caixa.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">

            <button
              onClick={() => {
                setShowAjuste(true);
                setShowForm(false);
                setError("");
                setSuccess("");
              }}
              className="rounded-lg bg-amber-500 px-3 py-2 text-xs font-bold sm:px-4 sm:py-2.5 sm:text-sm text-white shadow hover:bg-amber-600"
            >
              Ajustar saldo do caixa
            </button>

            <button
              onClick={() => {
                setShowForm(true);
                setError("");
                setSuccess("");
              }}
              className="rounded-lg bg-green-600 px-3 py-2 text-xs font-bold sm:px-4 sm:py-2.5 sm:text-sm text-white shadow hover:bg-green-700"
            >
              + Nova movimentação
            </button>

            <button
              onClick={runTest}
              className="col-span-2 rounded-lg bg-slate-900 px-3 py-2 text-xs font-bold sm:px-4 sm:py-2.5 sm:text-sm text-white sm:col-span-1"
            >
              Recalcular
            </button>

          </div>
        </div>

        {/* ERRO */}
        {error && (
          <div className="mb-4 rounded-lg border border-red-300 bg-red-50 p-4 text-red-700">
            <b>ERRO:</b> {error}
          </div>
        )}

        {/* SUCESSO */}
        {success && (
          <div className="mb-4 rounded-lg border border-green-300 bg-green-50 p-4 text-green-700">
            <b>Sucesso:</b> {success}
          </div>
        )}

        {/* AJUSTE DO SALDO */}
        {showAjuste && data && (
          <section className="mb-5 rounded-xl border border-amber-300 bg-amber-50 p-5 shadow">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-bold sm:text-lg">Ajustar saldo do caixa</h2>
                <p className="text-sm text-slate-600">
                  Informe quanto existe de verdade no caixa hoje. A diferença vira um
                  lançamento com data, usuário e motivo, que fica no histórico de ajustes
                  e não pode ser apagado pela tela.
                </p>
              </div>

              <button
                onClick={() => setShowAjuste(false)}
                className="rounded-lg px-3 py-2 text-sm font-bold text-slate-500 hover:bg-amber-100"
              >
                Fechar
              </button>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-semibold">
                  Saldo real em caixa hoje
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="Ex.: 5.831,56"
                  value={ajuste.valor}
                  onChange={(e) => setAjuste({ ...ajuste, valor: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-3 text-lg font-bold outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold">
                  Motivo do ajuste
                </label>
                <input
                  type="text"
                  placeholder="Ex.: Rendimento da conta do grupo"
                  value={ajuste.motivo}
                  onChange={(e) => setAjuste({ ...ajuste, motivo: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-3 outline-none focus:border-amber-500"
                />
              </div>
            </div>

            {Number.isFinite(parseValor(ajuste.valor)) && (
              <div className="mt-4 rounded-lg border bg-white p-4 text-sm">
                <div>
                  Saldo no sistema: <b>{brl(data.currentBalance)}</b>
                </div>
                <div>
                  Saldo informado: <b>{brl(parseValor(ajuste.valor))}</b>
                </div>
                <div className="mt-1 text-base">
                  Ajuste:{" "}
                  <b
                    className={
                      parseValor(ajuste.valor) - data.currentBalance >= 0
                        ? "text-green-700"
                        : "text-red-700"
                    }
                  >
                    {parseValor(ajuste.valor) - data.currentBalance >= 0 ? "+" : "−"}
                    {brl(Math.abs(parseValor(ajuste.valor) - data.currentBalance))}
                  </b>{" "}
                  em {dataBR(iso(new Date()))}
                </div>
              </div>
            )}

            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setShowAjuste(false)}
                className="rounded-lg border bg-white px-5 py-3 text-sm font-bold text-slate-600"
              >
                Cancelar
              </button>
              <button
                onClick={salvarAjuste}
                disabled={saving}
                className="rounded-lg bg-amber-600 px-5 py-3 text-sm font-bold text-white disabled:opacity-50"
              >
                {saving ? "Registrando..." : "Registrar ajuste"}
              </button>
            </div>
          </section>
        )}

        {/* FORMULÁRIO */}
        {showForm && (
          <section className="mb-5 rounded-xl border bg-white p-5 shadow">

            <div className="mb-5 flex items-center justify-between">

              <div>
                <h2 className="text-base font-bold sm:text-lg">
                  Nova movimentação
                </h2>

                <p className="text-sm text-slate-500">
                  Registre qualquer dinheiro que entrou ou saiu do caixa.
                </p>
              </div>

              <button
                onClick={() =>
                  setShowForm(false)
                }
                className="rounded-lg px-3 py-2 text-sm font-bold text-slate-500 hover:bg-slate-100"
              >
                Fechar
              </button>

            </div>

            <div className="grid gap-4 md:grid-cols-2">

              {/* TIPO */}
              <div>

                <label className="mb-2 block text-sm font-semibold">
                  Tipo
                </label>

                <div className="grid grid-cols-2 gap-2">

                  <button
                    type="button"
                    onClick={() =>
                      setForm({
                        ...form,
                        direction:
                          "entrada",
                      })
                    }
                    className={`rounded-lg border p-3 text-sm font-bold ${
                      form.direction ===
                      "entrada"
                        ? "border-green-500 bg-green-50 text-green-700"
                        : "bg-white text-slate-600"
                    }`}
                  >
                    🟢 Entrada
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      setForm({
                        ...form,
                        direction:
                          "saida",
                      })
                    }
                    className={`rounded-lg border p-3 text-sm font-bold ${
                      form.direction ===
                      "saida"
                        ? "border-red-500 bg-red-50 text-red-700"
                        : "bg-white text-slate-600"
                    }`}
                  >
                    🔴 Saída
                  </button>

                </div>
              </div>

              {/* DATA */}
              <div>

                <label className="mb-2 block text-sm font-semibold">
                  Data
                </label>

                <input
                  type="date"
                  min={data?.startDate && !String(data.startDate).startsWith("1900") ? String(data.startDate) : undefined}
                  value={
                    form.transaction_date
                  }
                  onChange={(e) =>
                    setForm({
                      ...form,
                      transaction_date:
                        e.target.value,
                    })
                  }
                  className="w-full rounded-lg border border-slate-300 px-3 py-3 outline-none focus:border-blue-500"
                />

              </div>

              {/* VALOR */}
              <div>

                <label className="mb-2 block text-sm font-semibold">
                  Valor
                </label>

                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="0,00"
                  value={form.amount}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      amount:
                        e.target.value,
                    })
                  }
                  className="w-full rounded-lg border border-slate-300 px-3 py-3 outline-none focus:border-blue-500"
                />

              </div>

              {/* DESCRIÇÃO */}
              <div>

                <label className="mb-2 block text-sm font-semibold">
                  Descrição
                </label>

                <input
                  type="text"
                  placeholder="Ex.: Compra de microfone"
                  value={
                    form.description
                  }
                  onChange={(e) =>
                    setForm({
                      ...form,
                      description:
                        e.target.value,
                    })
                  }
                  className="w-full rounded-lg border border-slate-300 px-3 py-3 outline-none focus:border-blue-500"
                />

              </div>

              {/* OBSERVAÇÃO */}
              <div className="md:col-span-2">

                <label className="mb-2 block text-sm font-semibold">
                  Observação
                </label>

                <textarea
                  rows={3}
                  placeholder="Observação opcional"
                  value={form.notes}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      notes:
                        e.target.value,
                    })
                  }
                  className="w-full rounded-lg border border-slate-300 px-3 py-3 outline-none focus:border-blue-500"
                />

              </div>

            </div>

            <div className="mt-5 flex justify-end gap-2">

              <button
                onClick={() =>
                  setShowForm(false)
                }
                className="rounded-lg border px-5 py-3 text-sm font-bold text-slate-600"
              >
                Cancelar
              </button>

              <button
                onClick={saveMovement}
                disabled={saving}
                className="rounded-lg bg-blue-600 px-5 py-3 text-sm font-bold text-white disabled:opacity-50"
              >
                {saving
                  ? "Salvando..."
                  : "Salvar movimentação"}
              </button>

            </div>
          </section>
        )}

        {/* LOADING */}
        {loading && (
          <div className="rounded-lg bg-white p-6 shadow">
            Carregando dados reais do Supabase...
          </div>
        )}

        {data && !loading && (
          <>
            {/* CARDS */}
            <div className="grid grid-cols-3 gap-2 sm:gap-3">

              <div className="rounded-xl border bg-white p-2.5 shadow-sm sm:p-3">

                <div className="text-[11px] sm:text-xs font-semibold uppercase text-slate-500">
                  Saldo atual
                </div>

                <div className="mt-1 text-sm sm:text-xl font-bold">
                  {brl(data.currentBalance)}
                </div>

              </div>

              <div className="rounded-xl border border-green-200 bg-green-50 p-2.5 sm:p-3">

                <div className="text-[11px] sm:text-xs font-semibold uppercase text-green-700">
                  Entradas
                </div>

                <div className="mt-1 text-sm sm:text-xl font-bold text-green-700">
                  {brl(data.totalEntries)}
                </div>

              </div>

              <div className="rounded-xl border border-red-200 bg-red-50 p-2.5 sm:p-3">

                <div className="text-[11px] sm:text-xs font-semibold uppercase text-red-700">
                  Saídas
                </div>

                <div className="mt-1 text-sm sm:text-xl font-bold text-red-700">
                  {brl(data.totalExits)}
                </div>

              </div>

            </div>

            {/* RESUMO */}
            <section className="mt-3 rounded-xl border bg-white p-3 shadow-sm sm:p-4">

              <h2 className="text-base font-bold sm:text-lg">
                Resumo do Caixa
              </h2>

              <p className="mb-4 text-sm text-slate-500">
                Contando desde {dataBR(data.startDate)}
                {data.weekEnd
                  ? ` · último fechamento: ${dataBR(data.weekStart)} a ${dataBR(data.weekEnd)}`
                  : ""}
              </p>

              <div className="grid grid-cols-2 gap-2 md:grid-cols-4">

                <div className="rounded-lg bg-slate-50 p-2.5 text-xs sm:text-sm">
                  <b>Saldo inicial</b>

                  <div className="text-sm font-semibold sm:text-base">
                    {brl(
                      data.initialBalance
                    )}
                  </div>
                </div>

                <div className="rounded-lg bg-green-50 p-2.5 text-xs sm:text-sm">
                  <b>
                    Restante recebido dos eventos
                  </b>

                  <div className="text-sm font-semibold sm:text-base text-green-700">
                    {brl(
                      data.eventEntries
                    )}
                  </div>
                </div>

                <div className="rounded-lg bg-green-50 p-2.5 text-xs sm:text-sm">
                  <b>
                    Sinais recebidos
                  </b>

                  <div className="text-sm font-semibold sm:text-base text-green-700">
                    {brl(
                      data.signalsTotal
                    )}
                  </div>
                </div>

                <div className="rounded-lg bg-green-50 p-2.5 text-xs sm:text-sm">
                  <b>
                    Entradas manuais
                  </b>

                  <div className="text-sm font-semibold sm:text-base text-green-700">
                    {brl(
                      data.manualEntries
                    )}
                  </div>
                </div>

                <div className="rounded-lg bg-red-50 p-2.5 text-xs sm:text-sm">
                  <b>
                    Músicos pagos
                  </b>

                  <div className="text-sm font-semibold sm:text-base text-red-700">
                    {brl(
                      data.musiciansPaid
                    )}
                  </div>
                </div>

                <div className="rounded-lg bg-red-50 p-2.5 text-xs sm:text-sm">
                  <b>
                    Rodrigo + Marlon
                  </b>

                  <div className="text-sm font-semibold sm:text-base text-red-700">
                    {brl(
                      data.partnersPaid
                    )}
                  </div>
                </div>

                <div className="rounded-lg bg-red-50 p-2.5 text-xs sm:text-sm">
                  <b>
                    Despesas pagas
                  </b>

                  <div className="text-sm font-semibold sm:text-base text-red-700">
                    {brl(
                      data.expensesPaid
                    )}
                  </div>
                </div>

                <div className="rounded-lg bg-red-50 p-2.5 text-xs sm:text-sm">
                  <b>Bonificações pagas</b>

                  <div className="text-sm font-semibold sm:text-base text-red-700">
                    {brl(data.bonusesPaid)}
                  </div>
                </div>

                <div className="rounded-lg bg-red-50 p-2.5 text-xs sm:text-sm">
                  <b>
                    Saídas manuais
                  </b>

                  <div className="text-sm font-semibold sm:text-base text-red-700">
                    {brl(
                      data.manualExits
                    )}
                  </div>
                </div>

                <div className="col-span-2 rounded-lg bg-amber-50 p-2.5 text-xs sm:text-sm">
                  <b>Ajustes de saldo</b>
                  <span className="ml-2 text-xs text-slate-500">
                    ({data.adjustments.length}{" "}
                    {data.adjustments.length === 1 ? "ajuste" : "ajustes"})
                  </span>

                  <div
                    className={`text-sm font-semibold sm:text-base ${
                      data.adjustmentsTotal >= 0 ? "text-green-700" : "text-red-700"
                    }`}
                  >
                    {data.adjustmentsTotal >= 0 ? "+" : "−"}
                    {brl(Math.abs(data.adjustmentsTotal))}
                  </div>
                </div>

              </div>
            </section>

            {/* HISTÓRICO DE AJUSTES */}
            <section className="mt-3 rounded-xl border border-amber-200 bg-white p-3 shadow-sm sm:p-4">
              <h2 className="text-base font-bold sm:text-lg">Histórico de ajustes de saldo</h2>
              <p className="text-sm text-slate-500">
                Toda alteração no saldo do caixa fica registrada aqui, com data, usuário e motivo.
              </p>

              <div className="mt-4 overflow-x-auto">
                {data.adjustments.length === 0 ? (
                  <div className="rounded-lg bg-slate-50 p-6 text-center text-sm text-slate-500">
                    Nenhum ajuste de saldo registrado.
                  </div>
                ) : (
                  <><div className="space-y-2 md:hidden">
                    {data.adjustments.map((a: AnyRow) => {
                      const entrada = String(a.direction) === "entrada";
                      return (
                        <div key={a.id} className="rounded-lg border border-slate-200 p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="text-xs text-slate-500">
                              {dataBR(String(a.transaction_date))}
                              {a.created_at &&
                                ` às ${new Date(a.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`}
                            </div>
                            <div className={`font-bold ${entrada ? "text-green-700" : "text-red-700"}`}>
                              {entrada ? "+" : "−"}
                              {brl(a.amount)}
                            </div>
                          </div>
                          <div className="mt-1 text-sm font-semibold">{a.motivo || "-"}</div>
                          <div className="mt-1 text-xs text-slate-500">
                            {brl(a.saldoAnterior)} → {brl(a.saldoNovo)}
                          </div>
                          <div className="mt-1 break-all text-xs text-slate-400">{a.autor || "-"}</div>
                        </div>
                      );
                    })}
                  </div>
                  <table className="hidden w-full text-sm md:table">
                    <thead>
                      <tr className="border-b text-left">
                        <th className="p-3">Data</th>
                        <th className="p-3">Usuário</th>
                        <th className="p-3">Motivo</th>
                        <th className="p-3 text-right">Saldo antes</th>
                        <th className="p-3 text-right">Saldo depois</th>
                        <th className="p-3 text-right">Ajuste</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.adjustments.map((a: AnyRow) => {
                        const entrada = String(a.direction) === "entrada";
                        return (
                          <tr key={a.id} className="border-b last:border-0">
                            <td className="p-3 whitespace-nowrap">
                              {dataBR(String(a.transaction_date))}
                              {a.created_at && (
                                <span className="block text-xs text-slate-400">
                                  {new Date(a.created_at).toLocaleTimeString("pt-BR", {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  })}
                                </span>
                              )}
                            </td>
                            <td className="p-3">{a.autor || "-"}</td>
                            <td className="p-3">{a.motivo || "-"}</td>
                            <td className="p-3 text-right">{brl(a.saldoAnterior)}</td>
                            <td className="p-3 text-right">{brl(a.saldoNovo)}</td>
                            <td
                              className={`p-3 text-right font-bold ${
                                entrada ? "text-green-700" : "text-red-700"
                              }`}
                            >
                              {entrada ? "+" : "−"}
                              {brl(a.amount)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table></>
                )}
              </div>
            </section>

            {/* MOVIMENTAÇÕES */}
            <section className="mt-3 rounded-xl border bg-white p-3 shadow-sm sm:p-4">

              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">

                <div>
                  <h2 className="text-base font-bold sm:text-lg">
                    Movimentações do Caixa
                  </h2>

                  <p className="text-sm text-slate-500">
                    Entradas e saídas lançadas manualmente.
                  </p>
                </div>

                <button
                  onClick={() => {
                    setShowForm(true);
                    setError("");
                    setSuccess("");
                  }}
                  className="rounded-lg bg-green-600 px-4 py-2 text-sm font-bold text-white"
                >
                  + Nova movimentação
                </button>

              </div>

              <div className="mt-4 overflow-x-auto">

                {data.manualTransactions.filter((t: AnyRow) => !ehAjusteSaldo(t.notes)).length ===
                0 ? (
                  <div className="rounded-lg bg-slate-50 p-6 text-center text-sm text-slate-500">
                    Nenhuma movimentação manual cadastrada.
                  </div>
                ) : (
                  <><div className="space-y-2 md:hidden">
                    {data.manualTransactions
                      .filter((t: AnyRow) => !ehAjusteSaldo(t.notes))
                      .map((item: AnyRow) => {
                        const isEntrada = String(item.direction) === "entrada";
                        const obs = String(item.notes || "")
                          .replace(`${MANUAL_PREFIX} | `, "")
                          .replace(MANUAL_PREFIX, "")
                          .trim();
                        return (
                          <div key={item.id} className="rounded-lg border border-slate-200 p-3">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="font-semibold">{item.description}</div>
                                <div className="text-xs text-slate-500">
                                  {dataBR(String(item.transaction_date))} ·{" "}
                                  {isEntrada ? "Entrada" : "Saída"}
                                </div>
                              </div>
                              <div className={`shrink-0 font-bold ${isEntrada ? "text-green-700" : "text-red-700"}`}>
                                {isEntrada ? "+" : "-"}
                                {brl(item.amount)}
                              </div>
                            </div>
                            {obs && <div className="mt-1 text-xs text-slate-500">{obs}</div>}
                          </div>
                        );
                      })}
                  </div>
                  <table className="hidden w-full text-sm md:table">

                    <thead>
                      <tr className="border-b text-left">

                        <th className="p-3">
                          Data
                        </th>

                        <th className="p-3">
                          Tipo
                        </th>

                        <th className="p-3">
                          Descrição
                        </th>

                        <th className="p-3">
                          Observação
                        </th>

                        <th className="p-3 text-right">
                          Valor
                        </th>

                      </tr>
                    </thead>

                    <tbody>

                      {data.manualTransactions.filter((t: AnyRow) => !ehAjusteSaldo(t.notes)).map(
                        (item: AnyRow) => {

                          const isEntrada =
                            String(
                              item.direction
                            ) ===
                            "entrada";

                          const rawNotes =
                            String(
                              item.notes || ""
                            );

                          const displayNotes =
                            rawNotes
                              .replace(
                                `${MANUAL_PREFIX} | `,
                                ""
                              )
                              .replace(
                                MANUAL_PREFIX,
                                ""
                              )
                              .trim();

                          return (
                            <tr
                              key={item.id}
                              className="border-b last:border-0"
                            >

                              <td className="p-3">
                                {new Date(
                                  `${item.transaction_date}T12:00:00`
                                ).toLocaleDateString(
                                  "pt-BR"
                                )}
                              </td>

                              <td className="p-3">

                                <span
                                  className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${
                                    isEntrada
                                      ? "bg-green-100 text-green-700"
                                      : "bg-red-100 text-red-700"
                                  }`}
                                >
                                  {isEntrada
                                    ? "Entrada"
                                    : "Saída"}
                                </span>

                              </td>

                              <td className="p-3 font-medium">
                                {
                                  item.description
                                }
                              </td>

                              <td className="p-3 text-slate-500">
                                {displayNotes ||
                                  "-"}
                              </td>

                              <td
                                className={`p-3 text-right font-bold ${
                                  isEntrada
                                    ? "text-green-700"
                                    : "text-red-700"
                                }`}
                              >
                                {isEntrada
                                  ? "+"
                                  : "-"}
                                {brl(
                                  item.amount
                                )}
                              </td>

                            </tr>
                          );
                        }
                      )}

                    </tbody>
                  </table></>
                )}

              </div>
            </section>

            {/* EVENTOS */}
            <section className="mt-3 rounded-xl border bg-white p-3 shadow-sm sm:p-4">

              <h2 className="text-base font-bold sm:text-lg">Recebimentos de eventos</h2>
              <p className="text-sm text-slate-500">
                Valores realmente recebidos desde {dataBR(data.startDate)}. O sinal
                entra na data em que foi pago; o restante, na data em que foi recebido.
              </p>

              <div className="mt-3 overflow-x-auto">
                {data.eventBreakdown.length === 0 ? (
                  <div className="rounded-lg bg-slate-50 p-6 text-center text-sm text-slate-500">
                    Nenhum recebimento de evento neste período.
                  </div>
                ) : (
                  <><div className="space-y-2 md:hidden">
                    {data.eventBreakdown.map((e: AnyRow, i: number) => (
                      <div key={`m-${e.event}-${e.date}-${i}`} className="rounded-lg border border-slate-200 p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="font-semibold">{e.event}</div>
                            <div className="text-xs text-slate-500">{dataBR(String(e.date || ""))}</div>
                          </div>
                          <div className="shrink-0 font-bold text-green-700">{brl(e.received)}</div>
                        </div>
                        <div className="mt-1 text-xs text-slate-500">
                          Sinal {brl(e.signals)} · Restante {brl(e.rest)}
                        </div>
                      </div>
                    ))}
                  </div>
                  <table className="hidden w-full text-sm md:table">
                    <thead>
                      <tr className="border-b text-left">
                        <th className="p-2">Evento</th>
                        <th className="p-2">Data</th>
                        <th className="p-2 text-right">Sinal</th>
                        <th className="p-2 text-right">Restante</th>
                        <th className="p-2 text-right">Entrou no caixa</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.eventBreakdown.map((e: AnyRow, i: number) => (
                        <tr key={`${e.event}-${e.date}-${i}`} className="border-b">
                          <td className="p-2">{e.event}</td>
                          <td className="p-2">{dataBR(String(e.date || ""))}</td>
                          <td className="p-2 text-right">{brl(e.signals)}</td>
                          <td className="p-2 text-right">{brl(e.rest)}</td>
                          <td className="p-2 text-right font-bold text-green-700">{brl(e.received)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table></>
                )}
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
