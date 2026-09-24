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
  payment_status: string;
  payment_date: string | null;
  musician_name: string;
};

type Fechamento = {
  id: string;
  week_start: string;
  week_end: string;
  net_result: number;
  rodrigo_amount: number;
  marlon_amount: number;
  group_cash_amount: number;
  rodrigo_paid: boolean;
  marlon_paid: boolean;
  rodrigo_payment_date: string | null;
  marlon_payment_date: string | null;
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
  const ano = date.getFullYear();
  const mes = String(date.getMonth() + 1).padStart(2, "0");
  const dia = String(date.getDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
}

function dataBR(data: string | null | undefined) {
  if (!data) return "-";
  const [ano, mes, dia] = data.split("-");
  return `${dia}/${mes}/${ano}`;
}

function segundaDaSemana(date: Date) {
  const d = new Date(date);
  const dia = d.getDay();
  const diferenca = dia === 0 ? -6 : 1 - dia;
  d.setDate(d.getDate() + diferenca);
  return d;
}

function domingoDaSemana(date: Date) {
  const d = new Date(date);
  d.setDate(d.getDate() + 6);
  return d;
}

export default function PagamentosPage() {
  const hoje = new Date();

  const [semanaReferencia, setSemanaReferencia] = useState(dataISO(hoje));
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [participacoes, setParticipacoes] = useState<Participacao[]>([]);
  const [fechamento, setFechamento] = useState<Fechamento | null>(null);
  const [loading, setLoading] = useState(true);
  const [pagando, setPagando] = useState<string | null>(null);
  const [mensagem, setMensagem] = useState("");
  const [erro, setErro] = useState("");

  const semanaInicio = useMemo(
    () => dataISO(segundaDaSemana(new Date(`${semanaReferencia}T12:00:00`))),
    [semanaReferencia]
  );

  const semanaFim = useMemo(
    () => dataISO(domingoDaSemana(new Date(`${semanaInicio}T12:00:00`))),
    [semanaInicio]
  );

  async function carregar() {
    try {
      setLoading(true);
      setErro("");
      setMensagem("");

      const { data: eventosData, error: eventosError } = await supabase
        .from("events")
        .select("id,name,event_date,status")
        .gte("event_date", semanaInicio)
        .lte("event_date", semanaFim)
        .order("event_date", { ascending: true });

      if (eventosError) throw eventosError;

      const eventosRealizados = (eventosData || []).filter(
        (evento: Evento) => evento.status === "realizado"
      );

      setEventos(eventosRealizados);

      const idsEventos = eventosRealizados.map((evento) => evento.id);

      if (idsEventos.length > 0) {
        const { data: participacoesData, error: participacoesError } =
          await supabase
            .from("event_musicians")
            .select(
              `
                id,
                event_id,
                musician_id,
                event_cache,
                payment_status,
                payment_date,
                musicians ( name )
              `
            )
            .in("event_id", idsEventos);

        if (participacoesError) throw participacoesError;

        setParticipacoes(
          (participacoesData || []).map((item: any) => ({
            id: item.id,
            event_id: item.event_id,
            musician_id: item.musician_id,
            event_cache: Number(item.event_cache || 0),
            payment_status: item.payment_status || "pendente",
            payment_date: item.payment_date || null,
            musician_name: item.musicians?.name || "Músico",
          }))
        );
      } else {
        setParticipacoes([]);
      }

      const { data: fechamentoData, error: fechamentoError } = await supabase
        .from("weekly_closings")
        .select(
          "id,week_start,week_end,net_result,rodrigo_amount,marlon_amount,group_cash_amount,rodrigo_paid,marlon_paid,rodrigo_payment_date,marlon_payment_date"
        )
        .eq("week_start", semanaInicio)
        .eq("week_end", semanaFim)
        .maybeSingle();

      if (fechamentoError) throw fechamentoError;

      setFechamento(fechamentoData || null);
    } catch (error: any) {
      console.error(error);
      setErro(error.message || "Erro ao carregar os pagamentos da semana.");
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
      const atual = mapa.get(participacao.musician_id) || {
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

  const totalMusicos = pagamentosMusicos.reduce((soma, item) => soma + item.total, 0);
  const totalPagoMusicos = pagamentosMusicos.reduce((soma, item) => soma + item.pago, 0);
  const totalPendenteMusicos = pagamentosMusicos.reduce((soma, item) => soma + item.pendente, 0);

  const totalSocios =
    Number(fechamento?.rodrigo_amount || 0) +
    Number(fechamento?.marlon_amount || 0);

  const totalPagar = totalPendenteMusicos + totalSocios -
    (fechamento?.rodrigo_paid ? Number(fechamento?.rodrigo_amount || 0) : 0) -
    (fechamento?.marlon_paid ? Number(fechamento?.marlon_amount || 0) : 0);

  function mudarSemana(direcao: number) {
    const data = new Date(`${semanaInicio}T12:00:00`);
    data.setDate(data.getDate() + direcao * 7);
    setSemanaReferencia(dataISO(data));
  }

  async function pagarMusico(item: PagamentoMusico) {
    if (item.pendente <= 0 || pagando) return;

    const confirmar = window.confirm(
      `Confirmar pagamento de ${item.nome} no valor de ${moeda(item.pendente)}?

Isso marcará como pago todas as participações pendentes desta semana.`
    );

    if (!confirmar) return;

    try {
      setPagando(item.musician_id);
      setErro("");
      setMensagem("");

      const idsPendentes = item.participacoes
        .filter((participacao) => participacao.payment_status !== "pago")
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

      setMensagem(`${item.nome} marcado como pago.`);
      await carregar();
    } catch (error: any) {
      console.error(error);
      setErro(error.message || "Erro ao registrar o pagamento do músico.");
    } finally {
      setPagando(null);
    }
  }

  async function pagarSocio(tipo: "rodrigo" | "marlon") {
    if (!fechamento) {
      setErro("Faça e salve o fechamento da semana antes de pagar os sócios.");
      return;
    }

    const nome = tipo === "rodrigo" ? "Rodrigo" : "Marlon";
    const valor = Number(
      tipo === "rodrigo" ? fechamento.rodrigo_amount : fechamento.marlon_amount
    );
    const jaPago = tipo === "rodrigo" ? fechamento.rodrigo_paid : fechamento.marlon_paid;

    if (jaPago || valor <= 0) return;

    const confirmar = window.confirm(
      `Confirmar pagamento de ${nome} no valor de ${moeda(valor)}?`
    );

    if (!confirmar) return;

    try {
      setPagando(tipo);
      setErro("");
      setMensagem("");

      const campoPago = tipo === "rodrigo" ? "rodrigo_paid" : "marlon_paid";
      const campoData = tipo === "rodrigo" ? "rodrigo_payment_date" : "marlon_payment_date";

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
      setErro(error.message || "Erro ao registrar o pagamento do sócio.");
    } finally {
      setPagando(null);
    }
  }

  return (
    <main className="min-h-screen bg-slate-100 p-4 text-slate-800 md:p-6">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-slate-500">VIROMANIA GESTÃO</p>
            <h1 className="mt-1 text-3xl font-extrabold">Pagamentos</h1>
            <p className="mt-2 text-sm text-slate-500">
              Tudo que precisa ser pago depois do fechamento da semana.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => mudarSemana(-1)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-bold hover:bg-slate-50"
            >
              ← Semana anterior
            </button>
            <button
              onClick={() => mudarSemana(1)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-bold hover:bg-slate-50"
            >
              Próxima semana →
            </button>
          </div>
        </div>

        <section className="mb-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Semana selecionada</p>
              <p className="mt-1 text-2xl font-extrabold">
                {dataBR(semanaInicio)} até {dataBR(semanaFim)}
              </p>
            </div>
            <div className={`rounded-full px-4 py-2 text-sm font-bold ${fechamento ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>
              {fechamento ? "✓ Fechamento realizado" : "⚠ Fechamento ainda não salvo"}
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
          <div className="rounded-xl bg-white p-10 text-center shadow-sm">Carregando pagamentos...</div>
        ) : (
          <>
            <section className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-xl border border-purple-200 bg-purple-50 p-5 shadow-sm">
                <p className="text-sm font-semibold text-purple-700">Músicos da semana</p>
                <p className="mt-2 text-2xl font-extrabold text-purple-900">{moeda(totalMusicos)}</p>
                <p className="mt-1 text-xs text-purple-700">{pagamentosMusicos.length} músico(s)</p>
              </div>
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 shadow-sm">
                <p className="text-sm font-semibold text-amber-700">Pendente dos músicos</p>
                <p className="mt-2 text-2xl font-extrabold text-amber-900">{moeda(totalPendenteMusicos)}</p>
                <p className="mt-1 text-xs text-amber-700">Já pago: {moeda(totalPagoMusicos)}</p>
              </div>
              <div className="rounded-xl border border-blue-200 bg-blue-50 p-5 shadow-sm">
                <p className="text-sm font-semibold text-blue-700">Rodrigo + Marlon</p>
                <p className="mt-2 text-2xl font-extrabold text-blue-900">{moeda(totalSocios)}</p>
                <p className="mt-1 text-xs text-blue-700">Divisão do resultado semanal</p>
              </div>
              <div className="rounded-xl border border-green-200 bg-green-50 p-5 shadow-sm">
                <p className="text-sm font-semibold text-green-700">Total a pagar agora</p>
                <p className="mt-2 text-2xl font-extrabold text-green-900">{moeda(Math.max(0, totalPagar))}</p>
                <p className="mt-1 text-xs text-green-700">Músicos + sócios pendentes</p>
              </div>
            </section>

            <section className="mb-6 rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-200 p-5">
                <h2 className="text-xl font-extrabold">Pagamentos dos músicos</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Todos que tocaram em eventos realizados nesta semana, incluindo fixos e freelancers.
                </p>
              </div>

              {pagamentosMusicos.length === 0 ? (
                <div className="p-10 text-center text-slate-500">
                  Nenhum músico participou de eventos realizados nesta semana.
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {pagamentosMusicos.map((item) => {
                    const pago = item.pendente <= 0;
                    return (
                      <div key={item.musician_id} className="flex flex-wrap items-center justify-between gap-4 p-5">
                        <div>
                          <p className="text-lg font-extrabold">{item.nome}</p>
                          <p className="mt-1 text-sm text-slate-500">
                            {item.eventos} {item.eventos === 1 ? "evento" : "eventos"} • Total: {moeda(item.total)}
                          </p>
                        </div>

                        <div className="text-right">
                          <p className="text-xs font-semibold uppercase text-slate-500">A pagar</p>
                          <p className="text-xl font-extrabold">{moeda(item.pendente)}</p>
                          <p className="text-xs text-slate-500">Pago: {moeda(item.pago)}</p>
                        </div>

                        {pago ? (
                          <span className="rounded-full bg-green-100 px-4 py-2 text-sm font-bold text-green-700">✓ Pago</span>
                        ) : (
                          <button
                            onClick={() => pagarMusico(item)}
                            disabled={pagando === item.musician_id}
                            className="rounded-lg bg-slate-900 px-5 py-3 text-sm font-bold text-white disabled:opacity-50"
                          >
                            {pagando === item.musician_id ? "Registrando..." : `Pagar ${moeda(item.pendente)}`}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            <section className="mb-6 rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-200 p-5">
                <h2 className="text-xl font-extrabold">Pagamentos dos sócios</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Valores calculados automaticamente pelo fechamento semanal: Rodrigo 25% e Marlon 25% do resultado distribuível.
                </p>
              </div>

              {!fechamento ? (
                <div className="p-8 text-center text-slate-500">
                  Salve o fechamento desta semana para liberar os valores dos sócios.
                </div>
              ) : (
                <div className="grid gap-4 p-5 md:grid-cols-2">
                  <div className="rounded-xl border border-slate-200 p-5">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <div>
                        <p className="text-lg font-extrabold">Rodrigo</p>
                        <p className="mt-1 text-sm text-slate-500">Sua parte da divisão semanal</p>
                      </div>
                      <p className="text-2xl font-extrabold">{moeda(fechamento.rodrigo_amount)}</p>
                    </div>
                    <div className="mt-4 flex items-center justify-between gap-3">
                      <span className={`rounded-full px-3 py-1 text-xs font-bold ${fechamento.rodrigo_paid ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>
                        {fechamento.rodrigo_paid ? `Pago em ${dataBR(fechamento.rodrigo_payment_date)}` : "Pendente"}
                      </span>
                      {!fechamento.rodrigo_paid && (
                        <button
                          onClick={() => pagarSocio("rodrigo")}
                          disabled={pagando === "rodrigo"}
                          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
                        >
                          {pagando === "rodrigo" ? "Registrando..." : "Marcar como pago"}
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-200 p-5">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <div>
                        <p className="text-lg font-extrabold">Marlon</p>
                        <p className="mt-1 text-sm text-slate-500">Parte da divisão semanal</p>
                      </div>
                      <p className="text-2xl font-extrabold">{moeda(fechamento.marlon_amount)}</p>
                    </div>
                    <div className="mt-4 flex items-center justify-between gap-3">
                      <span className={`rounded-full px-3 py-1 text-xs font-bold ${fechamento.marlon_paid ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>
                        {fechamento.marlon_paid ? `Pago em ${dataBR(fechamento.marlon_payment_date)}` : "Pendente"}
                      </span>
                      {!fechamento.marlon_paid && (
                        <button
                          onClick={() => pagarSocio("marlon")}
                          disabled={pagando === "marlon"}
                          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
                        >
                          {pagando === "marlon" ? "Registrando..." : "Marcar como pago"}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </section>

            <section className="mb-10 rounded-xl border border-blue-100 bg-blue-50 p-5">
              <h2 className="font-extrabold text-blue-900">Como funciona</h2>
              <div className="mt-3 space-y-2 text-sm text-blue-800">
                <p>1. Você fecha a semana em <strong>Fechamento</strong>.</p>
                <p>2. Aqui aparecem automaticamente todos os músicos que tocaram nos eventos realizados da semana.</p>
                <p>3. Fixos e freelancers entram normalmente nos pagamentos dos shows.</p>
                <p>4. O valor de cada músico é somado quando ele tocou em mais de um evento na semana.</p>
                <p>5. Rodrigo e Marlon aparecem separados com os valores calculados pelo fechamento.</p>
                <p>6. Ao clicar em <strong>Pagar</strong>, as participações correspondentes são marcadas como pagas.</p>
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
