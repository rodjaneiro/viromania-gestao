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
  status: "pendente" | "recebido" | "cancelado";
};

type MusicoEvento = {
  id: string;
  event_id: string;
  musician_id: string;
  event_cache: number | null;
  payment_status: "pendente" | "pago";
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

type PresencaEnsaio = {
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

type PremioBonificacao = {
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
  datas: number;
  totalCache: number;
  cachePago: number;
  cachePendente: number;
  media: number;
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

function primeiroDiaDoMes() {
  const agora = new Date();

  return `${agora.getFullYear()}-${String(
    agora.getMonth() + 1
  ).padStart(2, "0")}-01`;
}

function ultimoDiaDoMes(mes: string) {
  const [ano, numeroMes] = mes.split("-").map(Number);

  const ultimo = new Date(ano, numeroMes, 0).getDate();

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

function mesAnterior(mes: string) {
  const [ano, numeroMes] = mes.split("-").map(Number);

  const data = new Date(
    ano,
    numeroMes - 2,
    1
  );

  return `${data.getFullYear()}-${String(
    data.getMonth() + 1
  ).padStart(2, "0")}`;
}

export default function RelatoriosPage() {
  const [modo, setModo] = useState<
    "mes" | "ano" | "personalizado"
  >("mes");

  const [mes, setMes] = useState(
    primeiroDiaDoMes().slice(0, 7)
  );

  const [ano, setAno] = useState(
    String(new Date().getFullYear())
  );

  const [inicio, setInicio] = useState(
    primeiroDiaDoMes()
  );

  const [fim, setFim] = useState(
    ultimoDiaDoMes(
      primeiroDiaDoMes().slice(0, 7)
    )
  );

  const [eventos, setEventos] = useState<Evento[]>(
    []
  );

  const [receitas, setReceitas] = useState<
    Receita[]
  >([]);

  const [musicosEvento, setMusicosEvento] =
    useState<MusicoEvento[]>([]);

  const [musicos, setMusicos] = useState<Musico[]>(
    []
  );

  const [instrumentosEvento, setInstrumentosEvento] =
    useState<InstrumentoEvento[]>([]);

  const [instrumentos, setInstrumentos] = useState<
    Instrumento[]
  >([]);

  const [despesas, setDespesas] = useState<
    Despesa[]
  >([]);

  const [fechamentos, setFechamentos] = useState<
    Fechamento[]
  >([]);

  const [ensaios, setEnsaios] = useState<Ensaio[]>(
    []
  );

  const [presencasEnsaio, setPresencasEnsaio] =
    useState<PresencaEnsaio[]>([]);

  const [bonificacoes, setBonificacoes] =
    useState<Bonificacao[]>([]);

  const [premiosBonificacao, setPremiosBonificacao] =
    useState<PremioBonificacao[]>([]);

  const [carregando, setCarregando] =
    useState(true);

  const [mensagem, setMensagem] = useState("");

  const periodo = useMemo(() => {
    if (modo === "mes") {
      return {
        inicio: `${mes}-01`,
        fim: ultimoDiaDoMes(mes),
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
  }, [modo, mes, ano, inicio, fim]);

  async function carregarDados() {
    try {
      setCarregando(true);
      setMensagem("");

      const [
        eventosRes,
        receitasRes,
        musicosEventoRes,
        musicosRes,
        instrumentosEventoRes,
        instrumentosRes,
        despesasRes,
        fechamentosRes,
        ensaiosRes,
        bonificacoesRes,
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
          .select("id,name,type")
          .order("name"),

        supabase
          .from("event_musician_instruments")
          .select(
            "event_musician_id,instrument_id"
          ),

        supabase
          .from("instruments")
          .select("id,name"),

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
          )
          .order("rehearsal_date"),

        supabase
          .from("monthly_bonuses")
          .select("*")
          .gte(
            "reference_month",
            periodo.inicio
          )
          .lte(
            "reference_month",
            periodo.fim
          )
          .order("reference_month"),
      ]);

      const erros = [
        eventosRes,
        receitasRes,
        musicosEventoRes,
        musicosRes,
        instrumentosEventoRes,
        instrumentosRes,
        despesasRes,
        fechamentosRes,
        ensaiosRes,
        bonificacoesRes,
      ].filter((res) => res.error);

      if (erros.length > 0) {
        console.error(erros);

        setMensagem(
          erros[0].error?.message ||
            "Erro ao carregar relatório."
        );
      }

      const eventosData =
        eventosRes.data || [];

      const ensaiosData =
        ensaiosRes.data || [];

      const bonificacoesData =
        bonificacoesRes.data || [];

      setEventos(eventosData as Evento[]);

      setReceitas(
        (receitasRes.data || []).map(
          (item: any) => ({
            ...item,
            expected_amount: Number(
              item.expected_amount || 0
            ),
            actual_amount: Number(
              item.actual_amount || 0
            ),
          })
        )
      );

      setMusicosEvento(
        (musicosEventoRes.data || []).map(
          (item: any) => ({
            ...item,
            event_cache: Number(
              item.event_cache || 0
            ),
            payment_status:
              item.payment_status ||
              "pendente",
          })
        )
      );

      setMusicos(
        (musicosRes.data || []) as Musico[]
      );

      setInstrumentosEvento(
        (instrumentosEventoRes.data ||
          []) as InstrumentoEvento[]
      );

      setInstrumentos(
        (instrumentosRes.data ||
          []) as Instrumento[]
      );

      setDespesas(
        (despesasRes.data || []).map(
          (item: any) => ({
            ...item,
            amount: Number(
              item.amount || 0
            ),
          })
        )
      );

      const fechamentosDoPeriodo =
  (fechamentosRes.data || []).filter(
    (fechamento: any) =>
      fechamento.week_start <= periodo.fim &&
      fechamento.week_end >= periodo.inicio
  );

setFechamentos(
  fechamentosDoPeriodo as Fechamento[]
);;

      setEnsaios(
        ensaiosData as Ensaio[]
      );

      setBonificacoes(
        bonificacoesData.map(
          (item: any) => ({
            ...item,
            total_amount: Number(
              item.total_amount || 0
            ),
          })
        )
      );

      /*
       * PRESENÇAS DOS ENSAIOS
       */

      const ensaioIds =
        ensaiosData.map(
          (item: any) => item.id
        );

      if (ensaioIds.length > 0) {
        const {
          data,
          error,
        } = await supabase
          .from("rehearsal_attendance")
          .select(
            "id,rehearsal_id,musician_id,present"
          )
          .in(
            "rehearsal_id",
            ensaioIds
          )
          .eq("present", true);

        if (error) {
          throw error;
        }

        setPresencasEnsaio(
          (data || []) as PresencaEnsaio[]
        );
      } else {
        setPresencasEnsaio([]);
      }

      /*
       * PREMIAÇÕES
       */

      const bonusIds =
        bonificacoesData.map(
          (item: any) => item.id
        );

      if (bonusIds.length > 0) {
        const {
          data,
          error,
        } = await supabase
          .from("monthly_bonus_awards")
          .select("*")
          .in(
            "bonus_id",
            bonusIds
          );

        if (error) {
          throw error;
        }

        setPremiosBonificacao(
          (data || []).map(
            (item: any) => ({
              ...item,
              individual_amount:
                Number(
                  item.individual_amount ||
                    0
                ),
            })
          )
        );
      } else {
        setPremiosBonificacao([]);
      }
    } catch (error: any) {
      console.error(error);

      setMensagem(
        error.message ||
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

  useEffect(() => {
    if (modo === "mes") {
      setInicio(`${mes}-01`);
      setFim(ultimoDiaDoMes(mes));
    }
  }, [mes, modo]);

  /*
   * EVENTOS
   */

  const eventosRealizados = useMemo(
    () =>
      eventos.filter(
        (evento) =>
          evento.status === "realizado"
      ),
    [eventos]
  );

  const eventosRealizadosIds =
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
   * RECEITAS
   */

  const receitasDoPeriodo =
    useMemo(
      () =>
        receitas.filter(
          (receita) =>
            eventosRealizadosIds.has(
              receita.event_id
            )
        ),
      [
        receitas,
        eventosRealizadosIds,
      ]
    );

  const totalConfirmado =
    useMemo(
      () =>
        receitasDoPeriodo
          .filter(
            (r) =>
              r.confirmed &&
              r.status !== "cancelado"
          )
          .reduce(
            (total, r) =>
              total +
              Number(
                r.expected_amount || 0
              ),
            0
          ),
      [receitasDoPeriodo]
    );

  const totalRecebido =
    useMemo(
      () =>
        receitasDoPeriodo
          .filter(
            (r) =>
              r.confirmed &&
              r.status === "recebido"
          )
          .reduce(
            (total, r) =>
              total +
              Number(
                r.actual_amount ||
                  r.expected_amount ||
                  0
              ),
            0
          ),
      [receitasDoPeriodo]
    );

  const totalAReceber = Math.max(
    totalConfirmado -
      totalRecebido,
    0
  );

  /*
   * MÚSICOS
   */

  const musicosDoPeriodo =
    useMemo(
      () =>
        musicosEvento.filter(
          (item) =>
            eventosRealizadosIds.has(
              item.event_id
            )
        ),
      [
        musicosEvento,
        eventosRealizadosIds,
      ]
    );

  const totalMusicos =
    useMemo(
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

  const totalMusicosPagos =
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

  const totalMusicosPendentes =
    Math.max(
      totalMusicos -
        totalMusicosPagos,
      0
    );

  /*
   * DESPESAS
   */

  const despesasDoPeriodo =
    useMemo(
      () =>
        despesas.filter(
          (item) =>
            eventosRealizadosIds.has(
              item.event_id
            )
        ),
      [
        despesas,
        eventosRealizadosIds,
      ]
    );

  const totalDespesas =
    useMemo(
      () =>
        despesasDoPeriodo.reduce(
          (total, item) =>
            total +
            Number(
              item.amount || 0
            ),
          0
        ),
      [despesasDoPeriodo]
    );

  /*
   * RESULTADO
   */

  const resultadoLiquido =
    totalConfirmado -
    totalMusicos -
    totalDespesas;

  /*
   * DISTRIBUIÇÃO
   */

  const distribuicao =
    useMemo(() => {
      const rodrigo =
        fechamentos.reduce(
          (total, fechamento) =>
            total +
            Number(
              fechamento.rodrigo_amount ||
                0
            ),
          0
        );

      const marlon =
        fechamentos.reduce(
          (total, fechamento) =>
            total +
            Number(
              fechamento.marlon_amount ||
                0
            ),
          0
        );

      const grupo =
        fechamentos.reduce(
          (total, fechamento) =>
            total +
            Number(
              fechamento.group_cash_amount ||
                0
            ),
          0
        );

      return {
        rodrigo,
        marlon,
        grupo,
        total:
          rodrigo +
          marlon +
          grupo,
      };
    }, [fechamentos]);

  /*
   * LINHAS DOS MÚSICOS
   */

  const linhasMusicos =
    useMemo<LinhaMusico[]>(() => {
      const mapa = new Map<
        string,
        {
          datas: Set<string>;
          eventos: number;
          total: number;
          pago: number;
          pendente: number;
          instrumentos: Set<string>;
          ensaios: number;
          bonusPago: number;
          bonusPendente: number;
          quantidadeBonus: number;
        }
      >();

      /*
       * Inicializa todos os músicos
       */

      const nomesFreelancers = new Set([
        "joão vitor",
        "ronaldo",
        "wiglis",
      ]);

      const musicosFixos = musicos.filter((musico) => {
        const tipo = String(musico.type || "")
          .trim()
          .toLowerCase();

        const nome = String(musico.name || "")
          .trim()
          .toLowerCase();

        return tipo === "fixo" && !nomesFreelancers.has(nome);
      });

      for (const musico of musicosFixos) {
        mapa.set(musico.id, {
          datas: new Set(),
          eventos: 0,
          total: 0,
          pago: 0,
          pendente: 0,
          instrumentos: new Set(),
          ensaios: 0,
          bonusPago: 0,
          bonusPendente: 0,
          quantidadeBonus: 0,
        });
      }

      /*
       * EVENTOS
       */

      for (const item of musicosDoPeriodo) {
        const musico = musicos.find(
          (m) => m.id === item.musician_id
        );

        if (
          !musico ||
          String(musico.type || "").toLowerCase() !== "fixo"
        ) {
          continue;
        }

        const evento = eventos.find(
          (e) =>
            e.id === item.event_id
        );

        if (!evento) continue;

        if (!mapa.has(item.musician_id)) {
          mapa.set(
            item.musician_id,
            {
              datas: new Set(),
              eventos: 0,
              total: 0,
              pago: 0,
              pendente: 0,
              instrumentos: new Set(),
              ensaios: 0,
              bonusPago: 0,
              bonusPendente: 0,
              quantidadeBonus: 0,
            }
          );
        }

        const linha =
          mapa.get(
            item.musician_id
          )!;

        linha.datas.add(
          evento.event_date
        );

        linha.eventos += 1;

        linha.total += Number(
          item.event_cache || 0
        );

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

        const relacoes =
          instrumentosEvento.filter(
            (relacao) =>
              relacao.event_musician_id ===
              item.id
          );

        for (const relacao of relacoes) {
          const instrumento =
            instrumentos.find(
              (i) =>
                i.id ===
                relacao.instrument_id
            );

          if (instrumento) {
            linha.instrumentos.add(
              instrumento.name
            );
          }
        }
      }

      /*
       * ENSAIOS
       */

      for (const presenca of presencasEnsaio) {
        if (!presenca.present) continue;

        const musico = musicos.find(
          (m) => m.id === presenca.musician_id
        );

        if (
          !musico ||
          String(musico.type || "").toLowerCase() !== "fixo"
        ) {
          continue;
        }

        if (!mapa.has(
          presenca.musician_id
        )) {
          mapa.set(
            presenca.musician_id,
            {
              datas: new Set(),
              eventos: 0,
              total: 0,
              pago: 0,
              pendente: 0,
              instrumentos: new Set(),
              ensaios: 0,
              bonusPago: 0,
              bonusPendente: 0,
              quantidadeBonus: 0,
            }
          );
        }

        const linha =
          mapa.get(
            presenca.musician_id
          )!;

        linha.ensaios += 1;
      }

      /*
       * BONIFICAÇÕES
       */

      for (const premio of premiosBonificacao) {
        const musico = musicos.find(
          (m) => m.id === premio.musician_id
        );

        if (
          !musico ||
          String(musico.type || "").toLowerCase() !== "fixo"
        ) {
          continue;
        }

        if (!mapa.has(
          premio.musician_id
        )) {
          mapa.set(
            premio.musician_id,
            {
              datas: new Set(),
              eventos: 0,
              total: 0,
              pago: 0,
              pendente: 0,
              instrumentos: new Set(),
              ensaios: 0,
              bonusPago: 0,
              bonusPendente: 0,
              quantidadeBonus: 0,
            }
          );
        }

        const linha =
          mapa.get(
            premio.musician_id
          )!;

        const bonus =
          bonificacoes.find(
            (item) =>
              item.id ===
              premio.bonus_id
          );

        const valor = Number(
          premio.individual_amount ||
            0
        );

        if (bonus?.paid) {
          linha.bonusPago += valor;
          linha.quantidadeBonus += 1;
        } else {
          linha.bonusPendente += valor;
        }
      }

      return Array.from(
        mapa.entries()
      )
        .map(
          ([id, linha]) => ({
            id,
            nome:
              musicos.find(
                (musico) =>
                  musico.id === id
              )?.name ||
              "Músico",
            eventos:
              linha.eventos,
            ensaios:
              linha.ensaios,
            participacoes:
              linha.eventos +
              linha.ensaios,
            datas:
              linha.datas.size,
            totalCache:
              linha.total,
            cachePago:
              linha.pago,
            cachePendente:
              linha.pendente,
            media:
              linha.datas.size > 0
                ? linha.total /
                  linha.datas.size
                : 0,
            instrumentos:
              Array.from(
                linha.instrumentos
              ).join(", ") || "-",
            bonusPago:
              linha.bonusPago,
            bonusPendente:
              linha.bonusPendente,
            quantidadeBonus:
              linha.quantidadeBonus,
          })
        )
        .sort(
          (a, b) =>
            b.participacoes -
              a.participacoes ||
            b.totalCache -
              a.totalCache ||
            a.nome.localeCompare(
              b.nome
            )
        );
    }, [
      musicos,
      musicosDoPeriodo,
      eventos,
      instrumentosEvento,
      instrumentos,
      presencasEnsaio,
      premiosBonificacao,
      bonificacoes,
    ]);

  /*
   * TOTAIS DE BONIFICAÇÃO
   */

  const totalBonificacoesPagas =
    useMemo(
      () =>
        premiosBonificacao
          .filter((premio) => {
            const bonus =
              bonificacoes.find(
                (item) =>
                  item.id ===
                  premio.bonus_id
              );

            return bonus?.paid;
          })
          .reduce(
            (total, premio) =>
              total +
              Number(
                premio.individual_amount ||
                  0
              ),
            0
          ),
      [
        premiosBonificacao,
        bonificacoes,
      ]
    );

  const totalBonificacoesPendentes =
    useMemo(
      () =>
        premiosBonificacao
          .filter((premio) => {
            const bonus =
              bonificacoes.find(
                (item) =>
                  item.id ===
                  premio.bonus_id
              );

            return !bonus?.paid;
          })
          .reduce(
            (total, premio) =>
              total +
              Number(
                premio.individual_amount ||
                  0
              ),
            0
          ),
      [
        premiosBonificacao,
        bonificacoes,
      ]
    );

  const quantidadeBonificacoesPagas =
    useMemo(
      () =>
        new Set(
          premiosBonificacao
            .filter((premio) => {
              const bonus =
                bonificacoes.find(
                  (item) =>
                    item.id ===
                    premio.bonus_id
                );

              return bonus?.paid;
            })
            .map(
              (premio) =>
                `${premio.bonus_id}-${premio.musician_id}`
            )
        ).size,
      [
        premiosBonificacao,
        bonificacoes,
      ]
    );

  /*
   * FREQUÊNCIA
   */

  const maiorParticipacao =
    linhasMusicos.length > 0
      ? Math.max(
          ...linhasMusicos.map(
            (item) =>
              item.participacoes
          )
        )
      : 0;

  const lideres =
    linhasMusicos.filter(
      (item) =>
        item.participacoes ===
          maiorParticipacao &&
        maiorParticipacao > 0
    );

  /*
   * RECEITAS AGRUPADAS
   */

  const resumoReceitas =
    useMemo(() => {
      return receitasDoPeriodo
        .filter(
          (r) =>
            r.confirmed &&
            r.status !==
              "cancelado"
        )
        .reduce(
          (
            mapa,
            receita
          ) => {
            if (
              !mapa.has(
                receita.description
              )
            ) {
              mapa.set(
                receita.description,
                {
                  confirmado: 0,
                  recebido: 0,
                }
              );
            }

            const linha =
              mapa.get(
                receita.description
              )!;

            linha.confirmado +=
              Number(
                receita.expected_amount ||
                  0
              );

            if (
              receita.status ===
              "recebido"
            ) {
              linha.recebido +=
                Number(
                  receita.actual_amount ||
                    receita.expected_amount ||
                    0
                );
            }

            return mapa;
          },
          new Map<
            string,
            {
              confirmado: number;
              recebido: number;
            }
          >()
        );
    }, [receitasDoPeriodo]);

  const bonusMeses =
    bonificacoes.length;

  return (
    <main className="min-h-screen bg-slate-100 p-6 text-slate-800">
      <div className="mx-auto max-w-7xl">

        {/* CABEÇALHO */}

        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">

          <div>
            <p className="text-sm font-semibold text-slate-500">
              VIROMANIA GESTÃO
            </p>

            <h1 className="mt-1 text-3xl font-bold">
              Relatórios
            </h1>

            <p className="mt-1 text-sm text-slate-500">
              Visão financeira, frequência,
              pagamentos e bonificações.
            </p>
          </div>

          <div className="flex gap-2">

            <button
              onClick={carregarDados}
              className="rounded-lg bg-slate-800 px-5 py-3 text-sm font-semibold text-white"
            >
              Atualizar relatório
            </button>

            <a
              href="/"
              className="rounded-lg border border-slate-300 bg-white px-5 py-3 text-sm font-semibold"
            >
              Voltar
            </a>

          </div>

        </div>

        {/* FILTRO */}

        <section className="mb-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">

          <div className="flex flex-wrap items-end gap-4">

            <div>
              <label className="mb-1 block text-sm font-semibold">
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
                className="rounded-lg border border-slate-300 px-3 py-3"
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
                <label className="mb-1 block text-sm font-semibold">
                  Mês
                </label>

                <input
                  type="month"
                  value={mes}
                  onChange={(e) =>
                    setMes(e.target.value)
                  }
                  className="rounded-lg border border-slate-300 px-3 py-3"
                />
              </div>
            )}

            {modo === "ano" && (
              <div>
                <label className="mb-1 block text-sm font-semibold">
                  Ano
                </label>

                <input
                  type="number"
                  value={ano}
                  onChange={(e) =>
                    setAno(e.target.value)
                  }
                  className="w-32 rounded-lg border border-slate-300 px-3 py-3"
                />
              </div>
            )}

            {modo ===
              "personalizado" && (
              <>
                <div>
                  <label className="mb-1 block text-sm font-semibold">
                    Início
                  </label>

                  <input
                    type="date"
                    value={inicio}
                    onChange={(e) =>
                      setInicio(
                        e.target.value
                      )
                    }
                    className="rounded-lg border border-slate-300 px-3 py-3"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-semibold">
                    Fim
                  </label>

                  <input
                    type="date"
                    value={fim}
                    onChange={(e) =>
                      setFim(
                        e.target.value
                      )
                    }
                    className="rounded-lg border border-slate-300 px-3 py-3"
                  />
                </div>
              </>
            )}

            <div className="pb-2 text-sm text-slate-500">
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

        {mensagem && (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 font-semibold text-red-700">
            {mensagem}
          </div>
        )}

        {carregando ? (
          <div className="rounded-xl border border-slate-200 bg-white p-12 text-center">
            Carregando relatório...
          </div>
        ) : (
          <>
            {/* RESUMO FINANCEIRO */}

            <section className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">

              <Card
                titulo="Receitas confirmadas"
                valor={moeda(
                  totalConfirmado
                )}
              />

              <Card
                titulo="Recebido"
                valor={moeda(
                  totalRecebido
                )}
              />

              <Card
                titulo="A receber"
                valor={moeda(
                  totalAReceber
                )}
              />

              <Card
                titulo="Cachês"
                valor={moeda(
                  totalMusicos
                )}
              />

              <Card
                titulo="Resultado líquido"
                valor={moeda(
                  resultadoLiquido
                )}
                destaque
              />

            </section>

            {/* PAGAMENTOS */}

            <section className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">

              <Card
                titulo="Cachês pagos"
                valor={moeda(
                  totalMusicosPagos
                )}
              />

              <Card
                titulo="Cachês pendentes"
                valor={moeda(
                  totalMusicosPendentes
                )}
              />

              <Card
                titulo="Despesas dos eventos"
                valor={moeda(
                  totalDespesas
                )}
              />

            </section>

            {/* RECEITAS + DISTRIBUIÇÃO */}

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">

              <section className="rounded-xl border border-slate-200 bg-white shadow-sm">

                <div className="border-b border-slate-200 p-5">

                  <h2 className="text-xl font-bold">
                    Receitas
                  </h2>

                  <p className="mt-1 text-sm text-slate-500">
                    Receitas confirmadas de
                    eventos realizados.
                  </p>

                </div>

                <div className="overflow-x-auto">

                  <table className="w-full text-left text-sm">

                    <thead className="bg-slate-50 text-xs uppercase text-slate-500">

                      <tr>
                        <th className="px-5 py-3">
                          Receita
                        </th>

                        <th className="px-5 py-3">
                          Confirmado
                        </th>

                        <th className="px-5 py-3">
                          Recebido
                        </th>

                        <th className="px-5 py-3">
                          Pendente
                        </th>
                      </tr>

                    </thead>

                    <tbody className="divide-y divide-slate-100">

                      {Array.from(
                        resumoReceitas.entries()
                      ).map(
                        ([
                          nome,
                          linha,
                        ]) => (
                          <tr key={nome}>

                            <td className="px-5 py-3 font-semibold">
                              {nome}
                            </td>

                            <td className="px-5 py-3">
                              {moeda(
                                linha.confirmado
                              )}
                            </td>

                            <td className="px-5 py-3 text-green-700">
                              {moeda(
                                linha.recebido
                              )}
                            </td>

                            <td className="px-5 py-3 text-amber-700">
                              {moeda(
                                Math.max(
                                  linha.confirmado -
                                    linha.recebido,
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

              </section>

              <section className="rounded-xl border border-slate-200 bg-white shadow-sm">

                <div className="border-b border-slate-200 p-5">

                  <h2 className="text-xl font-bold">
                    Distribuição semanal
                  </h2>

                  <p className="mt-1 text-sm text-slate-500">
                    Valores registrados nos
                    fechamentos do período.
                  </p>

                </div>

                <div className="grid gap-3 p-5 md:grid-cols-3">

                  <Card
                    titulo="Rodrigo — 1/4"
                    valor={moeda(
                      distribuicao.rodrigo
                    )}
                    pequeno
                  />

                  <Card
                    titulo="Marlon — 1/4"
                    valor={moeda(
                      distribuicao.marlon
                    )}
                    pequeno
                  />

                  <Card
                    titulo="Caixa — 2/4"
                    valor={moeda(
                      distribuicao.grupo
                    )}
                    pequeno
                  />

                </div>

                <div className="mx-5 mb-5 rounded-lg bg-slate-50 p-4 text-sm">
                  Total distribuído:
                  <strong className="ml-1">
                    {moeda(
                      distribuicao.total
                    )}
                  </strong>
                </div>

              </section>

            </div>

            {/* DESEMPENHO DOS MÚSICOS */}

            <section className="mt-6 rounded-xl border border-slate-200 bg-white shadow-sm">

              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 p-5">

                <div>

                  <h2 className="text-xl font-bold">
                    Desempenho dos músicos
                  </h2>

                  <p className="mt-1 text-sm text-slate-500">
                    Eventos, ensaios, cachês,
                    pagamentos e bonificações.
                  </p>

                </div>

                <div className="rounded-lg bg-blue-50 px-4 py-3 text-sm text-blue-800">
                  Maior frequência:
                  <strong className="ml-1">
                    {maiorParticipacao}
                    {" "}
                    {maiorParticipacao === 1
                      ? "participação"
                      : "participações"}
                  </strong>
                </div>

              </div>

              <div className="overflow-x-auto">

                <table className="w-full text-left text-sm">

                  <thead className="bg-slate-50 text-xs uppercase text-slate-500">

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

                  <tbody className="divide-y divide-slate-100">

                    {linhasMusicos.map(
                      (linha) => (
                        <tr
                          key={linha.id}
                        >

                          <td className="px-4 py-4 font-bold">
                            {linha.nome}
                          </td>

                          <td className="px-4 py-4">
                            {linha.eventos}
                          </td>

                          <td className="px-4 py-4">
                            {linha.ensaios}
                          </td>

                          <td className="px-4 py-4">

                            <span className="rounded-full bg-slate-100 px-3 py-1 font-bold">
                              {
                                linha.participacoes
                              }
                            </span>

                          </td>

                          <td className="px-4 py-4">
                            {moeda(
                              linha.totalCache
                            )}
                          </td>

                          <td className="px-4 py-4 text-green-700">
                            {moeda(
                              linha.cachePago
                            )}
                          </td>

                          <td className="px-4 py-4 text-amber-700">
                            {moeda(
                              linha.cachePendente
                            )}
                          </td>

                          <td className="px-4 py-4">

                            {linha.bonusPago >
                            0 ? (
                              <div>
                                <strong className="text-green-700">
                                  {moeda(
                                    linha.bonusPago
                                  )}
                                </strong>

                                {linha.bonusPendente >
                                  0 && (
                                  <div className="text-xs text-amber-600">
                                    +
                                    {moeda(
                                      linha.bonusPendente
                                    )}{" "}
                                    pendente
                                  </div>
                                )}
                              </div>
                            ) : linha.bonusPendente >
                              0 ? (
                              <span className="text-amber-600">
                                {moeda(
                                  linha.bonusPendente
                                )}{" "}
                                pendente
                              </span>
                            ) : (
                              "-"
                            )}

                          </td>

                          <td className="px-4 py-4">
                            {linha.quantidadeBonus}
                          </td>

                        </tr>
                      )
                    )}

                    {linhasMusicos.length ===
                      0 && (
                      <tr>
                        <td
                          colSpan={9}
                          className="px-5 py-10 text-center text-slate-500"
                        >
                          Nenhum músico encontrado
                          no período.
                        </td>
                      </tr>
                    )}

                  </tbody>

                </table>

              </div>

            </section>

            {/* DETALHE POR MÚSICO */}

            <section className="mt-6 rounded-xl border border-slate-200 bg-white shadow-sm">

              <div className="border-b border-slate-200 p-5">

                <h2 className="text-xl font-bold">
                  Resumo individual
                </h2>

                <p className="mt-1 text-sm text-slate-500">
                  Informações detalhadas de
                  frequência e instrumentos.
                </p>

              </div>

              <div className="grid grid-cols-1 gap-4 p-5 md:grid-cols-2 xl:grid-cols-3">

                {linhasMusicos.map(
                  (linha) => (
                    <div
                      key={linha.id}
                      className="rounded-xl border border-slate-200 p-5"
                    >

                      <h3 className="text-lg font-bold">
                        {linha.nome}
                      </h3>

                      <div className="mt-4 grid grid-cols-2 gap-3">

                        <MiniInfo
                          titulo="Eventos"
                          valor={String(
                            linha.eventos
                          )}
                        />

                        <MiniInfo
                          titulo="Ensaios"
                          valor={String(
                            linha.ensaios
                          )}
                        />

                        <MiniInfo
                          titulo="Participações"
                          valor={String(
                            linha.participacoes
                          )}
                        />

                        <MiniInfo
                          titulo="Datas"
                          valor={String(
                            linha.datas
                          )}
                        />

                      </div>

                      <div className="mt-4 space-y-2 text-sm">

                        <div className="flex justify-between">
                          <span className="text-slate-500">
                            Total de cachês
                          </span>

                          <strong>
                            {moeda(
                              linha.totalCache
                            )}
                          </strong>
                        </div>

                        <div className="flex justify-between">
                          <span className="text-slate-500">
                            Média por data
                          </span>

                          <strong>
                            {moeda(
                              linha.media
                            )}
                          </strong>
                        </div>

                        <div className="flex justify-between">
                          <span className="text-slate-500">
                            Bônus recebidos
                          </span>

                          <strong className="text-green-700">
                            {moeda(
                              linha.bonusPago
                            )}
                          </strong>
                        </div>

                        <div className="flex justify-between">
                          <span className="text-slate-500">
                            Quantidade de bônus
                          </span>

                          <strong>
                            {
                              linha.quantidadeBonus
                            }
                          </strong>
                        </div>

                      </div>

                      <div className="mt-4 rounded-lg bg-slate-50 p-3 text-xs text-slate-600">

                        <strong>
                          Instrumentos:
                        </strong>

                        <div className="mt-1">
                          {
                            linha.instrumentos
                          }
                        </div>

                      </div>

                    </div>
                  )
                )}

              </div>

            </section>

            {/* BONIFICAÇÕES */}

            <section className="mt-6 rounded-xl border border-slate-200 bg-white shadow-sm">

              <div className="border-b border-slate-200 p-5">

                <div className="flex flex-wrap items-center justify-between gap-4">

                  <div>

                    <h2 className="text-xl font-bold">
                      Histórico de bonificações
                    </h2>

                    <p className="mt-1 text-sm text-slate-500">
                      Bonificações mensais e situação
                      de pagamento.
                    </p>

                  </div>

                  <div className="flex gap-3">

                    <div className="rounded-lg bg-green-50 px-4 py-3">
                      <p className="text-xs text-green-700">
                        Pagas
                      </p>

                      <strong className="text-green-800">
                        {moeda(
                          totalBonificacoesPagas
                        )}
                      </strong>
                    </div>

                    <div className="rounded-lg bg-amber-50 px-4 py-3">
                      <p className="text-xs text-amber-700">
                        Pendentes
                      </p>

                      <strong className="text-amber-800">
                        {moeda(
                          totalBonificacoesPendentes
                        )}
                      </strong>
                    </div>

                  </div>

                </div>

              </div>

              {bonificacoes.length ===
              0 ? (
                <div className="p-10 text-center text-slate-500">
                  Nenhuma bonificação registrada
                  neste período.
                </div>
              ) : (
                <div className="divide-y divide-slate-100">

                  {bonificacoes.map(
                    (bonus) => {

                      const premios =
                        premiosBonificacao.filter(
                          (premio) =>
                            premio.bonus_id ===
                            bonus.id
                        );

                      return (
                        <div
                          key={bonus.id}
                          className="p-5"
                        >

                          <div className="flex flex-wrap items-center justify-between gap-4">

                            <div>

                              <h3 className="font-bold capitalize">
                                {nomeMes(
                                  bonus.reference_month.slice(
                                    0,
                                    7
                                  )
                                )}
                              </h3>

                              <p className="mt-1 text-sm text-slate-500">
                                Total:{" "}
                                <strong>
                                  {moeda(
                                    bonus.total_amount
                                  )}
                                </strong>
                              </p>

                            </div>

                            <div>

                              {bonus.paid ? (
                                <span className="rounded-full bg-green-100 px-3 py-2 text-xs font-bold text-green-700">
                                  ✓ Pago em{" "}
                                  {dataBR(
                                    bonus.payment_date
                                  )}
                                </span>
                              ) : (
                                <span className="rounded-full bg-amber-100 px-3 py-2 text-xs font-bold text-amber-700">
                                  Pendente
                                </span>
                              )}

                            </div>

                          </div>

                          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">

                            {premios.map(
                              (premio) => {

                                const musico =
                                  musicos.find(
                                    (item) =>
                                      item.id ===
                                      premio.musician_id
                                  );

                                return (
                                  <div
                                    key={
                                      premio.id
                                    }
                                    className="rounded-lg border border-slate-200 p-4"
                                  >

                                    <div className="flex justify-between gap-3">

                                      <div>

                                        <p className="font-bold">
                                          {
                                            musico?.name ||
                                            "Músico"
                                          }
                                        </p>

                                        <p className="mt-1 text-xs text-slate-500">
                                          {
                                            premio.events_count
                                          }{" "}
                                          eventos +{" "}
                                          {
                                            premio.rehearsals_count
                                          }{" "}
                                          ensaios ={" "}
                                          {
                                            premio.total_participations
                                          }{" "}
                                          participações
                                        </p>

                                      </div>

                                      <strong className="text-green-700">
                                        {moeda(
                                          premio.individual_amount
                                        )}
                                      </strong>

                                    </div>

                                  </div>
                                );
                              }
                            )}

                          </div>

                        </div>
                      );
                    }
                  )}

                </div>
              )}

            </section>

            {/* ENSAIOS */}

            <section className="mt-6 rounded-xl border border-purple-200 bg-white shadow-sm">

              <div className="border-b border-purple-100 bg-purple-50 p-5">

                <h2 className="text-xl font-bold">
                  Ensaios do período
                </h2>

                <p className="mt-1 text-sm text-slate-600">
                  Ensaios contam para a frequência,
                  mas não geram cachê.
                </p>

              </div>

              <div className="p-5">

                <div className="mb-5 grid grid-cols-1 gap-4 md:grid-cols-3">

                  <MiniCard
                    titulo="Ensaios realizados"
                    valor={String(
                      ensaios.length
                    )}
                  />

                  <MiniCard
                    titulo="Presenças registradas"
                    valor={String(
                      presencasEnsaio.length
                    )}
                  />

                  <MiniCard
                    titulo="Meses com bonificação"
                    valor={String(
                      bonusMeses
                    )}
                  />

                </div>

                {ensaios.length ===
                0 ? (
                  <p className="text-sm text-slate-500">
                    Nenhum ensaio registrado
                    neste período.
                  </p>
                ) : (
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">

                    {ensaios.map(
                      (ensaio) => {

                        const presentes =
                          presencasEnsaio.filter(
                            (item) =>
                              item.rehearsal_id ===
                                ensaio.id &&
                              item.present
                          ).length;

                        return (
                          <div
                            key={ensaio.id}
                            className="rounded-lg border border-slate-200 p-4"
                          >

                            <p className="font-bold">
                              {dataBR(
                                ensaio.rehearsal_date
                              )}
                            </p>

                            <p className="mt-1 text-sm text-slate-500">
                              {presentes}{" "}
                              presentes
                            </p>

                          </div>
                        );
                      }
                    )}

                  </div>
                )}

              </div>

            </section>

            {/* EVENTOS */}

            <section className="mt-6 rounded-xl border border-slate-200 bg-white shadow-sm">

              <div className="border-b border-slate-200 p-5">

                <h2 className="text-xl font-bold">
                  Eventos realizados
                </h2>

                <p className="mt-1 text-sm text-slate-500">
                  {eventosRealizados.length}{" "}
                  {eventosRealizados.length ===
                  1
                    ? "evento realizado"
                    : "eventos realizados"}{" "}
                  no período.
                </p>

              </div>

              <div className="divide-y divide-slate-100">

                {eventosRealizados.map(
                  (evento) => {

                    const receitaEvento =
                      receitasDoPeriodo
                        .filter(
                          (receita) =>
                            receita.event_id ===
                            evento.id
                        )
                        .reduce(
                          (total, receita) =>
                            total +
                            Number(
                              receita.expected_amount ||
                                0
                            ),
                          0
                        );

                    const musicosEventoLocal =
                      musicosDoPeriodo
                        .filter(
                          (item) =>
                            item.event_id ===
                            evento.id
                        )
                        .reduce(
                          (total, item) =>
                            total +
                            Number(
                              item.event_cache ||
                                0
                            ),
                          0
                        );

                    const despesasEvento =
                      despesasDoPeriodo
                        .filter(
                          (item) =>
                            item.event_id ===
                            evento.id
                        )
                        .reduce(
                          (total, item) =>
                            total +
                            Number(
                              item.amount ||
                                0
                            ),
                          0
                        );

                    const resultado =
                      receitaEvento -
                      musicosEventoLocal -
                      despesasEvento;

                    return (
                      <div
                        key={evento.id}
                        className="p-5"
                      >

                        <div className="flex flex-wrap items-center justify-between gap-4">

                          <div>

                            <h3 className="font-bold">
                              {evento.name}
                            </h3>

                            <p className="mt-1 text-sm text-slate-500">
                              {dataBR(
                                evento.event_date
                              )}
                            </p>

                          </div>

                          <div className="text-right">

                            <p className="text-xs text-slate-500">
                              Resultado do evento
                            </p>

                            <strong
                              className={
                                resultado >=
                                0
                                  ? "text-green-700"
                                  : "text-red-700"
                              }
                            >
                              {moeda(
                                resultado
                              )}
                            </strong>

                          </div>

                        </div>

                        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">

                          <MiniInfo
                            titulo="Receitas"
                            valor={moeda(
                              receitaEvento
                            )}
                          />

                          <MiniInfo
                            titulo="Músicos"
                            valor={moeda(
                              musicosEventoLocal
                            )}
                          />

                          <MiniInfo
                            titulo="Despesas"
                            valor={moeda(
                              despesasEvento
                            )}
                          />

                        </div>

                      </div>
                    );
                  }
                )}

              </div>

            </section>

            {/* OBSERVAÇÃO FINANCEIRA */}

            <section className="mt-6 mb-10 rounded-xl border border-blue-200 bg-blue-50 p-5">

              <h2 className="font-bold text-blue-900">
                Regra financeira do sistema
              </h2>

              <div className="mt-3 space-y-1 text-sm text-blue-800">

                <p>
                  O resultado semanal considera
                  receitas confirmadas dos eventos,
                  cachês dos músicos e despesas dos
                  eventos.
                </p>

                <p>
                  Rodrigo recebe 1/4, Marlon 1/4 e
                  o Caixa do Grupo fica com 2/4.
                </p>

                <p>
                  Valores ainda não recebidos
                  continuam como contas a receber,
                  mas não alteram o resultado já
                  confirmado.
                </p>

                <p>
                  Bonificações mensais são despesas
                  separadas do Caixa do Grupo e não
                  alteram nenhum resultado semanal.
                </p>

                <p>
                  Ensaios servem para frequência da
                  bonificação e não geram cachê.
                </p>

              </div>

            </section>
          </>
        )}
      </div>
    </main>
  );
}

function Card({
  titulo,
  valor,
  destaque = false,
  pequeno = false,
}: {
  titulo: string;
  valor: string;
  destaque?: boolean;
  pequeno?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border p-5 ${
        destaque
          ? "border-slate-800 bg-slate-800 text-white"
          : "border-slate-200 bg-white text-slate-800"
      }`}
    >
      <p
        className={`text-sm ${
          destaque
            ? "text-slate-300"
            : "text-slate-500"
        }`}
      >
        {titulo}
      </p>

      <strong
        className={`mt-1 block ${
          pequeno
            ? "text-xl"
            : "text-2xl"
        }`}
      >
        {valor}
      </strong>
    </div>
  );
}

function MiniInfo({
  titulo,
  valor,
}: {
  titulo: string;
  valor: string;
}) {
  return (
    <div className="rounded-lg bg-slate-50 p-3">
      <p className="text-xs text-slate-500">
        {titulo}
      </p>

      <p className="mt-1 font-bold">
        {valor}
      </p>
    </div>
  );
}

function MiniCard({
  titulo,
  valor,
}: {
  titulo: string;
  valor: string;
}) {
  return (
    <div className="rounded-lg border border-slate-200 p-4">
      <p className="text-sm text-slate-500">
        {titulo}
      </p>

      <p className="mt-1 text-2xl font-bold">
        {valor}
      </p>
    </div>
  );
}