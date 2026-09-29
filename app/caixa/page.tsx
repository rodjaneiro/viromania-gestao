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
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function mondayOf(dateString: string) {
  const d = new Date(`${dateString}T12:00:00`);
  const day = d.getDay();
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
  return iso(d);
}

function sundayFromMonday(monday: string) {
  const d = new Date(`${monday}T12:00:00`);
  d.setDate(d.getDate() + 6);
  return iso(d);
}

function isSignal(description: string) {
  const d = String(description || "").trim().toLowerCase();
  return d === "sinal" || d.startsWith("sinal ");
}

export default function CaixaTestePage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState<AnyRow | null>(null);

  async function runTest() {
    try {
      setLoading(true);
      setError("");

      // 1) SALDO INICIAL
      const setupRes = await supabase
        .from("cash_setup")
        .select("initial_balance,start_date")
        .limit(1)
        .maybeSingle();

      if (setupRes.error) throw setupRes.error;

      const initialBalance = Number(setupRes.data?.initial_balance || 0);
      const startDate = String(setupRes.data?.start_date || "1900-01-01");

      // 2) ÚLTIMO FECHAMENTO
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
        throw new Error("Não encontrei nenhum fechamento semanal.");
      }

      const weekStart = String(closing.week_start);
      const weekEnd = String(closing.week_end);

      // 3) EVENTOS DA SEMANA
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

      // 4) RECEITAS DOS EVENTOS
      let revenues: AnyRow[] = [];
      if (eventIds.length) {
        const revenuesRes = await supabase
          .from("event_revenues")
          .select("id,event_id,expected_amount,actual_amount,confirmed,status")
          .in("event_id", eventIds);

        if (revenuesRes.error) throw revenuesRes.error;
        revenues = (revenuesRes.data || []) as AnyRow[];
      }

      // 5) TODOS OS RECEBIMENTOS
      const receiptsRes = await supabase
        .from("event_revenue_receipts")
        .select("id,event_revenue_id,description,actual_amount,actual_receipt_date,status")
        .eq("status", "recebido");

      if (receiptsRes.error) throw receiptsRes.error;

      const receipts = (receiptsRes.data || []) as AnyRow[];

      // 6) ENTRADA DOS EVENTOS DA SEMANA
      // Mesma regra validada no Pagamentos:
      // soma tudo recebido pelo evento e desconta os sinais desse mesmo evento.
      let eventWeekEntries = 0;
      const eventBreakdown: AnyRow[] = [];

      for (const event of events) {
        const eventRevenueIds = revenues
          .filter((r) => String(r.event_id) === String(event.id))
          .map((r) => String(r.id));

        const eventReceipts = receipts.filter((r) =>
          eventRevenueIds.includes(String(r.event_revenue_id))
        );

        const received = eventReceipts.reduce(
          (sum, r) => sum + Number(r.actual_amount || 0),
          0
        );

        const oldSignals = eventReceipts
          .filter((r) => isSignal(String(r.description || "")))
          .reduce((sum, r) => sum + Number(r.actual_amount || 0), 0);

        const entersNow = Math.max(received - oldSignals, 0);
        eventWeekEntries += entersNow;

        eventBreakdown.push({
          event: event.name,
          date: event.event_date,
          received,
          oldSignals,
          entersNow,
        });
      }

      // 7) SINAIS DE EVENTOS FUTUROS RECEBIDOS ATÉ O FIM DA SEMANA
      // Busca todas as receitas/recebimentos e cruza com events para descobrir
      // se o evento é posterior à semana fechada.
      const allRevenuesRes = await supabase
        .from("event_revenues")
        .select("id,event_id");

      if (allRevenuesRes.error) throw allRevenuesRes.error;

      const allRevenues = (allRevenuesRes.data || []) as AnyRow[];

      const allEventIds = [...new Set(allRevenues.map((r) => String(r.event_id)))];

      let futureEvents: AnyRow[] = [];
      if (allEventIds.length) {
        const futureEventsRes = await supabase
          .from("events")
          .select("id,name,event_date,status")
          .in("id", allEventIds)
          .gt("event_date", weekEnd);

        if (futureEventsRes.error) throw futureEventsRes.error;
        futureEvents = (futureEventsRes.data || []) as AnyRow[];
      }

      const futureEventIds = new Set(futureEvents.map((e) => String(e.id)));
      const futureRevenueIds = new Set(
        allRevenues
          .filter((r) => futureEventIds.has(String(r.event_id)))
          .map((r) => String(r.id))
      );

      const futureSignals = receipts.filter(
        (r) =>
          futureRevenueIds.has(String(r.event_revenue_id)) &&
          isSignal(String(r.description || "")) &&
          !!r.actual_receipt_date &&
          String(r.actual_receipt_date) >= startDate &&
          String(r.actual_receipt_date) <= weekEnd
      );

      const futureSignalsTotal = futureSignals.reduce(
        (sum, r) => sum + Number(r.actual_amount || 0),
        0
      );

      // 8) MÚSICOS: o caixa desconta o que foi efetivamente marcado como pago.
      // Não limitamos à semana do evento: os pagamentos podem acontecer depois
      // do fechamento, como aconteceu neste caso (pagamentos em 28/09).
      const musicianPaymentsRes = await supabase
        .from("event_musicians")
        .select("event_cache,payment_status,payment_date,event_id")
        .eq("payment_status", "pago")
        .not("payment_date", "is", null);

      if (musicianPaymentsRes.error) throw musicianPaymentsRes.error;

      const musicianPayments = (musicianPaymentsRes.data || []) as AnyRow[];
      const musiciansPaid = musicianPayments
        .filter((p) => String(p.payment_date) >= startDate)
        .reduce(
          (sum, p) => sum + Number(p.event_cache || 0),
          0
        );

      // 9) SÓCIOS PAGOS NA SEMANA
      const rodrigoPaid =
        Boolean(closing.rodrigo_paid) &&
        String(closing.rodrigo_payment_date || "") >= startDate
          ? Number(closing.rodrigo_amount || 0)
          : 0;

      const marlonPaid =
        Boolean(closing.marlon_paid) &&
        String(closing.marlon_payment_date || "") >= startDate
          ? Number(closing.marlon_amount || 0)
          : 0;

      const partnersPaid = rodrigoPaid + marlonPaid;

      // 10) DESPESAS PAGAS NA SEMANA
      const expensesRes = await supabase
        .from("event_expenses")
        .select("amount,payment_date")
        .not("payment_date", "is", null);

      if (expensesRes.error) throw expensesRes.error;

      const expensesPaid = (expensesRes.data || [])
        .filter((d: AnyRow) => String(d.payment_date) >= startDate)
        .reduce(
          (sum, d) => sum + Number(d.amount || 0),
          0
        );

      // 11) Lançamentos manuais:
      // não usamos os registros automáticos antigos do sistema.
      // Por enquanto o teste não soma cash_transactions, porque o caixa
      // dos eventos é calculado pelas fontes oficiais acima.
      const manualEntries = 0;
      const manualExits = 0;

      const weeklyEntries =
        eventWeekEntries + futureSignalsTotal + manualEntries;

      const weeklyExits =
        musiciansPaid + partnersPaid + expensesPaid + manualExits;

      const currentBalance = initialBalance + weeklyEntries - weeklyExits;

      setData({
        initialBalance,
        startDate,
        weekStart,
        weekEnd,
        eventWeekEntries,
        futureSignalsTotal,
        manualEntries,
        musiciansPaid,
        rodrigoPaid,
        marlonPaid,
        partnersPaid,
        expensesPaid,
        manualExits,
        weeklyEntries,
        weeklyExits,
        currentBalance,
        eventBreakdown,
        futureSignals,
      });
    } catch (e: any) {
      console.error(e);
      setError(e?.message || "Erro ao testar o cálculo.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    runTest();
  }, []);

  return (
    <main className="min-h-screen bg-slate-100 p-4 text-slate-900">
      <div className="mx-auto max-w-6xl">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold uppercase text-blue-700">
              Financeiro
            </div>
            <h1 className="text-3xl font-bold">Caixa ViroMania</h1>
            <p className="text-sm text-slate-500">
              O saldo mostra somente as movimentações reais do caixa.
            </p>
          </div>
          <button
            onClick={runTest}
            className="rounded-lg bg-slate-900 px-4 py-3 text-sm font-bold text-white"
          >
            Recalcular
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-red-300 bg-red-50 p-4 text-red-700">
            <b>ERRO:</b> {error}
          </div>
        )}

        {loading && (
          <div className="rounded-lg bg-white p-6 shadow">
            Carregando dados reais do Supabase...
          </div>
        )}

        {data && !loading && (
          <>
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

            <section className="mt-5 rounded-xl border bg-white p-5 shadow">
              <h2 className="text-xl font-bold">Teste do cálculo</h2>
              <p className="mb-4 text-sm text-slate-500">
                Semana: {data.weekStart} até {data.weekEnd}
              </p>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-lg bg-slate-50 p-4">
                  <b>Saldo inicial</b>
                  <div className="text-xl">{brl(data.initialBalance)}</div>
                </div>

                <div className="rounded-lg bg-green-50 p-4">
                  <b>Recebimentos dos eventos da semana</b>
                  <div className="text-xl text-green-700">
                    {brl(data.eventWeekEntries)}
                  </div>
                </div>

                <div className="rounded-lg bg-green-50 p-4">
                  <b>Sinais de eventos futuros recebidos até o fechamento</b>
                  <div className="text-xl text-green-700">
                    {brl(data.futureSignalsTotal)}
                  </div>
                </div>

                <div className="rounded-lg bg-green-50 p-4">
                  <b>Entradas manuais</b>
                  <div className="text-xl text-green-700">
                    {brl(data.manualEntries)}
                  </div>
                </div>

                <div className="rounded-lg bg-red-50 p-4">
                  <b>Músicos pagos</b>
                  <div className="text-xl text-red-700">
                    {brl(data.musiciansPaid)}
                  </div>
                </div>

                <div className="rounded-lg bg-red-50 p-4">
                  <b>Rodrigo + Marlon</b>
                  <div className="text-xl text-red-700">
                    {brl(data.partnersPaid)}
                  </div>
                </div>

                <div className="rounded-lg bg-red-50 p-4">
                  <b>Despesas pagas</b>
                  <div className="text-xl text-red-700">
                    {brl(data.expensesPaid)}
                  </div>
                </div>

                <div className="rounded-lg bg-red-50 p-4">
                  <b>Saídas manuais</b>
                  <div className="text-xl text-red-700">
                    {brl(data.manualExits)}
                  </div>
                </div>
              </div>
            </section>

            <section className="mt-5 rounded-xl border bg-white p-5 shadow">
              <h2 className="text-xl font-bold">Eventos da semana</h2>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left">
                      <th className="p-2">Evento</th>
                      <th className="p-2">Recebido</th>
                      <th className="p-2">Sinal abatido</th>
                      <th className="p-2">Entra no caixa</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.eventBreakdown.map((e: AnyRow, i: number) => (
                      <tr key={`${e.event}-${e.date}-${i}`} className="border-b">
                        <td className="p-2">{e.event}</td>
                        <td className="p-2">{brl(e.received)}</td>
                        <td className="p-2">{brl(e.oldSignals)}</td>
                        <td className="p-2 font-bold text-green-700">
                          {brl(e.entersNow)}
                        </td>
                      </tr>
                    ))}
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
