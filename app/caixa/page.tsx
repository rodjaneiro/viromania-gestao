"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type CaixaConfig = {
  id: string;
  start_date: string;
  initial_balance: number;
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

type Fechamento = {
  week_start: string;
  week_end: string;
  total_received: number;
  total_musicians: number;
  total_other_expenses: number;
  rodrigo_amount: number;
  marlon_amount: number;
  group_cash_amount: number;
};

type Recebimento = {
  event_revenue_id: string;
  actual_amount: number;
  actual_receipt_date: string | null;
  status: string;
};

type Evento = {
  id: string;
  event_date: string;
  status: string;
};

type ReceitaEvento = {
  event_id: string;
  actual_amount: number;
  expected_amount: number;
  confirmed: boolean;
  status: string;
};

type MusicoEvento = {
  event_id: string;
  event_cache: number;
};

type DespesaEvento = {
  event_id: string;
  amount: number;
};

const tipos = [
  { value: "receita", label: "Receita" },
  { value: "despesa", label: "Despesa" },
  { value: "rendimento", label: "Rendimento" },
  { value: "ajuste", label: "Ajuste" },
];

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

function ehLancamentoAutomatico(descricao: string) {
  const d = String(descricao || "")
    .trim()
    .toLowerCase();

  return (
    d === "saldo inicial de implantação" ||
    d === "saldo inicial" ||
    d === "sinal" ||
    d === "saldo final" ||
    d === "receita do evento" ||
    d === "recebimento de evento" ||
    d.includes("recebimento legado") ||
    d.includes("recebimento do fechamento") ||
    d.includes("pagamento músico") ||
    d.includes("pagamento musico") ||
    d.includes("distribuição") ||
    d.includes("distribuicao")
  );
}

export default function CaixaPage() {
  const [config, setConfig] =
    useState<CaixaConfig | null>(null);

  const [lancamentos, setLancamentos] =
    useState<Lancamento[]>([]);

  const [recebimentos, setRecebimentos] =
    useState<Recebimento[]>([]);

  const [fechamentos, setFechamentos] =
    useState<Fechamento[]>([]);

  const [eventos, setEventos] =
    useState<Evento[]>([]);

  const [receitasEventos, setReceitasEventos] =
    useState<ReceitaEvento[]>([]);

  const [musicosEventos, setMusicosEventos] =
    useState<MusicoEvento[]>([]);

  const [despesasEventos, setDespesasEventos] =
    useState<DespesaEvento[]>([]);

  const [carregando, setCarregando] =
    useState(true);

  const [erro, setErro] = useState("");

  const [dataInicio, setDataInicio] = useState(
    new Date().toISOString().slice(0, 10)
  );

  const [saldoInicial, setSaldoInicial] =
    useState("");

  const [observacaoInicial, setObservacaoInicial] =
    useState("");

  const [mostrarLancamento, setMostrarLancamento] =
    useState(false);

  const [dataLancamento, setDataLancamento] =
    useState(
      new Date().toISOString().slice(0, 10)
    );

  const [descricao, setDescricao] = useState("");

  const [tipo, setTipo] =
    useState("receita");

  const [direcao, setDirecao] =
    useState<"entrada" | "saida">("entrada");

  const [valor, setValor] = useState("");

  const [observacao, setObservacao] =
    useState("");

  const [salvandoConfig, setSalvandoConfig] =
    useState(false);

  const [salvandoLancamento, setSalvandoLancamento] =
    useState(false);

  async function carregar() {
    try {
      setCarregando(true);
      setErro("");

      const [
        configRes,
        lancamentosRes,
        recebimentosRes,
        fechamentosRes,
        eventosRes,
        receitasEventosRes,
        musicosEventosRes,
        despesasEventosRes,
      ] = await Promise.all([
        supabase
          .from("cash_setup")
          .select(
            "id,start_date,initial_balance,notes"
          )
          .limit(1)
          .maybeSingle(),

        supabase
          .from("cash_transactions")
          .select(
            "id,transaction_date,description,transaction_type,amount,direction,notes"
          )
          .order("transaction_date", {
            ascending: false,
          }),

        supabase
          .from("event_revenue_receipts")
          .select(
            "event_revenue_id,actual_amount,actual_receipt_date,status"
          )
          .eq("status", "recebido"),

        supabase
          .from("weekly_closings")
          .select(
            "week_start,week_end,total_received,total_musicians,total_other_expenses,rodrigo_amount,marlon_amount,group_cash_amount"
          )
          .order("week_end", {
            ascending: true,
          }),

        supabase
          .from("events")
          .select(
            "id,event_date,status"
          ),

        supabase
          .from("event_revenues")
          .select(
            "event_id,actual_amount,expected_amount,confirmed,status"
          ),

        supabase
          .from("event_musicians")
          .select(
            "event_id,event_cache"
          ),

        supabase
          .from("event_expenses")
          .select(
            "event_id,amount"
          ),
      ]);

      if (configRes.error)
        throw configRes.error;

      if (lancamentosRes.error)
        throw lancamentosRes.error;

      if (recebimentosRes.error)
        throw recebimentosRes.error;

      if (fechamentosRes.error)
        throw fechamentosRes.error;

      if (eventosRes.error)
        throw eventosRes.error;

      if (receitasEventosRes.error)
        throw receitasEventosRes.error;

      if (musicosEventosRes.error)
        throw musicosEventosRes.error;

      if (despesasEventosRes.error)
        throw despesasEventosRes.error;

      setEventos(
        (eventosRes.data || []) as Evento[]
      );

      setReceitasEventos(
        (receitasEventosRes.data || []).map(
          (x: any) => ({
            event_id: x.event_id,
            actual_amount: Number(
              x.actual_amount || 0
            ),
            expected_amount: Number(
              x.expected_amount || 0
            ),
            confirmed: Boolean(
              x.confirmed
            ),
            status:
              x.status || "pendente",
          })
        )
      );

      setMusicosEventos(
        (musicosEventosRes.data || []).map(
          (x: any) => ({
            event_id: x.event_id,
            event_cache: Number(
              x.event_cache || 0
            ),
          })
        )
      );

      setDespesasEventos(
        (despesasEventosRes.data || []).map(
          (x: any) => ({
            event_id: x.event_id,
            amount: Number(
              x.amount || 0
            ),
          })
        )
      );

      if (configRes.data) {
        const c: CaixaConfig = {
          ...configRes.data,
          initial_balance: Number(
            configRes.data.initial_balance || 0
          ),
        };

        setConfig(c);
        setDataInicio(c.start_date);
        setSaldoInicial(
          String(c.initial_balance)
        );
        setObservacaoInicial(
          c.notes || ""
        );
      } else {
        setConfig(null);
      }

      setLancamentos(
        (lancamentosRes.data || []).map(
          (x: any) => ({
            id: x.id,
            transaction_date:
              x.transaction_date,
            description:
              x.description || "",
            transaction_type:
              x.transaction_type || "",
            amount: Number(
              x.amount || 0
            ),
            direction:
              x.direction === "saida"
                ? "saida"
                : "entrada",
            notes:
              x.notes || null,
          })
        )
      );

      setRecebimentos(
        (recebimentosRes.data || []).map(
          (x: any) => ({
            event_revenue_id:
              x.event_revenue_id,
            actual_amount: Number(
              x.actual_amount || 0
            ),
            actual_receipt_date:
              x.actual_receipt_date ||
              null,
            status: x.status,
          })
        )
      );

      setFechamentos(
        (fechamentosRes.data || []).map(
          (x: any) => ({
            week_start:
              x.week_start,
            week_end:
              x.week_end,
            total_received: Number(
              x.total_received || 0
            ),
            total_musicians: Number(
              x.total_musicians || 0
            ),
            total_other_expenses:
              Number(
                x.total_other_expenses ||
                  0
              ),
            rodrigo_amount:
              Number(
                x.rodrigo_amount || 0
              ),
            marlon_amount:
              Number(
                x.marlon_amount || 0
              ),
            group_cash_amount:
              Number(
                x.group_cash_amount || 0
              ),
          })
        )
      );
    } catch (error: any) {
      console.error(error);

      setErro(
        error?.message ||
          "Erro ao carregar o caixa."
      );
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    carregar();
  }, []);

  /*
   * SOMENTE O ÚLTIMO FECHAMENTO DEFINE O LIMITE.
   *
   * Qualquer semana futura ou aberta fica fora do caixa.
   */
  const ultimoFechamento = useMemo(
    () =>
      [...fechamentos]
        .sort((a, b) =>
          a.week_end.localeCompare(
            b.week_end
          )
        )
        .at(-1) || null,
    [fechamentos]
  );

  const limiteFinanceiro =
    ultimoFechamento?.week_end ||
    config?.start_date ||
    "1900-01-01";

  /*
   * FECHAMENTOS QUE REALMENTE PODEM AFETAR
   * O CAIXA.
   */
  const fechamentosConsiderados =
    useMemo(() => {
      const inicioCaixa =
        config?.start_date ||
        "1900-01-01";

      return [...fechamentos]
        .filter(
          (f) =>
            f.week_end >= inicioCaixa &&
            f.week_end <=
              limiteFinanceiro
        )
        .sort((a, b) =>
          a.week_end.localeCompare(
            b.week_end
          )
        );
    }, [
      fechamentos,
      config,
      limiteFinanceiro,
    ]);

  /*
   * DINHEIRO REALMENTE RECEBIDO.
   *
   * Não usamos event_revenues.actual_amount
   * para movimentação do caixa.
   *
   * O movimento real vem de
   * event_revenue_receipts.
   */
  const recebimentosConsiderados =
    useMemo(() => {
      const inicioCaixa =
        config?.start_date ||
        "1900-01-01";

      return recebimentos.filter(
        (r) =>
          r.status === "recebido" &&
          !!r.actual_receipt_date &&
          r.actual_receipt_date >=
            inicioCaixa &&
          r.actual_receipt_date <=
            limiteFinanceiro
      );
    }, [
      recebimentos,
      config,
      limiteFinanceiro,
    ]);

  const entradasRecebimentos =
    useMemo(
      () =>
        recebimentosConsiderados.reduce(
          (total, r) =>
            total +
            Number(
              r.actual_amount || 0
            ),
          0
        ),
      [recebimentosConsiderados]
    );

  /*
   * LANÇAMENTOS MANUAIS.
   *
   * Os lançamentos automáticos antigos são
   * ignorados para não duplicar os recebimentos
   * e pagamentos que já vêm das tabelas oficiais.
   */
  const lancamentosManuais =
    useMemo(() => {
      const inicioCaixa =
        config?.start_date ||
        "1900-01-01";

      return lancamentos.filter(
        (l) => {
          if (
            l.transaction_date <
            inicioCaixa
          ) {
            return false;
          }

          if (
            l.transaction_date >
            limiteFinanceiro
          ) {
            return false;
          }

          return !ehLancamentoAutomatico(
            l.description
          );
        }
      );
    }, [
      lancamentos,
      config,
      limiteFinanceiro,
    ]);

  const entradasManuais =
    useMemo(
      () =>
        lancamentosManuais
          .filter(
            (l) =>
              l.direction ===
              "entrada"
          )
          .reduce(
            (total, l) =>
              total +
              Number(
                l.amount || 0
              ),
            0
          ),
      [lancamentosManuais]
    );

  const saidasManuais =
    useMemo(
      () =>
        lancamentosManuais
          .filter(
            (l) =>
              l.direction ===
              "saida"
          )
          .reduce(
            (total, l) =>
              total +
              Number(
                l.amount || 0
              ),
            0
          ),
      [lancamentosManuais]
    );

  /*
   * SAÍDAS DOS FECHAMENTOS.
   *
   * Importante:
   *
   * - músicos = saída
   * - despesas = saída
   * - Rodrigo = saída
   * - Marlon = saída
   * - Caixa do grupo = NÃO é saída
   *
   * O valor 2/4 da banda não é uma nova
   * entrada nem uma nova saída.
   */
  const obrigacoesFechadas =
    useMemo(
      () =>
        fechamentosConsiderados.reduce(
          (total, f) =>
            total +
            Number(
              f.total_musicians || 0
            ) +
            Number(
              f.total_other_expenses ||
                0
            ) +
            Number(
              f.rodrigo_amount || 0
            ) +
            Number(
              f.marlon_amount || 0
            ),
          0
        ),
      [fechamentosConsiderados]
    );

  const entradas =
    entradasRecebimentos +
    entradasManuais;

  const saidas =
    obrigacoesFechadas +
    saidasManuais;

  /*
   * SALDO REAL.
   *
   * saldo inicial não entra novamente
   * como uma entrada.
   */
  const saldoAtual =
    Number(
      config?.initial_balance || 0
    ) +
    entradas -
    saidas;

  async function salvarConfiguracaoInicial() {
    const valorNumerico =
      Number(saldoInicial || 0);

    if (!dataInicio) {
      alert(
        "Informe a data de início."
      );
      return;
    }

    if (valorNumerico < 0) {
      alert(
        "O saldo inicial não pode ser negativo."
      );
      return;
    }

    setSalvandoConfig(true);

    try {
      const payload = {
        start_date: dataInicio,
        initial_balance:
          valorNumerico,
        notes:
          observacaoInicial || null,
      };

      const { error } = config
        ? await supabase
            .from("cash_setup")
            .update(payload)
            .eq("id", config.id)
        : await supabase
            .from("cash_setup")
            .insert(payload);

      if (error) throw error;

      await carregar();

      alert(
        "Configuração inicial salva."
      );
    } catch (error: any) {
      alert(
        error?.message ||
          "Erro ao salvar o caixa."
      );
    } finally {
      setSalvandoConfig(false);
    }
  }

  async function salvarLancamento() {
    const valorNumerico =
      Number(valor || 0);

    if (!descricao.trim()) {
      alert(
        "Informe a descrição."
      );
      return;
    }

    if (valorNumerico <= 0) {
      alert(
        "Informe um valor maior que zero."
      );
      return;
    }

    setSalvandoLancamento(true);

    try {
      const { error } =
        await supabase
          .from(
            "cash_transactions"
          )
          .insert({
            transaction_date:
              dataLancamento,
            description:
              descricao.trim(),
            transaction_type:
              tipo,
            amount:
              valorNumerico,
            direction:
              direcao,
            notes:
              observacao || null,
          });

      if (error) throw error;

      setDescricao("");
      setValor("");
      setObservacao("");
      setMostrarLancamento(false);

      await carregar();
    } catch (error: any) {
      alert(
        error?.message ||
          "Erro ao lançar no caixa."
      );
    } finally {
      setSalvandoLancamento(false);
    }
  }

  const historico = useMemo(() => {
    const linhas: Array<{
      id: string;
      data: string;
      descricao: string;
      tipo: string;
      valor: number;
      entrada: boolean;
    }> = [];

    /*
     * RECEBIMENTOS REAIS
     */
    for (const r of recebimentosConsiderados) {
      if (
        !r.actual_receipt_date ||
        Number(r.actual_amount || 0) <=
          0
      ) {
        continue;
      }

      linhas.push({
        id:
          `rec-${r.event_revenue_id}-` +
          `${r.actual_receipt_date}-` +
          `${r.actual_amount}`,
        data:
          r.actual_receipt_date,
        descricao:
          "Recebimento de evento",
        tipo:
          "Receita de evento",
        valor:
          Number(
            r.actual_amount || 0
          ),
        entrada: true,
      });
    }

    /*
     * LANÇAMENTOS MANUAIS
     */
    for (const l of lancamentosManuais) {
      linhas.push({
        id: `lan-${l.id}`,
        data:
          l.transaction_date,
        descricao:
          l.description,
        tipo:
          l.transaction_type ||
          "Lançamento",
        valor:
          Number(l.amount || 0),
        entrada:
          l.direction ===
          "entrada",
      });
    }

    /*
     * SAÍDAS DOS FECHAMENTOS
     *
     * São exibidas no histórico,
     * mas não são gravadas novamente
     * em cash_transactions.
     */
    for (const f of fechamentosConsiderados) {
      if (
        f.total_musicians > 0
      ) {
        linhas.push({
          id:
            `mus-${f.week_start}`,
          data:
            f.week_end,
          descricao:
            `Cachês dos músicos — semana ` +
            `${dataBR(
              f.week_start
            )} a ${dataBR(
              f.week_end
            )}`,
          tipo: "Cachês",
          valor:
            f.total_musicians,
          entrada: false,
        });
      }

      if (
        f.total_other_expenses >
        0
      ) {
        linhas.push({
          id:
            `desp-${f.week_start}`,
          data:
            f.week_end,
          descricao:
            `Despesas — semana ` +
            `${dataBR(
              f.week_start
            )} a ${dataBR(
              f.week_end
            )}`,
          tipo: "Despesa",
          valor:
            f.total_other_expenses,
          entrada: false,
        });
      }

      if (
        f.rodrigo_amount > 0
      ) {
        linhas.push({
          id:
            `rod-${f.week_start}`,
          data:
            f.week_end,
          descricao:
            `Pagamento Rodrigo — semana ` +
            `${dataBR(
              f.week_start
            )} a ${dataBR(
              f.week_end
            )}`,
          tipo: "Sócio",
          valor:
            f.rodrigo_amount,
          entrada: false,
        });
      }

      if (
        f.marlon_amount > 0
      ) {
        linhas.push({
          id:
            `mar-${f.week_start}`,
          data:
            f.week_end,
          descricao:
            `Pagamento Marlon — semana ` +
            `${dataBR(
              f.week_start
            )} a ${dataBR(
              f.week_end
            )}`,
          tipo: "Sócio",
          valor:
            f.marlon_amount,
          entrada: false,
        });
      }
    }

    return linhas.sort(
      (a, b) =>
        b.data.localeCompare(
          a.data
        )
    );
  }, [
    recebimentosConsiderados,
    lancamentosManuais,
    fechamentosConsiderados,
  ]);

  return (
    <main className="min-h-screen bg-slate-100">
      <div className="mx-auto max-w-7xl px-4 py-8">

        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">

          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              Financeiro
            </p>

            <h1 className="text-3xl font-extrabold text-slate-900">
              Caixa
            </h1>

            <p className="mt-1 text-sm text-slate-500">
              Somente dinheiro de semanas fechadas participa do caixa.
            </p>
          </div>

          <button
            onClick={() =>
              setMostrarLancamento(
                (valorAtual) =>
                  !valorAtual
              )
            }
            className="rounded-xl bg-slate-900 px-5 py-3 text-sm font-bold text-white"
          >
            {mostrarLancamento
              ? "Fechar lançamento"
              : "+ Lançamento manual"}
          </button>
        </div>

        {erro && (
          <div className="mb-5 rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
            {erro}
          </div>
        )}

        {carregando ? (
          <div className="rounded-2xl bg-white p-10 text-center">
            Carregando caixa...
          </div>
        ) : (
          <>
            <section className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">

              <div className="rounded-2xl border bg-white p-5 shadow-sm">

                <p className="text-xs font-bold uppercase text-slate-500">
                  Saldo atual
                </p>

                <p
                  className={`mt-2 text-3xl font-extrabold ${
                    saldoAtual >= 0
                      ? "text-slate-900"
                      : "text-red-600"
                  }`}
                >
                  {moeda(saldoAtual)}
                </p>

                <p className="mt-1 text-xs text-slate-500">
                  Saldo inicial + recebimentos reais + entradas manuais
                  − músicos − despesas − sócios
                </p>

              </div>

              <div className="rounded-2xl border border-green-200 bg-green-50 p-5 shadow-sm">

                <p className="text-xs font-bold uppercase text-green-700">
                  Entradas
                </p>

                <p className="mt-2 text-2xl font-extrabold text-green-700">
                  {moeda(entradas)}
                </p>

                <p className="mt-1 text-xs text-green-700">
                  Recebimentos reais e entradas manuais até o último fechamento
                </p>

              </div>

              <div className="rounded-2xl border border-red-200 bg-red-50 p-5 shadow-sm">

                <p className="text-xs font-bold uppercase text-red-700">
                  Saídas
                </p>

                <p className="mt-2 text-2xl font-extrabold text-red-700">
                  {moeda(saidas)}
                </p>

                <p className="mt-1 text-xs text-red-700">
                  Músicos + despesas + Rodrigo + Marlon
                </p>

              </div>

            </section>

            <section className="mb-6 rounded-2xl border border-blue-200 bg-white shadow-sm">

              <div className="border-b border-blue-100 bg-blue-50 px-5 py-4">

                <h2 className="text-lg font-bold">
                  Implantação do caixa
                </h2>

                <p className="mt-1 text-sm text-slate-500">
                  Valor que já existia no caixa quando o sistema começou.
                </p>

              </div>

              <div className="grid grid-cols-1 gap-4 p-5 md:grid-cols-3">

                <div>
                  <label className="mb-1 block text-xs font-bold uppercase text-slate-500">
                    Data de início
                  </label>

                  <input
                    type="date"
                    value={dataInicio}
                    onChange={(e) =>
                      setDataInicio(
                        e.target.value
                      )
                    }
                    className="w-full rounded-lg border px-3 py-3"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-bold uppercase text-slate-500">
                    Saldo existente
                  </label>

                  <input
                    type="number"
                    step="0.01"
                    value={saldoInicial}
                    onChange={(e) =>
                      setSaldoInicial(
                        e.target.value
                      )
                    }
                    className="w-full rounded-lg border px-3 py-3"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-bold uppercase text-slate-500">
                    Observação
                  </label>

                  <input
                    value={observacaoInicial}
                    onChange={(e) =>
                      setObservacaoInicial(
                        e.target.value
                      )
                    }
                    className="w-full rounded-lg border px-3 py-3"
                  />
                </div>

              </div>

              <div className="flex items-center justify-between border-t p-5">

                <span className="text-sm text-slate-500">
                  Implantado em{" "}
                  {dataBR(
                    config?.start_date ||
                      dataInicio
                  )}
                </span>

                <button
                  onClick={
                    salvarConfiguracaoInicial
                  }
                  disabled={
                    salvandoConfig
                  }
                  className="rounded-lg bg-blue-600 px-5 py-3 text-sm font-bold text-white"
                >
                  {salvandoConfig
                    ? "Salvando..."
                    : "Salvar saldo inicial"}
                </button>

              </div>

            </section>

            {mostrarLancamento && (
              <section className="mb-6 rounded-2xl border bg-white p-5 shadow-sm">

                <h2 className="text-lg font-bold">
                  Lançamento manual
                </h2>

                <div className="mt-4 grid gap-4 md:grid-cols-5">

                  <input
                    type="date"
                    value={dataLancamento}
                    onChange={(e) =>
                      setDataLancamento(
                        e.target.value
                      )
                    }
                    className="rounded-lg border px-3 py-3"
                  />

                  <input
                    value={descricao}
                    onChange={(e) =>
                      setDescricao(
                        e.target.value
                      )
                    }
                    placeholder="Descrição"
                    className="rounded-lg border px-3 py-3"
                  />

                  <select
                    value={tipo}
                    onChange={(e) =>
                      setTipo(
                        e.target.value
                      )
                    }
                    className="rounded-lg border px-3 py-3"
                  >
                    {tipos.map(
                      (item) => (
                        <option
                          key={
                            item.value
                          }
                          value={
                            item.value
                          }
                        >
                          {item.label}
                        </option>
                      )
                    )}
                  </select>

                  <select
                    value={direcao}
                    onChange={(e) =>
                      setDirecao(
                        e.target.value as
                          | "entrada"
                          | "saida"
                      )
                    }
                    className="rounded-lg border px-3 py-3"
                  >
                    <option value="entrada">
                      Entrada
                    </option>

                    <option value="saida">
                      Saída
                    </option>
                  </select>

                  <input
                    type="number"
                    step="0.01"
                    value={valor}
                    onChange={(e) =>
                      setValor(
                        e.target.value
                      )
                    }
                    placeholder="Valor"
                    className="rounded-lg border px-3 py-3"
                  />

                </div>

                <textarea
                  value={observacao}
                  onChange={(e) =>
                    setObservacao(
                      e.target.value
                    )
                  }
                  placeholder="Observação"
                  className="mt-4 w-full rounded-lg border px-3 py-3"
                />

                <button
                  onClick={
                    salvarLancamento
                  }
                  disabled={
                    salvandoLancamento
                  }
                  className="mt-4 rounded-lg bg-slate-900 px-5 py-3 text-sm font-bold text-white"
                >
                  {salvandoLancamento
                    ? "Salvando..."
                    : "Salvar lançamento"}
                </button>

              </section>
            )}

            <section className="rounded-2xl border bg-white shadow-sm">

              <div className="border-b p-5">

                <h2 className="text-lg font-bold">
                  Histórico financeiro
                </h2>

                <p className="text-sm text-slate-500">
                  Mostra o que realmente entrou e o que o fechamento destinou para pagamentos.
                </p>

              </div>

              <div className="overflow-x-auto">

                <table className="min-w-full text-sm">

                  <thead className="bg-slate-50 text-left text-xs font-bold uppercase text-slate-500">

                    <tr>

                      <th className="px-5 py-3">
                        Data
                      </th>

                      <th className="px-5 py-3">
                        Descrição
                      </th>

                      <th className="px-5 py-3">
                        Tipo
                      </th>

                      <th className="px-5 py-3">
                        Movimento
                      </th>

                      <th className="px-5 py-3">
                        Valor
                      </th>

                    </tr>

                  </thead>

                  <tbody className="divide-y">

                    {historico.map(
                      (item) => (
                        <tr
                          key={item.id}
                        >

                          <td className="px-5 py-3">
                            {dataBR(
                              item.data
                            )}
                          </td>

                          <td className="px-5 py-3 font-semibold">
                            {item.descricao}
                          </td>

                          <td className="px-5 py-3">
                            {item.tipo}
                          </td>

                          <td
                            className={`px-5 py-3 font-bold ${
                              item.entrada
                                ? "text-green-700"
                                : "text-red-700"
                            }`}
                          >
                            {item.entrada
                              ? "Entrada"
                              : "Saída"}
                          </td>

                          <td
                            className={`px-5 py-3 font-bold ${
                              item.entrada
                                ? "text-green-700"
                                : "text-red-700"
                            }`}
                          >
                            {item.entrada
                              ? "+"
                              : "-"}{" "}
                            {moeda(
                              item.valor
                            )}
                          </td>

                        </tr>
                      )
                    )}

                    {historico.length ===
                      0 && (
                      <tr>

                        <td
                          colSpan={5}
                          className="px-5 py-10 text-center text-slate-500"
                        >
                          Nenhuma movimentação encontrada.
                        </td>

                      </tr>
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