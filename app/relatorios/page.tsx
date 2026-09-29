"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type Evento = {
  id: string;
  name: string;
  event_date: string;
  status: string;
};

type Receita = {
  id: string;
  event_id: string;
  description: string;
  expected_amount: number;
  actual_amount: number;
  confirmed: boolean;
  status: string;
};

type MusicoEvento = {
  id: string;
  event_id: string;
  musician_id: string;
  event_cache: number;
  payment_status: string;
  payment_date: string | null;
};

type Musico = {
  id: string;
  name: string;
  type: string;
};

type InstrumentoEvento = {
  event_musician_id: string;
  instrument_id: string;
};

type Instrumento = {
  id: string;
  name: string;
};

type Despesa = {
  id: string;
  event_id: string;
  amount: number;
  description: string;
};

type Fechamento = {
  id: string;
  week_start: string;
  week_end: string;
  total_confirmed: number;
  total_received: number;
  total_to_receive: number;
  total_musicians: number;
  total_other_expenses: number;
  net_result: number;
  rodrigo_amount: number;
  marlon_amount: number;
  group_cash_amount: number;
  rodrigo_paid: boolean;
  marlon_paid: boolean;
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

type Bonificacao = {
  id: string;
  reference_month: string;
  total_amount: number;
  paid: boolean;
  payment_date: string | null;
  notes: string | null;
};

type Premio = {
  id: string;
  bonus_id: string;
  musician_id: string;
  events_count: number;
  rehearsals_count: number;
  total_participations: number;
  individual_amount: number;
};

type LinhaMusico = {
  id: string;
  nome: string;
  eventos: number;
  ensaios: number;
  participacoes: number;
  totalCache: number;
  cachePago: number;
  cachePendente: number;
  instrumentos: string;
  bonusPago: number;
  bonusPendente: number;
  quantidadeBonus: number;
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

function primeiroDiaMes() {
  const hoje = new Date();

  return `${hoje.getFullYear()}-${String(
    hoje.getMonth() + 1
  ).padStart(2, "0")}-01`;
}

function ultimoDiaMes(mes: string) {
  const [ano, numeroMes] = mes.split("-").map(Number);

  const ultimo = new Date(
    ano,
    numeroMes,
    0
  ).getDate();

  return `${ano}-${String(numeroMes).padStart(
    2,
    "0"
  )}-${String(ultimo).padStart(2, "0")}`;
}

function nomeMes(mes: string) {
  if (!mes) return "";

  const [ano, numeroMes] = mes.split("-").map(Number);

  return new Date(
    ano,
    numeroMes - 1,
    1
  ).toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
  });
}

function musicoFixo(musico?: Musico) {
  return (
    String(musico?.type || "")
      .trim()
      .toLowerCase() === "fixo"
  );
}

export default function RelatoriosPage() {
  const [modo, setModo] = useState<
    "mes" | "ano" | "personalizado"
  >("mes");

  const [mes, setMes] = useState(
    primeiroDiaMes().slice(0, 7)
  );

  const [ano, setAno] = useState(
    new Date().getFullYear()
  );

  const [inicioPersonalizado, setInicioPersonalizado] =
    useState(primeiroDiaMes());

  const [fimPersonalizado, setFimPersonalizado] =
    useState(primeiroDiaMes());

  const [eventos, setEventos] = useState<Evento[]>([]);
  const [receitas, setReceitas] = useState<Receita[]>([]);
  const [musicosEventos, setMusicosEventos] =
    useState<MusicoEvento[]>([]);
  const [musicos, setMusicos] = useState<Musico[]>([]);
  const [instrumentosEventos, setInstrumentosEventos] =
    useState<InstrumentoEvento[]>([]);
  const [instrumentos, setInstrumentos] =
    useState<Instrumento[]>([]);
  const [despesas, setDespesas] = useState<Despesa[]>([]);
  const [fechamentos, setFechamentos] =
    useState<Fechamento[]>([]);
  const [ensaios, setEnsaios] = useState<Ensaio[]>([]);
  const [presencas, setPresencas] =
    useState<Presenca[]>([]);
  const [bonificacoes, setBonificacoes] =
    useState<Bonificacao[]>([]);
  const [premios, setPremios] =
    useState<Premio[]>([]);

  const [carregando, setCarregando] =
    useState(true);

  const [mensagem, setMensagem] =
    useState("");

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
      inicio: inicioPersonalizado,
      fim: fimPersonalizado,
    };
  }, [
    modo,
    mes,
    ano,
    inicioPersonalizado,
    fimPersonalizado,
  ]);

  async function carregarDados() {
    try {
      setCarregando(true);
      setMensagem("");

      const [
        eventosRes,
        receitasRes,
        musicosEventosRes,
        musicosRes,
        instrumentosEventosRes,
        instrumentosRes,
        despesasRes,
        fechamentosRes,
        ensaiosRes,
        presencasRes,
        bonificacoesRes,
        premiosRes,
      ] = await Promise.all([
        supabase
          .from("events")
          .select(
            "id,name,event_date,status"
          )
          .gte(
            "event_date",
            periodo.inicio
          )
          .lte(
            "event_date",
            periodo.fim
          )
          .order("event_date", {
            ascending: true,
          }),

        supabase
          .from("event_revenues")
          .select(
            "id,event_id,description,expected_amount,actual_amount,confirmed,status"
          ),

        supabase
          .from("event_musicians")
          .select(
            "id,event_id,musician_id,event_cache,payment_status,payment_date"
          ),

        supabase
          .from("musicians")
          .select(
            "id,name,type"
          )
          .order("name"),

        supabase
          .from("event_musician_instruments")
          .select(
            "event_musician_id,instrument_id"
          ),

        supabase
          .from("instruments")
          .select(
            "id,name"
          ),

        supabase
          .from("event_expenses")
          .select(
            "id,event_id,amount,description"
          ),

        supabase
          .from("weekly_closings")
          .select("*")
          .order("week_start", {
            ascending: true,
          }),

        supabase
          .from("rehearsals")
          .select(
            "id,rehearsal_date"
          )
          .gte(
            "rehearsal_date",
            periodo.inicio
          )
          .lte(
            "rehearsal_date",
            periodo.fim
          ),

        supabase
          .from("rehearsal_attendance")
          .select(
            "id,rehearsal_id,musician_id,present"
          ),

        supabase
          .from("bonuses")
          .select("*"),

        supabase
          .from("bonus_awards")
          .select("*"),
      ]);

      if (eventosRes.error)
        throw eventosRes.error;

      if (receitasRes.error)
        throw receitasRes.error;

      if (musicosEventosRes.error)
        throw musicosEventosRes.error;

      if (musicosRes.error)
        throw musicosRes.error;

      if (instrumentosEventosRes.error)
        throw instrumentosEventosRes.error;

      if (instrumentosRes.error)
        throw instrumentosRes.error;

      if (despesasRes.error)
        throw despesasRes.error;

      if (fechamentosRes.error)
        throw fechamentosRes.error;

      if (ensaiosRes.error)
        throw ensaiosRes.error;

      if (presencasRes.error)
        throw presencasRes.error;

      if (bonificacoesRes.error)
        throw bonificacoesRes.error;

      if (premiosRes.error)
        throw premiosRes.error;

      setEventos(
        (eventosRes.data || []) as Evento[]
      );

      setReceitas(
        (receitasRes.data || []).map(
          (r: any) => ({
            ...r,
            expected_amount: Number(
              r.expected_amount || 0
            ),
            actual_amount: Number(
              r.actual_amount || 0
            ),
          })
        )
      );

      setMusicosEventos(
        (musicosEventosRes.data || []).map(
          (m: any) => ({
            ...m,
            event_cache: Number(
              m.event_cache || 0
            ),
          })
        )
      );

      setMusicos(
        (musicosRes.data || []) as Musico[]
      );

      setInstrumentosEventos(
        (instrumentosEventosRes.data || []) as InstrumentoEvento[]
      );

      setInstrumentos(
        (instrumentosRes.data || []) as Instrumento[]
      );

      setDespesas(
        (despesasRes.data || []).map(
          (d: any) => ({
            ...d,
            amount: Number(
              d.amount || 0
            ),
          })
        )
      );

      setFechamentos(
        (fechamentosRes.data || []).map(
          (f: any) => ({
            ...f,
            total_confirmed: Number(
              f.total_confirmed || 0
            ),
            total_received: Number(
              f.total_received || 0
            ),
            total_to_receive: Number(
              f.total_to_receive || 0
            ),
            total_musicians: Number(
              f.total_musicians || 0
            ),
            total_other_expenses: Number(
              f.total_other_expenses || 0
            ),
            net_result: Number(
              f.net_result || 0
            ),
            rodrigo_amount: Number(
              f.rodrigo_amount || 0
            ),
            marlon_amount: Number(
              f.marlon_amount || 0
            ),
            group_cash_amount: Number(
              f.group_cash_amount || 0
            ),
          })
        )
      );

      setEnsaios(
        (ensaiosRes.data || []) as Ensaio[]
      );

      setPresencas(
        (presencasRes.data || []) as Presenca[]
      );

      setBonificacoes(
        (bonificacoesRes.data || []) as Bonificacao[]
      );

      setPremios(
        (premiosRes.data || []) as Premio[]
      );
    } catch (error: any) {
      console.error(error);

      setMensagem(
        error?.message ||
          "Erro ao carregar relatório."
      );
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    carregarDados();
  }, [
    periodo.inicio,
    periodo.fim,
  ]);

  const eventosRealizados = useMemo(
    () =>
      eventos.filter(
        (evento) =>
          evento.status === "realizado"
      ),
    [eventos]
  );

  const idsEventosRealizados =
    useMemo(
      () =>
        new Set(
          eventosRealizados.map(
            (evento) => evento.id
          )
        ),
      [eventosRealizados]
    );

  /*
   * ================================
   * RECEITAS
   * ================================
   *
   * CONFIRMADO:
   * valor total das receitas dos eventos realizados.
   *
   * RECEBIDO:
   * dinheiro que efetivamente foi marcado como recebido
   * na própria receita.
   *
   * IMPORTANTE:
   * Não usamos event_revenue_receipts aqui.
   * O relatório mensal mostra a situação financeira
   * FINAL dos eventos realizados.
   */

  const receitasDoPeriodo = useMemo(
    () =>
      receitas.filter(
        (r) =>
          idsEventosRealizados.has(
            r.event_id
          ) &&
          r.confirmed &&
          r.status !== "cancelado"
      ),
    [
      receitas,
      idsEventosRealizados,
    ]
  );

  const totalConfirmado = useMemo(
    () =>
      receitasDoPeriodo.reduce(
        (total, r) =>
          total +
          Number(
            r.expected_amount || 0
          ),
        0
      ),
    [receitasDoPeriodo]
  );

  /*
   * Se a receita está recebida:
   *
   * - usa actual_amount quando existe;
   * - se actual_amount estiver zerado,
   *   considera o expected_amount.
   *
   * Isso corrige receitas que foram marcadas
   * como recebidas na tela de eventos, mas ficaram
   * com actual_amount antigo/zerado.
   */
  function valorRecebidoReceita(
    receita: Receita
  ) {
    if (
      receita.status !== "recebido"
    ) {
      return 0;
    }

    const atual = Number(
      receita.actual_amount || 0
    );

    if (atual > 0) {
      return atual;
    }

    return Number(
      receita.expected_amount || 0
    );
  }

  const totalRecebido = useMemo(
    () =>
      receitasDoPeriodo.reduce(
        (total, receita) =>
          total +
          valorRecebidoReceita(
            receita
          ),
        0
      ),
    [receitasDoPeriodo]
  );

  const totalAReceber = useMemo(
    () =>
      Math.max(
        totalConfirmado -
          totalRecebido,
        0
      ),
    [
      totalConfirmado,
      totalRecebido,
    ]
  );

  /*
   * ================================
   * MÚSICOS
   * ================================
   */

  const musicosDoPeriodo =
    useMemo(
      () =>
        musicosEventos.filter(
          (item) =>
            idsEventosRealizados.has(
              item.event_id
            )
        ),
      [
        musicosEventos,
        idsEventosRealizados,
      ]
    );

  const totalCaches = useMemo(
    () =>
      musicosDoPeriodo.reduce(
        (total, item) =>
          total +
          Number(
            item.event_cache || 0
          ),
        0
      ),
    [musicosDoPeriodo]
  );

  const totalCachesPagos =
    useMemo(
      () =>
        musicosDoPeriodo
          .filter(
            (item) =>
              item.payment_status ===
              "pago"
          )
          .reduce(
            (total, item) =>
              total +
              Number(
                item.event_cache || 0
              ),
            0
          ),
      [musicosDoPeriodo]
    );

  const totalCachesPendentes =
    Math.max(
      totalCaches -
        totalCachesPagos,
      0
    );

  /*
   * ================================
   * DESPESAS
   * ================================
   */

  const despesasDoPeriodo =
    useMemo(
      () =>
        despesas.filter(
          (d) =>
            idsEventosRealizados.has(
              d.event_id
            )
        ),
      [
        despesas,
        idsEventosRealizados,
      ]
    );

  const totalDespesas =
    despesasDoPeriodo.reduce(
      (total, despesa) =>
        total +
        Number(
          despesa.amount || 0
        ),
      0
    );

  /*
   * ================================
   * RESULTADO
   * ================================
   */

  const resultadoLiquido =
    totalConfirmado -
    totalCaches -
    totalDespesas;

  /*
   * A distribuição mostrada no relatório
   * vem do resultado do período.
   *
   * Não somamos o Caixa como uma nova
   * entrada financeira.
   */

  const rodrigo =
    resultadoLiquido / 4;

  const marlon =
    resultadoLiquido / 4;

  const caixaGrupo =
    resultadoLiquido / 2;

  /*
   * ================================
   * RESUMO POR RECEITA
   * ================================
   */

  const resumoReceitas =
    useMemo(() => {
      const mapa = new Map<
        string,
        {
          confirmado: number;
          recebido: number;
        }
      >();

      for (const receita of receitasDoPeriodo) {
        const chave =
          receita.description ||
          "Receita";

        if (!mapa.has(chave)) {
          mapa.set(chave, {
            confirmado: 0,
            recebido: 0,
          });
        }

        const linha =
          mapa.get(chave)!;

        linha.confirmado +=
          Number(
            receita.expected_amount ||
              0
          );

        linha.recebido +=
          valorRecebidoReceita(
            receita
          );
      }

      return mapa;
    }, [receitasDoPeriodo]);

  /*
   * ================================
   * LINHAS DOS MÚSICOS
   * ================================
   */

  const linhasMusicos =
    useMemo<LinhaMusico[]>(() => {
      const mapa = new Map<
        string,
        LinhaMusico
      >();

      for (const participacao of musicosDoPeriodo) {
        const musico =
          musicos.find(
            (m) =>
              m.id ===
              participacao.musician_id
          );

        if (!musico) continue;

        if (!mapa.has(musico.id)) {
          mapa.set(musico.id, {
            id: musico.id,
            nome: musico.name,
            eventos: 0,
            ensaios: 0,
            participacoes: 0,
            totalCache: 0,
            cachePago: 0,
            cachePendente: 0,
            instrumentos: "",
            bonusPago: 0,
            bonusPendente: 0,
            quantidadeBonus: 0,
          });
        }

        const linha =
          mapa.get(musico.id)!;

        linha.eventos += 1;

        linha.participacoes += 1;

        linha.totalCache +=
          Number(
            participacao.event_cache ||
              0
          );

        if (
          participacao.payment_status ===
          "pago"
        ) {
          linha.cachePago +=
            Number(
              participacao.event_cache ||
                0
            );
        } else {
          linha.cachePendente +=
            Number(
              participacao.event_cache ||
                0
            );
        }
      }

      /*
       * Ensaios
       */

      const ensaiosDoPeriodo =
        ensaios.filter(
          (ensaio) =>
            ensaio.rehearsal_date >=
              periodo.inicio &&
            ensaio.rehearsal_date <=
              periodo.fim
        );

      for (const presenca of presencas) {
        if (!presenca.present)
          continue;

        const ensaioExiste =
          ensaiosDoPeriodo.some(
            (ensaio) =>
              ensaio.id ===
              presenca.rehearsal_id
          );

        if (!ensaioExiste)
          continue;

        const linha =
          mapa.get(
            presenca.musician_id
          );

        if (!linha) continue;

        linha.ensaios += 1;
        linha.participacoes += 1;
      }

      /*
       * Instrumentos
       */

      for (const linha of mapa.values()) {
        const participacoesMusico =
          musicosDoPeriodo.filter(
            (p) =>
              p.musician_id ===
              linha.id
          );

        const nomes = new Set<string>();

        for (const p of participacoesMusico) {
          const instrumentosDoEvento =
            instrumentosEventos.filter(
              (item) =>
                item.event_musician_id ===
                p.id
            );

          for (
            const item of instrumentosDoEvento
          ) {
            const instrumento =
              instrumentos.find(
                (i) =>
                  i.id ===
                  item.instrument_id
              );

            if (instrumento) {
              nomes.add(
                instrumento.name
              );
            }
          }
        }

        linha.instrumentos =
          Array.from(nomes).join(
            ", "
          );
      }

      /*
       * Bônus
       */

      for (const premio of premios) {
        const linha =
          mapa.get(
            premio.musician_id
          );

        if (!linha) continue;

        linha.quantidadeBonus += 1;

        if (premio.individual_amount > 0) {
          linha.bonusPago +=
            Number(
              premio.individual_amount ||
                0
            );
        }
      }

      return Array.from(
        mapa.values()
      ).sort(
        (a, b) =>
          b.participacoes -
          a.participacoes
      );
    }, [
      musicosDoPeriodo,
      musicos,
      ensaios,
      presencas,
      periodo.inicio,
      periodo.fim,
      instrumentosEventos,
      instrumentos,
      premios,
    ]);

  const maiorParticipacao =
    linhasMusicos.length
      ? Math.max(
          ...linhasMusicos.map(
            (m) =>
              m.participacoes
          )
        )
      : 0;

  /*
   * ================================
   * FECHAMENTOS DO PERÍODO
   * ================================
   */

  const fechamentosDoPeriodo =
    useMemo(
      () =>
        fechamentos.filter(
          (f) =>
            f.week_end >=
              periodo.inicio &&
            f.week_start <=
              periodo.fim
        ),
      [
        fechamentos,
        periodo.inicio,
        periodo.fim,
      ]
    );

  /*
   * ================================
   * BONIFICAÇÕES
   * ================================
   */

  const bonificacoesDoPeriodo =
    useMemo(
      () =>
        bonificacoes.filter(
          (b) => {
            if (!b.reference_month)
              return false;

            return (
              b.reference_month >=
                periodo.inicio.slice(
                  0,
                  7
                ) &&
              b.reference_month <=
                periodo.fim.slice(
                  0,
                  7
                )
            );
          }
        ),
      [
        bonificacoes,
        periodo.inicio,
        periodo.fim,
      ]
    );

  const totalBonificacoes =
    premios.reduce(
      (total, premio) =>
        total +
        Number(
          premio.individual_amount ||
            0
        ),
      0
    );

  return (
    <main className="min-h-screen bg-slate-100 p-4 text-slate-800 sm:p-6">
      <div className="mx-auto max-w-7xl">

        {/* CABEÇALHO */}

        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">

          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
              VIROMANIA GESTÃO
            </p>

            <h1 className="mt-1 text-3xl font-extrabold">
              Relatórios
            </h1>

            <p className="mt-1 text-sm text-slate-500">
              Visão financeira, frequência,
              pagamentos e bonificações.
            </p>
          </div>

          <div className="flex gap-2">

            <button
              onClick={
                carregarDados
              }
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-bold text-white"
            >
              Atualizar
            </button>

            <a
              href="/"
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-bold"
            >
              Voltar ao início
            </a>

          </div>

        </div>

        {/* FILTRO */}

        <section className="mb-5 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">

          <div className="flex flex-wrap items-end gap-3">

            <div>
              <label className="mb-1 block text-xs font-bold">
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
                <label className="mb-1 block text-xs font-bold">
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
                <label className="mb-1 block text-xs font-bold">
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
                  className="rounded-lg border px-3 py-2"
                />
              </div>
            )}

            {modo ===
              "personalizado" && (
              <>
                <div>
                  <label className="mb-1 block text-xs font-bold">
                    Início
                  </label>

                  <input
                    type="date"
                    value={
                      inicioPersonalizado
                    }
                    onChange={(e) =>
                      setInicioPersonalizado(
                        e.target.value
                      )
                    }
                    className="rounded-lg border px-3 py-2"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-bold">
                    Fim
                  </label>

                  <input
                    type="date"
                    value={
                      fimPersonalizado
                    }
                    onChange={(e) =>
                      setFimPersonalizado(
                        e.target.value
                      )
                    }
                    className="rounded-lg border px-3 py-2"
                  />
                </div>
              </>
            )}

            <p className="pb-2 text-xs text-slate-500">
              {dataBR(periodo.inicio)} até{" "}
              {dataBR(periodo.fim)}
            </p>

          </div>

        </section>

        {mensagem && (
          <div className="mb-5 rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
            {mensagem}
          </div>
        )}

        {carregando ? (
          <div className="rounded-xl bg-white p-10 text-center shadow-sm">
            Carregando relatório...
          </div>
        ) : (
          <>
            {/* RESUMO */}

            <section className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">

              <div className="rounded-xl border bg-white p-4">
                <p className="text-xs text-slate-500">
                  Receitas confirmadas
                </p>

                <p className="mt-1 text-xl font-extrabold">
                  {moeda(
                    totalConfirmado
                  )}
                </p>
              </div>

              <div className="rounded-xl border bg-white p-4">
                <p className="text-xs text-slate-500">
                  Recebido
                </p>

                <p className="mt-1 text-xl font-extrabold">
                  {moeda(
                    totalRecebido
                  )}
                </p>
              </div>

              <div className="rounded-xl border bg-white p-4">
                <p className="text-xs text-slate-500">
                  A receber
                </p>

                <p className="mt-1 text-xl font-extrabold">
                  {moeda(
                    totalAReceber
                  )}
                </p>
              </div>

              <div className="rounded-xl border bg-white p-4">
                <p className="text-xs text-slate-500">
                  Cachês
                </p>

                <p className="mt-1 text-xl font-extrabold">
                  {moeda(
                    totalCaches
                  )}
                </p>
              </div>

              <div className="rounded-xl bg-slate-900 p-4 text-white">
                <p className="text-xs text-slate-300">
                  Resultado líquido
                </p>

                <p className="mt-1 text-xl font-extrabold">
                  {moeda(
                    resultadoLiquido
                  )}
                </p>
              </div>

            </section>

            {/* SEGUNDO RESUMO */}

            <section className="mb-5 grid gap-3 md:grid-cols-3">

              <div className="rounded-xl border bg-white p-4">
                <p className="text-xs text-slate-500">
                  Cachês pagos
                </p>

                <p className="mt-1 text-xl font-bold text-emerald-700">
                  {moeda(
                    totalCachesPagos
                  )}
                </p>
              </div>

              <div className="rounded-xl border bg-white p-4">
                <p className="text-xs text-slate-500">
                  Cachês pendentes
                </p>

                <p className="mt-1 text-xl font-bold text-orange-600">
                  {moeda(
                    totalCachesPendentes
                  )}
                </p>
              </div>

              <div className="rounded-xl border bg-white p-4">
                <p className="text-xs text-slate-500">
                  Despesas dos eventos
                </p>

                <p className="mt-1 text-xl font-bold">
                  {moeda(
                    totalDespesas
                  )}
                </p>
              </div>

            </section>

            {/* RECEITAS + DISTRIBUIÇÃO */}

            <section className="mb-5 grid gap-5 lg:grid-cols-2">

              <div className="overflow-hidden rounded-xl border bg-white">

                <div className="border-b p-4">
                  <h2 className="font-bold">
                    Receitas
                  </h2>

                  <p className="text-xs text-slate-500">
                    Receitas confirmadas dos eventos realizados.
                  </p>
                </div>

                <div className="overflow-x-auto">

                  <table className="min-w-full text-sm">

                    <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                      <tr>
                        <th className="px-4 py-3">
                          Receita
                        </th>

                        <th className="px-4 py-3">
                          Confirmado
                        </th>

                        <th className="px-4 py-3">
                          Recebido
                        </th>

                        <th className="px-4 py-3">
                          Pendente
                        </th>
                      </tr>
                    </thead>

                    <tbody className="divide-y">

                      {Array.from(
                        resumoReceitas.entries()
                      ).map(
                        ([
                          nome,
                          valores,
                        ]) => (
                          <tr key={nome}>
                            <td className="px-4 py-3 font-semibold">
                              {nome}
                            </td>

                            <td className="px-4 py-3">
                              {moeda(
                                valores.confirmado
                              )}
                            </td>

                            <td className="px-4 py-3 font-semibold text-emerald-600">
                              {moeda(
                                valores.recebido
                              )}
                            </td>

                            <td className="px-4 py-3 font-semibold text-orange-600">
                              {moeda(
                                Math.max(
                                  valores.confirmado -
                                    valores.recebido,
                                  0
                                )
                              )}
                            </td>
                          </tr>
                        )
                      )}

                    </tbody>

                  </table>

                </div>

              </div>

              <div className="rounded-xl border bg-white p-4">

                <h2 className="font-bold">
                  Distribuição semanal
                </h2>

                <p className="mt-1 text-xs text-slate-500">
                  Valores calculados sobre o resultado do período.
                </p>

                <div className="mt-4 grid gap-3 md:grid-cols-3">

                  <div className="rounded-lg border p-4">
                    <p className="text-xs text-slate-500">
                      Rodrigo — 1/4
                    </p>

                    <p className="mt-1 text-lg font-bold">
                      {moeda(rodrigo)}
                    </p>
                  </div>

                  <div className="rounded-lg border p-4">
                    <p className="text-xs text-slate-500">
                      Marlon — 1/4
                    </p>

                    <p className="mt-1 text-lg font-bold">
                      {moeda(marlon)}
                    </p>
                  </div>

                  <div className="rounded-lg border p-4">
                    <p className="text-xs text-slate-500">
                      Caixa — 2/4
                    </p>

                    <p className="mt-1 text-lg font-bold">
                      {moeda(caixaGrupo)}
                    </p>
                  </div>

                </div>

                <div className="mt-4 rounded-lg bg-slate-50 p-3 text-sm font-semibold">
                  Total distribuído:{" "}
                  {moeda(
                    resultadoLiquido
                  )}
                </div>

              </div>

            </section>

            {/* DESEMPENHO DOS MÚSICOS */}

            <section className="mb-5 overflow-hidden rounded-xl border bg-white">

              <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">

                <div>
                  <h2 className="font-bold">
                    Desempenho dos músicos
                  </h2>

                  <p className="text-xs text-slate-500">
                    Eventos, ensaios, cachês, pagamentos e bonificações.
                  </p>
                </div>

                <span className="rounded-lg bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700">
                  Maior frequência:{" "}
                  {maiorParticipacao}{" "}
                  participações
                </span>

              </div>

              <div className="overflow-x-auto">

                <table className="min-w-full text-sm">

                  <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">

                    <tr>
                      <th className="px-4 py-3">
                        Músico
                      </th>

                      <th className="px-4 py-3">
                        Eventos
                      </th>

                      <th className="px-4 py-3">
                        Ensaios
                      </th>

                      <th className="px-4 py-3">
                        Total
                      </th>

                      <th className="px-4 py-3">
                        Cachês
                      </th>

                      <th className="px-4 py-3">
                        Pago
                      </th>

                      <th className="px-4 py-3">
                        Pendente
                      </th>

                      <th className="px-4 py-3">
                        Bônus
                      </th>

                      <th className="px-4 py-3">
                        Nº bônus
                      </th>
                    </tr>

                  </thead>

                  <tbody className="divide-y">

                    {linhasMusicos.map(
                      (linha) => (
                        <tr key={linha.id}>

                          <td className="px-4 py-3 font-semibold">
                            {linha.nome}
                          </td>

                          <td className="px-4 py-3">
                            {linha.eventos}
                          </td>

                          <td className="px-4 py-3">
                            {linha.ensaios}
                          </td>

                          <td className="px-4 py-3">
                            <span className="rounded-full bg-slate-100 px-2 py-1 font-bold">
                              {
                                linha.participacoes
                              }
                            </span>
                          </td>

                          <td className="px-4 py-3">
                            {moeda(
                              linha.totalCache
                            )}
                          </td>

                          <td className="px-4 py-3 font-semibold text-emerald-600">
                            {moeda(
                              linha.cachePago
                            )}
                          </td>

                          <td className="px-4 py-3 font-semibold text-orange-600">
                            {moeda(
                              linha.cachePendente
                            )}
                          </td>

                          <td className="px-4 py-3">
                            {linha.bonusPago >
                            0
                              ? moeda(
                                  linha.bonusPago
                                )
                              : "-"}
                          </td>

                          <td className="px-4 py-3">
                            {
                              linha.quantidadeBonus
                            }
                          </td>

                        </tr>
                      )
                    )}

                  </tbody>

                </table>

              </div>

            </section>

            {/* RESUMO INDIVIDUAL */}

            <section className="mb-5">

              <div className="mb-3">
                <h2 className="font-bold">
                  Resumo individual
                </h2>

                <p className="text-xs text-slate-500">
                  Informações detalhadas de frequência e instrumentos.
                </p>
              </div>

              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">

                {linhasMusicos.map(
                  (linha) => (
                    <div
                      key={linha.id}
                      className="rounded-xl border bg-white p-4"
                    >

                      <h3 className="font-bold">
                        {linha.nome}
                      </h3>

                      <div className="mt-3 grid grid-cols-2 gap-2">

                        <div className="rounded-lg bg-slate-50 p-3">
                          <p className="text-[10px] text-slate-500">
                            Eventos
                          </p>

                          <p className="font-bold">
                            {linha.eventos}
                          </p>
                        </div>

                        <div className="rounded-lg bg-slate-50 p-3">
                          <p className="text-[10px] text-slate-500">
                            Ensaios
                          </p>

                          <p className="font-bold">
                            {linha.ensaios}
                          </p>
                        </div>

                        <div className="rounded-lg bg-slate-50 p-3">
                          <p className="text-[10px] text-slate-500">
                            Participações
                          </p>

                          <p className="font-bold">
                            {
                              linha.participacoes
                            }
                          </p>
                        </div>

                        <div className="rounded-lg bg-slate-50 p-3">
                          <p className="text-[10px] text-slate-500">
                            Bônus
                          </p>

                          <p className="font-bold">
                            {linha.quantidadeBonus}
                          </p>
                        </div>

                      </div>

                      <div className="mt-3 space-y-1 text-xs">

                        <div className="flex justify-between">
                          <span>
                            Total de cachês
                          </span>

                          <strong>
                            {moeda(
                              linha.totalCache
                            )}
                          </strong>
                        </div>

                        <div className="flex justify-between">
                          <span>
                            Cachês pagos
                          </span>

                          <strong className="text-emerald-600">
                            {moeda(
                              linha.cachePago
                            )}
                          </strong>
                        </div>

                        <div className="flex justify-between">
                          <span>
                            Cachês pendentes
                          </span>

                          <strong className="text-orange-600">
                            {moeda(
                              linha.cachePendente
                            )}
                          </strong>
                        </div>

                        <div className="flex justify-between">
                          <span>
                            Bônus recebidos
                          </span>

                          <strong className="text-emerald-600">
                            {moeda(
                              linha.bonusPago
                            )}
                          </strong>
                        </div>

                      </div>

                      <div className="mt-3 rounded-lg bg-slate-50 p-3 text-xs">

                        <p className="font-semibold">
                          Instrumentos:
                        </p>

                        <p className="mt-1 text-slate-600">
                          {linha.instrumentos ||
                            "-"}
                        </p>

                      </div>

                    </div>
                  )
                )}

              </div>

            </section>

            {/* FECHAMENTOS */}

            <section className="mb-5 rounded-xl border bg-white p-4">

              <h2 className="font-bold">
                Fechamentos do período
              </h2>

              <div className="mt-3 overflow-x-auto">

                <table className="min-w-full text-sm">

                  <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                    <tr>
                      <th className="px-4 py-3">
                        Semana
                      </th>

                      <th className="px-4 py-3">
                        Resultado
                      </th>

                      <th className="px-4 py-3">
                        Rodrigo
                      </th>

                      <th className="px-4 py-3">
                        Marlon
                      </th>

                      <th className="px-4 py-3">
                        Caixa
                      </th>
                    </tr>
                  </thead>

                  <tbody className="divide-y">

                    {fechamentosDoPeriodo.map(
                      (f) => (
                        <tr
                          key={f.id}
                        >

                          <td className="px-4 py-3">
                            {dataBR(
                              f.week_start
                            )}{" "}
                            até{" "}
                            {dataBR(
                              f.week_end
                            )}
                          </td>

                          <td className="px-4 py-3 font-bold">
                            {moeda(
                              f.net_result
                            )}
                          </td>

                          <td className="px-4 py-3">
                            {moeda(
                              f.rodrigo_amount
                            )}
                          </td>

                          <td className="px-4 py-3">
                            {moeda(
                              f.marlon_amount
                            )}
                          </td>

                          <td className="px-4 py-3">
                            {moeda(
                              f.group_cash_amount
                            )}
                          </td>

                        </tr>
                      )
                    )}

                  </tbody>

                </table>

              </div>

            </section>

            {/* RODAPÉ FINANCEIRO */}

            <section className="rounded-xl border border-slate-200 bg-white p-5">

              <div className="grid gap-4 md:grid-cols-4">

                <div>
                  <p className="text-xs text-slate-500">
                    Eventos realizados
                  </p>

                  <p className="text-2xl font-bold">
                    {
                      eventosRealizados.length
                    }
                  </p>
                </div>

                <div>
                  <p className="text-xs text-slate-500">
                    Receita confirmada
                  </p>

                  <p className="text-2xl font-bold">
                    {moeda(
                      totalConfirmado
                    )}
                  </p>
                </div>

                <div>
                  <p className="text-xs text-slate-500">
                    Resultado líquido
                  </p>

                  <p className="text-2xl font-bold">
                    {moeda(
                      resultadoLiquido
                    )}
                  </p>
                </div>

                <div>
                  <p className="text-xs text-slate-500">
                    Bonificações
                  </p>

                  <p className="text-2xl font-bold">
                    {moeda(
                      totalBonificacoes
                    )}
                  </p>
                </div>

              </div>

              <p className="mt-5 border-t pt-4 text-xs text-slate-500">
                O resultado acima não inclui bonificação mensal.
                A bonificação é uma despesa separada do caixa do grupo
                no final do mês.
              </p>

            </section>
          </>
        )}

      </div>
    </main>
  );
}