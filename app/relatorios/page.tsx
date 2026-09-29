"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type Evento = {
  id: string;
  name: string;
  event_date: string;
  status: string;
};

type Musico = {
  id: string;
  name: string;
  type: string;
  active: boolean;
};

type MusicoEvento = {
  id: string;
  event_id: string;
  musician_id: string;
  event_cache: number;
  payment_status: string;
  payment_date: string | null;
};

type Recebimento = {
  id: string;
  event_revenue_id: string;
  actual_amount: number;
  actual_receipt_date: string | null;
  status: string;
};

type Receita = {
  id: string;
  event_id: string;
};

type Despesa = {
  id: string;
  event_id: string;
  amount: number;
  payment_date: string | null;
};

type Fechamento = {
  id: string;
  week_start: string;
  week_end: string;
  rodrigo_amount: number;
  marlon_amount: number;
  rodrigo_paid: boolean;
  marlon_paid: boolean;
  rodrigo_payment_date: string | null;
  marlon_payment_date: string | null;
};

type Ensaio = {
  id: string;
  rehearsal_date: string;
};

type Presenca = {
  id: string;
  rehearsal_id: string;
  musician_id: string;
  present: boolean;
};

type Bonus = {
  id: string;
  reference_month: string;
  total_amount: number;
  paid: boolean;
  payment_date: string | null;
};

type Manual = {
  id: string;
  amount: number;
  direction: string;
  transaction_date: string;
  description: string | null;
};

type ResumoMusico = {
  id: string;
  nome: string;
  cache: number;
  pago: number;
  pendente: number;
  eventos: number;
  ensaios: number;
  participacoes: number;
};

function moeda(valor: number) {
  return Number(valor || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function dataBR(data: string | null | undefined) {
  if (!data) return "-";

  const [ano, mes, dia] = data.split("-");

  return `${dia}/${mes}/${ano}`;
}

function primeiroDiaMesAtual() {
  const hoje = new Date();

  return `${hoje.getFullYear()}-${String(
    hoje.getMonth() + 1
  ).padStart(2, "0")}-01`;
}

function ultimoDiaMes(mes: string) {
  const [ano, numeroMes] = mes.split("-").map(Number);

  const ultimo = new Date(ano, numeroMes, 0).getDate();

  return `${ano}-${String(numeroMes).padStart(
    2,
    "0"
  )}-${String(ultimo).padStart(2, "0")}`;
}

function musicoFixo(musico: Musico) {
  return (
    String(musico.type || "")
      .trim()
      .toLowerCase() === "fixo"
  );
}

export default function RelatoriosPage() {
  const [modo, setModo] = useState<
    "mes" | "ano" | "personalizado"
  >("mes");

  const [mes, setMes] = useState(
    primeiroDiaMesAtual().slice(0, 7)
  );

  const [ano, setAno] = useState(
    new Date().getFullYear()
  );

  const [inicio, setInicio] = useState(
    primeiroDiaMesAtual()
  );

  const [fim, setFim] = useState(
    primeiroDiaMesAtual()
  );

  const [eventos, setEventos] = useState<Evento[]>([]);

  // Total de eventos do período:
  // agendados + realizados
  const [totalEventosPeriodo, setTotalEventosPeriodo] =
    useState(0);

  const [musicos, setMusicos] = useState<Musico[]>([]);
  const [musicosEventos, setMusicosEventos] = useState<
    MusicoEvento[]
  >([]);

  const [receitas, setReceitas] = useState<Receita[]>([]);
  const [recebimentos, setRecebimentos] = useState<
    Recebimento[]
  >([]);

  const [despesas, setDespesas] = useState<Despesa[]>([]);
  const [fechamentos, setFechamentos] = useState<
    Fechamento[]
  >([]);

  const [ensaios, setEnsaios] = useState<Ensaio[]>([]);
  const [presencas, setPresencas] = useState<Presenca[]>([]);

  const [bonuses, setBonuses] = useState<Bonus[]>([]);
  const [manuais, setManuais] = useState<Manual[]>([]);

  const [buscaMusico, setBuscaMusico] = useState("");

  const [carregando, setCarregando] =
    useState(false);

  const [erro, setErro] = useState("");

  const periodo = useMemo(() => {
    if (modo === "mes") {
      return {
        inicio: `${mes}-01`,
        fim: ultimoDiaMes(mes),
      };
    }

    if (modo === "ano") {
      return {
        inicio: `${ano}-01-01`,
        fim: `${ano}-12-31`,
      };
    }

    return {
      inicio,
      fim,
    };
  }, [
    modo,
    mes,
    ano,
    inicio,
    fim,
  ]);

  async function carregarRelatorio() {
    try {
      setCarregando(true);
      setErro("");

      const {
        inicio: inicioPeriodo,
        fim: fimPeriodo,
      } = periodo;

      /*
       * BUSCA TODOS OS EVENTOS DO PERÍODO.
       *
       * Aqui NÃO filtramos por realizado.
       * Portanto o card consegue contar:
       * - eventos agendados
       * - eventos realizados
       */
      const eventosRes = await supabase
        .from("events")
        .select(
          "id,name,event_date,status"
        )
        .gte(
          "event_date",
          inicioPeriodo
        )
        .lte(
          "event_date",
          fimPeriodo
        )
        .order(
          "event_date",
          {
            ascending: true,
          }
        );

      if (eventosRes.error) {
        throw eventosRes.error;
      }

      const todosEventosPeriodo =
        (eventosRes.data || []) as Evento[];

      // Card "Eventos no período"
      setTotalEventosPeriodo(
        todosEventosPeriodo.length
      );

      /*
       * Para os cálculos financeiros,
       * pagamentos dos músicos e desempenho,
       * continuam valendo somente os eventos
       * efetivamente realizados.
       */
      const eventosPeriodo =
        todosEventosPeriodo.filter(
          (evento) =>
            String(evento.status || "")
              .trim()
              .toLowerCase() ===
            "realizado"
        );

      setEventos(eventosPeriodo);

      const eventoIds =
        eventosPeriodo.map(
          (e) => e.id
        );

      const [
        musicosRes,
        musicosEventosRes,
        receitasRes,
        recebimentosRes,
        despesasRes,
        fechamentosRes,
        ensaiosRes,
        presencasRes,
        bonusesRes,
        manuaisRes,
      ] = await Promise.all([
        supabase
          .from("musicians")
          .select(
            "id,name,type,active"
          )
          .eq("active", true)
          .order("name"),

        eventoIds.length
          ? supabase
              .from("event_musicians")
              .select(
                "id,event_id,musician_id,event_cache,payment_status,payment_date"
              )
              .in(
                "event_id",
                eventoIds
              )
          : Promise.resolve({
              data: [],
              error: null,
            }),

        eventoIds.length
          ? supabase
              .from("event_revenues")
              .select(
                "id,event_id"
              )
              .in(
                "event_id",
                eventoIds
              )
          : Promise.resolve({
              data: [],
              error: null,
            }),

        supabase
          .from(
            "event_revenue_receipts"
          )
          .select(
            "id,event_revenue_id,actual_amount,actual_receipt_date,status"
          )
          .eq(
            "status",
            "recebido"
          )
          .gte(
            "actual_receipt_date",
            inicioPeriodo
          )
          .lte(
            "actual_receipt_date",
            fimPeriodo
          ),

        eventoIds.length
          ? supabase
              .from("event_expenses")
              .select(
                "id,event_id,amount,payment_date"
              )
              .in(
                "event_id",
                eventoIds
              )
          : Promise.resolve({
              data: [],
              error: null,
            }),

        supabase
          .from("weekly_closings")
          .select(
            "id,week_start,week_end,rodrigo_amount,marlon_amount,rodrigo_paid,marlon_paid,rodrigo_payment_date,marlon_payment_date"
          )
          .order(
            "week_start",
            {
              ascending: true,
            }
          ),

        supabase
          .from("rehearsals")
          .select(
            "id,rehearsal_date"
          )
          .gte(
            "rehearsal_date",
            inicioPeriodo
          )
          .lte(
            "rehearsal_date",
            fimPeriodo
          ),

        supabase
          .from(
            "rehearsal_attendance"
          )
          .select(
            "id,rehearsal_id,musician_id,present"
          ),

        supabase
          .from(
            "monthly_bonuses"
          )
          .select(
            "id,reference_month,total_amount,paid,payment_date"
          ),

        supabase
          .from("cash_transactions")
          .select(
            "id,amount,direction,transaction_date,description"
          )
          .gte(
            "transaction_date",
            inicioPeriodo
          )
          .lte(
            "transaction_date",
            fimPeriodo
          ),
      ]);

      const respostas = [
        musicosRes,
        musicosEventosRes,
        receitasRes,
        recebimentosRes,
        despesasRes,
        fechamentosRes,
        ensaiosRes,
        presencasRes,
        bonusesRes,
        manuaisRes,
      ];

      for (const resposta of respostas) {
        if (resposta.error) {
          throw resposta.error;
        }
      }

      setMusicos(
        (musicosRes.data || []) as Musico[]
      );

      setMusicosEventos(
        (
          (musicosEventosRes.data ||
            []) as any[]
        ).map((item) => ({
          ...item,
          event_cache: Number(
            item.event_cache || 0
          ),
        }))
      );

      setReceitas(
        (receitasRes.data ||
          []) as Receita[]
      );

      setRecebimentos(
        (
          (recebimentosRes.data ||
            []) as any[]
        ).map((item) => ({
          ...item,
          actual_amount: Number(
            item.actual_amount || 0
          ),
        }))
      );

      setDespesas(
        (
          (despesasRes.data ||
            []) as any[]
        ).map((item) => ({
          ...item,
          amount: Number(
            item.amount || 0
          ),
        }))
      );

      setFechamentos(
        (
          (fechamentosRes.data ||
            []) as any[]
        ).map((item) => ({
          ...item,
          rodrigo_amount: Number(
            item.rodrigo_amount || 0
          ),
          marlon_amount: Number(
            item.marlon_amount || 0
          ),
        }))
      );

      setEnsaios(
        (ensaiosRes.data ||
          []) as Ensaio[]
      );

      setPresencas(
        (presencasRes.data ||
          []) as Presenca[]
      );

      setBonuses(
        (
          (bonusesRes.data ||
            []) as any[]
        ).map((item) => ({
          ...item,
          total_amount: Number(
            item.total_amount || 0
          ),
        }))
      );

      setManuais(
        (
          (manuaisRes.data ||
            []) as any[]
        ).map((item) => ({
          ...item,
          amount: Number(
            item.amount || 0
          ),
        }))
      );
    } catch (e: any) {
      console.error(e);

      setErro(
        e?.message ||
          "Não foi possível carregar o relatório."
      );
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    carregarRelatorio();
  }, [
    periodo.inicio,
    periodo.fim,
  ]);

  const idsEventos = useMemo(
    () =>
      new Set(
        eventos.map(
          (e) => e.id
        )
      ),
    [eventos]
  );

  const receitasDoPeriodo =
    useMemo(
      () =>
        receitas.filter(
          (r) =>
            idsEventos.has(
              r.event_id
            )
        ),
      [
        receitas,
        idsEventos,
      ]
    );

  const receitaIdsDoPeriodo =
    useMemo(
      () =>
        new Set(
          receitasDoPeriodo.map(
            (r) => r.id
          )
        ),
      [receitasDoPeriodo]
    );

  /*
   * DINHEIRO QUE REALMENTE ENTROU
   * NO CAIXA NO PERÍODO.
   */
  const entradasEventos =
    useMemo(
      () =>
        recebimentos
          .filter((r) =>
            receitaIdsDoPeriodo.has(
              r.event_revenue_id
            )
          )
          .reduce(
            (s, r) =>
              s +
              Number(
                r.actual_amount || 0
              ),
            0
          ),
      [
        recebimentos,
        receitaIdsDoPeriodo,
      ]
    );

  const entradasManuais =
    useMemo(
      () =>
        manuais
          .filter(
            (m) =>
              String(
                m.direction
              ).toLowerCase() ===
              "entrada"
          )
          .reduce(
            (s, m) =>
              s +
              Number(
                m.amount || 0
              ),
            0
          ),
      [manuais]
    );

  const totalEntrou =
    entradasEventos +
    entradasManuais;

  /*
   * SAÍDAS REAIS.
   */
  const saidaMusicos =
    useMemo(
      () =>
        musicosEventos
          .filter(
            (m) =>
              m.payment_status ===
                "pago" &&
              !!m.payment_date &&
              m.payment_date >=
                periodo.inicio &&
              m.payment_date <=
                periodo.fim
          )
          .reduce(
            (s, m) =>
              s +
              Number(
                m.event_cache || 0
              ),
            0
          ),
      [
        musicosEventos,
        periodo,
      ]
    );

  const saidaSocios =
    useMemo(() => {
      return fechamentos.reduce(
        (total, f) => {
          const rodrigo =
            f.rodrigo_paid &&
            f.rodrigo_payment_date &&
            f.rodrigo_payment_date >=
              periodo.inicio &&
            f.rodrigo_payment_date <=
              periodo.fim
              ? Number(
                  f.rodrigo_amount ||
                    0
                )
              : 0;

          const marlon =
            f.marlon_paid &&
            f.marlon_payment_date &&
            f.marlon_payment_date >=
              periodo.inicio &&
            f.marlon_payment_date <=
              periodo.fim
              ? Number(
                  f.marlon_amount ||
                    0
                )
              : 0;

          return (
            total +
            rodrigo +
            marlon
          );
        },
        0
      );
    }, [
      fechamentos,
      periodo,
    ]);

  const saidaDespesas =
    useMemo(
      () =>
        despesas
          .filter(
            (d) =>
              !!d.payment_date &&
              d.payment_date >=
                periodo.inicio &&
              d.payment_date <=
                periodo.fim
          )
          .reduce(
            (s, d) =>
              s +
              Number(
                d.amount || 0
              ),
            0
          ),
      [
        despesas,
        periodo,
      ]
    );

  const saidaBonificacoes =
    useMemo(
      () =>
        bonuses
          .filter(
            (b) =>
              b.paid &&
              !!b.payment_date &&
              b.payment_date >=
                periodo.inicio &&
              b.payment_date <=
                periodo.fim
          )
          .reduce(
            (s, b) =>
              s +
              Number(
                b.total_amount ||
                  0
              ),
            0
          ),
      [
        bonuses,
        periodo,
      ]
    );

  const saidasManuais =
    useMemo(
      () =>
        manuais
          .filter(
            (m) =>
              String(
                m.direction
              ).toLowerCase() ===
              "saida"
          )
          .reduce(
            (s, m) =>
              s +
              Number(
                m.amount || 0
              ),
            0
          ),
      [manuais]
    );

  const totalSaiu =
    saidaMusicos +
    saidaSocios +
    saidaDespesas +
    saidaBonificacoes +
    saidasManuais;

  const resumoMusicos =
    useMemo<ResumoMusico[]>(() => {
      const mapa =
        new Map<
          string,
          ResumoMusico
        >();

      for (const musico of musicos) {
        if (!musicoFixo(musico))
          continue;

        mapa.set(musico.id, {
          id: musico.id,
          nome: musico.name,
          cache: 0,
          pago: 0,
          pendente: 0,
          eventos: 0,
          ensaios: 0,
          participacoes: 0,
        });
      }

      for (const item of musicosEventos) {
        const linha =
          mapa.get(
            item.musician_id
          );

        if (!linha) continue;

        linha.cache += Number(
          item.event_cache || 0
        );

        linha.eventos += 1;

        if (
          item.payment_status ===
          "pago"
        ) {
          linha.pago += Number(
            item.event_cache || 0
          );
        } else {
          linha.pendente += Number(
            item.event_cache || 0
          );
        }
      }

      const ensaioIds =
        new Set(
          ensaios.map(
            (e) => e.id
          )
        );

      for (const presenca of presencas) {
        if (!presenca.present)
          continue;

        if (
          !ensaioIds.has(
            presenca.rehearsal_id
          )
        )
          continue;

        const linha =
          mapa.get(
            presenca.musician_id
          );

        if (!linha) continue;

        linha.ensaios += 1;
      }

      for (const linha of mapa.values()) {
        linha.participacoes =
          linha.eventos +
          linha.ensaios;
      }

      return Array.from(
        mapa.values()
      ).sort(
        (a, b) =>
          b.participacoes -
            a.participacoes ||
          a.nome.localeCompare(
            b.nome
          )
      );
    }, [
      musicos,
      musicosEventos,
      ensaios,
      presencas,
    ]);

  const musicosFiltrados =
    useMemo(() => {
      const termo =
        buscaMusico
          .trim()
          .toLowerCase();

      if (!termo)
        return resumoMusicos;

      return resumoMusicos.filter(
        (m) =>
          m.nome
            .toLowerCase()
            .includes(termo)
      );
    }, [
      resumoMusicos,
      buscaMusico,
    ]);

  const socios = useMemo(() => {
    let rodrigo = 0;
    let marlon = 0;

    for (const f of fechamentos) {
      const dentro =
        f.week_end >=
          periodo.inicio &&
        f.week_start <=
          periodo.fim;

      if (!dentro) continue;

      rodrigo += Number(
        f.rodrigo_amount || 0
      );

      marlon += Number(
        f.marlon_amount || 0
      );
    }

    return {
      rodrigo,
      marlon,
    };
  }, [
    fechamentos,
    periodo,
  ]);

  return (
    <main className="min-h-screen bg-slate-100 p-4 md:p-6 text-slate-900">
      <div className="mx-auto max-w-7xl">

        <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">

          <div>
            <div className="text-xs font-bold uppercase text-blue-700">
              ViroMania Gestão
            </div>

            <h1 className="text-3xl font-bold">
              Relatórios
            </h1>

            <p className="text-sm text-slate-500">
              Visão simples do dinheiro,
              músicos, sócios e eventos.
            </p>
          </div>

          <button
            onClick={
              carregarRelatorio
            }
            className="rounded-lg bg-slate-900 px-5 py-3 text-sm font-bold text-white"
          >
            Atualizar
          </button>

        </div>

        <section className="mb-5 rounded-xl border bg-white p-4 shadow-sm">

          <div className="flex flex-col gap-3 md:flex-row md:items-end">

            <div>
              <label className="mb-1 block text-xs font-bold uppercase text-slate-500">
                Período
              </label>

              <select
                value={modo}
                onChange={(e) =>
                  setModo(
                    e.target.value as
                      | "mes"
                      | "ano"
                      | "personalizado"
                  )
                }
                className="rounded-lg border px-3 py-2"
              >
                <option value="mes">
                  Mês
                </option>

                <option value="ano">
                  Ano
                </option>

                <option value="personalizado">
                  Personalizado
                </option>
              </select>
            </div>

            {modo === "mes" && (
              <div>
                <label className="mb-1 block text-xs font-bold uppercase text-slate-500">
                  Mês
                </label>

                <input
                  type="month"
                  value={mes}
                  onChange={(e) =>
                    setMes(
                      e.target.value
                    )
                  }
                  className="rounded-lg border px-3 py-2"
                />
              </div>
            )}

            {modo === "ano" && (
              <div>
                <label className="mb-1 block text-xs font-bold uppercase text-slate-500">
                  Ano
                </label>

                <input
                  type="number"
                  value={ano}
                  onChange={(e) =>
                    setAno(
                      Number(
                        e.target.value
                      )
                    )
                  }
                  className="w-32 rounded-lg border px-3 py-2"
                />
              </div>
            )}

            {modo ===
              "personalizado" && (
              <>
                <div>
                  <label className="mb-1 block text-xs font-bold uppercase text-slate-500">
                    De
                  </label>

                  <input
                    type="date"
                    value={inicio}
                    onChange={(e) =>
                      setInicio(
                        e.target.value
                      )
                    }
                    className="rounded-lg border px-3 py-2"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-bold uppercase text-slate-500">
                    Até
                  </label>

                  <input
                    type="date"
                    value={fim}
                    onChange={(e) =>
                      setFim(
                        e.target.value
                      )
                    }
                    className="rounded-lg border px-3 py-2"
                  />
                </div>
              </>
            )}

            <div className="rounded-lg bg-slate-50 px-4 py-2 text-sm text-slate-600">
              {dataBR(
                periodo.inicio
              )}{" "}
              até{" "}
              {dataBR(
                periodo.fim
              )}
            </div>

          </div>
        </section>

        {erro && (
          <div className="mb-5 rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-700">
            {erro}
          </div>
        )}

        {carregando ? (
          <div className="rounded-xl border bg-white p-8 text-center">
            Carregando relatório...
          </div>
        ) : (
          <>
            {/* CARDS PRINCIPAIS */}

            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">

              {/* ENTRADAS */}

              <div className="rounded-xl border bg-white p-5 shadow-sm">

                <div className="text-xs font-bold uppercase text-slate-500">
                  Dinheiro que entrou
                </div>

                <div className="mt-2 text-2xl font-bold text-green-700">
                  {moeda(
                    totalEntrou
                  )}
                </div>

                <div className="mt-1 text-xs text-slate-500">
                  Recebimentos reais +
                  entradas manuais
                </div>

              </div>

              {/* SAÍDAS */}

              <div className="rounded-xl border bg-white p-5 shadow-sm">

                <div className="text-xs font-bold uppercase text-slate-500">
                  Dinheiro que saiu
                </div>

                <div className="mt-2 text-2xl font-bold text-red-600">
                  {moeda(
                    totalSaiu
                  )}
                </div>

                <div className="mt-1 text-xs text-slate-500">
                  Pagamentos e saídas
                  reais
                </div>

              </div>

              {/* EVENTOS */}

              <div className="rounded-xl border bg-white p-5 shadow-sm">

                <div className="text-xs font-bold uppercase text-slate-500">
                  Eventos no período
                </div>

                <div className="mt-2 text-2xl font-bold">
                  {
                    totalEventosPeriodo
                  }
                </div>

                <div className="mt-1 text-xs text-slate-500">
                  Agendados + realizados
                </div>

              </div>

              {/* SOCIOS */}

              <div className="rounded-xl border bg-white p-5 shadow-sm">

                <div className="text-xs font-bold uppercase text-slate-500">
                  Sócios
                </div>

                <div className="mt-2 text-lg font-bold">
                  Rodrigo:{" "}
                  {moeda(
                    socios.rodrigo
                  )}
                </div>

                <div className="text-lg font-bold">
                  Marlon:{" "}
                  {moeda(
                    socios.marlon
                  )}
                </div>

              </div>

            </section>

            {/* QUANTO CADA MUSICO GANHOU */}

            <section className="mt-5 rounded-xl border bg-white shadow-sm">

              <div className="border-b p-5">

                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">

                  <div>
                    <h2 className="text-xl font-bold">
                      Quanto cada músico ganhou
                    </h2>

                    <p className="text-sm text-slate-500">
                      Somente músicos fixos
                      da banda.
                    </p>
                  </div>

                  <input
                    value={
                      buscaMusico
                    }
                    onChange={(e) =>
                      setBuscaMusico(
                        e.target.value
                      )
                    }
                    placeholder="Pesquisar músico..."
                    className="w-full rounded-lg border px-4 py-2 md:w-64"
                  />

                </div>

              </div>

              <div className="divide-y">

                {musicosFiltrados.length ===
                0 ? (
                  <div className="p-6 text-sm text-slate-500">
                    Nenhum músico fixo
                    encontrado.
                  </div>
                ) : (
                  musicosFiltrados.map(
                    (musico) => (
                      <div
                        key={
                          musico.id
                        }
                        className="grid gap-3 p-4 md:grid-cols-5 md:items-center"
                      >

                        <div className="font-bold">
                          {
                            musico.nome
                          }
                        </div>

                        <div>
                          <div className="text-xs text-slate-500">
                            Cachê no período
                          </div>

                          <div className="font-bold">
                            {moeda(
                              musico.cache
                            )}
                          </div>
                        </div>

                        <div>
                          <div className="text-xs text-slate-500">
                            Já pago
                          </div>

                          <div className="font-bold text-green-700">
                            {moeda(
                              musico.pago
                            )}
                          </div>
                        </div>

                        <div>
                          <div className="text-xs text-slate-500">
                            Pendente
                          </div>

                          <div className="font-bold text-red-600">
                            {moeda(
                              musico.pendente
                            )}
                          </div>
                        </div>

                        <div className="text-sm text-slate-600">
                          {
                            musico.eventos
                          }{" "}
                          evento(s) ·{" "}
                          {
                            musico.ensaios
                          }{" "}
                          ensaio(s)
                        </div>

                      </div>
                    )
                  )
                )}

              </div>

            </section>

            {/* DESEMPENHO */}

            <section className="mt-5 rounded-xl border bg-white shadow-sm">

              <div className="border-b p-5">

                <h2 className="text-xl font-bold">
                  Desempenho dos músicos
                  fixos
                </h2>

                <p className="text-sm text-slate-500">
                  Eventos + ensaios no
                  período. Freelancers não
                  aparecem.
                </p>

              </div>

              <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">

                {musicosFiltrados.map(
                  (musico) => (
                    <div
                      key={`desempenho-${musico.id}`}
                      className="rounded-xl border bg-slate-50 p-4"
                    >

                      <div className="font-bold">
                        {
                          musico.nome
                        }
                      </div>

                      <div className="mt-3 grid grid-cols-3 gap-2 text-center">

                        <div className="rounded-lg bg-white p-3">
                          <div className="text-xs text-slate-500">
                            Eventos
                          </div>

                          <div className="text-xl font-bold">
                            {
                              musico.eventos
                            }
                          </div>
                        </div>

                        <div className="rounded-lg bg-white p-3">
                          <div className="text-xs text-slate-500">
                            Ensaios
                          </div>

                          <div className="text-xl font-bold">
                            {
                              musico.ensaios
                            }
                          </div>
                        </div>

                        <div className="rounded-lg bg-white p-3">
                          <div className="text-xs text-slate-500">
                            Total
                          </div>

                          <div className="text-xl font-bold">
                            {
                              musico.participacoes
                            }
                          </div>
                        </div>

                      </div>

                    </div>
                  )
                )}

              </div>

            </section>
          </>
        )}

      </div>
    </main>
  );
}