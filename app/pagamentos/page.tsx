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
  total_received: number;
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
  payment_date: string | null;
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
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
    2,
    "0"
  )}-${String(date.getDate()).padStart(2, "0")}`;
}

function dataBR(data: string | null | undefined) {
  if (!data) return "-";

  const [ano, mes, dia] = data.split("-");

  return `${dia}/${mes}/${ano}`;
}

function segundaDaSemana(date: Date) {
  const d = new Date(date);
  const dia = d.getDay();

  d.setDate(d.getDate() + (dia === 0 ? -6 : 1 - dia));

  return d;
}

function domingoDaSemana(date: Date) {
  const d = new Date(date);

  d.setDate(d.getDate() + 6);

  return d;
}

function ehLancamentoAutomatico(descricao: string) {
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

export default function PagamentosPage() {
  const [semanaReferencia, setSemanaReferencia] = useState(
    dataISO(new Date())
  );

  const [participacoes, setParticipacoes] = useState<Participacao[]>([]);
  const [pagamentosMusicosCaixa, setPagamentosMusicosCaixa] = useState<Participacao[]>([]);
  const [despesasCaixa, setDespesasCaixa] = useState<DespesaEvento[]>([]);
  const [fechamento, setFechamento] = useState<Fechamento | null>(null);
  const [fechamentos, setFechamentos] = useState<Fechamento[]>([]);
  const [recebimentos, setRecebimentos] = useState<Recebimento[]>([]);
  const [receitasEventos, setReceitasEventos] = useState<ReceitaEvento[]>([]);
  const [despesasEventos, setDespesasEventos] = useState<DespesaEvento[]>([]);
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([]);

  const [saldoInicialCaixa, setSaldoInicialCaixa] = useState(0);
  const [dataInicioCaixa, setDataInicioCaixa] = useState("1900-01-01");

  const [loading, setLoading] = useState(true);
  const [pagando, setPagando] = useState<string | null>(null);
  const [mensagem, setMensagem] = useState("");
  const [erro, setErro] = useState("");

  const semanaInicio = useMemo(
    () =>
      dataISO(
        segundaDaSemana(new Date(`${semanaReferencia}T12:00:00`))
      ),
    [semanaReferencia]
  );

  const semanaFim = useMemo(
    () =>
      dataISO(
        domingoDaSemana(new Date(`${semanaInicio}T12:00:00`))
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
      ] = await Promise.all([
        supabase
          .from("events")
          .select("id,name,event_date,status")
          .gte("event_date", semanaInicio)
          .lte("event_date", semanaFim)
          .order("event_date"),

        supabase
          .from("weekly_closings")
          .select(
            "id,week_start,week_end,total_received,total_musicians,total_other_expenses,rodrigo_amount,marlon_amount,group_cash_amount,rodrigo_paid,marlon_paid,rodrigo_payment_date,marlon_payment_date"
          )
          .eq("week_start", semanaInicio)
          .eq("week_end", semanaFim)
          .maybeSingle(),

        supabase
          .from("weekly_closings")
          .select(
            "id,week_start,week_end,total_received,total_musicians,total_other_expenses,rodrigo_amount,marlon_amount,group_cash_amount,rodrigo_paid,marlon_paid,rodrigo_payment_date,marlon_payment_date"
          )
          .order("week_end", { ascending: true }),

        supabase
          .from("cash_setup")
          .select("initial_balance,start_date")
          .limit(1)
          .maybeSingle(),

        supabase
          .from("event_revenue_receipts")
          .select(
            "event_revenue_id,description,actual_amount,actual_receipt_date,status"
          )
          .eq("status", "recebido"),

        supabase
          .from("cash_transactions")
          .select(
            "id,transaction_date,description,transaction_type,amount,direction,notes"
          )
          .order("transaction_date", { ascending: true }),
      ]);

      if (eventosRes.error) throw eventosRes.error;
      if (fechamentoRes.error) throw fechamentoRes.error;
      if (fechamentosRes.error) throw fechamentosRes.error;
      if (configRes.error) throw configRes.error;
      if (recibosRes.error) throw recibosRes.error;
      if (lancamentosRes.error) throw lancamentosRes.error;

      const eventosRealizados = (eventosRes.data || []).filter(
        (e: any) => e.status === "realizado"
      );

      const idsEventos = eventosRealizados.map((e: any) => e.id);

      let participacoesData: any[] = [];

      if (idsEventos.length > 0) {
        const participacoesRes = await supabase
          .from("event_musicians")
          .select(
            "id,event_id,musician_id,event_cache,payment_status,payment_date,musicians(name)"
          )
          .in("event_id", idsEventos);

        if (participacoesRes.error) {
          throw participacoesRes.error;
        }

        participacoesData = participacoesRes.data || [];
      }

      const todosFechamentos = (fechamentosRes.data || []).map(
        (f: any) => ({
          ...f,
          total_received: Number(f.total_received || 0),
          total_musicians: Number(f.total_musicians || 0),
          total_other_expenses: Number(
            f.total_other_expenses || 0
          ),
          rodrigo_amount: Number(f.rodrigo_amount || 0),
          marlon_amount: Number(f.marlon_amount || 0),
          group_cash_amount: Number(f.group_cash_amount || 0),
        })
      ) as Fechamento[];

      const fechamentoAtual =
        (fechamentoRes.data || null) as Fechamento | null;

      const configInicial = Number(
        configRes.data?.initial_balance || 0
      );

      const inicioCaixa =
        configRes.data?.start_date || "1900-01-01";

      setFechamento(fechamentoAtual);
      setFechamentos(todosFechamentos);
      setSaldoInicialCaixa(configInicial);
      setDataInicioCaixa(inicioCaixa);

      setRecebimentos(
        (recibosRes.data || []).map((r: any) => ({
          event_revenue_id: r.event_revenue_id,
          description: r.description || "",
          actual_amount: Number(r.actual_amount || 0),
          actual_receipt_date: r.actual_receipt_date || null,
          status: r.status,
        }))
      );

      setLancamentos(
        (lancamentosRes.data || []).map((l: any) => ({
          id: l.id,
          transaction_date: l.transaction_date,
          description: l.description,
          transaction_type: l.transaction_type,
          amount: Number(l.amount || 0),
          direction: l.direction,
          notes: l.notes || null,
        }))
      );

      const pagamentosMusicosCaixaRes = await supabase
        .from("event_musicians")
        .select(
          "id,event_id,musician_id,event_cache,payment_status,payment_date,musicians(name)"
        )
        .eq("payment_status", "pago");

      if (pagamentosMusicosCaixaRes.error) {
        throw pagamentosMusicosCaixaRes.error;
      }

      setPagamentosMusicosCaixa(
        (pagamentosMusicosCaixaRes.data || []).map((p: any) => ({
          id: p.id,
          event_id: p.event_id,
          musician_id: p.musician_id,
          event_cache: Number(p.event_cache || 0),
          payment_status: "pago",
          payment_date: p.payment_date || null,
          musician_name: p.musicians?.name || "Músico sem nome",
        }))
      );

      const despesasCaixaRes = await supabase
        .from("event_expenses")
        .select("id,event_id,amount,payment_date");

      if (despesasCaixaRes.error) {
        throw despesasCaixaRes.error;
      }

      setDespesasCaixa(
        (despesasCaixaRes.data || []).map((d: any) => ({
          id: d.id,
          event_id: d.event_id,
          amount: Number(d.amount || 0),
          payment_date: d.payment_date || null,
        }))
      );

      setParticipacoes(
        participacoesData.map((p: any) => ({
          id: p.id,
          event_id: p.event_id,
          musician_id: p.musician_id,
          event_cache: Number(p.event_cache || 0),
          payment_status:
            p.payment_status === "pago" ? "pago" : "pendente",
          payment_date: p.payment_date || null,
          musician_name:
            p.musicians?.name || "Músico sem nome",
        }))
      );

      if (idsEventos.length > 0) {
        const [receitasRes, despesasRes] = await Promise.all([
          supabase
            .from("event_revenues")
            .select(
              "id,event_id,expected_amount,actual_amount,confirmed,status"
            )
            .in("event_id", idsEventos),

          supabase
            .from("event_expenses")
            .select("id,event_id,amount,payment_date")
            .in("event_id", idsEventos),
        ]);

        if (receitasRes.error) throw receitasRes.error;
        if (despesasRes.error) throw despesasRes.error;

        setReceitasEventos(
          (receitasRes.data || []).map((r: any) => ({
            id: r.id,
            event_id: r.event_id,
            expected_amount: Number(r.expected_amount || 0),
            actual_amount: Number(r.actual_amount || 0),
            confirmed: Boolean(r.confirmed),
            status: r.status,
          }))
        );

        setDespesasEventos(
          (despesasRes.data || []).map((d: any) => ({
            id: d.id,
            event_id: d.event_id,
            amount: Number(d.amount || 0),
            payment_date: d.payment_date || null,
          }))
        );
      } else {
        setReceitasEventos([]);
        setDespesasEventos([]);
      }
    } catch (error: any) {
      console.error(error);
      setErro(
        error?.message ||
          "Erro ao carregar os pagamentos da semana."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    carregar();
  }, [semanaInicio, semanaFim]);

  const pagamentosMusicos = useMemo<PagamentoMusico[]>(() => {
    const mapa = new Map<string, PagamentoMusico>();

    for (const participacao of participacoes) {
      const atual =
        mapa.get(participacao.musician_id) || {
          musician_id: participacao.musician_id,
          nome: participacao.musician_name,
          eventos: 0,
          total: 0,
          pago: 0,
          pendente: 0,
          participacoes: [],
        };

      atual.eventos += 1;
      atual.total += participacao.event_cache;

      atual.participacoes.push(participacao);

      if (participacao.payment_status === "pago") {
        atual.pago += participacao.event_cache;
      } else {
        atual.pendente += participacao.event_cache;
      }

      mapa.set(participacao.musician_id, atual);
    }

    return Array.from(mapa.values()).sort((a, b) =>
      a.nome.localeCompare(b.nome, "pt-BR")
    );
  }, [participacoes]);

  const totalMusicos = pagamentosMusicos.reduce(
    (soma, item) => soma + item.total,
    0
  );

  const totalPagoMusicos = pagamentosMusicos.reduce(
    (soma, item) => soma + item.pago,
    0
  );

  const totalPendenteMusicos = pagamentosMusicos.reduce(
    (soma, item) => soma + item.pendente,
    0
  );

  /*
   * IMPORTANTE:
   * Rodrigo e Marlon NÃO são recalculados nesta tela.
   *
   * O valor oficial vem do fechamento semanal já salvo.
   */
  const valorRodrigo = Number(
    fechamento?.rodrigo_amount || 0
  );

  const valorMarlon = Number(
    fechamento?.marlon_amount || 0
  );

  const totalSocios = valorRodrigo + valorMarlon;

  const totalPagar =
    totalPendenteMusicos +
    (fechamento?.rodrigo_paid ? 0 : valorRodrigo) +
    (fechamento?.marlon_paid ? 0 : valorMarlon);

  /*
   * =============================================================
   * REGRA SIMPLES DO PAGAMENTOS
   * =============================================================
   *
   * 1. Valor recebido dos eventos da semana = soma de todos os
   *    recebimentos marcados como recebidos dos eventos da semana.
   *
   * 2. Valor que entrou no caixa na semana = valor recebido dos
   *    eventos - sinais.
   *
   *    O sinal NÃO é dinheiro novo desta semana, porque ele já
   *    estava dentro do saldo do caixa antes do fechamento.
   *
   * 3. Saldo total do caixa = saldo que já existia no caixa
   *    + valor que entrou na semana
   *    - sinais já existentes no saldo inicial
   *    - pagamentos dos músicos da semana.
   *
   * Não usamos aqui resultado líquido, despesas, sócios ou
   * obrigações futuras. Esta tela precisa mostrar exatamente o
   * dinheiro do caixa conforme a regra definida para o Pagamentos.
   */

  const idsReceitasEventosSemana = useMemo(() => {
    return new Set(receitasEventos.map((r) => r.id));
  }, [receitasEventos]);

  const valorRecebidoEventosSemana = useMemo(() => {
    return recebimentos
      .filter(
        (r) =>
          r.status === "recebido" &&
          idsReceitasEventosSemana.has(r.event_revenue_id)
      )
      .reduce(
        (total, r) => total + Number(r.actual_amount || 0),
        0
      );
  }, [recebimentos, idsReceitasEventosSemana]);

  const valorSinaisSemana = useMemo(() => {
    return recebimentos
      .filter(
        (r) =>
          r.status === "recebido" &&
          idsReceitasEventosSemana.has(r.event_revenue_id) &&
          String(r.description || "")
            .trim()
            .toLowerCase() === "sinal"
      )
      .reduce(
        (total, r) => total + Number(r.actual_amount || 0),
        0
      );
  }, [recebimentos, idsReceitasEventosSemana]);

  const entrouNaSemana = Math.max(
    valorRecebidoEventosSemana - valorSinaisSemana,
    0
  );

  const pagamentoMusicosSemana = totalPagoMusicos;

  const saldoCaixa =
    Number(saldoInicialCaixa || 0) +
    entrouNaSemana -
    valorSinaisSemana -
    pagamentoMusicosSemana;

  async function pagarMusico(item: PagamentoMusico) {
    if (item.pendente <= 0 || pagando) return;

    const confirmar = window.confirm(
      `Confirmar pagamento de ${item.nome} no valor de ${moeda(
        item.pendente
      )}?\n\nIsso marcará como pago todas as participações pendentes desta semana.`
    );

    if (!confirmar) return;

    try {
      setPagando(item.musician_id);
      setErro("");
      setMensagem("");

      const idsPendentes = item.participacoes
        .filter(
          (participacao) =>
            participacao.payment_status !== "pago"
        )
        .map((participacao) => participacao.id);

      if (idsPendentes.length === 0) return;

      const { error } = await supabase
        .from("event_musicians")
        .update({
          payment_status: "pago",
          payment_date: dataISO(new Date()),
        })
        .in("id", idsPendentes);

      if (error) throw error;

      setMensagem(
        `${item.nome} marcado como pago.`
      );

      await carregar();
    } catch (error: any) {
      console.error(error);

      setErro(
        error?.message ||
          "Erro ao registrar o pagamento do músico."
      );
    } finally {
      setPagando(null);
    }
  }

  async function pagarSocio(
    tipo: "rodrigo" | "marlon"
  ) {
    if (!fechamento) {
      setErro(
        "Faça e salve o fechamento da semana antes de pagar os sócios."
      );
      return;
    }

    const nome =
      tipo === "rodrigo"
        ? "Rodrigo"
        : "Marlon";

    const valor =
      tipo === "rodrigo"
        ? valorRodrigo
        : valorMarlon;

    const jaPago =
      tipo === "rodrigo"
        ? fechamento.rodrigo_paid
        : fechamento.marlon_paid;

    if (jaPago || valor <= 0) return;

    const confirmar = window.confirm(
      `Confirmar pagamento de ${nome} no valor de ${moeda(
        valor
      )}?`
    );

    if (!confirmar) return;

    try {
      setPagando(tipo);
      setErro("");
      setMensagem("");

      const campoPago =
        tipo === "rodrigo"
          ? "rodrigo_paid"
          : "marlon_paid";

      const campoData =
        tipo === "rodrigo"
          ? "rodrigo_payment_date"
          : "marlon_payment_date";

      const { error } = await supabase
        .from("weekly_closings")
        .update({
          [campoPago]: true,
          [campoData]: dataISO(new Date()),
        })
        .eq("id", fechamento.id);

      if (error) throw error;

      setMensagem(
        `${nome} marcado como pago.`
      );

      await carregar();
    } catch (error: any) {
      console.error(error);

      setErro(
        error?.message ||
          "Erro ao registrar o pagamento do sócio."
      );
    } finally {
      setPagando(null);
    }
  }

  function mudarSemana(direcao: number) {
    const data = new Date(
      `${semanaInicio}T12:00:00`
    );

    data.setDate(
      data.getDate() + direcao * 7
    );

    setSemanaReferencia(dataISO(data));
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-100 p-4">
        <div className="mx-auto max-w-7xl rounded-xl bg-white p-10 text-center shadow-sm">
          Carregando pagamentos...
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-100 p-4 text-slate-800 sm:p-6">
      <div className="mx-auto max-w-7xl">

        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              VIROMANIA GESTÃO
            </p>

            <h1 className="text-3xl font-bold">
              Pagamentos
            </h1>

            <p className="mt-1 text-sm text-slate-500">
              Tudo que precisa ser pago depois do fechamento da semana.
            </p>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => mudarSemana(-1)}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold hover:bg-slate-50"
            >
              ← Semana anterior
            </button>

            <button
              type="button"
              onClick={() => mudarSemana(1)}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold hover:bg-slate-50"
            >
              Próxima semana →
            </button>
          </div>
        </div>

        <section className="mb-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-bold uppercase text-slate-500">
                Semana selecionada
              </p>

              <p className="mt-1 text-2xl font-bold">
                {dataBR(semanaInicio)} até{" "}
                {dataBR(semanaFim)}
              </p>
            </div>

            {fechamento ? (
              <span className="rounded-full bg-emerald-100 px-4 py-2 text-sm font-bold text-emerald-700">
                ✓ Fechamento realizado
              </span>
            ) : (
              <span className="rounded-full bg-amber-100 px-4 py-2 text-sm font-bold text-amber-700">
                Fechamento ainda não salvo
              </span>
            )}
          </div>
        </section>

        {erro && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
            {erro}
          </div>
        )}

        {mensagem && (
          <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-700">
            {mensagem}
          </div>
        )}

        <section className="mb-5 grid gap-3 md:grid-cols-3">

          <div className="rounded-xl border border-purple-200 bg-purple-50 p-5">
            <p className="text-sm font-bold text-purple-700">
              Pagamento dos músicos da semana
            </p>

            <p className="mt-2 text-2xl font-extrabold text-purple-900">
              {moeda(totalPagar)}
            </p>

            <p className="mt-1 text-xs text-purple-700">
              Total: {moeda(totalMusicos)} • Já pago:{" "}
              {moeda(totalPagoMusicos)}
            </p>
          </div>

          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5">
            <p className="text-sm font-bold text-emerald-700">
              Valor que entrou no caixa na semana
            </p>

            <p className="mt-2 text-2xl font-extrabold text-emerald-900">
              {moeda(entrouNaSemana)}
            </p>

            <p className="mt-1 text-xs text-emerald-700">
              {fechamento
                ? `Eventos recebidos: ${moeda(valorRecebidoEventosSemana)} − sinais: ${moeda(valorSinaisSemana)}`
                : "A semana ainda não foi fechada."}
            </p>
          </div>

          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5">
            <p className="text-sm font-bold text-emerald-700">
              Valor total do caixa
            </p>

            <p className="mt-2 text-2xl font-extrabold text-emerald-900">
              {moeda(saldoCaixa)}
            </p>

            <p className="mt-1 text-xs text-emerald-700">
              Saldo anterior + entradas da semana − sinais − músicos pagos
            </p>
          </div>

        </section>

        <section className="mb-5 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">

          <div className="border-b border-slate-200 p-5">
            <h2 className="text-xl font-bold">
              Pagamentos dos músicos
            </h2>

            <p className="mt-1 text-sm text-slate-500">
              Todos que tocaram em eventos realizados nesta semana.
            </p>
          </div>

          {pagamentosMusicos.length === 0 ? (
            <div className="p-8 text-center text-slate-500">
              Nenhum músico para pagar nesta semana.
            </div>
          ) : (
            <div className="divide-y divide-slate-200">

              {pagamentosMusicos.map((item) => (
                <div
                  key={item.musician_id}
                  className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="font-bold">
                      {item.nome}
                    </p>

                    <p className="mt-1 text-xs text-slate-500">
                      {item.eventos}{" "}
                      {item.eventos === 1
                        ? "evento"
                        : "eventos"}{" "}
                      • Total: {moeda(item.total)}
                    </p>
                  </div>

                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center">

                    <div className="text-right">
                      <p className="text-[10px] font-bold uppercase text-slate-500">
                        A pagar
                      </p>

                      <p className="text-xl font-extrabold">
                        {moeda(item.pendente)}
                      </p>

                      <p className="text-xs text-slate-500">
                        Pago: {moeda(item.pago)}
                      </p>
                    </div>

                    <button
                      type="button"
                      disabled={
                        item.pendente <= 0 ||
                        pagando !== null
                      }
                      onClick={() =>
                        pagarMusico(item)
                      }
                      className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {item.pendente <= 0
                        ? "Pago"
                        : pagando === item.musician_id
                        ? "Pagando..."
                        : `Pagar ${moeda(
                            item.pendente
                          )}`}
                    </button>

                  </div>
                </div>
              ))}

            </div>
          )}

        </section>

        <section className="mb-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">

          <div className="mb-4">
            <h2 className="text-xl font-bold">
              Pagamentos dos sócios
            </h2>

            <p className="mt-1 text-sm text-slate-500">
              Rodrigo 25% e Marlon 25% do resultado da semana.
            </p>
          </div>

          {!fechamento ? (
            <div className="rounded-lg bg-amber-50 p-4 text-sm font-semibold text-amber-700">
              Salve o fechamento da semana antes de pagar os sócios.
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">

              <div className="rounded-xl border border-slate-200 bg-white p-4">

                <div className="flex items-center justify-between gap-4">

                  <div>
                    <p className="font-bold">
                      Rodrigo
                    </p>

                    <p className="mt-1 text-xl font-extrabold">
                      {moeda(valorRodrigo)}
                    </p>

                    <span
                      className={`mt-2 inline-block rounded-full px-3 py-1 text-xs font-bold ${
                        fechamento.rodrigo_paid
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-amber-100 text-amber-700"
                      }`}
                    >
                      {fechamento.rodrigo_paid
                        ? `Pago em ${dataBR(
                            fechamento.rodrigo_payment_date
                          )}`
                        : "Pendente"}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      pagarSocio("rodrigo")
                    }
                    disabled={
                      fechamento.rodrigo_paid ||
                      pagando !== null
                    }
                    className={`rounded-lg px-4 py-2 text-xs font-bold text-white ${
                      fechamento.rodrigo_paid
                        ? "bg-slate-400"
                        : "bg-slate-900"
                    }`}
                  >
                    {fechamento.rodrigo_paid
                      ? "Pago"
                      : pagando === "rodrigo"
                      ? "Pagando..."
                      : "Marcar como pago"}
                  </button>

                </div>

              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-4">

                <div className="flex items-center justify-between gap-4">

                  <div>
                    <p className="font-bold">
                      Marlon
                    </p>

                    <p className="mt-1 text-xl font-extrabold">
                      {moeda(valorMarlon)}
                    </p>

                    <span
                      className={`mt-2 inline-block rounded-full px-3 py-1 text-xs font-bold ${
                        fechamento.marlon_paid
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-amber-100 text-amber-700"
                      }`}
                    >
                      {fechamento.marlon_paid
                        ? `Pago em ${dataBR(
                            fechamento.marlon_payment_date
                          )}`
                        : "Pendente"}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      pagarSocio("marlon")
                    }
                    disabled={
                      fechamento.marlon_paid ||
                      pagando !== null
                    }
                    className={`rounded-lg px-4 py-2 text-xs font-bold text-white ${
                      fechamento.marlon_paid
                        ? "bg-slate-400"
                        : "bg-slate-900"
                    }`}
                  >
                    {fechamento.marlon_paid
                      ? "Pago"
                      : pagando === "marlon"
                      ? "Pagando..."
                      : "Marcar como pago"}
                  </button>

                </div>

              </div>

            </div>
          )}

        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">

          <h2 className="text-lg font-bold">
            Resumo financeiro da semana
          </h2>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">

            <div className="rounded-lg bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase text-slate-500">
                Músicos
              </p>

              <p className="mt-1 text-lg font-bold">
                {moeda(totalMusicos)}
              </p>
            </div>

            <div className="rounded-lg bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase text-slate-500">
                Músicos pagos
              </p>

              <p className="mt-1 text-lg font-bold">
                {moeda(totalPagoMusicos)}
              </p>
            </div>

            <div className="rounded-lg bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase text-slate-500">
                Músicos pendentes
              </p>

              <p className="mt-1 text-lg font-bold">
                {moeda(totalPendenteMusicos)}
              </p>
            </div>

            <div className="rounded-lg bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase text-slate-500">
                Sócios
              </p>

              <p className="mt-1 text-lg font-bold">
                {moeda(totalSocios)}
              </p>
            </div>

          </div>

        </section>

        <div className="mt-6">
          <a
            href="/"
            className="inline-flex rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            ← Voltar ao início
          </a>
        </div>

      </div>
    </main>
  );
}