"use client";



import { useEffect, useMemo, useState } from "react";

import { supabase } from "@/lib/supabase";



type Evento = {

  id: string;

  name: string;

  event_date: string;

  status: string;

};



type Participacao = {

  id: string;

  event_id: string;

  musician_id: string;

  event_cache: number;

  payment_status: "pendente" | "pago";

  payment_date: string | null;

  musician_name: string;

};



type Fechamento = {

  id: string;

  week_start: string;

  week_end: string;

  total_musicians: number;

  total_other_expenses: number;

  rodrigo_amount: number;

  marlon_amount: number;

  group_cash_amount: number;

  rodrigo_paid: boolean;

  marlon_paid: boolean;

  rodrigo_payment_date: string | null;

  marlon_payment_date: string | null;

};



type Recebimento = {

  event_revenue_id: string;

  description: string;

  actual_amount: number;

  actual_receipt_date: string | null;

  status: string;

};



type ReceitaEvento = {

  id: string;

  event_id: string;

  expected_amount: number;

  actual_amount: number;

  confirmed: boolean;

  status: string;

};



type DespesaEvento = {

  id: string;

  event_id: string;

  amount: number;

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



type PagamentoMusico = {

  musician_id: string;

  nome: string;

  eventos: number;

  total: number;

  pago: number;

  pendente: number;

  participacoes: Participacao[];

};



function moeda(valor: number) {

  return Number(valor || 0).toLocaleString("pt-BR", {

    style: "currency",

    currency: "BRL",

  });

}



function dataISO(date: Date) {

  return `${date.getFullYear()}-${String(

    date.getMonth() + 1

  ).padStart(2, "0")}-${String(date.getDate()).padStart(

    2,

    "0"

  )}`;

}



function dataBR(data: string | null | undefined) {

  if (!data) return "-";



  const [ano, mes, dia] = data.split("-");



  return `${dia}/${mes}/${ano}`;

}



function segundaDaSemana(date: Date) {

  const d = new Date(date);

  const dia = d.getDay();



  d.setDate(

    d.getDate() + (dia === 0 ? -6 : 1 - dia)

  );



  return d;

}



function domingoDaSemana(date: Date) {

  const d = new Date(date);



  d.setDate(d.getDate() + 6);



  return d;

}



function isSignal(descricao: string) {

  const d = String(descricao || "")

    .trim()

    .toLowerCase();



  return (

    d === "sinal" ||

    d.startsWith("sinal ")

  );

}



function ehLancamentoAutomatico(

  descricao: string

) {

  const d = String(descricao || "")

    .trim()

    .toLowerCase();



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



type AnyRow = Record<string, any>;

const MANUAL_PREFIX = "MANUAL_CAIXA";

async function calcularSaldoAtualCaixa() {

    try {



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



      return currentBalance;

    } catch (e: any) {
      console.error(e);
      throw e;
    }
  }

export default function PagamentosPage() {

  const [semanaReferencia, setSemanaReferencia] =

    useState(dataISO(new Date()));



  const [eventosSemana, setEventosSemana] =

    useState<Evento[]>([]);



  const [participacoes, setParticipacoes] =

    useState<Participacao[]>([]);



  const [fechamento, setFechamento] =

    useState<Fechamento | null>(null);



  const [fechamentos, setFechamentos] =

    useState<Fechamento[]>([]);



  const [recebimentos, setRecebimentos] =

    useState<Recebimento[]>([]);



  const [receitasEventos, setReceitasEventos] =

    useState<ReceitaEvento[]>([]);



  const [despesasEventos, setDespesasEventos] =

    useState<DespesaEvento[]>([]);



  const [lancamentos, setLancamentos] =

    useState<Lancamento[]>([]);



  const [pagamentosHistoricos, setPagamentosHistoricos] =

    useState<

      {

        event_cache: number;

        payment_status: string;

        payment_date: string | null;

      }[]

    >([]);



  const [despesasHistoricas, setDespesasHistoricas] =

    useState<

      {

        amount: number;

        payment_date: string | null;

      }[]

    >([]);



  const [saldoAtualCaixa, setSaldoAtualCaixa] =

    useState(0);



  const [loading, setLoading] =

    useState(true);



  const [pagando, setPagando] =

    useState<string | null>(null);



  const [mensagem, setMensagem] =

    useState("");



  const [erro, setErro] =

    useState("");



  const semanaInicio = useMemo(

    () =>

      dataISO(

        segundaDaSemana(

          new Date(

            `${semanaReferencia}T12:00:00`

          )

        )

      ),

    [semanaReferencia]

  );



  const semanaFim = useMemo(

    () =>

      dataISO(

        domingoDaSemana(

          new Date(

            `${semanaInicio}T12:00:00`

          )

        )

      ),

    [semanaInicio]

  );



  async function carregar() {

    try {

      setLoading(true);

      setErro("");

      setMensagem("");



      const [

        eventosRes,

        fechamentoRes,

        fechamentosRes,

        configRes,

        recibosRes,

        lancamentosRes,

        musicosHistoricoRes,

        despesasHistoricoRes,

      ] = await Promise.all([

        supabase

          .from("events")

          .select(

            "id,name,event_date,status"

          )

          .gte(

            "event_date",

            semanaInicio

          )

          .lte(

            "event_date",

            semanaFim

          )

          .order("event_date"),



        supabase

          .from("weekly_closings")

          .select(

            "id,week_start,week_end,total_musicians,total_other_expenses,rodrigo_amount,marlon_amount,group_cash_amount,rodrigo_paid,marlon_paid,rodrigo_payment_date,marlon_payment_date"

          )

          .eq(

            "week_start",

            semanaInicio

          )

          .eq(

            "week_end",

            semanaFim

          )

          .maybeSingle(),



        supabase

          .from("weekly_closings")

          .select(

            "id,week_start,week_end,total_musicians,total_other_expenses,rodrigo_amount,marlon_amount,group_cash_amount,rodrigo_paid,marlon_paid,rodrigo_payment_date,marlon_payment_date"

          )

          .order(

            "week_end",

            { ascending: true }

          ),



        supabase

          .from("cash_setup")

          .select(

            "initial_balance,start_date"

          )

          .limit(1)

          .maybeSingle(),



        supabase

          .from(

            "event_revenue_receipts"

          )

          .select(

            "event_revenue_id,description,actual_amount,actual_receipt_date,status"

          )

          .eq(

            "status",

            "recebido"

          ),



        supabase

          .from("cash_transactions")

          .select(

            "id,transaction_date,description,transaction_type,amount,direction,notes"

          )

          .order(

            "transaction_date",

            { ascending: true }

          ),



        supabase

          .from("event_musicians")

          .select(

            "event_cache,payment_status,payment_date"

          ),



        supabase

          .from("event_expenses")

          .select(

            "amount,payment_date"

          ),

      ]);



      if (eventosRes.error)

        throw eventosRes.error;



      if (fechamentoRes.error)

        throw fechamentoRes.error;



      if (fechamentosRes.error)

        throw fechamentosRes.error;



      if (configRes.error)

        throw configRes.error;



      if (recibosRes.error)

        throw recibosRes.error;



      if (lancamentosRes.error)

        throw lancamentosRes.error;



      if (musicosHistoricoRes.error)

        throw musicosHistoricoRes.error;



      if (despesasHistoricoRes.error)

        throw despesasHistoricoRes.error;



      const eventosRealizados: Evento[] =

        (eventosRes.data || [])

          .filter(

            (e: any) =>

              e.status === "realizado"

          )

          .map((e: any) => ({

            id: String(e.id),

            name: String(

              e.name || "Evento"

            ),

            event_date: String(

              e.event_date

            ),

            status: String(

              e.status || ""

            ),

          }));



      setEventosSemana(

        eventosRealizados

      );



      const idsEventos =

        eventosRealizados.map(

          (e) => e.id

        );



      let participacoesData: any[] =

        [];



      if (idsEventos.length > 0) {

        const participacoesRes =

          await supabase

            .from("event_musicians")

            .select(

              "id,event_id,musician_id,event_cache,payment_status,payment_date,musicians(name)"

            )

            .in(

              "event_id",

              idsEventos

            );



        if (participacoesRes.error)

          throw participacoesRes.error;



        participacoesData =

          participacoesRes.data || [];

      }



      const todosFechamentos =

        (fechamentosRes.data || []).map(

          (f: any) => ({

            ...f,

            total_musicians:

              Number(

                f.total_musicians || 0

              ),

            total_other_expenses:

              Number(

                f.total_other_expenses ||

                  0

              ),

            rodrigo_amount:

              Number(

                f.rodrigo_amount || 0

              ),

            marlon_amount:

              Number(

                f.marlon_amount || 0

              ),

            group_cash_amount:

              Number(

                f.group_cash_amount || 0

              ),

          })

        ) as Fechamento[];



      const fechamentoAtual =

        (fechamentoRes.data ||

          null) as Fechamento | null;



      const configInicial =

        Number(

          configRes.data

            ?.initial_balance || 0

        );



      const inicioCaixa =

        configRes.data

          ?.start_date ||

        "1900-01-01";



      setFechamento(

        fechamentoAtual

      );



      setFechamentos(

        todosFechamentos

      );






      const saldoCaixaReal = await calcularSaldoAtualCaixa();

      setSaldoAtualCaixa(saldoCaixaReal);

      setRecebimentos(

        (recibosRes.data || []).map(

          (r: any) => ({

            event_revenue_id:

              String(

                r.event_revenue_id

              ),

            description:

              String(

                r.description || ""

              ),

            actual_amount:

              Number(

                r.actual_amount || 0

              ),

            actual_receipt_date:

              r.actual_receipt_date ||

              null,

            status:

              String(

                r.status || ""

              ),

          })

        )

      );



      setLancamentos(

        (lancamentosRes.data || []).map(

          (l: any) => ({

            id: l.id,

            transaction_date:

              l.transaction_date,

            description:

              l.description || "",

            transaction_type:

              l.transaction_type ||

              "",

            amount:

              Number(

                l.amount || 0

              ),

            direction:

              l.direction ===

              "saida"

                ? "saida"

                : "entrada",

            notes:

              l.notes || null,

          })

        )

      );



      setPagamentosHistoricos(

        (

          musicosHistoricoRes.data ||

          []

        ).map((p: any) => ({

          event_cache:

            Number(

              p.event_cache || 0

            ),

          payment_status:

            String(

              p.payment_status ||

                "pendente"

            ),

          payment_date:

            p.payment_date ||

            null,

        }))

      );



      setDespesasHistoricas(

        (

          despesasHistoricoRes.data ||

          []

        ).map((d: any) => ({

          amount:

            Number(

              d.amount || 0

            ),

          payment_date:

            d.payment_date ||

            null,

        }))

      );



      if (idsEventos.length > 0) {

        const receitasRes =

          await supabase

            .from(

              "event_revenues"

            )

            .select(

              "id,event_id,expected_amount,actual_amount,confirmed,status"

            )

            .in(

              "event_id",

              idsEventos

            );



        if (receitasRes.error)

          throw receitasRes.error;



        setReceitasEventos(

          (

            receitasRes.data ||

            []

          ).map((r: any) => ({

            id: String(r.id),

            event_id:

              String(

                r.event_id

              ),

            expected_amount:

              Number(

                r.expected_amount ||

                  0

              ),

            actual_amount:

              Number(

                r.actual_amount ||

                  0

              ),

            confirmed:

              Boolean(

                r.confirmed

              ),

            status:

              String(

                r.status || ""

              ),

          }))

        );



        const despesasRes =

          await supabase

            .from(

              "event_expenses"

            )

            .select(

              "id,event_id,amount"

            )

            .in(

              "event_id",

              idsEventos

            );



        if (despesasRes.error)

          throw despesasRes.error;



        setDespesasEventos(

          (

            despesasRes.data ||

            []

          ).map((d: any) => ({

            id: String(d.id),

            event_id:

              String(

                d.event_id

              ),

            amount:

              Number(

                d.amount || 0

              ),

          }))

        );

      } else {

        setReceitasEventos([]);

        setDespesasEventos([]);

      }



      setParticipacoes(

        participacoesData.map(

          (item: any) => ({

            id: item.id,

            event_id:

              item.event_id,

            musician_id:

              item.musician_id,

            event_cache:

              Number(

                item.event_cache ||

                  0

              ),

            payment_status:

              item.payment_status ===

              "pago"

                ? "pago"

                : "pendente",

            payment_date:

              item.payment_date ||

              null,

            musician_name:

              item.musicians?.name ||

              "Músico",

          })

        )

      );

    } catch (error: any) {

      console.error(error);



      setErro(

        error.message ||

          "Erro ao carregar os pagamentos."

      );

    } finally {

      setLoading(false);

    }

  }



  useEffect(() => {

    carregar();

  }, [

    semanaInicio,

    semanaFim,

  ]);



  const pagamentosMusicos =

    useMemo<

      PagamentoMusico[]

    >(() => {

      const mapa =

        new Map<

          string,

          PagamentoMusico

        >();



      for (const p of participacoes) {

        const atual =

          mapa.get(

            p.musician_id

          ) || {

            musician_id:

              p.musician_id,

            nome:

              p.musician_name,

            eventos: 0,

            total: 0,

            pago: 0,

            pendente: 0,

            participacoes: [],

          };



        atual.eventos += 1;

        atual.total +=

          p.event_cache;



        atual.participacoes.push(

          p

        );



        if (

          p.payment_status ===

          "pago"

        ) {

          atual.pago +=

            p.event_cache;

        } else {

          atual.pendente +=

            p.event_cache;

        }



        mapa.set(

          p.musician_id,

          atual

        );

      }



      return [

        ...mapa.values(),

      ].sort((a, b) =>

        a.nome.localeCompare(

          b.nome,

          "pt-BR"

        )

      );

    }, [participacoes]);



  const totalMusicos =

    pagamentosMusicos.reduce(

      (total, item) =>

        total + item.total,

      0

    );



  const totalPagoMusicos =

    pagamentosMusicos.reduce(

      (total, item) =>

        total + item.pago,

      0

    );



  const totalPendenteMusicos =

    pagamentosMusicos.reduce(

      (total, item) =>

        total + item.pendente,

      0

    );



  const rodrigo =

    Number(

      fechamento?.rodrigo_amount ||

        0

    );



  const marlon =

    Number(

      fechamento?.marlon_amount ||

        0

    );



  const entradasSemana =

    useMemo(() => {

      if (!fechamento) {

        return 0;

      }



      let total = 0;



      for (

        const evento of eventosSemana

      ) {

        const receitasDoEvento =

          receitasEventos.filter(

            (receita) =>

              String(

                receita.event_id

              ) ===

              String(

                evento.id

              )

          );



        const idsReceitas =

          new Set(

            receitasDoEvento.map(

              (receita) =>

                String(

                  receita.id

                )

            )

          );



        const recebimentosDoEvento =

          recebimentos.filter(

            (recebimento) =>

              recebimento.status ===

                "recebido" &&

              idsReceitas.has(

                String(

                  recebimento.event_revenue_id

                )

              )

          );



        const totalRecebido =

          recebimentosDoEvento.reduce(

            (

              soma,

              recebimento

            ) =>

              soma +

              Number(

                recebimento.actual_amount ||

                  0

              ),

            0

          );



        const totalSinais =

          recebimentosDoEvento

            .filter(

              (recebimento) =>

                isSignal(

                  recebimento.description

                )

            )

            .reduce(

              (

                soma,

                recebimento

              ) =>

                soma +

                Number(

                  recebimento.actual_amount ||

                    0

                ),

              0

            );



        total += Math.max(

          totalRecebido -

            totalSinais,

          0

        );

      }



      return total;

    }, [

      fechamento,

      eventosSemana,

      receitasEventos,

      recebimentos,

    ]);



  function mudarSemana(

    direcao: number

  ) {

    const data =

      new Date(

        `${semanaInicio}T12:00:00`

      );



    data.setDate(

      data.getDate() +

        direcao * 7

    );



    setSemanaReferencia(

      dataISO(data)

    );

  }



  async function pagarMusico(

    item: PagamentoMusico

  ) {

    if (

      item.pendente <= 0 ||

      pagando

    ) {

      return;

    }



    if (

      !window.confirm(

        `Confirmar pagamento de ${item.nome} no valor de ${moeda(

          item.pendente

        )}?`

      )

    ) {

      return;

    }



    try {

      setPagando(

        item.musician_id

      );



      const dataPagamento =

        dataISO(new Date());



      for (

        const participacao of

        item.participacoes

      ) {

        if (

          participacao.payment_status ===

          "pago"

        ) {

          continue;

        }



        const { error } =

          await supabase

            .from(

              "event_musicians"

            )

            .update({

              payment_status:

                "pago",

              payment_date:

                dataPagamento,

            })

            .eq(

              "id",

              participacao.id

            );



        if (error) {

          throw error;

        }

      }



      setMensagem(

        `${item.nome} marcado como pago.`

      );



      await carregar();

    } catch (error: any) {

      setErro(

        error.message ||

          "Erro ao registrar pagamento do músico."

      );

    } finally {

      setPagando(null);

    }

  }



  async function pagarSocio(

    tipo:

      | "rodrigo"

      | "marlon"

  ) {

    if (!fechamento) {

      setErro(

        "Salve o fechamento da semana antes de pagar os sócios."

      );



      return;

    }



    const nome =

      tipo === "rodrigo"

        ? "Rodrigo"

        : "Marlon";



    const valor =

      tipo === "rodrigo"

        ? rodrigo

        : marlon;



    const pago =

      tipo === "rodrigo"

        ? fechamento.rodrigo_paid

        : fechamento.marlon_paid;



    if (

      pago ||

      valor <= 0

    ) {

      return;

    }



    if (

      !window.confirm(

        `Confirmar pagamento de ${nome} no valor de ${moeda(

          valor

        )}?`

      )

    ) {

      return;

    }



    try {

      setPagando(tipo);



      const campoPago =

        tipo === "rodrigo"

          ? "rodrigo_paid"

          : "marlon_paid";



      const campoData =

        tipo === "rodrigo"

          ? "rodrigo_payment_date"

          : "marlon_payment_date";



      const { error } =

        await supabase

          .from(

            "weekly_closings"

          )

          .update({

            [campoPago]: true,

            [campoData]:

              dataISO(

                new Date()

              ),

          })

          .eq(

            "id",

            fechamento.id

          );



      if (error) {

        throw error;

      }



      setMensagem(

        `${nome} marcado como pago.`

      );



      await carregar();

    } catch (error: any) {

      setErro(

        error.message ||

          "Erro ao registrar pagamento do sócio."

      );

    } finally {

      setPagando(null);

    }

  }



  return (

    <main className="min-h-screen bg-slate-100 p-4 text-slate-800 md:p-6">

      <div className="mx-auto max-w-7xl">

        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">

          <div>

            <p className="text-sm font-semibold text-slate-500">

              VIROMANIA GESTÃO

            </p>



            <h1 className="mt-1 text-3xl font-extrabold">

              Pagamentos

            </h1>



            <p className="mt-2 text-sm text-slate-500">

              Tudo que precisa ser pago depois do fechamento da semana.

            </p>

          </div>



          <div className="flex gap-2">

            <button

              onClick={() =>

                mudarSemana(-1)

              }

              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-bold"

            >

              ← Semana anterior

            </button>



            <button

              onClick={() =>

                mudarSemana(1)

              }

              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-bold"

            >

              Próxima semana →

            </button>

          </div>

        </div>



        <section className="mb-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">

          <div className="flex flex-wrap items-center justify-between gap-4">

            <div>

              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">

                Semana selecionada

              </p>



              <p className="mt-1 text-2xl font-extrabold">

                {dataBR(

                  semanaInicio

                )}{" "}

                até{" "}

                {dataBR(

                  semanaFim

                )}

              </p>

            </div>



            <div

              className={`rounded-full px-4 py-2 text-sm font-bold ${

                fechamento

                  ? "bg-green-100 text-green-700"

                  : "bg-amber-100 text-amber-700"

              }`}

            >

              {fechamento

                ? "✓ Fechamento realizado"

                : "⚠ Fechamento ainda não salvo"}

            </div>

          </div>

        </section>



        {mensagem && (

          <div className="mb-5 rounded-lg border border-green-200 bg-green-50 p-4 text-sm font-semibold text-green-700">

            {mensagem}

          </div>

        )}



        {erro && (

          <div className="mb-5 rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">

            {erro}

          </div>

        )}



        {loading ? (

          <div className="rounded-xl bg-white p-10 text-center shadow-sm">

            Carregando pagamentos...

          </div>

        ) : (

          <>

            <section className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">

              <div className="rounded-xl border border-purple-200 bg-purple-50 p-5">

                <p className="text-sm font-semibold text-purple-700">

                  Pagamento dos músicos da semana

                </p>



                <p className="mt-2 text-2xl font-extrabold text-purple-900">

                  {moeda(

                    totalPendenteMusicos

                  )}

                </p>



                <p className="mt-1 text-xs text-purple-700">

                  Total:{" "}

                  {moeda(

                    totalMusicos

                  )}{" "}

                  • Já pago:{" "}

                  {moeda(

                    totalPagoMusicos

                  )}

                </p>

              </div>



              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5">

                <p className="text-sm font-semibold text-emerald-700">

                  Valor que entrou no caixa na semana

                </p>



                <p className="mt-2 text-2xl font-extrabold text-emerald-900">

                  {moeda(

                    entradasSemana

                  )}

                </p>



                <p className="mt-1 text-xs text-emerald-700">

                  Eventos realizados da semana − sinais já recebidos desses próprios eventos

                </p>

              </div>



              <div className="rounded-xl border border-blue-200 bg-blue-50 p-5">

                <p className="text-sm font-semibold text-blue-700">

                  Valor total do caixa

                </p>



                <p className="mt-2 text-2xl font-extrabold text-blue-900">

                  {moeda(

                    saldoAtualCaixa

                  )}

                </p>



                <p className="mt-1 text-xs text-blue-700">

                  Saldo atual do caixa — mesmo cálculo da página Caixa.

                </p>

              </div>

            </section>



            <section className="mb-6 rounded-xl border border-slate-200 bg-white shadow-sm">

              <div className="border-b border-slate-200 p-5">

                <h2 className="text-xl font-extrabold">

                  Pagamentos dos músicos

                </h2>



                <p className="mt-1 text-sm text-slate-500">

                  Todos que tocaram em eventos realizados nesta semana.

                </p>

              </div>



              {pagamentosMusicos.length ===

              0 ? (

                <div className="p-10 text-center text-slate-500">

                  Nenhum músico participou de eventos realizados nesta semana.

                </div>

              ) : (

                <div className="divide-y divide-slate-100">

                  {pagamentosMusicos.map(

                    (item) => (

                      <div

                        key={

                          item.musician_id

                        }

                        className="flex flex-wrap items-center justify-between gap-4 p-5"

                      >

                        <div>

                          <p className="text-lg font-extrabold">

                            {item.nome}

                          </p>



                          <p className="mt-1 text-sm text-slate-500">

                            {item.eventos}{" "}

                            {item.eventos ===

                            1

                              ? "evento"

                              : "eventos"}{" "}

                            • Total:{" "}

                            {moeda(

                              item.total

                            )}

                          </p>

                        </div>



                        <div className="text-right">

                          <p className="text-xs font-semibold uppercase text-slate-500">

                            A pagar

                          </p>



                          <p className="text-xl font-extrabold">

                            {moeda(

                              item.pendente

                            )}

                          </p>



                          <p className="text-xs text-slate-500">

                            Pago:{" "}

                            {moeda(

                              item.pago

                            )}

                          </p>

                        </div>



                        {item.pendente <=

                        0 ? (

                          <span className="rounded-full bg-green-100 px-4 py-2 text-sm font-bold text-green-700">

                            ✓ Pago

                          </span>

                        ) : (

                          <button

                            onClick={() =>

                              pagarMusico(

                                item

                              )

                            }

                            disabled={

                              pagando ===

                              item.musician_id

                            }

                            className="rounded-lg bg-slate-900 px-5 py-3 text-sm font-bold text-white disabled:opacity-50"

                          >

                            {pagando ===

                            item.musician_id

                              ? "Registrando..."

                              : `Pagar ${moeda(

                                  item.pendente

                                )}`}

                          </button>

                        )}

                      </div>

                    )

                  )}

                </div>

              )}

            </section>



            <section className="mb-10 rounded-xl border border-slate-200 bg-white shadow-sm">

              <div className="border-b border-slate-200 p-5">

                <h2 className="text-xl font-extrabold">

                  Pagamentos dos sócios

                </h2>



                <p className="mt-1 text-sm text-slate-500">

                  Rodrigo 25% e Marlon 25% do resultado da semana.

                </p>

              </div>



              {!fechamento ? (

                <div className="p-8 text-center text-slate-500">

                  Salve o fechamento desta semana primeiro.

                </div>

              ) : (

                <div className="grid gap-4 p-5 md:grid-cols-2">

                  {(

                    [

                      "rodrigo",

                      "marlon",

                    ] as const

                  ).map((tipo) => {

                    const nome =

                      tipo ===

                      "rodrigo"

                        ? "Rodrigo"

                        : "Marlon";



                    const valor =

                      tipo ===

                      "rodrigo"

                        ? rodrigo

                        : marlon;



                    const pago =

                      tipo ===

                      "rodrigo"

                        ? fechamento.rodrigo_paid

                        : fechamento.marlon_paid;



                    const data =

                      tipo ===

                      "rodrigo"

                        ? fechamento.rodrigo_payment_date

                        : fechamento.marlon_payment_date;



                    return (

                      <div

                        key={tipo}

                        className="rounded-xl border border-slate-200 p-5"

                      >

                        <div className="flex items-center justify-between gap-4">

                          <p className="text-lg font-extrabold">

                            {nome}

                          </p>



                          <p className="text-2xl font-extrabold">

                            {moeda(

                              valor

                            )}

                          </p>

                        </div>



                        <div className="mt-4 flex items-center justify-between gap-3">

                          <span

                            className={`rounded-full px-3 py-1 text-xs font-bold ${

                              pago

                                ? "bg-green-100 text-green-700"

                                : "bg-amber-100 text-amber-700"

                            }`}

                          >

                            {pago

                              ? `Pago em ${dataBR(

                                  data

                                )}`

                              : "Pendente"}

                          </span>



                          {!pago && (

                            <button

                              onClick={() =>

                                pagarSocio(

                                  tipo

                                )

                              }

                              disabled={

                                pagando ===

                                tipo

                              }

                              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"

                            >

                              {pagando ===

                              tipo

                                ? "Registrando..."

                                : "Marcar como pago"}

                            </button>

                          )}

                        </div>

                      </div>

                    );

                  })}

                </div>

              )}

            </section>

          </>

        )}

      </div>

    </main>

  );

}