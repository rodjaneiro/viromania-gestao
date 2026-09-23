"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type Musician = {
  id: string;
  name: string;
  active: boolean;
};

type Ranking = {
  musician_id: string;
  name: string;
  events_count: number;
  rehearsals_count: number;
  total_participations: number;
  individual_amount: number;
  winner: boolean;
};

type ExistingBonus = {
  id: string;
  reference_month: string;
  total_amount: number;
  paid: boolean;
  payment_date: string | null;
  notes: string | null;
};

type BonusAward = {
  id: string;
  musician_id: string;
  events_count: number;
  rehearsals_count: number;
  total_participations: number;
  individual_amount: number;
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

function primeiroDiaMes(valor: string) {
  return `${valor}-01`;
}

function ultimoDiaMes(valor: string) {
  const [ano, mes] = valor.split("-").map(Number);

  const ultimo = new Date(ano, mes, 0);

  return `${ultimo.getFullYear()}-${String(
    ultimo.getMonth() + 1
  ).padStart(2, "0")}-${String(
    ultimo.getDate()
  ).padStart(2, "0")}`;
}

function nomeMes(valor: string) {
  const [ano, mes] = valor.split("-").map(Number);

  const data = new Date(ano, mes - 1, 1);

  return data.toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
  });
}

export default function BonificacoesPage() {
  const agora = new Date();

  const mesAtual = `${agora.getFullYear()}-${String(
    agora.getMonth() + 1
  ).padStart(2, "0")}`;

  const [mesReferencia, setMesReferencia] =
    useState("2026-10");

  const [valorBonificacao, setValorBonificacao] =
    useState("");

  const [observacao, setObservacao] = useState("");

  const [musicos, setMusicos] = useState<Musician[]>([]);
  const [ranking, setRanking] = useState<Ranking[]>([]);

  const [bonusExistente, setBonusExistente] =
    useState<ExistingBonus | null>(null);

  const [premiacoes, setPremiacoes] = useState<
    BonusAward[]
  >([]);

  const [loading, setLoading] = useState(true);
  const [calculando, setCalculando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [pagando, setPagando] = useState(false);

  const [mensagem, setMensagem] = useState("");
  const [erro, setErro] = useState("");

  const inicioMes = useMemo(
    () => primeiroDiaMes(mesReferencia),
    [mesReferencia]
  );

  const fimMes = useMemo(
    () => ultimoDiaMes(mesReferencia),
    [mesReferencia]
  );

  async function carregarMusicos() {
    const { data, error } = await supabase
      .from("musicians")
      .select("id, name, active")
      .eq("active", true)
      .order("name");

    if (error) throw error;

    setMusicos(data || []);
  }

  async function carregarBonusExistente(): Promise<ExistingBonus | null> {
    const { data, error } = await supabase
      .from("monthly_bonuses")
      .select("*")
      .eq("reference_month", inicioMes)
      .maybeSingle();

    if (error) throw error;

    setBonusExistente(data || null);

    if (data) {
      setValorBonificacao(
        String(data.total_amount || 0)
      );

      setObservacao(data.notes || "");

      const { data: awards, error: awardsError } =
        await supabase
          .from("monthly_bonus_awards")
          .select("*")
          .eq("bonus_id", data.id)
          .order("individual_amount", {
            ascending: false,
          });

      if (awardsError) throw awardsError;

      setPremiacoes(awards || []);
    } else {
      setValorBonificacao("");
      setObservacao("");
      setPremiacoes([]);
    }

    return data || null;
  }

  async function calcularFrequencia(valorParaCalculo?: number) {
    if (mesReferencia < "2026-10") {
      setRanking([]);
      setMensagem("");
      setErro("A bonificação começa a partir de outubro de 2026.");
      return;
    }

    try {
      setCalculando(true);
      setErro("");
      setMensagem("");

      /*
       * =====================================================
       * EVENTOS REALIZADOS
       * =====================================================
       */

      const { data: eventos, error: eventosError } =
        await supabase
          .from("events")
          .select("id, event_date, status")
          .gte("event_date", inicioMes)
          .lte("event_date", fimMes)
          .eq("status", "realizado");

      if (eventosError) throw eventosError;

      const eventosRealizados = eventos || [];

      const contagemEventos: Record<string, number> =
        {};

      for (const evento of eventosRealizados) {
        const { data: participantes, error } =
          await supabase
            .from("event_musicians")
            .select("musician_id")
            .eq("event_id", evento.id);

        if (error) throw error;

        for (const participante of participantes || []) {
          contagemEventos[participante.musician_id] =
            (contagemEventos[
              participante.musician_id
            ] || 0) + 1;
        }
      }

      /*
       * =====================================================
       * ENSAIOS
       * =====================================================
       */

      const { data: ensaios, error: ensaiosError } =
        await supabase
          .from("rehearsals")
          .select("id, rehearsal_date")
          .gte("rehearsal_date", inicioMes)
          .lte("rehearsal_date", fimMes);

      if (ensaiosError) throw ensaiosError;

      const ensaiosIds = (ensaios || []).map(
        (item) => item.id
      );

      const contagemEnsaios: Record<string, number> =
        {};

      if (ensaiosIds.length > 0) {
        const {
          data: presencas,
          error: presencasError,
        } = await supabase
          .from("rehearsal_attendance")
          .select("musician_id, present")
          .in("rehearsal_id", ensaiosIds)
          .eq("present", true);

        if (presencasError) throw presencasError;

        for (const presenca of presencas || []) {
          contagemEnsaios[presenca.musician_id] =
            (contagemEnsaios[
              presenca.musician_id
            ] || 0) + 1;
        }
      }

      /*
       * =====================================================
       * RANKING
       * =====================================================
       */

      const rankingCalculado: Ranking[] = musicos
        .map((musico) => {
          const eventosCount =
            contagemEventos[musico.id] || 0;

          const ensaiosCount =
            contagemEnsaios[musico.id] || 0;

          return {
            musician_id: musico.id,
            name: musico.name,
            events_count: eventosCount,
            rehearsals_count: ensaiosCount,
            total_participations:
              eventosCount + ensaiosCount,
            individual_amount: 0,
            winner: false,
          };
        })
        .filter(
          (musico) =>
            musico.total_participations > 0
        )
        .sort((a, b) => {
          if (
            b.total_participations !==
            a.total_participations
          ) {
            return (
              b.total_participations -
              a.total_participations
            );
          }

          if (b.events_count !== a.events_count) {
            return (
              b.events_count - a.events_count
            );
          }

          return (
            b.rehearsals_count -
            a.rehearsals_count
          );
        });

      /*
       * =====================================================
       * DEFINIR VENCEDOR(ES)
       *
       * Critérios:
       * 1. Participações totais
       * 2. Eventos
       * 3. Ensaios
       * 4. Empate completo = divide
       * =====================================================
       */

      if (rankingCalculado.length > 0) {
        const primeiro = rankingCalculado[0];

        const vencedores = rankingCalculado.filter(
          (item) =>
            item.total_participations ===
              primeiro.total_participations &&
            item.events_count ===
              primeiro.events_count &&
            item.rehearsals_count ===
              primeiro.rehearsals_count
        );

        const valor =
          valorParaCalculo !== undefined
            ? Number(valorParaCalculo || 0)
            : Number(valorBonificacao || 0);

        const valorIndividual =
          vencedores.length > 0
            ? valor / vencedores.length
            : 0;

        for (const item of rankingCalculado) {
          const vencedor = vencedores.some(
            (v) =>
              v.musician_id === item.musician_id
          );

          item.winner = vencedor;

          item.individual_amount = vencedor
            ? valorIndividual
            : 0;
        }
      }

      setRanking(rankingCalculado);

      setMensagem("");
    } catch (error: any) {
      console.error(error);

      setErro(
        error.message ||
          "Erro ao calcular frequência."
      );
    } finally {
      setCalculando(false);
    }
  }

  function alterarValor(valor: string) {
    setValorBonificacao(valor);

    const numero = Number(valor || 0);

    if (ranking.length === 0) return;

    const vencedores = ranking.filter(
      (item) => item.winner
    );

    const valorIndividual =
      vencedores.length > 0
        ? numero / vencedores.length
        : 0;

    setRanking((atual) =>
      atual.map((item) => ({
        ...item,
        individual_amount: item.winner
          ? valorIndividual
          : 0,
      }))
    );
  }

  async function salvarBonificacao() {
    if (mesReferencia < "2026-10") {
      setErro("A bonificação começa a partir de outubro de 2026.");
      return;
    }

    const valor = Number(valorBonificacao || 0);

    if (valor <= 0) {
      setErro(
        "Informe um valor de bonificação maior que zero."
      );
      return;
    }

    if (ranking.length === 0) {
      setErro(
        "Calcule a frequência antes de salvar."
      );
      return;
    }

    if (bonusExistente?.paid) {
      setErro(
        "Esta bonificação já foi paga e não pode ser alterada."
      );
      return;
    }

    try {
      setSalvando(true);
      setErro("");
      setMensagem("");

      let bonusId = bonusExistente?.id;

      /*
       * CRIA OU ATUALIZA O MÊS
       */

      if (bonusId) {
        const { error } = await supabase
          .from("monthly_bonuses")
          .update({
            total_amount: valor,
            notes: observacao || null,
          })
          .eq("id", bonusId);

        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from("monthly_bonuses")
          .insert({
            reference_month: inicioMes,
            total_amount: valor,
            paid: false,
            notes: observacao || null,
          })
          .select()
          .single();

        if (error) throw error;

        bonusId = data.id;
      }

      /*
       * REMOVE PREMIAÇÕES ANTIGAS
       */

      const { error: deleteError } =
        await supabase
          .from("monthly_bonus_awards")
          .delete()
          .eq("bonus_id", bonusId);

      if (deleteError) throw deleteError;

      /*
       * SALVA SOMENTE OS VENCEDORES
       */

      const vencedores = ranking.filter(
        (item) => item.winner
      );

      if (vencedores.length > 0) {
        const linhas = vencedores.map((item) => ({
          bonus_id: bonusId,
          musician_id: item.musician_id,
          events_count: item.events_count,
          rehearsals_count:
            item.rehearsals_count,
          total_participations:
            item.total_participations,
          individual_amount:
            item.individual_amount,
        }));

        const { error: awardsError } =
          await supabase
            .from("monthly_bonus_awards")
            .insert(linhas);

        if (awardsError) throw awardsError;
      }

      await carregarBonusExistente();

      setMensagem(
        "Bonificação mensal salva com sucesso."
      );
    } catch (error: any) {
      console.error(error);

      setErro(
        error.message ||
          "Erro ao salvar bonificação."
      );
    } finally {
      setSalvando(false);
    }
  }

  async function pagarBonificacao() {
    if (!bonusExistente) {
      setErro(
        "Salve a bonificação antes de realizar o pagamento."
      );
      return;
    }

    if (bonusExistente.paid) {
      return;
    }

    const valor = Number(
      bonusExistente.total_amount || 0
    );

    if (valor <= 0) {
      setErro(
        "A bonificação não possui valor."
      );
      return;
    }

    const vencedores = premiacoes.filter(
      (item) =>
        Number(item.individual_amount || 0) > 0
    );

    if (vencedores.length === 0) {
      setErro(
        "Não há músicos premiados nesta bonificação."
      );
      return;
    }

    const confirmar = window.confirm(
      `Confirmar pagamento da bonificação de ${moeda(
        valor
      )} referente a ${nomeMes(
        mesReferencia
      )}?\n\nEsse valor será lançado como saída do Caixa do Grupo.`
    );

    if (!confirmar) return;

    try {
      setPagando(true);
      setErro("");
      setMensagem("");

      const hoje = new Date();

      const dataPagamento = `${hoje.getFullYear()}-${String(
        hoje.getMonth() + 1
      ).padStart(2, "0")}-${String(
        hoje.getDate()
      ).padStart(2, "0")}`;

      const { error } = await supabase
        .from("monthly_bonuses")
        .update({
          paid: true,
          payment_date: dataPagamento,
        })
        .eq("id", bonusExistente.id);

      if (error) throw error;

      await carregarBonusExistente();

      setMensagem(
        "Bonificação paga e lançada automaticamente no Caixa do Grupo."
      );
    } catch (error: any) {
      console.error(error);

      setErro(
        error.message ||
          "Erro ao pagar bonificação."
      );
    } finally {
      setPagando(false);
    }
  }

  async function carregarTudo() {
    try {
      setLoading(true);
      setErro("");

      await carregarMusicos();
    } catch (error: any) {
      console.error(error);

      setErro(
        error.message ||
          "Erro ao carregar músicos."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    carregarTudo();
  }, []);

  useEffect(() => {
    if (loading || musicos.length === 0) return;

    let cancelado = false;

    async function carregarMes() {
      try {
        setErro("");
        setMensagem("");

        const bonus = await carregarBonusExistente();

        if (cancelado) return;

        await calcularFrequencia(
          bonus ? Number(bonus.total_amount || 0) : 0
        );
      } catch (error: any) {
        if (cancelado) return;

        console.error(error);

        setErro(
          error.message ||
            "Erro ao carregar a bonificação e calcular a frequência."
        );
      }
    }

    carregarMes();

    return () => {
      cancelado = true;
    };
  }, [mesReferencia, loading, musicos.length]);

  return (
    <main className="min-h-screen bg-slate-100 p-6 text-slate-800">
      <div className="mx-auto max-w-7xl">

        {/* HEADER */}

        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">

          <div>
            <p className="text-sm font-semibold text-slate-500">
              VIROMANIA GESTÃO
            </p>

            <h1 className="mt-1 text-3xl font-bold">
              Bonificação mensal
            </h1>

            <p className="mt-2 text-sm text-slate-500">
              Frequência de eventos + ensaios para
              definição da bonificação.
            </p>
          </div>

          <a
            href="/"
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold"
          >
            Voltar ao início
          </a>

        </div>

        {/* MENSAGENS */}

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
            Carregando...
          </div>
        ) : (
          <>
            {/* CONFIGURAÇÃO */}

            <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                A bonificação começa a valer a partir de <strong>outubro de 2026</strong>. Setembro de 2026 não será considerado para pagamento.
              </div>

              <section className="mb-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">

              <h2 className="text-xl font-bold">
                Bonificação do mês
              </h2>

              <div className="mt-5 grid gap-4 md:grid-cols-3">

                <div>
                  <label className="mb-1 block text-sm font-semibold">
                    Mês de referência
                  </label>

                  <input
                    type="month"
                    value={mesReferencia}
                    onChange={(e) =>
                      setMesReferencia(
                        e.target.value
                      )
                    }
                    disabled={bonusExistente?.paid}
                    className="w-full rounded-lg border border-slate-300 px-3 py-3 disabled:bg-slate-100"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-semibold">
                    Valor total da bonificação
                  </label>

                  <input
                    type="number"
                    step="0.01"
                    value={valorBonificacao}
                    onChange={(e) =>
                      alterarValor(
                        e.target.value
                      )
                    }
                    disabled={bonusExistente?.paid}
                    placeholder="Ex.: 500"
                    className="w-full rounded-lg border border-slate-300 px-3 py-3 disabled:bg-slate-100"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-semibold">
                    Observação
                  </label>

                  <input
                    value={observacao}
                    onChange={(e) =>
                      setObservacao(
                        e.target.value
                      )
                    }
                    disabled={bonusExistente?.paid}
                    placeholder="Observação opcional"
                    className="w-full rounded-lg border border-slate-300 px-3 py-3 disabled:bg-slate-100"
                  />
                </div>

              </div>

              {bonusExistente?.paid && (
                <div className="mt-5 rounded-lg border border-green-200 bg-green-50 p-4">

                  <p className="font-bold text-green-700">
                    ✓ Bonificação paga
                  </p>

                  <p className="mt-1 text-sm text-green-700">
                    Pagamento realizado em{" "}
                    {dataBR(
                      bonusExistente.payment_date
                    )}
                    .
                  </p>

                  <p className="mt-1 text-sm text-green-700">
                    Valor retirado do Caixa do Grupo:{" "}
                    <strong>
                      {moeda(
                        bonusExistente.total_amount
                      )}
                    </strong>
                  </p>

                </div>
              )}

              {!bonusExistente?.paid && (
                <div className="mt-5 flex flex-wrap gap-3">

                  <button
                    onClick={() => calcularFrequencia(Number(valorBonificacao || 0))}
                    disabled={calculando}
                    className="rounded-lg bg-slate-900 px-5 py-3 font-bold text-white disabled:opacity-50"
                  >
                    {calculando
                      ? "Calculando..."
                      : "Recalcular frequência"}
                  </button>

                  <button
                    onClick={salvarBonificacao}
                    disabled={
                      salvando ||
                      ranking.length === 0
                    }
                    className="rounded-lg bg-blue-600 px-5 py-3 font-bold text-white disabled:opacity-50"
                  >
                    {salvando
                      ? "Salvando..."
                      : "Salvar bonificação"}
                  </button>

                </div>
              )}

            </section>

            {/* EXPLICAÇÃO */}

            <section className="mb-6 rounded-xl border border-blue-100 bg-blue-50 p-5">

              <h2 className="font-bold text-blue-900">
                Como o sistema calcula
              </h2>

              <div className="mt-3 space-y-1 text-sm text-blue-800">

                <p>
                  <strong>1.</strong> Conta os eventos
                  realizados em que o músico participou.
                </p>

                <p>
                  <strong>2.</strong> Soma os ensaios em
                  que o músico esteve presente.
                </p>

                <p>
                  <strong>3.</strong> O maior total de
                  participações recebe a bonificação.
                </p>

                <p>
                  <strong>4.</strong> Empate → mais
                  eventos realizados.
                </p>

                <p>
                  <strong>5.</strong> Persistindo o empate
                  → mais ensaios.
                </p>

                <p>
                  <strong>6.</strong> Empate completo →
                  divide igualmente.
                </p>

                <p>
                  <strong>7.</strong> O ranking é calculado quando você clicar em <strong>Recalcular frequência</strong>.
                </p>

              </div>

            </section>

            {/* RANKING */}

            <section className="mb-6 rounded-xl border border-slate-200 bg-white shadow-sm">

              <div className="border-b border-slate-200 p-5">

                <div className="flex flex-wrap items-center justify-between gap-4">

                  <div>
                    <h2 className="text-xl font-bold">
                      Frequência —{" "}
                      {nomeMes(mesReferencia)}
                    </h2>

                    <p className="mt-1 text-sm text-slate-500">
                      Eventos realizados + ensaios
                      frequentados.
                    </p>
                  </div>

                  {ranking.length > 0 && (
                    <div className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-bold">
                      {ranking.filter(
                        (item) => item.winner
                      ).length}{" "}
                      premiado(s)
                    </div>
                  )}

                </div>

              </div>

              {ranking.length === 0 ? (
                <div className="p-10 text-center text-slate-500">
                  <p>
                    Clique em <strong>Recalcular frequência</strong>
                    para calcular a frequência do mês.
                  </p>

                  {!calculando && (
                    <button
                      onClick={() =>
                        calcularFrequencia(
                          Number(valorBonificacao || 0)
                        )
                      }
                      className="mt-4 rounded-lg bg-slate-900 px-5 py-2 font-bold text-white"
                    >
                      Recalcular frequência
                    </button>
                  )}

                  {calculando && (
                    <p className="mt-3 text-sm font-semibold">
                      Calculando frequência...
                    </p>
                  )}
                </div>
              ) : (
                <div className="overflow-x-auto">

                  <table className="w-full text-sm">

                    <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">

                      <tr>

                        <th className="px-5 py-4">
                          Músico
                        </th>

                        <th className="px-5 py-4">
                          Eventos
                        </th>

                        <th className="px-5 py-4">
                          Ensaios
                        </th>

                        <th className="px-5 py-4">
                          Total
                        </th>

                        <th className="px-5 py-4">
                          Bonificação
                        </th>

                        <th className="px-5 py-4">
                          Situação
                        </th>

                      </tr>

                    </thead>

                    <tbody>

                      {ranking.map(
                        (item, index) => (
                          <tr
                            key={item.musician_id}
                            className={`border-t border-slate-100 ${
                              item.winner
                                ? "bg-green-50"
                                : ""
                            }`}
                          >

                            <td className="px-5 py-4">

                              <div className="font-bold">
                                {item.name}
                              </div>

                              {index === 0 && (
                                <div className="mt-1 text-xs text-slate-500">
                                  Maior frequência
                                </div>
                              )}

                            </td>

                            <td className="px-5 py-4">
                              {item.events_count}
                            </td>

                            <td className="px-5 py-4">
                              {item.rehearsals_count}
                            </td>

                            <td className="px-5 py-4">

                              <span className="rounded-full bg-slate-100 px-3 py-1 font-bold">
                                {
                                  item.total_participations
                                }
                              </span>

                            </td>

                            <td className="px-5 py-4 font-bold">

                              {item.individual_amount >
                              0
                                ? moeda(
                                    item.individual_amount
                                  )
                                : "-"}

                            </td>

                            <td className="px-5 py-4">

                              {item.winner ? (
                                <span className="rounded-full bg-green-600 px-3 py-1 text-xs font-bold text-white">
                                  🏆 Recebe
                                </span>
                              ) : (
                                <span className="text-xs text-slate-500">
                                  Sem bonificação
                                </span>
                              )}

                            </td>

                          </tr>
                        )
                      )}

                    </tbody>

                  </table>

                </div>
              )}

            </section>

            {/* RESUMO */}

            {ranking.length > 0 && (
              <section className="mb-6 grid gap-4 md:grid-cols-3">

                <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">

                  <p className="text-sm font-semibold text-slate-500">
                    Bonificação total
                  </p>

                  <p className="mt-2 text-2xl font-bold">
                    {moeda(
                      Number(
                        valorBonificacao || 0
                      )
                    )}
                  </p>

                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">

                  <p className="text-sm font-semibold text-slate-500">
                    Participações do líder
                  </p>

                  <p className="mt-2 text-2xl font-bold">
                    {ranking[0]
                      ?.total_participations || 0}
                  </p>

                </div>

                <div className="rounded-xl border border-green-200 bg-green-50 p-5">

                  <p className="text-sm font-semibold text-green-700">
                    Valor a pagar
                  </p>

                  <p className="mt-2 text-2xl font-bold text-green-800">
                    {moeda(
                      ranking.reduce(
                        (total, item) =>
                          total +
                          Number(
                            item.individual_amount ||
                              0
                          ),
                        0
                      )
                    )}
                  </p>

                </div>

              </section>
            )}

            {/* AÇÕES FINAIS */}

            {bonusExistente &&
              !bonusExistente.paid &&
              premiacoes.length > 0 && (
                <section className="mb-10 rounded-xl bg-slate-900 p-6 text-white shadow-sm">

                  <div className="flex flex-wrap items-center justify-between gap-5">

                    <div>

                      <h2 className="text-xl font-bold">
                        Pagamento da bonificação
                      </h2>

                      <p className="mt-2 text-sm text-slate-400">
                        Depois de pagar, o sistema
                        registrará automaticamente a
                        saída no Caixa do Grupo.
                      </p>

                    </div>

                    <button
                      onClick={pagarBonificacao}
                      disabled={pagando}
                      className="rounded-lg bg-green-600 px-6 py-3 font-bold text-white disabled:opacity-50"
                    >
                      {pagando
                        ? "Processando..."
                        : `Pagar ${moeda(
                            bonusExistente.total_amount
                          )}`}
                    </button>

                  </div>

                </section>
              )}

            {/* HISTÓRICO */}

            <section className="mb-10 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">

              <h2 className="text-xl font-bold">
                Histórico deste mês
              </h2>

              {premiacoes.length === 0 ? (
                <p className="mt-3 text-sm text-slate-500">
                  Nenhuma bonificação registrada
                  para este mês.
                </p>
              ) : (
                <div className="mt-4 space-y-3">

                  {premiacoes.map((premio) => {

                    const musico = musicos.find(
                      (item) =>
                        item.id ===
                        premio.musician_id
                    );

                    return (
                      <div
                        key={premio.id}
                        className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-slate-200 p-4"
                      >

                        <div>

                          <p className="font-bold">
                            {musico?.name ||
                              "Músico"}
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

                        <div className="text-right">

                          <p className="text-lg font-bold">
                            {moeda(
                              premio.individual_amount
                            )}
                          </p>

                          <p
                            className={`text-xs font-semibold ${
                              bonusExistente?.paid
                                ? "text-green-600"
                                : "text-yellow-600"
                            }`}
                          >
                            {bonusExistente?.paid
                              ? "Pago"
                              : "Pendente"}
                          </p>

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