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
  event_id: string | null;
  description: string;
  actual_amount: number;
  actual_receipt_date: string | null;
  status: string;
};

type SinalDetalhe = {
  event_revenue_id: string;
  descricao: string;
  valor: number;
  data: string | null;
  event_id: string | null;
  evento: string;
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

function moeda(valor: number): string {
  return Number(valor || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function dataISO(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
    2,
    "0"
  )}-${String(date.getDate()).padStart(2, "0")}`;
}

function dataBR(data: string | null | undefined): string {
  if (!data) return "-";

  const parts = data.split("-");
  if (parts.length !== 3) return data;

  const [ano, mes, dia] = parts;
  return `${dia}/${mes}/${ano}`;
}

function segundaDaSemana(date: Date): Date {
  const d = new Date(date);
  const dia = d.getDay();
  d.setDate(d.getDate() + (dia === 0 ? -6 : 1 - dia));
  return d;
}

function domingoDaSemana(date: Date): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + 6);
  return d;
}

function ehLancamentoAutomatico(descricao: string): boolean {
  const d = String(descricao || "").trim().toLowerCase();

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
  const [semanaReferencia, setSemanaReferencia] = useState<string>(
    dataISO(new Date())
  );

  const [participacoes, setParticipacoes] = useState<Participacao[]>([]);
  const [eventosDaSemana, setEventosDaSemana] = useState<Evento[]>([]);
  const [fechamento, setFechamento] = useState<Fechamento | null>(null);
  const [recebimentos, setRecebimentos] = useState<Recebimento[]>([]);
  const [sinaisDetalhes, setSinaisDetalhes] = useState<SinalDetalhe[]>([]);
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([]);
  const [saldoInicialCaixa, setSaldoInicialCaixa] = useState<number>(0);

  const [loading, setLoading] = useState<boolean>(true);
  const [pagando, setPagando] = useState<string | null>(null);
  const [mensagem, setMensagem] = useState<string>("");
  const [erro, setErro] = useState<string>("");

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
        configRes,
        recebimentosRes,
        receitasRes,
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
          .from("cash_setup")
          .select("initial_balance")
          .limit(1)
          .maybeSingle(),

        supabase
          .from("event_revenue_receipts")
          .select(
            "event_revenue_id,description,actual_amount,actual_receipt_date,status"
          )
          .eq("status", "recebido"),

        supabase
          .from("event_revenues")
          .select("id,event_id,description") ,

        supabase
          .from("cash_transactions")
          .select(
            "id,transaction_date,description,transaction_type,amount,direction,notes"
          )
          .order("transaction_date", { ascending: true }),
      ]);

      if (eventosRes.error) throw eventosRes.error;
      if (fechamentoRes.error) throw fechamentoRes.error;
      if (configRes.error) throw configRes.error;
      if (recebimentosRes.error) throw recebimentosRes.error;
      if (receitasRes.error) throw receitasRes.error;
      if (lancamentosRes.error) throw lancamentosRes.error;

      const eventosRealizados = ((eventosRes.data || []) as Evento[]).filter(
        (evento) => evento.status === "realizado"
      );

      setEventosDaSemana(eventosRealizados);

      const idsEventos = eventosRealizados.map((evento) => evento.id);

      let participacoesData: any[] = [];

      if (idsEventos.length > 0) {
        const participacoesRes = await supabase
          .from("event_musicians")
          .select(
            "id,event_id,musician_id,event_cache,payment_status,payment_date,musicians(name)"
          )
          .in("event_id", idsEventos);

        if (participacoesRes.error) throw participacoesRes.error;

        participacoesData = participacoesRes.data || [];
      }

      setParticipacoes(
        participacoesData.map((p: any): Participacao => ({
          id: String(p.id),
          event_id: String(p.event_id),
          musician_id: String(p.musician_id),
          event_cache: Number(p.event_cache || 0),
          payment_status: p.payment_status === "pago" ? "pago" : "pendente",
          payment_date: p.payment_date || null,
          musician_name: p.musicians?.name || "Músico sem nome",
        }))
      );

      const fechamentoData = fechamentoRes.data as Fechamento | null;

      setFechamento(
        fechamentoData
          ? {
              ...fechamentoData,
              total_received: Number(fechamentoData.total_received || 0),
              total_musicians: Number(fechamentoData.total_musicians || 0),
              total_other_expenses: Number(
                fechamentoData.total_other_expenses || 0
              ),
              rodrigo_amount: Number(fechamentoData.rodrigo_amount || 0),
              marlon_amount: Number(fechamentoData.marlon_amount || 0),
              group_cash_amount: Number(fechamentoData.group_cash_amount || 0),
              rodrigo_paid: Boolean(fechamentoData.rodrigo_paid),
              marlon_paid: Boolean(fechamentoData.marlon_paid),
            }
          : null
      );

      const mapaReceitas = new Map<string, { event_id: string; description: string }>();
      for (const receita of receitasRes.data || []) {
        mapaReceitas.set(String(receita.id), {
          event_id: String(receita.event_id),
          description: String(receita.description || ""),
        });
      }

      setRecebimentos(
        (recebimentosRes.data || []).map(
          (r: any): Recebimento => ({
            event_revenue_id: String(r.event_revenue_id),
            event_id: mapaReceitas.get(String(r.event_revenue_id))?.event_id || null,
            description: String(r.description || ""),
            actual_amount: Number(r.actual_amount || 0),
            actual_receipt_date: r.actual_receipt_date || null,
            status: String(r.status || ""),
          })
        )
      );

      const mapaEventos = new Map<string, string>();
      for (const evento of eventosRes.data || []) {
        mapaEventos.set(String(evento.id), String(evento.name || "Evento sem nome"));
      }

      const detalhesSinais: SinalDetalhe[] = (recebimentosRes.data || [])
        .filter((r: any) => {
          const descricao = String(r.description || "").trim().toLowerCase();
          const data = r.actual_receipt_date || "";
          return (
            r.status === "recebido" &&
            !!r.actual_receipt_date &&
            data >= semanaInicio &&
            data <= semanaFim &&
            (descricao === "sinal" || descricao.startsWith("sinal "))
          );
        })
        .map((r: any): SinalDetalhe => {
          const receita = mapaReceitas.get(String(r.event_revenue_id));
          const evento = receita?.event_id
            ? mapaEventos.get(receita.event_id) || "Evento não encontrado"
            : "Receita não vinculada a evento";
          return {
            event_revenue_id: String(r.event_revenue_id),
            descricao: String(r.description || ""),
            valor: Number(r.actual_amount || 0),
            data: r.actual_receipt_date || null,
            event_id: receita?.event_id || null,
            evento,
          };
        });

      setSinaisDetalhes(detalhesSinais);

      setLancamentos(
        (lancamentosRes.data || []).map(
          (l: any): Lancamento => ({
            id: String(l.id),
            transaction_date: String(l.transaction_date),
            description: String(l.description || ""),
            transaction_type: String(l.transaction_type || ""),
            amount: Number(l.amount || 0),
            direction: l.direction === "saida" ? "saida" : "entrada",
            notes: l.notes || null,
          })
        )
      );

      setSaldoInicialCaixa(Number(configRes.data?.initial_balance || 0));
    } catch (error: any) {
      console.error(error);
      setErro(
        error?.message || "Erro ao carregar os pagamentos da semana."
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
        mapa.get(participacao.musician_id) ||
        ({
          musician_id: participacao.musician_id,
          nome: participacao.musician_name,
          eventos: 0,
          total: 0,
          pago: 0,
          pendente: 0,
          participacoes: [],
        } satisfies PagamentoMusico);

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

  const totalMusicos = useMemo(
    () =>
      pagamentosMusicos.reduce(
        (total, item) => total + Number(item.total || 0),
        0
      ),
    [pagamentosMusicos]
  );

  const totalPagoMusicos = useMemo(
    () =>
      pagamentosMusicos.reduce(
        (total, item) => total + Number(item.pago || 0),
        0
      ),
    [pagamentosMusicos]
  );

  const totalPendenteMusicos = useMemo(
    () =>
      pagamentosMusicos.reduce(
        (total, item) => total + Number(item.pendente || 0),
        0
      ),
    [pagamentosMusicos]
  );

  // REGRA DEFINITIVA:
  // O card "Valor que entrou no caixa na semana" considera somente
  // recebimentos dos eventos cuja DATA DO EVENTO pertence à semana selecionada.
  //
  // Sinais de eventos futuros ficam fora deste cálculo, mesmo que tenham
  // sido recebidos durante a semana. Eles entram no caixa, mas só serão
  // considerados no fechamento da semana em que o evento acontecer.
  //
  // Também excluímos qualquer recebimento descrito como "Sinal" dos
  // eventos da própria semana, porque o sinal já foi recebido anteriormente
  // e o que entra nesta semana é somente o saldo restante.
  const valorRecebidoEventosSemana = useMemo(() => {
    const idsEventosSemana = new Set(
      eventosDaSemana.map((evento) => String(evento.id))
    );

    return recebimentos.reduce((total, recebimento) => {
      const descricao = String(recebimento.description || "")
        .trim()
        .toLowerCase();

      const dataRecebimento = recebimento.actual_receipt_date || "";
      const pertenceAosEventosDaSemana = idsEventosSemana.has(
        String(recebimento.event_id || "")
      );
      const recebidoNestaSemana =
        dataRecebimento >= semanaInicio && dataRecebimento <= semanaFim;
      const ehSinal =
        descricao === "sinal" || descricao.startsWith("sinal ");

      if (
        recebimento.status !== "recebido" ||
        !recebimento.actual_receipt_date ||
        !pertenceAosEventosDaSemana ||
        !recebidoNestaSemana ||
        ehSinal
      ) {
        return total;
      }

      return total + Number(recebimento.actual_amount || 0);
    }, 0);
  }, [recebimentos, eventosDaSemana, semanaInicio, semanaFim]);

  // Mantido apenas para exibir no diagnóstico temporário abaixo.
  const valorSinaisSemana = useMemo(
    () =>
      sinaisDetalhes.reduce(
        (total, sinal) => total + Number(sinal.valor || 0),
        0
      ),
    [sinaisDetalhes]
  );

  // Nesta tela, o valor do card já é o valor novo efetivamente recebido
  // pelos eventos da semana. Não subtraímos sinais novamente.
  const entrouNaSemana = valorRecebidoEventosSemana;

  // REGRA DEFINIDA:
  // caixa = valor que já estava no caixa
  //       + valor novo que entrou na semana
  //       - sinais
  //       - músicos pagos na semana.
  const saldoCaixa = useMemo(() => {
    const musicosPagosSemana = pagamentosMusicos.reduce(
      (total, item) => total + Number(item.pago || 0),
      0
    );

    return (
      Number(saldoInicialCaixa || 0) +
      Number(entrouNaSemana || 0) -
      Number(valorSinaisSemana || 0) -
      Number(musicosPagosSemana || 0)
    );
  }, [
    saldoInicialCaixa,
    entrouNaSemana,
    valorSinaisSemana,
    pagamentosMusicos,
  ]);

  const valorRodrigo = Number(fechamento?.rodrigo_amount || 0);
  const valorMarlon = Number(fechamento?.marlon_amount || 0);
  const totalSocios = valorRodrigo + valorMarlon;

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
        .filter((p) => p.payment_status !== "pago")
        .map((p) => p.id);

      if (idsPendentes.length === 0) return;

      const { error } = await supabase
        .from("event_musicians")
        .update({
          payment_status: "pago",
          payment_date: dataISO(new Date()),
        })
        .in("id", idsPendentes);

      if (error) throw error;

      setMensagem(`${item.nome} marcado como pago.`);
      await carregar();
    } catch (error: any) {
      console.error(error);
      setErro(
        error?.message || "Erro ao registrar o pagamento do músico."
      );
    } finally {
      setPagando(null);
    }
  }

  async function pagarSocio(tipo: "rodrigo" | "marlon") {
    if (!fechamento) {
      setErro(
        "Faça e salve o fechamento da semana antes de pagar os sócios."
      );
      return;
    }

    const nome = tipo === "rodrigo" ? "Rodrigo" : "Marlon";
    const valor = tipo === "rodrigo" ? valorRodrigo : valorMarlon;
    const jaPago =
      tipo === "rodrigo"
        ? fechamento.rodrigo_paid
        : fechamento.marlon_paid;

    if (jaPago || valor <= 0) return;

    const confirmar = window.confirm(
      `Confirmar pagamento de ${nome} no valor de ${moeda(valor)}?`
    );

    if (!confirmar) return;

    try {
      setPagando(tipo);
      setErro("");
      setMensagem("");

      const campoPago =
        tipo === "rodrigo" ? "rodrigo_paid" : "marlon_paid";
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

      setMensagem(`${nome} marcado como pago.`);
      await carregar();
    } catch (error: any) {
      console.error(error);
      setErro(
        error?.message || "Erro ao registrar o pagamento do sócio."
      );
    } finally {
      setPagando(null);
    }
  }

  function mudarSemana(direcao: number) {
    const data = new Date(`${semanaInicio}T12:00:00`);
    data.setDate(data.getDate() + direcao * 7);
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
            <h1 className="text-3xl font-bold">Pagamentos</h1>
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
                {dataBR(semanaInicio)} até {dataBR(semanaFim)}
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

        {/* SOMENTE 3 CARDS */}
        <section className="mb-5 grid gap-3 md:grid-cols-3">
          <div className="rounded-xl border border-purple-200 bg-purple-50 p-5">
            <p className="text-sm font-bold text-purple-700">
              Pagamento dos músicos da semana
            </p>
            <p className="mt-2 text-2xl font-extrabold text-purple-900">
              {moeda(totalPendenteMusicos)}
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
              Recebimentos dos eventos desta semana. Sinais de eventos futuros não entram aqui.
            </p>
          </div>

          <div className="rounded-xl border border-blue-200 bg-blue-50 p-5">
            <p className="text-sm font-bold text-blue-700">
              Valor total do caixa
            </p>
            <p className="mt-2 text-2xl font-extrabold text-blue-900">
              {moeda(saldoCaixa)}
            </p>
            <p className="mt-1 text-xs text-blue-700">
              Saldo anterior + entrada da semana − sinais − músicos pagos
            </p>
          </div>
        </section>

        <section className="mb-5 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 p-5">
            <h2 className="text-xl font-bold">Pagamentos dos músicos</h2>
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
                    <p className="font-bold">{item.nome}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {item.eventos}{" "}
                      {item.eventos === 1 ? "evento" : "eventos"} • Total:{" "}
                      {moeda(item.total)}
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
                      disabled={item.pendente <= 0 || pagando !== null}
                      onClick={() => pagarMusico(item)}
                      className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {item.pendente <= 0
                        ? "Pago"
                        : pagando === item.musician_id
                        ? "Pagando..."
                        : `Pagar ${moeda(item.pendente)}`}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="mb-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4">
            <h2 className="text-xl font-bold">Pagamentos dos sócios</h2>
            <p className="mt-1 text-sm text-slate-500">
              Rodrigo e Marlon conforme o fechamento semanal.
            </p>
          </div>

          {!fechamento ? (
            <div className="rounded-lg bg-amber-50 p-4 text-sm font-semibold text-amber-700">
              Salve o fechamento da semana antes de pagar os sócios.
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {(
                [
                  ["rodrigo", "Rodrigo", valorRodrigo, fechamento.rodrigo_paid, fechamento.rodrigo_payment_date],
                  ["marlon", "Marlon", valorMarlon, fechamento.marlon_paid, fechamento.marlon_payment_date],
                ] as const
              ).map(([tipo, nome, valor, pago, dataPagamento]) => (
                <div
                  key={tipo}
                  className="rounded-xl border border-slate-200 bg-white p-4"
                >
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="font-bold">{nome}</p>
                      <p className="mt-1 text-xl font-extrabold">
                        {moeda(valor)}
                      </p>
                      <span
                        className={`mt-2 inline-block rounded-full px-3 py-1 text-xs font-bold ${
                          pago
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-amber-100 text-amber-700"
                        }`}
                      >
                        {pago ? `Pago em ${dataBR(dataPagamento)}` : "Pendente"}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => pagarSocio(tipo)}
                      disabled={pago || pagando !== null || valor <= 0}
                      className={`rounded-lg px-4 py-2 text-xs font-bold text-white ${
                        pago ? "bg-slate-400" : "bg-slate-900"
                      }`}
                    >
                      {pago
                        ? "Pago"
                        : pagando === tipo
                        ? "Pagando..."
                        : "Marcar como pago"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-bold">Resumo da semana</h2>

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
