"use client";



import { useEffect, useMemo, useState } from "react";

import { supabase } from "@/lib/supabase";
import { calcularCaixa, semDuplicadosAutomaticos } from "@/lib/caixa";
import { inicioDaSemana, fimDaSemana, semanaParaFechar, diaAnteriorISO } from "@/lib/semana";
import { ajustesDaPessoa, somaAjustes, detalharPagamento } from "@/lib/despesas";
import { bonificacoesDaSemana, nomeDoMes, type BonusDaSemana } from "@/lib/bonus";



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
  description: string;
  amount: number;
  notes: string | null;
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
  // cachê sem os reembolsos
  cache: number;
  // reembolsos de despesas (ex.: gasolina) somados ao pagamento
  reembolsos: { descricao: string; valor: number }[];
  participacoes: Participacao[];
  // bonificação do mês ainda não paga (é paga ao salvar o fechamento)
  bonusPendente?: boolean;
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



// Semana de terça a segunda (ver lib/semana.ts)
function segundaDaSemana(date: Date) {
  return inicioDaSemana(date);
}

function domingoDaSemana(date: Date) {
  return fimDaSemana(date);
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
  // Mesmo cálculo da aba Caixa (lib/caixa.ts)
  const resultado = await calcularCaixa();
  return resultado.currentBalance;
}

export default function PagamentosPage() {

  const [semanaReferencia, setSemanaReferencia] =

    useState(() => semanaParaFechar());



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



  // Bonificação mensal paga nesta semana (última semana do mês)
  const [bonusSemana, setBonusSemana] = useState<BonusDaSemana[]>([]);

  // Chave PIX de cada músico (cadastro de músicos)
  const [pixPorMusico, setPixPorMusico] = useState<Record<string, string>>({});
  const [pixCopiado, setPixCopiado] = useState<string | null>(null);

  async function copiarPix(musicianId: string, chave: string) {
    try {
      await navigator.clipboard.writeText(chave);
    } catch {
      // Navegadores sem acesso à área de transferência
      const campo = document.createElement("textarea");
      campo.value = chave;
      document.body.appendChild(campo);
      campo.select();
      document.execCommand("copy");
      document.body.removeChild(campo);
    }
    setPixCopiado(musicianId);
    window.setTimeout(
      () => setPixCopiado((atual) => (atual === musicianId ? null : atual)),
      2000
    );
  }

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

          // Fechamento desta semana (terça a segunda) ou o antigo
          // equivalente, que começava na segunda-feira anterior
          .in("week_start", [semanaInicio, diaAnteriorISO(semanaInicio)])
          .order("week_start", { ascending: false })
          .limit(1)
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

            "event_revenue_id,description,actual_amount,actual_receipt_date,status,notes"

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

        semDuplicadosAutomaticos((recibosRes.data || []) as any[]).map(

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

              "id,event_id,description,amount,notes"

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

            description: String(d.description || "Despesa"),
            notes: d.notes || null,
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



      setBonusSemana(await bonificacoesDaSemana(semanaInicio, semanaFim));

      const { data: pixData, error: pixError } = await supabase
        .from("musicians")
        .select("id,pix");
      if (pixError) throw pixError;
      setPixPorMusico(
        Object.fromEntries(
          (pixData || []).map((m: any) => [String(m.id), String(m.pix || "").trim()])
        )
      );

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
    useMemo<PagamentoMusico[]>(() => {
      const mapa = new Map<string, PagamentoMusico>();

      for (const p of participacoes) {
        const atual = mapa.get(p.musician_id) || {
          musician_id: p.musician_id,
          nome: p.musician_name,
          eventos: 0,
          total: 0,
          pago: 0,
          pendente: 0,
          cache: 0,
          reembolsos: [],
          participacoes: [],
          bonusPendente: false,
        };

        atual.eventos += 1;
        atual.cache += p.event_cache;
        atual.total += p.event_cache;
        atual.participacoes.push(p);

        if (p.payment_status === "pago") atual.pago += p.event_cache;
        else atual.pendente += p.event_cache;

        mapa.set(p.musician_id, atual);
      }

      // Bonificação do mês: quem ganhou recebe nesta semana, mesmo sem ter
      // tocado nela.
      for (const b of bonusSemana) {
        if (!mapa.has(b.musician_id)) {
          mapa.set(b.musician_id, {
            musician_id: b.musician_id,
            nome: b.nome,
            eventos: 0,
            total: 0,
            pago: 0,
            pendente: 0,
            cache: 0,
            reembolsos: [],
            participacoes: [],
            bonusPendente: false,
          });
        }
      }

      // Reembolsos (+), descontos (−) e bonificação entram no pagamento
      // junto com o cachê.
      for (const item of mapa.values()) {
        const bonus = bonusSemana
          .filter((b) => b.musician_id === item.musician_id)
          .map((b) => ({ descricao: `Bonificação de ${nomeDoMes(b.mes)}`, valor: b.valor }));

        item.bonusPendente = bonusSemana.some(
          (b) => b.musician_id === item.musician_id && !b.paid
        );

        item.reembolsos = [...ajustesDaPessoa(despesasEventos, item.musician_id), ...bonus];
        const ajuste = somaAjustes(item.reembolsos);
        item.total += ajuste;
        if (item.pendente > 0 || item.bonusPendente) item.pendente += ajuste;
        else item.pago += ajuste;
      }

      return [...mapa.values()].sort((a, b) =>
        a.nome.localeCompare(b.nome, "pt-BR")
      );
    }, [participacoes, despesasEventos, bonusSemana]);



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

      !item.participacoes.some((p) => p.payment_status !== "pago") ||

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

        <div className="mb-4 flex flex-wrap items-center justify-between gap-4">

          <div>

            <p className="text-sm font-semibold text-slate-500">

              VIROMANIA GESTÃO

            </p>



            <h1 className="mt-1 text-2xl sm:text-3xl font-extrabold">

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



        <section className="mb-4 rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">

          <div className="flex flex-wrap items-center justify-between gap-2">

            <div>

              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">

                Semana selecionada

              </p>



              <p className="mt-1 text-lg sm:text-xl font-extrabold">

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

              className={`rounded-full px-3 py-1 text-xs font-bold ${

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

            <section className="mb-4 grid grid-cols-3 gap-2 sm:gap-3">

              <div className="rounded-xl border border-purple-200 bg-purple-50 p-2.5 sm:p-3">

                <p className="text-[11px] font-semibold leading-tight text-purple-700 sm:text-xs">

                  Músicos da semana

                </p>



                <p className="mt-1 text-sm sm:text-lg font-extrabold text-purple-900">

                  {moeda(

                    totalMusicos

                  )}

                </p>



                <p className="mt-0.5 hidden text-[11px] leading-tight text-purple-700 sm:block">

                  {totalPendenteMusicos > 0
                    ? "Pago automaticamente ao salvar o fechamento"
                    : "✓ Pago no fechamento"}

                </p>

              </div>



              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-2.5 sm:p-3">

                <p className="text-[11px] font-semibold leading-tight text-emerald-700 sm:text-xs">

                  Entrou no caixa

                </p>



                <p className="mt-1 text-sm sm:text-lg font-extrabold text-emerald-900">

                  {moeda(

                    entradasSemana

                  )}

                </p>



                <p className="mt-0.5 hidden text-[11px] leading-tight text-emerald-700 sm:block">

                  Eventos realizados da semana − sinais já recebidos desses próprios eventos

                </p>

              </div>



              <div className="rounded-xl border border-blue-200 bg-blue-50 p-2.5 sm:p-3">

                <p className="text-[11px] font-semibold leading-tight text-blue-700 sm:text-xs">

                  Saldo do caixa

                </p>



                <p className="mt-1 text-sm sm:text-lg font-extrabold text-blue-900">

                  {moeda(

                    saldoAtualCaixa

                  )}

                </p>



                <p className="mt-0.5 hidden text-[11px] leading-tight text-blue-700 sm:block">

                  Saldo atual do caixa — mesmo cálculo da página Caixa.

                </p>

              </div>

            </section>



            <section className="mb-4 rounded-xl border border-slate-200 bg-white shadow-sm">

              <div className="border-b border-slate-200 p-3 sm:p-4">

                <h2 className="text-base sm:text-lg font-extrabold">

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

                        className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 p-3 sm:items-center sm:px-4 sm:py-3"

                      >

                        <div className="min-w-0 flex-1">

                          <p className="text-base font-extrabold">

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
                          {item.reembolsos.length > 0 && (
                            <p className="mt-1 text-sm font-semibold text-amber-700">
                              {detalharPagamento(item.cache, "de cachê", item.reembolsos)}
                            </p>
                          )}

                        </div>



                        {/* CHAVE PIX */}
                        <div className="order-last w-full sm:order-none sm:w-auto sm:min-w-[220px] sm:max-w-xs sm:flex-1">
                          <p className="text-xs font-semibold uppercase text-slate-500">
                            Chave PIX
                          </p>
                          {pixPorMusico[item.musician_id] ? (
                            <div className="mt-1 flex items-center gap-2">
                              <span className="flex-1 truncate rounded-lg bg-slate-100 px-3 py-2 font-mono text-sm" title={pixPorMusico[item.musician_id]}>
                                {pixPorMusico[item.musician_id]}
                              </span>
                              <button
                                type="button"
                                onClick={() => copiarPix(item.musician_id, pixPorMusico[item.musician_id])}
                                className={`shrink-0 rounded-lg px-3 py-2 text-xs font-bold text-white ${
                                  pixCopiado === item.musician_id ? "bg-green-600" : "bg-slate-900"
                                }`}
                              >
                                {pixCopiado === item.musician_id ? "✓ Copiado" : "Copiar"}
                              </button>
                            </div>
                          ) : (
                            <p className="mt-1 text-sm text-slate-400">
                              Sem chave PIX cadastrada
                            </p>
                          )}
                        </div>

                        <div className="text-right">
                          <p className="text-xs font-semibold uppercase text-slate-500">
                            Valor a pagar
                          </p>
                          <p className="text-lg font-extrabold">
                            {moeda(item.total)}
                          </p>
                          <p className="text-xs text-slate-500">
                            {item.participacoes.some((p) => p.payment_status !== "pago") || item.bonusPendente
                              ? "Pago automaticamente ao salvar o fechamento"
                              : "✓ Pago no fechamento"}
                          </p>
                        </div>

                      </div>

                    )

                  )}

                </div>

              )}

            </section>



            <section className="mb-10 rounded-xl border border-slate-200 bg-white shadow-sm">

              <div className="border-b border-slate-200 p-3 sm:p-4">

                <h2 className="text-base sm:text-lg font-extrabold">

                  Pagamentos dos sócios

                </h2>



                <p className="mt-1 text-sm text-slate-500">

                  Rodrigo 25% e Marlon 25% do resultado da semana, mais reembolsos de despesas (ex.: gasolina).

                </p>

              </div>



              {!fechamento ? (

                <div className="p-8 text-center text-slate-500">

                  Salve o fechamento desta semana primeiro.

                </div>

              ) : (

                <div className="grid gap-3 p-3 sm:p-4 md:grid-cols-2">

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

                    // Reembolsos (+) e descontos (−) já incluídos no valor
                    const ajustes = ajustesDaPessoa(despesasEventos, tipo);
                    const detalhe = detalharPagamento(
                      valor - somaAjustes(ajustes),
                      "da semana",
                      ajustes
                    );

                    return (

                      <div

                        key={tipo}

                        className="rounded-xl border border-slate-200 p-3 sm:p-4"

                      >

                        <div className="flex items-center justify-between gap-4">

                          <p className="text-base font-extrabold">

                            {nome}

                          </p>



                          <p className="text-lg font-extrabold">

                            {moeda(

                              valor

                            )}

                          </p>

                        </div>

                        {detalhe && (
                          <p className="mt-1 text-right text-xs font-semibold text-amber-700">
                            {detalhe}
                          </p>
                        )}



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