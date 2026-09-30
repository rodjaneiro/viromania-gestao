"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

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

function isSignal(description: string) {
  const d = String(description || "").trim().toLowerCase();
  return d === "sinal" || d.startsWith("sinal ");
}

const MANUAL_PREFIX = "MANUAL_CAIXA";

export default function CaixaTestePage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [data, setData] = useState<AnyRow | null>(null);
  const [showForm, setShowForm] = useState(false);

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

      // =========================================================
      // 1) SALDO INICIAL
      // =========================================================
      const setupRes = await supabase
        .from("cash_setup")
        .select("initial_balance,start_date")
        .limit(1)
        .maybeSingle();

      if (setupRes.error) throw setupRes.error;

      const initialBalance = Number(
        setupRes.data?.initial_balance || 0
      );

      const startDate = String(
        setupRes.data?.start_date || "1900-01-01"
      );

      // =========================================================
      // 2) ÚLTIMO FECHAMENTO
      // =========================================================
      const closingRes = await supabase
        .from("weekly_closings")
        .select(
          "id,week_start,week_end,rodrigo_amount,marlon_amount,rodrigo_paid,marlon_paid,rodrigo_payment_date,marlon_payment_date"
        )
        .order("week_end", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (closingRes.error) throw closingRes.error;

      const closing = closingRes.data as AnyRow | null;

      if (!closing) {
        throw new Error(
          "Não encontrei nenhum fechamento semanal."
        );
      }

      const weekStart = String(closing.week_start);
      const weekEnd = String(closing.week_end);

      // =========================================================
      // 3) EVENTOS DA SEMANA
      // =========================================================
      const eventsRes = await supabase
        .from("events")
        .select("id,name,event_date,status")
        .gte("event_date", weekStart)
        .lte("event_date", weekEnd)
        .eq("status", "realizado")
        .order("event_date");

      if (eventsRes.error) throw eventsRes.error;

      const events = (eventsRes.data || []) as AnyRow[];

      const eventIds = events.map((e) => String(e.id));

      // =========================================================
      // 4) RECEITAS DOS EVENTOS
      // =========================================================
      let revenues: AnyRow[] = [];

      if (eventIds.length) {
        const revenuesRes = await supabase
          .from("event_revenues")
          .select(
            "id,event_id,expected_amount,actual_amount,confirmed,status"
          )
          .in("event_id", eventIds);

        if (revenuesRes.error) {
          throw revenuesRes.error;
        }

        revenues = (revenuesRes.data || []) as AnyRow[];
      }

      // =========================================================
      // 5) TODOS OS RECEBIMENTOS
      // =========================================================
      const receiptsRes = await supabase
        .from("event_revenue_receipts")
        .select(
          "id,event_revenue_id,description,actual_amount,actual_receipt_date,status"
        )
        .eq("status", "recebido");

      if (receiptsRes.error) {
        throw receiptsRes.error;
      }

      const receipts = (receiptsRes.data || []) as AnyRow[];

      // =========================================================
      // 6) ENTRADAS DOS EVENTOS DA SEMANA
      // =========================================================
      let eventWeekEntries = 0;

      const eventBreakdown: AnyRow[] = [];

      for (const event of events) {
        const eventRevenueIds = revenues
          .filter(
            (r) =>
              String(r.event_id) === String(event.id)
          )
          .map((r) => String(r.id));

        const eventReceipts = receipts.filter((r) =>
          eventRevenueIds.includes(
            String(r.event_revenue_id)
          )
        );

        const received = eventReceipts.reduce(
          (sum, r) =>
            sum + Number(r.actual_amount || 0),
          0
        );

        const oldSignals = eventReceipts
          .filter((r) =>
            isSignal(
              String(r.description || "")
            )
          )
          .reduce(
            (sum, r) =>
              sum + Number(r.actual_amount || 0),
            0
          );

        const entersNow = Math.max(
          received - oldSignals,
          0
        );

        eventWeekEntries += entersNow;

        eventBreakdown.push({
          event: event.name,
          date: event.event_date,
          received,
          oldSignals,
          entersNow,
        });
      }

      // =========================================================
      // 7) SINAIS DE EVENTOS FUTUROS
      // =========================================================
      const allRevenuesRes = await supabase
        .from("event_revenues")
        .select("id,event_id");

      if (allRevenuesRes.error) {
        throw allRevenuesRes.error;
      }

      const allRevenues =
        (allRevenuesRes.data || []) as AnyRow[];

      const allEventIds = [
        ...new Set(
          allRevenues.map((r) =>
            String(r.event_id)
          )
        ),
      ];

      let futureEvents: AnyRow[] = [];

      if (allEventIds.length) {
        const futureEventsRes = await supabase
          .from("events")
          .select("id,name,event_date,status")
          .in("id", allEventIds)
          .gt("event_date", weekEnd);

        if (futureEventsRes.error) {
          throw futureEventsRes.error;
        }

        futureEvents =
          (futureEventsRes.data || []) as AnyRow[];
      }

      const futureEventIds = new Set(
        futureEvents.map((e) => String(e.id))
      );

      const futureRevenueIds = new Set(
        allRevenues
          .filter((r) =>
            futureEventIds.has(
              String(r.event_id)
            )
          )
          .map((r) => String(r.id))
      );

      const futureSignals = receipts.filter(
        (r) =>
          futureRevenueIds.has(
            String(r.event_revenue_id)
          ) &&
          isSignal(
            String(r.description || "")
          ) &&
          !!r.actual_receipt_date &&
          String(r.actual_receipt_date) >=
            startDate &&
          String(r.actual_receipt_date) <=
            weekEnd
      );

      const futureSignalsTotal =
        futureSignals.reduce(
          (sum, r) =>
            sum + Number(r.actual_amount || 0),
          0
        );

      // =========================================================
      // 8) PAGAMENTOS DOS MÚSICOS
      // =========================================================
      const musicianPaymentsRes = await supabase
        .from("event_musicians")
        .select(
          "event_cache,payment_status,payment_date,event_id"
        )
        .eq("payment_status", "pago")
        .not("payment_date", "is", null);

      if (musicianPaymentsRes.error) {
        throw musicianPaymentsRes.error;
      }

      const musicianPayments =
        (musicianPaymentsRes.data || []) as AnyRow[];

      const musiciansPaid = musicianPayments
        .filter(
          (p) =>
            String(p.payment_date) >=
            startDate
        )
        .reduce(
          (sum, p) =>
            sum + Number(p.event_cache || 0),
          0
        );

      // =========================================================
      // 9) SÓCIOS PAGOS
      // =========================================================
      const rodrigoPaid =
        Boolean(closing.rodrigo_paid) &&
        String(
          closing.rodrigo_payment_date || ""
        ) >= startDate
          ? Number(
              closing.rodrigo_amount || 0
            )
          : 0;

      const marlonPaid =
        Boolean(closing.marlon_paid) &&
        String(
          closing.marlon_payment_date || ""
        ) >= startDate
          ? Number(
              closing.marlon_amount || 0
            )
          : 0;

      const partnersPaid =
        rodrigoPaid + marlonPaid;

      // =========================================================
      // 10) DESPESAS PAGAS
      // =========================================================
      const expensesRes = await supabase
        .from("event_expenses")
        .select("amount,payment_date")
        .not("payment_date", "is", null);

      if (expensesRes.error) {
        throw expensesRes.error;
      }

      const expensesPaid = (
        expensesRes.data || []
      )
        .filter(
          (d: AnyRow) =>
            String(d.payment_date) >=
            startDate
        )
        .reduce(
          (sum, d) =>
            sum + Number(d.amount || 0),
          0
        );

      // =========================================================
      // 11) MOVIMENTAÇÕES MANUAIS
      //
      // Usamos transaction_type = "receita" porque esse
      // é um tipo aceito pela tabela atual.
      //
      // Para não misturar com receitas automáticas,
      // usamos o prefixo MANUAL_CAIXA nas observações.
      // =========================================================
      const manualRes = await supabase
        .from("cash_transactions")
        .select(
          "id,transaction_date,description,transaction_type,amount,direction,notes,created_at"
        )
        .eq("transaction_type", "receita")
        .is("event_id", null)
        .is("musician_id", null)
        .gte("transaction_date", startDate)
        .order("transaction_date", {
          ascending: false,
        })
        .order("created_at", {
          ascending: false,
        });

      if (manualRes.error) {
        throw manualRes.error;
      }

      const allPossibleManual =
        (manualRes.data || []) as AnyRow[];

      const manualTransactions =
        allPossibleManual.filter((t) =>
          String(t.notes || "").startsWith(
            MANUAL_PREFIX
          )
        );

      const manualEntries =
        manualTransactions
          .filter(
            (t) =>
              String(t.direction) ===
              "entrada"
          )
          .reduce(
            (sum, t) =>
              sum + Number(t.amount || 0),
            0
          );

      const manualExits =
        manualTransactions
          .filter(
            (t) =>
              String(t.direction) ===
              "saida"
          )
          .reduce(
            (sum, t) =>
              sum + Number(t.amount || 0),
            0
          );

      // =========================================================
      // 12) TOTAL DO CAIXA
      // =========================================================
      const weeklyEntries =
        eventWeekEntries +
        futureSignalsTotal +
        manualEntries;

      const weeklyExits =
        musiciansPaid +
        partnersPaid +
        expensesPaid +
        manualExits;

      const currentBalance =
        initialBalance +
        weeklyEntries -
        weeklyExits;

      setData({
        initialBalance,
        startDate,
        weekStart,
        weekEnd,
        eventWeekEntries,
        futureSignalsTotal,
        manualEntries,
        manualExits,
        musiciansPaid,
        rodrigoPaid,
        marlonPaid,
        partnersPaid,
        expensesPaid,
        weeklyEntries,
        weeklyExits,
        currentBalance,
        eventBreakdown,
        futureSignals,
        manualTransactions,
      });
    } catch (e: any) {
      console.error(e);

      setError(
        e?.message ||
          "Erro ao calcular o caixa."
      );
    } finally {
      setLoading(false);
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

      const amount = Number(
        String(form.amount)
          .replace(/\./g, "")
          .replace(",", ".")
      );

      if (!form.transaction_date) {
        throw new Error(
          "Informe a data da movimentação."
        );
      }

      if (!amount || amount <= 0) {
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

            <h1 className="text-3xl font-bold">
              Caixa ViroMania
            </h1>

            <p className="text-sm text-slate-500">
              Controle de entradas e saídas reais do caixa.
            </p>
          </div>

          <div className="flex gap-2">

            <button
              onClick={() => {
                setShowForm(true);
                setError("");
                setSuccess("");
              }}
              className="rounded-lg bg-green-600 px-4 py-3 text-sm font-bold text-white shadow hover:bg-green-700"
            >
              + Nova movimentação
            </button>

            <button
              onClick={runTest}
              className="rounded-lg bg-slate-900 px-4 py-3 text-sm font-bold text-white"
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

        {/* FORMULÁRIO */}
        {showForm && (
          <section className="mb-5 rounded-xl border bg-white p-5 shadow">

            <div className="mb-5 flex items-center justify-between">

              <div>
                <h2 className="text-xl font-bold">
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
            <div className="grid gap-4 md:grid-cols-3">

              <div className="rounded-xl border bg-white p-5 shadow">

                <div className="text-xs font-semibold uppercase text-slate-500">
                  Saldo atual
                </div>

                <div className="mt-2 text-3xl font-bold">
                  {brl(data.currentBalance)}
                </div>

              </div>

              <div className="rounded-xl border border-green-200 bg-green-50 p-5">

                <div className="text-xs font-semibold uppercase text-green-700">
                  Entradas
                </div>

                <div className="mt-2 text-3xl font-bold text-green-700">
                  {brl(data.weeklyEntries)}
                </div>

              </div>

              <div className="rounded-xl border border-red-200 bg-red-50 p-5">

                <div className="text-xs font-semibold uppercase text-red-700">
                  Saídas
                </div>

                <div className="mt-2 text-3xl font-bold text-red-700">
                  {brl(data.weeklyExits)}
                </div>

              </div>

            </div>

            {/* RESUMO */}
            <section className="mt-5 rounded-xl border bg-white p-5 shadow">

              <h2 className="text-xl font-bold">
                Resumo do Caixa
              </h2>

              <p className="mb-4 text-sm text-slate-500">
                Semana: {data.weekStart} até{" "}
                {data.weekEnd}
              </p>

              <div className="grid gap-3 md:grid-cols-2">

                <div className="rounded-lg bg-slate-50 p-4">
                  <b>Saldo inicial</b>

                  <div className="text-xl">
                    {brl(
                      data.initialBalance
                    )}
                  </div>
                </div>

                <div className="rounded-lg bg-green-50 p-4">
                  <b>
                    Recebimentos dos eventos
                  </b>

                  <div className="text-xl text-green-700">
                    {brl(
                      data.eventWeekEntries
                    )}
                  </div>
                </div>

                <div className="rounded-lg bg-green-50 p-4">
                  <b>
                    Sinais de eventos futuros
                  </b>

                  <div className="text-xl text-green-700">
                    {brl(
                      data.futureSignalsTotal
                    )}
                  </div>
                </div>

                <div className="rounded-lg bg-green-50 p-4">
                  <b>
                    Entradas manuais
                  </b>

                  <div className="text-xl text-green-700">
                    {brl(
                      data.manualEntries
                    )}
                  </div>
                </div>

                <div className="rounded-lg bg-red-50 p-4">
                  <b>
                    Músicos pagos
                  </b>

                  <div className="text-xl text-red-700">
                    {brl(
                      data.musiciansPaid
                    )}
                  </div>
                </div>

                <div className="rounded-lg bg-red-50 p-4">
                  <b>
                    Rodrigo + Marlon
                  </b>

                  <div className="text-xl text-red-700">
                    {brl(
                      data.partnersPaid
                    )}
                  </div>
                </div>

                <div className="rounded-lg bg-red-50 p-4">
                  <b>
                    Despesas pagas
                  </b>

                  <div className="text-xl text-red-700">
                    {brl(
                      data.expensesPaid
                    )}
                  </div>
                </div>

                <div className="rounded-lg bg-red-50 p-4">
                  <b>
                    Saídas manuais
                  </b>

                  <div className="text-xl text-red-700">
                    {brl(
                      data.manualExits
                    )}
                  </div>
                </div>

              </div>
            </section>

            {/* MOVIMENTAÇÕES */}
            <section className="mt-5 rounded-xl border bg-white p-5 shadow">

              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">

                <div>
                  <h2 className="text-xl font-bold">
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

                {data.manualTransactions.length ===
                0 ? (
                  <div className="rounded-lg bg-slate-50 p-6 text-center text-sm text-slate-500">
                    Nenhuma movimentação manual cadastrada.
                  </div>
                ) : (
                  <table className="w-full text-sm">

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

                      {data.manualTransactions.map(
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
                  </table>
                )}

              </div>
            </section>

            {/* EVENTOS */}
            <section className="mt-5 rounded-xl border bg-white p-5 shadow">

              <h2 className="text-xl font-bold">
                Eventos da semana
              </h2>

              <div className="mt-3 overflow-x-auto">

                <table className="w-full text-sm">

                  <thead>
                    <tr className="border-b text-left">

                      <th className="p-2">
                        Evento
                      </th>

                      <th className="p-2">
                        Recebido
                      </th>

                      <th className="p-2">
                        Sinal abatido
                      </th>

                      <th className="p-2">
                        Entra no caixa
                      </th>

                    </tr>
                  </thead>

                  <tbody>

                    {data.eventBreakdown.map(
                      (
                        e: AnyRow,
                        i: number
                      ) => (
                        <tr
                          key={`${e.event}-${e.date}-${i}`}
                          className="border-b"
                        >

                          <td className="p-2">
                            {e.event}
                          </td>

                          <td className="p-2">
                            {brl(
                              e.received
                            )}
                          </td>

                          <td className="p-2">
                            {brl(
                              e.oldSignals
                            )}
                          </td>

                          <td className="p-2 font-bold text-green-700">
                            {brl(
                              e.entersNow
                            )}
                          </td>

                        </tr>
                      )
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