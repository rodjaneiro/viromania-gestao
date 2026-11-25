"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { semDuplicadosAutomaticos } from "@/lib/caixa";
import { pagarBonificacoesDaSemana } from "@/lib/bonus";
import {
  inicioDaSemana,
  fimDaSemana,
  quintaDaSemana,
  semanaParaFechar,
  diaAnteriorISO,
} from "@/lib/semana";
import {
  ehDesconto,
  montarNotas,
  textoSemTag,
  descreverAjuste,
  ajustesDaPessoa,
  somaAjustes,
  detalharPagamento,
  type TipoAjuste,
} from "@/lib/despesas";

type Evento = {
  id: string;
  name: string;
  event_date: string;
  location: string | null;
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
  expected_receipt_date: string | null;
  actual_receipt_date: string | null;
};

type MusicoEvento = {
  id: string;
  event_id: string;
  musician_id: string;
  musician_name: string;
  event_cache: number;
  payment_status: "pendente" | "pago";
  payment_date: string | null;
};

type Despesa = {
  id: string;
  event_id: string;
  description: string;
  amount: number;
  payment_date: string | null;
  notes: string | null;
};

type Recebimento = {
  id: string;
  event_revenue_id: string;
  description: string;
  expected_amount: number;
  actual_amount: number;
  actual_receipt_date: string | null;
  status: string;
  notes: string | null;
};

type Musico = {
  id: string;
  name: string;
  active: boolean;
  cache?: number;
};

type Presenca = {
  id?: string;
  rehearsal_id: string;
  musician_id: string;
  present: boolean;
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

function dataISO(date: Date) {
  const ano = date.getFullYear();
  const mes = String(date.getMonth() + 1).padStart(2, "0");
  const dia = String(date.getDate()).padStart(2, "0");

  return `${ano}-${mes}-${dia}`;
}

function isSinal(descricao: string) {
  const d = String(descricao || "").trim().toLowerCase();
  return d === "sinal" || d.startsWith("sinal ");
}

function numeroBR(valor: string) {
  const s = String(valor || "").trim();
  if (!s) return 0;
  const n = Number(s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s);
  return Number.isFinite(n) ? n : 0;
}

export default function FechamentoPage() {
  const hoje = new Date();

  const [semanaReferencia, setSemanaReferencia] = useState(
    semanaParaFechar()
  );

  const [eventos, setEventos] = useState<Evento[]>([]);
  const [receitas, setReceitas] = useState<Receita[]>([]);
  const [recebimentos, setRecebimentos] = useState<Recebimento[]>([]);
  // Valor recebido no fechamento (o restante, sem o sinal), por receita
  const [valoresFechamento, setValoresFechamento] = useState<Record<string, string>>({});
  // Cópias repetidas geradas pela sincronização antiga (apagadas ao salvar)
  const [duplicados, setDuplicados] = useState<Recebimento[]>([]);
  const [musicosEventos, setMusicosEventos] = useState<MusicoEvento[]>([]);
  const [musicosEventosOriginais, setMusicosEventosOriginais] = useState<MusicoEvento[]>([]);
  const [musicosEventosRemovidos, setMusicosEventosRemovidos] = useState<string[]>([]);
  const [despesas, setDespesas] = useState<Despesa[]>([]);
  const [despesasOriginais, setDespesasOriginais] = useState<Despesa[]>([]);
  const [musicos, setMusicos] = useState<Musico[]>([]);
  const [eventoAdicionandoMusico, setEventoAdicionandoMusico] = useState<string | null>(null);
  const [musicoSelecionadoId, setMusicoSelecionadoId] = useState("");
  const [cacheMusicoNovo, setCacheMusicoNovo] = useState("");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [mensagem, setMensagem] = useState("");
  const [rodrigoPago, setRodrigoPago] = useState(false);
  const [marlonPago, setMarlonPago] = useState(false);
  const [erro, setErro] = useState("");

  // ENSAIO
  const [teveEnsaio, setTeveEnsaio] = useState(false);
  const [rehearsalId, setRehearsalId] = useState<string | null>(
    null
  );
  const [presencas, setPresencas] = useState<Presenca[]>([]);

  // DESPESA
  const [eventoDespesa, setEventoDespesa] = useState("");
  const [descricaoDespesa, setDescricaoDespesa] = useState("");
  // Quem recebe o valor da despesa: "outro" (sai do caixa), "rodrigo",
  // "marlon", "socios" (metade cada) ou "musico:<id>" (músico do evento)
  const [tipoDespesa, setTipoDespesa] = useState<TipoAjuste>("reembolso");
  // Pessoas marcadas e o valor de cada uma.
  // Chaves: "outro" (posto/fornecedor), "rodrigo", "marlon" ou id do músico.
  const [pessoasDespesa, setPessoasDespesa] = useState<Record<string, string>>({});

  // Fechamento já gravado desta semana (pode ser um antigo, de segunda a domingo)
  const [fechamentoId, setFechamentoId] = useState<string | null>(null);
  const [rodrigoPagoData, setRodrigoPagoData] = useState<string | null>(null);
  const [marlonPagoData, setMarlonPagoData] = useState<string | null>(null);
  const [salvandoDespesa, setSalvandoDespesa] = useState(false);

  // Semana de terça (inicio) a segunda (fim)
  const segunda = useMemo(
    () =>
      inicioDaSemana(
        new Date(`${semanaReferencia}T12:00:00`)
      ),
    [semanaReferencia]
  );

  const domingo = useMemo(
    () => fimDaSemana(segunda),
    [segunda]
  );

  const quinta = useMemo(
    () => quintaDaSemana(segunda),
    [segunda]
  );

  const semanaInicio = dataISO(segunda);
  const semanaFim = dataISO(domingo);
  const dataEnsaio = dataISO(quinta);

  async function carregarMusicos() {
    const { data, error } = await supabase
      .from("musicians")
      .select("id, name, active, cache")
      .eq("active", true)
      .order("name");

    if (error) {
      throw error;
    }

    setMusicos(data || []);
  }

  async function carregarSemana() {
    try {
      setLoading(true);
      setErro("");
      setMensagem("");

      const { data: eventosData, error: eventosError } =
        await supabase
          .from("events")
          .select("*")
          .gte("event_date", semanaInicio)
          .lte("event_date", semanaFim)
          .order("event_date");

      if (eventosError) throw eventosError;

      const eventosLista = eventosData || [];

      setEventos(eventosLista);

      const idsEventos = eventosLista.map((item) => item.id);

      if (idsEventos.length > 0) {
        const { data: receitasData, error: receitasError } =
          await supabase
            .from("event_revenues")
            .select("*")
            .in("event_id", idsEventos)
            .order("created_at");

        if (receitasError) throw receitasError;

        setReceitas(
          (receitasData || []).map((item) => ({
            ...item,
            expected_amount: Number(
              item.expected_amount || 0
            ),
            actual_amount: Number(
              item.actual_amount || 0
            ),
          }))
        );

        const receitaIds = (receitasData || []).map((item) => item.id);
        if (receitaIds.length > 0) {
          const { data: recebimentosData, error: recebimentosError } =
            await supabase
              .from("event_revenue_receipts")
              .select("id,event_revenue_id,description,expected_amount,actual_amount,actual_receipt_date,status,notes")
              .in("event_revenue_id", receitaIds);

          if (recebimentosError) throw recebimentosError;

          const recebimentosBrutos: Recebimento[] = (recebimentosData || []).map((item: any) => ({
            id: String(item.id),
            event_revenue_id: String(item.event_revenue_id),
            description: String(item.description || ""),
            expected_amount: Number(item.expected_amount || 0),
            actual_amount: Number(item.actual_amount || 0),
            actual_receipt_date: item.actual_receipt_date || null,
            status: item.status || "pendente",
            notes: item.notes || null,
          }));

          const recebimentosLista = semDuplicadosAutomaticos(recebimentosBrutos);
          const idsValidos = new Set(recebimentosLista.map((p) => p.id));
          setDuplicados(recebimentosBrutos.filter((p) => !idsValidos.has(p.id)));
          setRecebimentos(recebimentosLista);

          // Valor já lançado no fechamento = recebimentos (sem sinal) já recebidos
          const iniciais: Record<string, string> = {};
          for (const receita of receitasData || []) {
            const parcelas = recebimentosLista.filter(
              (p) => p.event_revenue_id === String(receita.id)
            );
            const semSinal = parcelas
              .filter((p) => p.status === "recebido" && !isSinal(p.description))
              .reduce((s, p) => s + p.actual_amount, 0);
            const sinal = parcelas
              .filter((p) => p.status === "recebido" && isSinal(p.description))
              .reduce((s, p) => s + p.actual_amount, 0);

            let valor = semSinal;
            // Receita antiga marcada como recebida cujo restante só ficou
            // gravado no total da receita (sem parcela recebida)
            const temRestanteRecebido = parcelas.some(
              (p) => p.status === "recebido" && !isSinal(p.description)
            );
            if (receita.status === "recebido" && !temRestanteRecebido) {
              valor = Math.max(Number(receita.actual_amount || 0) - sinal, 0);
            }

            iniciais[String(receita.id)] = valor > 0 ? String(valor) : "";
          }
          setValoresFechamento(iniciais);
        } else {
          setRecebimentos([]);
          setDuplicados([]);
          setValoresFechamento({});
        }

        const {
          data: participantes,
          error: participantesError,
        } = await supabase
          .from("event_musicians")
          .select(
            `
              id,
              event_id,
              musician_id,
              event_cache,
              payment_status,
              payment_date,
              musicians (
                name
              )
            `
          )
          .in("event_id", idsEventos);

        if (participantesError) throw participantesError;

        const musicosCarregados = (participantes || []).map((item: any) => ({
          id: item.id,
          event_id: item.event_id,
          musician_id: item.musician_id,
          musician_name: item.musicians?.name || "Músico",
          event_cache: Number(item.event_cache || 0),
          payment_status: item.payment_status || "pendente",
          payment_date: item.payment_date || null,
        }));

        setMusicosEventos(musicosCarregados);
        setMusicosEventosOriginais(musicosCarregados);
        setMusicosEventosRemovidos([]);

        const { data: despesasData, error: despesasError } =
          await supabase
            .from("event_expenses")
            .select("*")
            .in("event_id", idsEventos)
            .order("created_at");

        if (despesasError) throw despesasError;

        const despesasCarregadas = (despesasData || []).map((item) => ({
          ...item,
          amount: Number(item.amount || 0),
        }));

        setDespesas(despesasCarregadas);
        setDespesasOriginais(despesasCarregadas);
      } else {
        setReceitas([]);
        setMusicosEventos([]);
        setMusicosEventosOriginais([]);
        setMusicosEventosRemovidos([]);
        setDespesas([]);
        setDespesasOriginais([]);
      }

      await carregarEnsaio();
    } catch (error: any) {
      console.error(error);

      setErro(
        error.message || "Erro ao carregar o fechamento."
      );
    } finally {
      setLoading(false);
    }
  }

  async function carregarEnsaio() {
    const { data: ensaio, error: ensaioError } =
      await supabase
        .from("rehearsals")
        .select("*")
        .eq("rehearsal_date", dataEnsaio)
        .maybeSingle();

    if (ensaioError) {
      throw ensaioError;
    }

    if (!ensaio) {
      setRehearsalId(null);
      setTeveEnsaio(false);
      setPresencas([]);
      return;
    }

    setRehearsalId(ensaio.id);
    setTeveEnsaio(true);

    const { data: presencasData, error } =
      await supabase
        .from("rehearsal_attendance")
        .select("*")
        .eq("rehearsal_id", ensaio.id);

    if (error) {
      throw error;
    }

    setPresencas(presencasData || []);
  }

  useEffect(() => {
    carregarMusicos().catch((error) => {
      console.error(error);
      setErro(
        error.message || "Erro ao carregar músicos."
      );
    });
  }, []);

  useEffect(() => {
    carregarSemana();
  }, [semanaInicio, semanaFim, dataEnsaio]);


  const [recarregarStatus, setRecarregarStatus] = useState(0);

  useEffect(() => {
    async function carregarStatusDistribuicao() {
      // Procura o fechamento desta semana (terça a segunda) ou o antigo
      // equivalente, que começava na segunda-feira anterior.
      const { data: lista, error } = await supabase
        .from("weekly_closings")
        .select("id,week_start,rodrigo_paid,marlon_paid,rodrigo_payment_date,marlon_payment_date")
        .in("week_start", [semanaInicio, diaAnteriorISO(semanaInicio)]);

      if (error) {
        console.error(error);
        return;
      }

      const data =
        (lista || []).find((f: any) => f.week_start === semanaInicio) ||
        (lista || [])[0] ||
        null;

      setFechamentoId(data?.id ? String(data.id) : null);
      setRodrigoPago(Boolean(data?.rodrigo_paid));
      setMarlonPago(Boolean(data?.marlon_paid));
      setRodrigoPagoData(data?.rodrigo_payment_date || null);
      setMarlonPagoData(data?.marlon_payment_date || null);
    }

    carregarStatusDistribuicao();
  }, [semanaInicio, semanaFim, recarregarStatus]);

  function mudarSemana(direcao: number) {
    const novaData = new Date(
      `${semanaReferencia}T12:00:00`
    );

    novaData.setDate(
      novaData.getDate() + direcao * 7
    );

    setSemanaReferencia(dataISO(novaData));
  }

  function voltarSemanaAtual() {
    setSemanaReferencia(semanaParaFechar());
  }

  function marcarEvento(
    evento: Evento,
    status: "realizado" | "nao_realizado"
  ) {
    setEventos((atual) =>
      atual.map((item) =>
        item.id === evento.id ? { ...item, status } : item
      )
    );
    setMensagem('Status alterado. Clique em "Salvar fechamento da semana" para gravar.');
  }

  function atualizarReceita(
    receita: Receita,
    campo: "confirmed" | "recebido" | "pendente" | "cancelado"
  ) {
    const update: Partial<Receita> = {};

    if (campo === "confirmed") {
      update.confirmed = !receita.confirmed;
      update.status = !receita.confirmed ? "pendente" : receita.status;
    } else if (campo === "recebido") {
      update.status = "recebido";
      update.actual_receipt_date = dataISO(new Date());
    } else if (campo === "pendente") {
      update.status = "pendente";
      update.actual_receipt_date = null;
    } else {
      update.status = "cancelado";
      update.confirmed = false;
      update.actual_amount = 0;
      update.actual_receipt_date = null;
    }

    setReceitas((atual) =>
      atual.map((item) =>
        item.id === receita.id ? { ...item, ...update } : item
      )
    );
    setMensagem('Receita alterada. Clique em "Salvar fechamento da semana" para gravar.');
  }

  function alterarValorReceita(receita: Receita, valor: string) {
    setValoresFechamento((atual) => ({ ...atual, [receita.id]: valor }));

    // Digitou um valor: considera recebido
    if (numeroBR(valor) > 0 && receita.status !== "recebido") {
      setReceitas((atual) =>
        atual.map((item) =>
          item.id === receita.id
            ? {
                ...item,
                status: "recebido",
                actual_receipt_date: item.actual_receipt_date || dataISO(new Date()),
              }
            : item
        )
      );
    }

    setMensagem('Valor alterado. Clique em "Salvar fechamento da semana" para gravar.');
  }

  // Sinal já recebido (entrou no caixa na data do pagamento)
  function sinalDaReceita(receitaId: string) {
    return recebimentos
      .filter(
        (p) =>
          p.event_revenue_id === receitaId &&
          p.status === "recebido" &&
          isSinal(p.description)
      )
      .reduce((s, p) => s + p.actual_amount, 0);
  }

  // Valor recebido no fechamento (sem o sinal)
  function restoDaReceita(receita: Receita) {
    if (receita.status !== "recebido") return 0;
    return numeroBR(valoresFechamento[receita.id] || "");
  }

  // Total realmente recebido pela receita = sinal + recebido no fechamento
  function recebidoDaReceita(receita: Receita) {
    return sinalDaReceita(receita.id) + restoDaReceita(receita);
  }

  function alterarPagamento(participante: MusicoEvento) {
    const novoStatus =
      participante.payment_status === "pago" ? "pendente" : "pago";

    setMusicosEventos((atual) =>
      atual.map((item) =>
        item.event_id === participante.event_id &&
        item.musician_id === participante.musician_id
          ? {
              ...item,
              payment_status: novoStatus,
              payment_date:
                novoStatus === "pago" ? dataISO(new Date()) : null,
            }
          : item
      )
    );

    setMensagem('Pagamento alterado. Clique em "Salvar fechamento da semana" para gravar.');
  }

  function adicionarMusicoAoEvento(evento: Evento) {
    if (!musicoSelecionadoId) {
      alert("Selecione o músico.");
      return;
    }

    const musico = musicos.find((item) => item.id === musicoSelecionadoId);
    if (!musico) return;

    if (
      musicosEventos.some(
        (item) =>
          item.event_id === evento.id &&
          item.musician_id === musico.id
      )
    ) {
      alert("Esse músico já está lançado neste evento.");
      return;
    }

    const cache = Number(cacheMusicoNovo || musico.cache || 0);
    if (cache <= 0) {
      alert("Informe o cachê do músico.");
      return;
    }

    setMusicosEventos((atual) => [
      ...atual,
      {
        id: "",
        event_id: evento.id,
        musician_id: musico.id,
        musician_name: musico.name,
        event_cache: cache,
        payment_status: "pendente",
        payment_date: null,
      },
    ]);

    setEventoAdicionandoMusico(null);
    setMusicoSelecionadoId("");
    setCacheMusicoNovo("");
    setMensagem('Músico adicionado. Clique em "Salvar fechamento da semana" para gravar.');
  }

  function removerMusicoDoEvento(participante: MusicoEvento) {
    if (participante.id) {
      setMusicosEventosRemovidos((atual) =>
        atual.includes(participante.id)
          ? atual
          : [...atual, participante.id]
      );
    }

    setMusicosEventos((atual) =>
      atual.filter(
        (item) =>
          !(
            item.event_id === participante.event_id &&
            item.musician_id === participante.musician_id
          )
      )
    );

    setMensagem('Músico removido. Clique em "Salvar fechamento da semana" para gravar.');
  }

  function salvarDespesa() {
    if (!eventoDespesa) {
      alert("Selecione o evento.");
      return;
    }
    if (!descricaoDespesa.trim()) {
      alert("Informe a descrição da despesa.");
      return;
    }

    const valores: { rodrigo?: number; marlon?: number; musicos: Record<string, number> } = {
      musicos: {},
    };
    let outro = 0;
    let total = 0;

    for (const [chave, texto] of Object.entries(pessoasDespesa)) {
      const v = numeroBR(texto);
      if (v <= 0) continue;
      total += v;
      if (chave === "outro") outro = v;
      else if (chave === "rodrigo") valores.rodrigo = v;
      else if (chave === "marlon") valores.marlon = v;
      else valores.musicos[chave] = v;
    }

    if (total <= 0) {
      alert("Marque quem recebe (ou de quem será descontado) e informe o valor.");
      return;
    }

    if (tipoDespesa === "desconto" && outro > 0) {
      alert("Desconto é sempre de uma pessoa do grupo.");
      return;
    }

    setDespesas((atual) => [
      ...atual,
      {
        id: `temp-${Date.now()}`,
        event_id: eventoDespesa,
        description: descricaoDespesa.trim(),
        amount: Math.round(total * 100) / 100,
        payment_date: dataISO(new Date()),
        notes: montarNotas(tipoDespesa, valores),
      },
    ]);

    setEventoDespesa("");
    setDescricaoDespesa("");
    setPessoasDespesa({});
    setMensagem(
      `${tipoDespesa === "desconto" ? "Desconto" : "Despesa"} adicionado. Clique em "Salvar fechamento da semana" para gravar.`
    );
  }

  function excluirDespesa(id: string) {
    setDespesas((atual) => atual.filter((item) => item.id !== id));
    setMensagem('Despesa removida. Clique em "Salvar fechamento da semana" para gravar.');
  }

  function marcarPresenca(musicianId: string) {
    if (!rehearsalId) return;

    setPresencas((atual) => {
      const existente = atual.find(
        (item) =>
          item.rehearsal_id === rehearsalId &&
          item.musician_id === musicianId
      );

      if (existente) {
        return atual.map((item) =>
          item.musician_id === musicianId
            ? { ...item, present: !item.present }
            : item
        );
      }

      return [
        ...atual,
        {
          rehearsal_id: rehearsalId,
          musician_id: musicianId,
          present: true,
        },
      ];
    });
  }

  function estaPresente(musicianId: string) {
    return presencas.some(
      (item) => item.musician_id === musicianId && item.present
    );
  }

  function alterarEnsaio(teve: boolean) {
    setTeveEnsaio(teve);

    if (teve) {
      if (!rehearsalId) setRehearsalId("temp-rehearsal");
      setMensagem('Ensaio marcado. Clique em "Salvar fechamento da semana" para gravar.');
    } else {
      setMensagem('Ensaio marcado como não realizado. Clique em "Salvar fechamento da semana" para gravar.');
    }
  }

  function salvarPresencas() {
    setMensagem('Presenças atualizadas. Clique em "Salvar fechamento da semana" para gravar.');
  }

  function adicionarMusicoAoEventoPlaceholder() {}

  /**
   * Grava o que foi recebido no fechamento.
   *
   * - O sinal (parcela "Sinal") não é alterado aqui: ele já entrou no
   *   caixa na data em que foi pago.
   * - O valor digitado em "Recebido no fechamento" vira UMA parcela
   *   "Saldo final" recebida. Parcelas pendentes ou repetidas (sem sinal)
   *   são substituídas, evitando valores em dobro.
   * - actual_amount da receita = sinal + recebido no fechamento.
   */
  async function salvarRecebimentoReceita(receita: Receita) {
    const parcelas = recebimentos.filter((p) => p.event_revenue_id === receita.id);
    const parcelasSemSinal = parcelas.filter((p) => !isSinal(p.description));
    const sinal = sinalDaReceita(receita.id);
    const resto = restoDaReceita(receita);

    // Remove cópias repetidas da sincronização antiga
    const idsDuplicados = duplicados
      .filter((p) => p.event_revenue_id === receita.id)
      .map((p) => p.id);
    if (idsDuplicados.length > 0) {
      const { error } = await supabase
        .from("event_revenue_receipts")
        .delete()
        .in("id", idsDuplicados);
      if (error) throw error;
    }

    if (receita.confirmed && receita.status === "recebido") {
      const recebidasSemSinal = parcelasSemSinal.filter((p) => p.status === "recebido");
      const somaAtual = recebidasSemSinal.reduce((s, p) => s + p.actual_amount, 0);
      const pendentes = parcelasSemSinal.filter((p) => p.status !== "recebido");
      const precisaReescrever =
        Math.abs(somaAtual - resto) > 0.009 || recebidasSemSinal.length > 1;

      const idsApagar = precisaReescrever
        ? parcelasSemSinal.map((p) => p.id)
        : pendentes.map((p) => p.id);

      if (idsApagar.length > 0) {
        const { error } = await supabase
          .from("event_revenue_receipts")
          .delete()
          .in("id", idsApagar);
        if (error) throw error;
      }

      if (precisaReescrever && resto > 0) {
        const dataRecebimento =
          recebidasSemSinal.map((p) => p.actual_receipt_date).filter(Boolean).sort().at(-1) ||
          dataISO(new Date());

        const { error } = await supabase.from("event_revenue_receipts").insert({
          event_revenue_id: receita.id,
          description: "Saldo final",
          expected_amount: resto,
          actual_amount: resto,
          expected_receipt_date: dataRecebimento,
          actual_receipt_date: dataRecebimento,
          status: "recebido",
          payment_method: null,
          notes: "Recebido no fechamento semanal",
        });
        if (error) throw error;
      }
    }

    const recebidoTotal =
      receita.confirmed && receita.status === "recebido" ? sinal + resto : sinal;

    const statusFinal =
      receita.status === "cancelado"
        ? "cancelado"
        : receita.status === "recebido"
          ? "recebido"
          : sinal > 0
            ? "parcial"
            : "pendente";

    const { error } = await supabase
      .from("event_revenues")
      .update({
        actual_amount: recebidoTotal,
        confirmed: receita.confirmed,
        status: statusFinal,
        actual_receipt_date:
          receita.status === "recebido" ? receita.actual_receipt_date : null,
      })
      .eq("id", receita.id);
    if (error) throw error;
  }

  async function salvarFechamento() {
    try {
      setSaving(true);
      setErro("");
      setMensagem("");

      for (const evento of eventos) {
        const { error } = await supabase
          .from("events")
          .update({ status: evento.status })
          .eq("id", evento.id);
        if (error) throw error;
      }

      for (const receita of receitas) {
        await salvarRecebimentoReceita(receita);
      }

      if (musicosEventosRemovidos.length > 0) {
        const { error } = await supabase
          .from("event_musicians")
          .delete()
          .in("id", musicosEventosRemovidos);
        if (error) throw error;
      }

      const originaisMap = new Map(
        musicosEventosOriginais.map((item) => [item.id, item])
      );

      for (const naTela of musicosEventos) {
        // Ao fechar a semana, os músicos dos eventos realizados são
        // considerados pagos na segunda-feira do fechamento (fim da semana).
        const realizado =
          eventos.find((e) => e.id === naTela.event_id)?.status === "realizado";

        const participante: MusicoEvento = realizado
          ? {
              ...naTela,
              payment_status: "pago",
              payment_date: naTela.payment_date || semanaFim,
            }
          : { ...naTela, payment_status: "pendente", payment_date: null };

        if (participante.id) {
          const original = originaisMap.get(participante.id);

          if (
            !original ||
            original.event_cache !== participante.event_cache ||
            original.payment_status !== participante.payment_status ||
            original.payment_date !== participante.payment_date
          ) {
            const { error } = await supabase
              .from("event_musicians")
              .update({
                event_cache: participante.event_cache,
                use_default_cache: false,
                payment_status: participante.payment_status,
                payment_date: participante.payment_date,
              })
              .eq("id", participante.id);
            if (error) throw error;
          }
        } else {
          const { error } = await supabase
            .from("event_musicians")
            .insert({
              event_id: participante.event_id,
              musician_id: participante.musician_id,
              event_cache: participante.event_cache,
              use_default_cache: false,
              payment_status: participante.payment_status,
              payment_date: participante.payment_date,
            });
          if (error) throw error;
        }
      }

      const originaisDespesas = new Set(
        despesasOriginais.map((item) => item.id)
      );

      for (const despesa of despesas) {
        if (!originaisDespesas.has(despesa.id)) {
          const { error } = await supabase
            .from("event_expenses")
            .insert({
              event_id: despesa.event_id,
              description: despesa.description,
              amount: despesa.amount,
              payment_date: despesa.payment_date,
              notes: despesa.notes,
            });
          if (error) throw error;
        }
      }

      const despesasAtuaisIds = new Set(despesas.map((item) => item.id));
      const despesasRemovidas = despesasOriginais
        .filter((item) => !despesasAtuaisIds.has(item.id))
        .map((item) => item.id);

      if (despesasRemovidas.length > 0) {
        const { error } = await supabase
          .from("event_expenses")
          .delete()
          .in("id", despesasRemovidas);
        if (error) throw error;
      }

      if (teveEnsaio) {
        let idEnsaio = rehearsalId;

        if (!idEnsaio || idEnsaio === "temp-rehearsal") {
          const { data, error } = await supabase
            .from("rehearsals")
            .insert({ rehearsal_date: dataEnsaio })
            .select()
            .single();
          if (error) throw error;
          idEnsaio = data.id;
        }

        const linhas = musicos.map((musico) => {
          const existente = presencas.find(
            (item) => item.musician_id === musico.id
          );
          return {
            rehearsal_id: idEnsaio,
            musician_id: musico.id,
            present: existente?.present || false,
          };
        });

        const { error } = await supabase
          .from("rehearsal_attendance")
          .upsert(linhas, {
            onConflict: "rehearsal_id,musician_id",
          });
        if (error) throw error;
      } else if (rehearsalId && rehearsalId !== "temp-rehearsal") {
        const { error } = await supabase
          .from("rehearsals")
          .delete()
          .eq("id", rehearsalId);
        if (error) throw error;
      }

      const dadosFechamento = {
            week_start: semanaInicio,
            week_end: semanaFim,
            total_expected: totalPrevisto,
            total_confirmed: totalConfirmado,
            total_received: totalRecebido,
            total_to_receive: totalAReceber,
            total_musicians: totalMusicos,
            total_other_expenses: totalDespesas,
            net_result: resultadoLiquido,
            // Valor da semana + reembolsos de despesas (ex.: gasolina)
            rodrigo_amount: rodrigoTotal,
            marlon_amount: marlonTotal,
            group_cash_amount: caixaGrupo,
            rodrigo_paid: rodrigoPago,
            marlon_paid: marlonPago,
            // Mantém a data original do pagamento ao salvar de novo
            rodrigo_payment_date: rodrigoPago ? rodrigoPagoData || dataISO(new Date()) : null,
            marlon_payment_date: marlonPago ? marlonPagoData || dataISO(new Date()) : null,
      };

      const { error } = fechamentoId
        ? await supabase
            .from("weekly_closings")
            .update(dadosFechamento)
            .eq("id", fechamentoId)
        : await supabase
            .from("weekly_closings")
            .upsert(dadosFechamento, { onConflict: "week_start,week_end" });

      if (error) throw error;

      // Última semana do mês: a bonificação mensal é paga junto
      await pagarBonificacoesDaSemana(semanaInicio, semanaFim, semanaFim);

      setRecarregarStatus((n) => n + 1);
      await carregarSemana();

      setMensagem(
        "Fechamento semanal salvo com sucesso."
      );

      window.setTimeout(() => {
        const resultado = document.getElementById("resultado-semana");

        if (!resultado) return;

        const posicao =
          resultado.getBoundingClientRect().top +
          window.scrollY -
          20;

        window.scrollTo({
          top: Math.max(0, posicao),
          behavior: "smooth",
        });
      }, 300);
    } catch (error: any) {
      console.error(error);

      setErro(
        error.message ||
          "Erro ao salvar fechamento."
      );
    } finally {
      setSaving(false);
    }
  }


  function pagarDistribuicao(
    tipo: "rodrigo" | "marlon"
  ) {
    const valor = tipo === "rodrigo" ? rodrigoTotal : marlonTotal;
    const jaPago = tipo === "rodrigo" ? rodrigoPago : marlonPago;

    if (jaPago) return;

    if (valor <= 0) {
      alert("Não há valor para pagar nesta distribuição.");
      return;
    }

    const nome = tipo === "rodrigo" ? "Rodrigo" : "Marlon";
    const confirmar = window.confirm(
      `Confirmar pagamento de ${nome} de ${moeda(valor)}?`
    );
    if (!confirmar) return;

    if (tipo === "rodrigo") {
      setRodrigoPago(true);
      setRodrigoPagoData(dataISO(new Date()));
    } else {
      setMarlonPago(true);
      setMarlonPagoData(dataISO(new Date()));
    }

    setMensagem(`Pagamento de ${nome} marcado. Clique em "Salvar fechamento da semana" para gravar.`);
  }

  const eventosRealizados = eventos.filter(
    (evento) => evento.status === "realizado"
  );

  /*
   * Regras do fechamento:
   * - Valor PREVISTO = valor cobrado pelo evento. É só referência,
   *   não entra em nenhum cálculo de resultado ou caixa.
   * - SINAL = parcela "Sinal" já recebida (entrou no caixa na data do pagamento).
   * - RECEBIDO NO FECHAMENTO = o restante que realmente foi recebido
   *   (pode ser menor ou maior que o previsto).
   * - RECEBIDO TOTAL = sinal + recebido no fechamento. É esse valor que
   *   forma o resultado da semana.
   */
  const receitasRealizadas = receitas.filter((receita) => {
    if (!receita.confirmed || receita.status === "cancelado") return false;
    const evento = eventos.find((item) => item.id === receita.event_id);
    return evento?.status === "realizado";
  });

  const totalPrevisto = receitasRealizadas.reduce(
    (total, receita) => total + Number(receita.expected_amount || 0),
    0
  );

  const totalSinais = receitasRealizadas.reduce(
    (total, receita) => total + sinalDaReceita(receita.id),
    0
  );

  const totalRecebido = receitasRealizadas.reduce(
    (total, receita) => total + recebidoDaReceita(receita),
    0
  );

  // Gravado em weekly_closings.total_confirmed
  const totalConfirmado = totalRecebido;

  // Receitas ainda não recebidas: falta o previsto menos o sinal
  const totalAReceber = receitasRealizadas
    .filter((receita) => receita.status !== "recebido")
    .reduce(
      (total, receita) =>
        total +
        Math.max(Number(receita.expected_amount || 0) - sinalDaReceita(receita.id), 0),
      0
    );

  const totalMusicos = useMemo(() => {
    return musicosEventos
      .filter((item) => {
        const evento = eventos.find(
          (evento) =>
            evento.id === item.event_id
        );

        return evento?.status === "realizado";
      })
      .reduce(
        (total, item) =>
          total + Number(item.event_cache || 0),
        0
      );
  }, [musicosEventos, eventos]);

  const totalDespesas = useMemo(() => {
    return despesas
      .filter((despesa) => {
        const evento = eventos.find(
          (evento) =>
            evento.id === despesa.event_id
        );

        return evento?.status === "realizado" && !ehDesconto(despesa.notes);
      })
      .reduce(
        (total, item) =>
          total + Number(item.amount || 0),
        0
      );
  }, [despesas, eventos]);

  // Descontos (consumo, empréstimo...) diminuem o que é pago às pessoas;
  // o dinheiro fica com o grupo.
  const totalDescontos = despesas
    .filter((despesa) => {
      const evento = eventos.find((e) => e.id === despesa.event_id);
      return evento?.status === "realizado" && ehDesconto(despesa.notes);
    })
    .reduce((total, item) => total + Number(item.amount || 0), 0);

  const resultadoLiquido =
    totalRecebido -
    totalMusicos -
    totalDespesas +
    totalDescontos;

  const rodrigo =
    resultadoLiquido > 0
      ? resultadoLiquido / 4
      : 0;

  const marlon =
    resultadoLiquido > 0
      ? resultadoLiquido / 4
      : 0;

  // Despesas pagas pelos sócios (ex.: gasolina) voltam para eles
  // junto com o pagamento da semana.
  const despesasRealizadas = despesas.filter((despesa) => {
    const evento = eventos.find((e) => e.id === despesa.event_id);
    return evento?.status === "realizado";
  });

  // Reembolsos (+) e descontos (−) de cada sócio
  const reembolsosRodrigo = ajustesDaPessoa(despesasRealizadas, "rodrigo");
  const reembolsosMarlon = ajustesDaPessoa(despesasRealizadas, "marlon");

  const rodrigoTotal = rodrigo + somaAjustes(reembolsosRodrigo);
  const marlonTotal = marlon + somaAjustes(reembolsosMarlon);

  function nomeMusico(id: string) {
    return (
      musicosEventos.find((m) => m.musician_id === id)?.musician_name ||
      musicos.find((m) => m.id === id)?.name ||
      "músico"
    );
  }

  // Reembolsos (+) e descontos (−) do músico lançados neste evento
  function reembolsosDoMusicoNoEvento(eventId: string, musicianId: string) {
    return ajustesDaPessoa(
      despesas.filter((d) => d.event_id === eventId),
      musicianId
    );
  }

  function detalheSocio(
    valorSemana: number,
    ajustes: { descricao: string; valor: number }[]
  ) {
    return detalharPagamento(valorSemana, "da semana", ajustes);
  }

  // Músicos que tocaram em algum evento desta semana
  const musicosDaSemana = new Set(musicosEventos.map((m) => m.musician_id));

  const caixaGrupo =
    resultadoLiquido > 0
      ? (resultadoLiquido / 4) * 2
      : 0;

  const presentes =
    musicos.filter((musico) =>
      estaPresente(musico.id)
    ).length;

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-100 p-3 sm:p-8">
        <div className="mx-auto max-w-7xl">
          <div className="rounded-xl bg-white p-5 text-center shadow-sm sm:p-10">
            Carregando fechamento...
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen overflow-x-hidden bg-slate-100 p-3 text-slate-800 sm:p-6">
      <div className="mx-auto max-w-7xl">

        {/* HEADER */}

        <div className="mb-4 flex flex-col items-stretch gap-3 sm:mb-6 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <div>
            <h1 className="text-2xl font-bold sm:text-3xl">
              Fechamento semanal
            </h1>

            <p className="mt-1 text-xs text-slate-500 sm:text-sm">
              Conferência dos eventos, músicos,
              despesas, ensaio e resultado da semana.
            </p>
          </div>

          <a
            href="/"
            className="hidden w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold sm:block sm:w-auto sm:px-4"
          >
            Voltar ao início
          </a>
        </div>

        {/* MENSAGENS */}

        {mensagem && (
          <div className="mb-4 rounded-lg border border-green-200 bg-green-50 p-3 text-xs font-semibold text-green-700 sm:mb-5 sm:p-4 sm:text-sm">
            {mensagem}
          </div>
        )}

        {erro && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-700 sm:mb-5 sm:p-4 sm:text-sm">
            {erro}
          </div>
        )}

        {/* SEMANA */}

        <section className="mb-4 rounded-xl border border-slate-200 bg-white p-2.5 shadow-sm sm:p-4">
          <div className="flex items-center justify-between gap-2 sm:gap-4">

            <button
              onClick={() => mudarSemana(-1)}
              title="Semana anterior"
              className="shrink-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold sm:px-4"
            >
              ←<span className="hidden sm:inline"> Semana anterior</span>
            </button>

            <div className="text-center">
              <p className="text-[11px] font-semibold leading-tight text-slate-500 sm:text-xs">
                Semana
              </p>

              <p className="text-base font-bold sm:text-xl">
                {dataBR(semanaInicio)} até{" "}
                {dataBR(semanaFim)}
              </p>

              <p className="text-[11px] leading-tight text-slate-500 sm:text-xs">
                Terça a segunda · fecha na segunda {dataBR(semanaFim)}
              </p>

              <button
                onClick={voltarSemanaAtual}
                className="mt-1 text-xs font-semibold text-blue-600"
              >
                Ir para a semana a fechar
              </button>
            </div>

            <button
              onClick={() => mudarSemana(1)}
              title="Próxima semana"
              className="shrink-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold sm:px-4"
            >
              <span className="hidden sm:inline">Próxima semana </span>→
            </button>

          </div>
        </section>

        {/* RESUMO */}

        <section className="mb-4 grid grid-cols-3 gap-2 sm:gap-3 lg:grid-cols-5">

          <Card
            titulo="Previsto (cobrado)"
            valor={moeda(totalPrevisto)}
          />

          <Card
            titulo={`Recebido${totalSinais > 0 ? ` (sinais ${moeda(totalSinais)})` : ""}`}
            valor={moeda(totalRecebido)}
          />

          <Card
            titulo="A receber"
            valor={moeda(totalAReceber)}
          />

          <Card
            titulo="Músicos"
            valor={moeda(totalMusicos)}
          />

          <Card
            titulo={totalDescontos > 0 ? `Despesas (descontos ${moeda(totalDescontos)})` : "Despesas"}
            valor={moeda(totalDespesas)}
          />

        </section>

        {/* RESULTADO */}

        <section id="resultado-semana" className="mb-4 rounded-xl bg-slate-900 p-3 text-white shadow-sm sm:p-4">

          <div className="mb-3">
            <p className="text-sm text-slate-400">
              Resultado líquido da semana
            </p>

            <p className="mt-1 text-2xl font-bold sm:text-3xl">
              {moeda(resultadoLiquido)}
            </p>

            <p className="mt-1 text-xs text-slate-400">
              Valor realmente recebido (sinal + restante) − cachês dos
              músicos − despesas dos eventos + descontos
            </p>
          </div>

          <div className="grid grid-cols-3 gap-2 sm:gap-3">

            <div className="rounded-xl bg-white/10 p-2.5 sm:p-3">
              <p className="text-[11px] leading-tight text-slate-300 sm:text-sm">
                Rodrigo — 1/4
              </p>

              <p className="mt-1 text-base sm:text-xl font-bold">
                {moeda(rodrigoTotal)}
              </p>
              {detalheSocio(rodrigo, reembolsosRodrigo) && (
                <p className="mt-1 text-[10px] leading-tight text-slate-300 sm:text-xs">
                  {detalheSocio(rodrigo, reembolsosRodrigo)}
                </p>
              )}
            </div>

            <div className="rounded-xl bg-white/10 p-2.5 sm:p-3">
              <p className="text-[11px] leading-tight text-slate-300 sm:text-sm">
                Marlon — 1/4
              </p>

              <p className="mt-1 text-base sm:text-xl font-bold">
                {moeda(marlonTotal)}
              </p>
              {detalheSocio(marlon, reembolsosMarlon) && (
                <p className="mt-1 text-[10px] leading-tight text-slate-300 sm:text-xs">
                  {detalheSocio(marlon, reembolsosMarlon)}
                </p>
              )}
            </div>

            <div className="rounded-xl bg-white/10 p-2.5 sm:p-3">
              <p className="text-[11px] leading-tight text-slate-300 sm:text-sm">
                Caixa do grupo — 2/4
              </p>

              <p className="mt-1 text-base sm:text-xl font-bold">
                {moeda(caixaGrupo)}
              </p>
            </div>

          </div>

          <div className="mt-4 border-t border-white/10 pt-4 text-xs text-slate-400 sm:mt-5 sm:pt-5 sm:text-sm">
            O resultado acima não inclui bonificação
            mensal. A bonificação é uma despesa separada
            do caixa do grupo no final do mês.
          </div>

        </section>



        {/* EVENTOS */}

        <section className="mb-4 rounded-xl border border-slate-200 bg-white shadow-sm sm:mb-6">

          <div className="border-b border-slate-200 p-3 sm:p-5">
            <h2 className="text-base font-bold sm:text-xl">
              Eventos da semana
            </h2>

            <p className="mt-1 text-xs text-slate-500 sm:text-sm">
              Confirme quais eventos realmente aconteceram
              e confira suas receitas.
            </p>
          </div>

          {eventos.length === 0 ? (
            <div className="p-8 text-center text-slate-500">
              Nenhum evento nesta semana.
            </div>
          ) : (
            <div className="space-y-3 p-3 sm:space-y-4 sm:p-5">

              {eventos.map((evento) => {

                const receitasEvento =
                  receitas.filter(
                    (receita) =>
                      receita.event_id === evento.id
                  );

                const musicosEvento =
                  musicosEventos.filter(
                    (musico) =>
                      musico.event_id === evento.id
                  );

                const despesasEvento =
                  despesas.filter(
                    (despesa) =>
                      despesa.event_id === evento.id
                  );

                const eventoLapa =
                  evento.name.toLowerCase().includes("lapa");

                const eventoMiami =
                  evento.name.toLowerCase().includes("miami");

                const cardEventoClass = eventoLapa
                  ? "border-blue-300 bg-blue-50/40"
                  : eventoMiami
                  ? "border-amber-300 bg-amber-50/40"
                  : "border-slate-200 bg-white";

                const cabecalhoEventoClass = eventoLapa
                  ? "border-b border-blue-200 bg-blue-100/80"
                  : eventoMiami
                  ? "border-b border-amber-200 bg-amber-100/80"
                  : "border-b border-slate-200 bg-slate-50";

                return (
                  <div
                    key={evento.id}
                    className={`overflow-hidden rounded-2xl border-2 shadow-sm ${cardEventoClass}`}
                  >

                    <div className={`flex flex-col items-stretch gap-3 p-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:p-5 ${cabecalhoEventoClass}`}>

                      <div className="flex items-center gap-2 sm:gap-4">
                        <div
                          className={`flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-lg border bg-white text-center shadow-sm sm:h-14 sm:w-14 sm:rounded-xl ${
                            eventoLapa
                              ? "border-blue-300 text-blue-800"
                              : eventoMiami
                              ? "border-amber-300 text-amber-800"
                              : "border-slate-300 text-slate-700"
                          }`}
                        >
                          <span className="text-[10px] font-bold uppercase">
                            {new Date(
                              `${evento.event_date}T12:00:00`
                            ).toLocaleDateString("pt-BR", {
                              weekday: "short",
                            }).replace(".", "")}
                          </span>
                          <span className="text-lg font-extrabold leading-5 sm:text-xl">
                            {evento.event_date.split("-")[2]}
                          </span>
                          <span className="text-[9px] font-semibold uppercase">
                            {new Date(
                              `${evento.event_date}T12:00:00`
                            ).toLocaleDateString("pt-BR", {
                              month: "short",
                            }).replace(".", "")}
                          </span>
                        </div>

                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-base font-extrabold text-slate-900 sm:text-lg">
                              {evento.name}
                            </h3>

                            <span
                              className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${
                                eventoLapa
                                  ? "bg-blue-200 text-blue-900"
                                  : eventoMiami
                                  ? "bg-amber-200 text-amber-900"
                                  : "bg-slate-200 text-slate-700"
                              }`}
                            >
                              Evento
                            </span>
                          </div>

                          <p className="mt-1 text-sm font-medium text-slate-600">
                            {evento.location || "Local não informado"}
                          </p>

                          <p className="mt-0.5 text-xs text-slate-500">
                            {dataBR(evento.event_date)}
                          </p>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2 sm:flex">

                        <button
                          onClick={() =>
                            marcarEvento(
                              evento,
                              "realizado"
                            )
                          }
                          className={`rounded-lg px-2 py-2 text-[11px] font-bold sm:px-3 sm:text-xs ${
                            evento.status ===
                            "realizado"
                              ? "bg-green-600 text-white"
                              : "bg-green-50 text-green-700"
                          }`}
                        >
                          ✓ Realizado
                        </button>

                        <button
                          onClick={() =>
                            marcarEvento(
                              evento,
                              "nao_realizado"
                            )
                          }
                          className={`rounded-lg px-2 py-2 text-[11px] font-bold sm:px-3 sm:text-xs ${
                            evento.status ===
                            "nao_realizado"
                              ? "bg-red-600 text-white"
                              : "bg-red-50 text-red-700"
                          }`}
                        >
                          Não realizado
                        </button>

                      </div>
                    </div>

                    <div className="border-b border-slate-200 bg-white px-2 pt-2 sm:px-4 sm:pt-3">
                      <div className="grid grid-cols-4 overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                        <a
                          href={`#receitas-${evento.id}`}
                          className="border-r border-slate-200 px-1 py-2 text-center text-[10px] font-bold text-slate-700 hover:bg-white sm:px-3 sm:py-3 sm:text-xs"
                        >
                          💰 Receitas
                        </a>
                        <a
                          href={`#musicos-${evento.id}`}
                          className="border-r border-slate-200 px-1 py-2 text-center text-[10px] font-bold text-slate-700 hover:bg-white sm:px-3 sm:py-3 sm:text-xs"
                        >
                          🎵 Músicos
                        </a>
                        <a
                          href={`#despesas-${evento.id}`}
                          className="border-r border-slate-200 px-1 py-2 text-center text-[10px] font-bold text-slate-700 hover:bg-white sm:px-3 sm:py-3 sm:text-xs"
                        >
                          🧾 Despesas
                        </a>
                        <a
                          href={`#resumo-${evento.id}`}
                          className="px-1 py-2 text-center text-[10px] font-bold text-slate-700 hover:bg-white sm:px-3 sm:py-3 sm:text-xs"
                        >
                          📊 Resumo
                        </a>
                      </div>
                    </div>

                    {evento.status ===
                      "nao_realizado" ? (
                      <div className="p-3 text-xs text-red-600 sm:p-5 sm:text-sm">
                        Este evento não entra no
                        resultado da semana.
                      </div>
                    ) : (
                      <div className="space-y-4 border-t border-white/70 bg-white/80 p-3 sm:space-y-5 sm:p-5">

                        {/* RECEITAS */}

                        <div id={`receitas-${evento.id}`}>
                          <div className="mb-3 flex flex-col items-stretch gap-2 sm:flex-row sm:items-end sm:justify-between sm:gap-3">
                            <div>
                              <h4 className="text-base font-extrabold text-slate-800">
                                Receitas do evento
                              </h4>
                              <p className="mt-1 text-xs text-slate-500">
                                Controle das entradas previstas e recebidas.
                              </p>
                            </div>

                            <div className="grid grid-cols-2 gap-2 sm:flex">
                              <div className="flex-1 rounded-lg bg-emerald-50 px-2 py-2 text-right sm:px-3">
                                <p className="text-[10px] font-bold uppercase text-emerald-600">
                                  Total previsto
                                </p>
                                <p className="font-extrabold text-emerald-700">
                                  {moeda(
                                    receitasEvento.reduce(
                                      (s, r) => s + Number(r.expected_amount || 0),
                                      0
                                    )
                                  )}
                                </p>
                              </div>

                              <div className="flex-1 rounded-lg bg-emerald-50 px-2 py-2 text-right sm:px-3">
                                <p className="text-[10px] font-bold uppercase text-emerald-600">
                                  Total recebido
                                </p>
                                <p className="font-extrabold text-emerald-700">
                                  {moeda(
                                    receitasEvento
                                      .filter((r) => r.confirmed && r.status !== "cancelado")
                                      .reduce((s, r) => s + recebidoDaReceita(r), 0)
                                  )}
                                </p>
                              </div>
                            </div>
                          </div>

                          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                            {receitasEvento.length === 0 ? (
                              <div className="p-5 text-sm text-slate-500">
                                Nenhuma receita cadastrada.
                              </div>
                            ) : (
                              <>
                                <div className="hidden grid-cols-[1.45fr_0.9fr_0.8fr_1.05fr_1fr_1fr] items-center gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 text-[10px] font-bold uppercase tracking-wide text-slate-500 lg:grid">
                                  <div>Descrição</div>
                                  <div>Valor previsto</div>
                                  <div>Sinal recebido</div>
                                  <div>Recebido no fechamento</div>
                                  <div>Aconteceu?</div>
                                  <div>Status</div>
                                </div>

                                <div className="divide-y divide-slate-100">
                                  {receitasEvento.map((receita) => (
                                    <div
                                      key={receita.id}
                                      className="p-3 hover:bg-slate-50/60 sm:p-4"
                                    >
                                      <div className="grid gap-2 sm:gap-4 lg:grid-cols-[1.45fr_0.9fr_0.8fr_1.05fr_1fr_1fr] lg:items-center lg:gap-3">
                                        <div>
                                          <p className="font-bold text-slate-800">
                                            {receita.description}
                                          </p>
                                          <p className="mt-1 text-xs text-slate-500">
                                            Receita do evento
                                          </p>
                                        </div>

                                        <div>
                                          <span className="mb-1 block text-[10px] font-bold uppercase text-slate-500 lg:hidden">
                                            Valor previsto
                                          </span>
                                          <p className="font-bold text-slate-800">
                                            {moeda(receita.expected_amount)}
                                          </p>
                                        </div>

                                        <div>
                                          <span className="mb-1 block text-[10px] font-bold uppercase text-slate-500 lg:hidden">
                                            Sinal recebido
                                          </span>
                                          <p className={`font-bold ${sinalDaReceita(receita.id) > 0 ? "text-emerald-700" : "text-slate-400"}`}>
                                            {sinalDaReceita(receita.id) > 0
                                              ? moeda(sinalDaReceita(receita.id))
                                              : "Sem sinal"}
                                          </p>
                                        </div>

                                        <div>
                                          <span className="mb-1 block text-[10px] font-bold uppercase text-slate-500 lg:hidden">
                                            Recebido no fechamento
                                          </span>
                                          <input
                                            type="number"
                                            step="0.01"
                                            value={valoresFechamento[receita.id] || ""}
                                            onChange={(e) =>
                                              alterarValorReceita(
                                                receita,
                                                e.target.value
                                              )
                                            }
                                            disabled={!receita.confirmed}
                                            placeholder={`Falta ${moeda(Math.max(receita.expected_amount - sinalDaReceita(receita.id), 0))}`}
                                            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold outline-none focus:border-blue-500 disabled:bg-slate-100"
                                          />
                                        </div>

                                        <div>
                                          <span className="mb-1 block text-[10px] font-bold uppercase text-slate-500 lg:hidden">
                                            Aconteceu?
                                          </span>
                                          <select
                                            value={
                                              receita.confirmed
                                                ? "aconteceu"
                                                : "nao_aconteceu"
                                            }
                                            onChange={() =>
                                              atualizarReceita(
                                                receita,
                                                "confirmed"
                                              )
                                            }
                                            className={`w-full rounded-lg border px-3 py-2 text-xs font-bold outline-none ${
                                              receita.confirmed
                                                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                                : "border-slate-200 bg-slate-100 text-slate-600"
                                            }`}
                                          >
                                            <option value="aconteceu">
                                              ✓ Aconteceu
                                            </option>
                                            <option value="nao_aconteceu">
                                              Não aconteceu
                                            </option>
                                          </select>
                                        </div>

                                        <div>
                                          <span className="mb-1 block text-[10px] font-bold uppercase text-slate-500 lg:hidden">
                                            Status
                                          </span>
                                          <select
                                            value={
                                              receita.status === "recebido"
                                                ? "recebido"
                                                : "pendente"
                                            }
                                            disabled={!receita.confirmed}
                                            onChange={(e) =>
                                              atualizarReceita(
                                                receita,
                                                e.target.value === "recebido"
                                                  ? "recebido"
                                                  : "pendente"
                                              )
                                            }
                                            className={`w-full rounded-lg border px-3 py-2 text-xs font-bold outline-none ${
                                              receita.status === "recebido"
                                                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                                : "border-amber-200 bg-amber-50 text-amber-800"
                                            }`}
                                          >
                                            <option value="recebido">
                                              ✓ Recebido
                                            </option>
                                            <option value="pendente">
                                              ◷ Pendente
                                            </option>
                                          </select>
                                        </div>

                                      </div>

                                      <div className="mt-2 rounded-lg bg-slate-50 px-2 py-2 text-[11px] text-slate-500 sm:mt-3 sm:px-3 sm:text-xs">
                                        {receita.confirmed
                                          ? receita.status === "recebido"
                                            ? `Total recebido: ${moeda(recebidoDaReceita(receita))}${
                                                sinalDaReceita(receita.id) > 0
                                                  ? ` (sinal ${moeda(sinalDaReceita(receita.id))} + fechamento ${moeda(restoDaReceita(receita))})`
                                                  : ""
                                              }. Entra no Caixa ao salvar o fechamento.`
                                            : sinalDaReceita(receita.id) > 0
                                              ? `Sinal de ${moeda(sinalDaReceita(receita.id))} já está no Caixa. Digite quanto recebeu do restante.`
                                              : "Digite em \"Recebido no fechamento\" quanto você realmente recebeu."
                                          : "Receita marcada como não acontecida. Não entra no resultado da semana."}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </>
                            )}
                          </div>
                        </div>

                        {/* MUSICOS */}

                        <div id={`musicos-${evento.id}`}>
                          <div className="mb-3 flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                            <div>
                              <h4 className="font-bold">Músicos</h4>
                              <p className="text-xs text-slate-500">
                                Lance aqui quem realmente tocou neste evento.
                              </p>
                            </div>

                            <button
                              type="button"
                              onClick={() => {
                                setEventoAdicionandoMusico(
                                  eventoAdicionandoMusico === evento.id
                                    ? null
                                    : evento.id
                                );
                                setMusicoSelecionadoId("");
                                setCacheMusicoNovo("");
                              }}
                              className="w-full rounded-lg bg-blue-100 px-3 py-2 text-xs font-bold text-blue-700 hover:bg-blue-200 sm:w-auto sm:px-4"
                            >
                              + Adicionar músico
                            </button>
                          </div>

                          {eventoAdicionandoMusico === evento.id && (
                            <div className="mb-4 rounded-xl border border-blue-200 bg-blue-50 p-3 sm:p-4">
                              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                                <div>
                                  <label className="mb-1 block text-xs font-bold uppercase text-slate-500">
                                    Músico
                                  </label>
                                  <select
                                    value={musicoSelecionadoId}
                                    onChange={(e) => {
                                      const id = e.target.value;
                                      setMusicoSelecionadoId(id);
                                      const musico = musicos.find(
                                        (item) => item.id === id
                                      );
                                      if (musico?.cache) {
                                        setCacheMusicoNovo(
                                          String(musico.cache)
                                        );
                                      }
                                    }}
                                    className="w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm sm:px-3"
                                  >
                                    <option value="">Selecione...</option>
                                    {musicos.map((musico) => (
                                      <option
                                        key={musico.id}
                                        value={musico.id}
                                      >
                                        {musico.name}
                                      </option>
                                    ))}
                                  </select>
                                </div>

                                <div>
                                  <label className="mb-1 block text-xs font-bold uppercase text-slate-500">
                                    Cachê deste evento
                                  </label>
                                  <input
                                    type="number"
                                    step="0.01"
                                    value={cacheMusicoNovo}
                                    onChange={(e) =>
                                      setCacheMusicoNovo(e.target.value)
                                    }
                                    className="w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm sm:px-3"
                                    placeholder="0,00"
                                  />
                                </div>

                                <div className="flex items-end gap-2">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      adicionarMusicoAoEvento(evento)
                                    }
                                    className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700"
                                  >
                                    Adicionar
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEventoAdicionandoMusico(null);
                                      setMusicoSelecionadoId("");
                                      setCacheMusicoNovo("");
                                    }}
                                    className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-slate-600"
                                  >
                                    Cancelar
                                  </button>
                                </div>
                              </div>
                            </div>
                          )}

                          {musicosEvento.length === 0 ? (
                            <div className="rounded-lg bg-slate-50 p-4 text-sm text-slate-500">
                              Nenhum músico lançado
                              neste evento.
                            </div>
                          ) : (
                            <div className="overflow-x-auto -mx-1 px-1">
                              <table className="w-full text-xs sm:text-sm">
                                <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                                  <tr>
                                    <th className="px-2 py-2 sm:px-3 sm:py-3">
                                      Músico
                                    </th>
                                    <th className="px-2 py-2 sm:px-3 sm:py-3">
                                      Cachê
                                    </th>
                                    <th className="hidden px-2 py-2 sm:table-cell sm:px-3 sm:py-3">
                                      Pagamento
                                    </th>
                                    <th className="px-2 py-2 text-right sm:px-3 sm:py-3 sm:text-left">
                                      <span className="sr-only sm:not-sr-only">Ação</span>
                                    </th>
                                  </tr>
                                </thead>

                                <tbody>
                                  {musicosEvento.map(
                                    (musico) => (
                                      <tr
                                        key={musico.id}
                                        className="border-t border-slate-100"
                                      >
                                        <td className="px-2 py-2 font-semibold sm:px-3 sm:py-3">
                                          {
                                            musico.musician_name
                                          }
                                          <span
                                            className={`mt-1 block w-fit rounded-full px-2 py-0.5 text-[10px] font-bold sm:hidden ${
                                              musico.payment_status === "pago"
                                                ? "bg-green-100 text-green-700"
                                                : "bg-yellow-100 text-yellow-700"
                                            }`}
                                          >
                                            {musico.payment_status === "pago" ? "Pago" : "Pago ao salvar"}
                                          </span>
                                        </td>

                                        <td className="px-2 py-2 sm:px-3 sm:py-3">
                                          {moeda(
                                            musico.event_cache
                                          )}
                                          {reembolsosDoMusicoNoEvento(musico.event_id, musico.musician_id).map((r, i) => (
                                            <span
                                              key={i}
                                              className={`block text-xs font-semibold ${r.valor >= 0 ? "text-amber-700" : "text-red-600"}`}
                                            >
                                              {r.valor >= 0 ? "+" : "−"} {moeda(Math.abs(r.valor))} de {r.descricao.toLowerCase()}
                                            </span>
                                          ))}
                                        </td>

                                        <td className="hidden px-2 py-2 sm:table-cell sm:px-3 sm:py-3">
                                          <span
                                            className={`rounded-full px-2 py-1 text-xs font-bold ${
                                              musico.payment_status ===
                                              "pago"
                                                ? "bg-green-100 text-green-700"
                                                : "bg-yellow-100 text-yellow-700"
                                            }`}
                                          >
                                            {musico.payment_status ===
                                            "pago"
                                              ? "Pago"
                                              : "Pago ao salvar"}
                                          </span>
                                        </td>

                                        <td className="px-2 py-2 text-right sm:px-3 sm:py-3 sm:text-left">
                                          <button
                                            onClick={() => removerMusicoDoEvento(musico)}
                                            title="Remover do evento"
                                            className="rounded-lg bg-red-50 px-2.5 py-2 text-xs font-bold text-red-700 sm:px-3"
                                          >
                                            <span className="sm:hidden">✕</span>
                                            <span className="hidden sm:inline">Remover</span>
                                          </button>
                                        </td>
                                      </tr>
                                    )
                                  )}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>

                        {/* DESPESAS DO EVENTO */}

                        <div id={`despesas-${evento.id}`}>
                          <div className="mb-3 flex items-center justify-between">
                            <h4 className="font-bold">
                              Despesas e descontos deste evento
                            </h4>

                            <span className="text-sm font-bold text-red-600">
                              {moeda(
                                despesasEvento.filter((d) => !ehDesconto(d.notes)).reduce(
                                  (total, item) =>
                                    total +
                                    Number(
                                      item.amount || 0
                                    ),
                                  0
                                )
                              )}
                            </span>
                          </div>

                          {despesasEvento.length ===
                          0 ? (
                            <div className="rounded-lg bg-slate-50 p-4 text-sm text-slate-500">
                              Nenhuma despesa
                              cadastrada.
                            </div>
                          ) : (
                            <div className="space-y-2">
                              {despesasEvento.map(
                                (despesa) => (
                                  <div
                                    key={despesa.id}
                                    className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 p-3"
                                  >
                                    <div>
                                      <p className="font-semibold">
                                        {
                                          despesa.description
                                        }
                                      </p>

                                      {descreverAjuste(despesa.notes, nomeMusico) && (
                                        <p
                                          className={`text-xs font-semibold ${ehDesconto(despesa.notes) ? "text-red-600" : "text-amber-700"}`}
                                        >
                                          {ehDesconto(despesa.notes) ? "Desconto: " : "Reembolso: "}
                                          {descreverAjuste(despesa.notes, nomeMusico)}
                                        </p>
                                      )}

                                      {textoSemTag(despesa.notes) && (
                                        <p className="text-xs text-slate-500">
                                          {textoSemTag(despesa.notes)}
                                        </p>
                                      )}
                                    </div>

                                    <div className="flex items-center gap-2 sm:gap-3">
                                      {ehDesconto(despesa.notes) ? (
                                        <strong className="text-emerald-700" title="Descontado do pagamento; fica no caixa do grupo">
                                          − {moeda(despesa.amount)}
                                        </strong>
                                      ) : (
                                        <strong className="text-red-600">
                                          {moeda(despesa.amount)}
                                        </strong>
                                      )}

                                      <button
                                        onClick={() =>
                                          excluirDespesa(
                                            despesa.id
                                          )
                                        }
                                        className="rounded-lg bg-red-50 px-3 py-2 text-xs font-bold text-red-700"
                                      >
                                        Excluir
                                      </button>
                                    </div>
                                  </div>
                                )
                              )}
                            </div>
                          )}
                        </div>

                        <div
                          id={`resumo-${evento.id}`}
                          className="rounded-xl border border-amber-200 bg-amber-50/70 p-4"
                        >
                          <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                            <div>
                              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                                Resultado do evento
                              </p>
                              <p className="mt-1 text-2xl font-extrabold text-slate-900">
                                {moeda(
                                  receitasEvento
                                    .filter((r) => r.confirmed)
                                    .reduce(
                                      (s, r) =>
                                        s + recebidoDaReceita(r),
                                      0
                                    ) -
                                    despesasEvento.filter((d) => !ehDesconto(d.notes)).reduce(
                                      (s, d) => s + Number(d.amount || 0),
                                      0
                                    )
                                )}
                              </p>
                            </div>

                            <div className="text-right text-sm">
                              <p className="text-slate-600">
                                Recebido:{" "}
                                <strong>
                                  {moeda(
                                    receitasEvento
                                      .filter((r) => r.confirmed)
                                      .reduce(
                                        (s, r) =>
                                          s + recebidoDaReceita(r),
                                        0
                                      )
                                  )}
                                </strong>
                              </p>
                              <p className="text-slate-600">
                                Despesas:{" "}
                                <strong className="text-red-600">
                                  {moeda(
                                    despesasEvento.filter((d) => !ehDesconto(d.notes)).reduce(
                                      (s, d) => s + Number(d.amount || 0),
                                      0
                                    )
                                  )}
                                </strong>
                              </p>
                            </div>
                          </div>
                        </div>

                      </div>
                    )}

                  </div>
                );
              })}

            </div>
          )}

        </section>

        {/* NOVA DESPESA / DESCONTO */}

        <section className="mb-4 rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:mb-6 sm:p-5">

          <h2 className="text-base font-bold sm:text-xl">
            Despesas e descontos
          </h2>

          <p className="mb-4 mt-1 text-sm text-slate-500">
            Reembolso: gasolina, alimentação, pedágio… (soma no pagamento de quem recebeu).
            Desconto: consumo no bar, empréstimo… (desconta do pagamento da pessoa).
          </p>

          {/* TIPO */}
          <div className="mb-4 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => {
                setTipoDespesa("reembolso");
                setPessoasDespesa({});
              }}
              className={`rounded-lg border p-3 text-sm font-bold ${
                tipoDespesa === "reembolso"
                  ? "border-red-500 bg-red-50 text-red-700"
                  : "bg-white text-slate-600"
              }`}
            >
              💸 Despesa / reembolso
            </button>
            <button
              type="button"
              onClick={() => {
                setTipoDespesa("desconto");
                setPessoasDespesa({});
              }}
              className={`rounded-lg border p-3 text-sm font-bold ${
                tipoDespesa === "desconto"
                  ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                  : "bg-white text-slate-600"
              }`}
            >
              ➖ Desconto (consumo, empréstimo…)
            </button>
          </div>

          <div className="grid gap-2 sm:gap-4 md:grid-cols-2">

            <div>
              <label className="mb-1 block text-sm font-semibold">
                Evento
              </label>

              <select
                value={eventoDespesa}
                onChange={(e) =>
                  setEventoDespesa(e.target.value)
                }
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 sm:py-3"
              >
                <option value="">
                  Selecione o evento
                </option>

                {eventosRealizados.map(
                  (evento) => (
                    <option
                      key={evento.id}
                      value={evento.id}
                    >
                      {evento.name} —{" "}
                      {dataBR(
                        evento.event_date
                      )}
                    </option>
                  )
                )}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-semibold">
                Descrição
              </label>

              <input
                value={descricaoDespesa}
                onChange={(e) =>
                  setDescricaoDespesa(
                    e.target.value
                  )
                }
                placeholder={
                  tipoDespesa === "desconto"
                    ? "Ex.: Consumo no bar"
                    : "Ex.: Gasolina"
                }
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 sm:py-3"
              />
            </div>

          </div>

          {/* PESSOAS */}
          <div className="mt-4">
            <label className="mb-1 block text-sm font-semibold">
              {tipoDespesa === "desconto"
                ? "De quem descontar e quanto"
                : "Quem recebeu e quanto"}
            </label>

            <div className="grid gap-1 rounded-xl border p-2 sm:grid-cols-2 sm:gap-2 sm:p-3 lg:grid-cols-3">
              {[
                ...(tipoDespesa === "reembolso"
                  ? [{ chave: "outro", nome: "Outra pessoa / posto", info: "sai do caixa como despesa", ativo: true }]
                  : []),
                { chave: "rodrigo", nome: "Rodrigo", info: "sócio", ativo: true },
                { chave: "marlon", nome: "Marlon", info: "sócio", ativo: true },
                // Só músicos que tocaram nesta semana (eles são pagos nela)
                ...musicos
                  .filter((m) => musicosDaSemana.has(m.id))
                  .map((m) => ({
                    chave: m.id,
                    nome: m.name,
                    info: "músico",
                    ativo: true,
                  })),
              ].map((pessoa) => {
                const marcado = pessoa.chave in pessoasDespesa;

                return (
                  <div
                    key={pessoa.chave}
                    className={`flex items-center gap-2 rounded-lg p-2 ${
                      marcado ? "bg-slate-50 ring-1 ring-slate-300" : ""
                    } ${pessoa.ativo ? "" : "opacity-40"}`}
                  >
                    <label className="flex flex-1 cursor-pointer items-center gap-2">
                      <input
                        type="checkbox"
                        disabled={!pessoa.ativo}
                        checked={marcado}
                        onChange={(e) => {
                          setPessoasDespesa((atual) => {
                            const novo = { ...atual };
                            if (e.target.checked) novo[pessoa.chave] = "";
                            else delete novo[pessoa.chave];
                            return novo;
                          });
                        }}
                      />
                      <span className="text-sm">
                        <span className="font-semibold">{pessoa.nome}</span>
                        <span className="block text-[11px] text-slate-400">{pessoa.info}</span>
                      </span>
                    </label>

                    {marcado && (
                      <input
                        type="text"
                        inputMode="decimal"
                        autoFocus
                        value={pessoasDespesa[pessoa.chave]}
                        onChange={(e) =>
                          setPessoasDespesa((atual) => ({
                            ...atual,
                            [pessoa.chave]: e.target.value,
                          }))
                        }
                        placeholder="0,00"
                        className="w-24 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-right text-sm font-semibold"
                      />
                    )}
                  </div>
                );
              })}
            </div>

            <p className="mt-2 text-xs text-slate-500">
              {tipoDespesa === "desconto"
                ? "O valor é descontado do pagamento da pessoa nesta semana e fica no caixa do grupo."
                : "O valor de cada pessoa do grupo é somado ao pagamento dela na semana e sai do caixa quando ela for paga."}
            </p>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-end gap-3">
            <span className="text-sm text-slate-600">
              Total:{" "}
              <strong>
                {moeda(
                  Object.values(pessoasDespesa).reduce(
                    (s, v) => s + numeroBR(v),
                    0
                  )
                )}
              </strong>
            </span>

            <button
              onClick={salvarDespesa}
              disabled={salvandoDespesa}
              className={`rounded-lg px-5 py-3 font-bold text-white disabled:opacity-50 ${
                tipoDespesa === "desconto" ? "bg-emerald-600" : "bg-red-600"
              }`}
            >
              {tipoDespesa === "desconto"
                ? "+ Adicionar desconto"
                : "+ Adicionar despesa"}
            </button>
          </div>

        </section>

        {/* ENSAIO */}

        <section className="mb-4 rounded-xl border border-purple-200 bg-white shadow-sm sm:mb-6">

          <div className="border-b border-purple-100 bg-purple-50 p-3 sm:p-5">

            <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">

              <div>
                <h2 className="text-base font-bold sm:text-xl">
                  🎵 Ensaio da semana
                </h2>

                <p className="mt-1 text-xs text-slate-500 sm:text-sm">
                  Quinta-feira —{" "}
                  {dataBR(dataEnsaio)}
                </p>
              </div>

              <div className="self-start rounded-lg bg-white px-3 py-2 text-xs font-bold shadow-sm sm:px-4 sm:text-sm">
                {presentes} presentes
              </div>

            </div>

          </div>

          <div className="p-3 sm:p-5">

            <div className="mb-4 flex flex-col items-stretch gap-2 sm:mb-5 sm:flex-row sm:items-center sm:gap-3">

              <span className="text-sm font-semibold">
                O ensaio aconteceu?
              </span>

              <button
                onClick={() =>
                  alterarEnsaio(true)
                }
                className={`w-full rounded-lg px-3 py-2 text-xs font-bold sm:w-auto sm:px-4 sm:text-sm ${
                  teveEnsaio
                    ? "bg-purple-600 text-white"
                    : "bg-purple-50 text-purple-700"
                }`}
              >
                ✓ Sim, teve ensaio
              </button>

              <button
                onClick={() =>
                  alterarEnsaio(false)
                }
                className={`w-full rounded-lg px-3 py-2 text-xs font-bold sm:w-auto sm:px-4 sm:text-sm ${
                  !teveEnsaio
                    ? "bg-slate-700 text-white"
                    : "bg-slate-100 text-slate-700"
                }`}
              >
                Não teve ensaio
              </button>

            </div>

            {teveEnsaio && rehearsalId && (
              <>
                <div className="mb-4 rounded-lg bg-slate-50 p-3 sm:p-4">
                  <p className="text-sm text-slate-500">
                    Marque os músicos que
                    participaram do ensaio.
                  </p>
                </div>

                <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-2">

                  {musicos.map((musico) => {

                    const presente =
                      estaPresente(
                        musico.id
                      );

                    return (
                      <button
                        key={musico.id}
                        onClick={() =>
                          marcarPresenca(
                            musico.id
                          )
                        }
                        className={`flex items-center justify-between rounded-lg border p-3 text-left sm:p-4 ${
                          presente
                            ? "border-green-300 bg-green-50"
                            : "border-slate-200 bg-white"
                        }`}
                      >

                        <span className="font-semibold">
                          {musico.name}
                        </span>

                        <span
                          className={`rounded-full px-3 py-1 text-xs font-bold ${
                            presente
                              ? "bg-green-600 text-white"
                              : "bg-slate-100 text-slate-600"
                          }`}
                        >
                          {presente
                            ? "✓ Foi"
                            : "Não foi"}
                        </span>

                      </button>
                    );
                  })}

                </div>

                <div className="mt-4 flex justify-end sm:mt-5">

                  <button
                    onClick={salvarPresencas}
                    disabled={saving}
                    className="w-full rounded-lg bg-purple-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50 sm:w-auto sm:px-5 sm:py-3"
                  >
                    {saving
                      ? "Salvando..."
                      : "Salvar presenças"}
                  </button>

                </div>
              </>
            )}

            {!teveEnsaio && (
              <div className="rounded-lg bg-slate-50 p-5 text-center text-sm text-slate-500">
                Esta semana não houve ensaio.
              </div>
            )}

          </div>

        </section>

        {/* PAGAMENTO DA DISTRIBUIÇÃO */}

        <section className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 shadow-sm sm:mb-6 sm:p-5">
          <div className="mb-4">
            <h2 className="text-lg font-bold text-slate-800">
              Pagamento da distribuição
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Os valores de Rodrigo e Marlon só saem do Caixa quando você confirmar o pagamento.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-white p-3 sm:p-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="font-bold">Rodrigo</p>
                  <p className="text-lg font-bold text-slate-800">
                    {moeda(rodrigoTotal)}
                  </p>
                  {detalheSocio(rodrigo, reembolsosRodrigo) && (
                    <p className="text-xs text-slate-500">
                      {detalheSocio(rodrigo, reembolsosRodrigo)}
                    </p>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => pagarDistribuicao("rodrigo")}
                  disabled={saving || rodrigoPago}
                  className={`rounded-lg px-4 py-2 text-sm font-bold text-white ${
                    rodrigoPago
                      ? "bg-slate-400"
                      : "bg-green-600"
                  }`}
                >
                  {rodrigoPago ? "Pago" : "Pagar Rodrigo"}
                </button>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-3 sm:p-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="font-bold">Marlon</p>
                  <p className="text-lg font-bold text-slate-800">
                    {moeda(marlonTotal)}
                  </p>
                  {detalheSocio(marlon, reembolsosMarlon) && (
                    <p className="text-xs text-slate-500">
                      {detalheSocio(marlon, reembolsosMarlon)}
                    </p>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => pagarDistribuicao("marlon")}
                  disabled={saving || marlonPago}
                  className={`rounded-lg px-4 py-2 text-sm font-bold text-white ${
                    marlonPago
                      ? "bg-slate-400"
                      : "bg-green-600"
                  }`}
                >
                  {marlonPago ? "Pago" : "Pagar Marlon"}
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* SALVAR */}

        <div className="mb-8 flex justify-stretch sm:mb-10 sm:justify-end">

          <button
            onClick={salvarFechamento}
            disabled={saving}
            className="w-full rounded-lg bg-green-600 px-5 py-3 text-sm font-bold text-white shadow-sm disabled:opacity-50 sm:w-auto sm:px-7"
          >
            {saving
              ? "Salvando..."
              : "Salvar fechamento da semana"}
          </button>

        </div>

      </div>
    </main>
  );
}

function Card({
  titulo,
  valor,
}: {
  titulo: string;
  valor: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-2.5 shadow-sm sm:p-3">
      <p className="text-[11px] font-semibold leading-tight text-slate-500 sm:text-xs">
        {titulo}
      </p>

      <p className="mt-1 text-sm font-bold text-slate-800 sm:text-lg">
        {valor}
      </p>
    </div>
  );
}