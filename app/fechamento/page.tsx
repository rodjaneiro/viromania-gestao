"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

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

function segundaDaSemana(date: Date) {
  const d = new Date(date);
  const dia = d.getDay();

  const diferenca = dia === 0 ? -6 : 1 - dia;

  d.setDate(d.getDate() + diferenca);

  return d;
}

function domingoDaSemana(date: Date) {
  const segunda = segundaDaSemana(date);

  const domingo = new Date(segunda);
  domingo.setDate(segunda.getDate() + 6);

  return domingo;
}

function quintaDaSemana(date: Date) {
  const segunda = segundaDaSemana(date);

  const quinta = new Date(segunda);
  quinta.setDate(segunda.getDate() + 3);

  return quinta;
}

export default function FechamentoPage() {
  const hoje = new Date();

  const [semanaReferencia, setSemanaReferencia] = useState(
    dataISO(hoje)
  );

  const [eventos, setEventos] = useState<Evento[]>([]);
  const [receitas, setReceitas] = useState<Receita[]>([]);
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
  const [valorDespesa, setValorDespesa] = useState("");
  const [salvandoDespesa, setSalvandoDespesa] = useState(false);

  const segunda = useMemo(
    () =>
      segundaDaSemana(
        new Date(`${semanaReferencia}T12:00:00`)
      ),
    [semanaReferencia]
  );

  const domingo = useMemo(
    () => domingoDaSemana(segunda),
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


  useEffect(() => {
    async function carregarStatusDistribuicao() {
      const { data, error } = await supabase
        .from("weekly_closings")
        .select("rodrigo_paid,marlon_paid")
        .eq("week_start", semanaInicio)
        .eq("week_end", semanaFim)
        .maybeSingle();

      if (error) {
        console.error(error);
        return;
      }

      setRodrigoPago(Boolean(data?.rodrigo_paid));
      setMarlonPago(Boolean(data?.marlon_paid));
    }

    carregarStatusDistribuicao();
  }, [semanaInicio, semanaFim]);

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
    setSemanaReferencia(dataISO(new Date()));
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
      update.actual_amount = receita.actual_amount || receita.expected_amount;
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
    const numero = Number(valor);
    if (Number.isNaN(numero)) return;

    setReceitas((atual) =>
      atual.map((item) =>
        item.id === receita.id ? { ...item, actual_amount: numero } : item
      )
    );
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

    const valor = Number(valorDespesa);
    if (!valor || valor <= 0) {
      alert("Informe um valor válido.");
      return;
    }

    setDespesas((atual) => [
      ...atual,
      {
        id: `temp-${Date.now()}`,
        event_id: eventoDespesa,
        description: descricaoDespesa.trim(),
        amount: valor,
        payment_date: dataISO(new Date()),
        notes: null,
      },
    ]);

    setEventoDespesa("");
    setDescricaoDespesa("");
    setValorDespesa("");
    setMensagem('Despesa adicionada. Clique em "Salvar fechamento da semana" para gravar.');
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
        const { error } = await supabase
          .from("event_revenues")
          .update({
            actual_amount: receita.actual_amount,
            confirmed: receita.confirmed,
            status: receita.status,
            actual_receipt_date: receita.actual_receipt_date,
          })
          .eq("id", receita.id);
        if (error) throw error;
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

      for (const participante of musicosEventos) {
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

            const { error } = await supabase
        .from("weekly_closings")
        .upsert(
          {
            week_start: semanaInicio,
            week_end: semanaFim,
            total_expected: totalPrevisto,
            total_confirmed: totalConfirmado,
            total_received: totalRecebido,
            total_to_receive: totalAReceber,
            total_musicians: totalMusicos,
            total_other_expenses: totalDespesas,
            net_result: resultadoLiquido,
            rodrigo_amount: rodrigo,
            marlon_amount: marlon,
            group_cash_amount: caixaGrupo,
            rodrigo_paid: rodrigoPago,
            marlon_paid: marlonPago,
            rodrigo_payment_date: rodrigoPago ? dataISO(new Date()) : null,
            marlon_payment_date: marlonPago ? dataISO(new Date()) : null,
          },
          {
            onConflict:
              "week_start,week_end",
          }
        );

      if (error) throw error;

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
    const valor = tipo === "rodrigo" ? rodrigo : marlon;
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
    } else {
      setMarlonPago(true);
    }

    setMensagem(`Pagamento de ${nome} marcado. Clique em "Salvar fechamento da semana" para gravar.`);
  }

  const eventosRealizados = eventos.filter(
    (evento) => evento.status === "realizado"
  );

  const totalPrevisto = useMemo(() => {
    return receitas.reduce(
      (total, receita) =>
        total + Number(receita.expected_amount || 0),
      0
    );
  }, [receitas]);

  const totalConfirmado = useMemo(() => {
    return receitas
      .filter((receita) => receita.confirmed)
      .filter((receita) => {
        const evento = eventos.find(
          (item) => item.id === receita.event_id
        );

        return evento?.status === "realizado";
      })
      .reduce(
        (total, receita) =>
          total +
          Number(receita.expected_amount || 0),
        0
      );
  }, [receitas, eventos]);

  const totalRecebido = useMemo(() => {
    return receitas
      .filter(
        (receita) =>
          receita.confirmed &&
          receita.status === "recebido"
      )
      .filter((receita) => {
        const evento = eventos.find(
          (item) => item.id === receita.event_id
        );

        return evento?.status === "realizado";
      })
      .reduce(
        (total, receita) =>
          total +
          Number(
            receita.actual_amount ||
              receita.expected_amount ||
              0
          ),
        0
      );
  }, [receitas, eventos]);

  const totalAReceber = Math.max(
    totalConfirmado - totalRecebido,
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

        return evento?.status === "realizado";
      })
      .reduce(
        (total, item) =>
          total + Number(item.amount || 0),
        0
      );
  }, [despesas, eventos]);

  const resultadoLiquido =
    totalConfirmado -
    totalMusicos -
    totalDespesas;

  const rodrigo =
    resultadoLiquido > 0
      ? resultadoLiquido / 4
      : 0;

  const marlon =
    resultadoLiquido > 0
      ? resultadoLiquido / 4
      : 0;

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
      <main className="min-h-screen bg-slate-100 p-8">
        <div className="mx-auto max-w-7xl">
          <div className="rounded-xl bg-white p-10 text-center shadow-sm">
            Carregando fechamento...
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-100 p-6 text-slate-800">
      <div className="mx-auto max-w-7xl">

        {/* HEADER */}

        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">
              Fechamento semanal
            </h1>

            <p className="mt-1 text-sm text-slate-500">
              Conferência dos eventos, músicos,
              despesas, ensaio e resultado da semana.
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

        {/* SEMANA */}

        <section className="mb-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-4">

            <button
              onClick={() => mudarSemana(-1)}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 font-semibold"
            >
              ← Semana anterior
            </button>

            <div className="text-center">
              <p className="text-sm font-semibold text-slate-500">
                Semana
              </p>

              <p className="text-xl font-bold">
                {dataBR(semanaInicio)} até{" "}
                {dataBR(semanaFim)}
              </p>

              <button
                onClick={voltarSemanaAtual}
                className="mt-1 text-xs font-semibold text-blue-600"
              >
                Ir para semana atual
              </button>
            </div>

            <button
              onClick={() => mudarSemana(1)}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 font-semibold"
            >
              Próxima semana →
            </button>

          </div>
        </section>

        {/* RESUMO */}

        <section className="mb-6 grid gap-4 md:grid-cols-2 lg:grid-cols-5">

          <Card
            titulo="Confirmado"
            valor={moeda(totalConfirmado)}
          />

          <Card
            titulo="Recebido"
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
            titulo="Despesas"
            valor={moeda(totalDespesas)}
          />

        </section>

        {/* RESULTADO */}

        <section id="resultado-semana" className="mb-6 rounded-xl bg-slate-900 p-6 text-white shadow-sm">

          <div className="mb-6">
            <p className="text-sm text-slate-400">
              Resultado líquido da semana
            </p>

            <p className="mt-1 text-4xl font-bold">
              {moeda(resultadoLiquido)}
            </p>

            <p className="mt-2 text-sm text-slate-400">
              Receitas confirmadas − cachês dos
              músicos − despesas dos eventos
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-3">

            <div className="rounded-xl bg-white/10 p-5">
              <p className="text-sm text-slate-300">
                Rodrigo — 1/4
              </p>

              <p className="mt-1 text-2xl font-bold">
                {moeda(rodrigo)}
              </p>
            </div>

            <div className="rounded-xl bg-white/10 p-5">
              <p className="text-sm text-slate-300">
                Marlon — 1/4
              </p>

              <p className="mt-1 text-2xl font-bold">
                {moeda(marlon)}
              </p>
            </div>

            <div className="rounded-xl bg-white/10 p-5">
              <p className="text-sm text-slate-300">
                Caixa do grupo — 2/4
              </p>

              <p className="mt-1 text-2xl font-bold">
                {moeda(caixaGrupo)}
              </p>
            </div>

          </div>

          <div className="mt-5 border-t border-white/10 pt-5 text-sm text-slate-400">
            O resultado acima não inclui bonificação
            mensal. A bonificação é uma despesa separada
            do caixa do grupo no final do mês.
          </div>

        </section>



        {/* EVENTOS */}

        <section className="mb-6 rounded-xl border border-slate-200 bg-white shadow-sm">

          <div className="border-b border-slate-200 p-5">
            <h2 className="text-xl font-bold">
              Eventos da semana
            </h2>

            <p className="mt-1 text-sm text-slate-500">
              Confirme quais eventos realmente aconteceram
              e confira suas receitas.
            </p>
          </div>

          {eventos.length === 0 ? (
            <div className="p-8 text-center text-slate-500">
              Nenhum evento nesta semana.
            </div>
          ) : (
            <div className="space-y-4 p-5">

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

                    <div className={`flex flex-wrap items-center justify-between gap-4 p-5 ${cabecalhoEventoClass}`}>

                      <div className="flex items-center gap-4">
                        <div
                          className={`flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-xl border bg-white text-center shadow-sm ${
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
                          <span className="text-xl font-extrabold leading-5">
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
                            <h3 className="text-lg font-extrabold text-slate-900">
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

                      <div className="flex gap-2">

                        <button
                          onClick={() =>
                            marcarEvento(
                              evento,
                              "realizado"
                            )
                          }
                          className={`rounded-lg px-3 py-2 text-xs font-bold ${
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
                          className={`rounded-lg px-3 py-2 text-xs font-bold ${
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

                    <div className="border-b border-slate-200 bg-white px-4 pt-3">
                      <div className="grid grid-cols-4 overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                        <a
                          href={`#receitas-${evento.id}`}
                          className="border-r border-slate-200 px-3 py-3 text-center text-xs font-bold text-slate-700 hover:bg-white"
                        >
                          💰 Receitas
                        </a>
                        <a
                          href={`#musicos-${evento.id}`}
                          className="border-r border-slate-200 px-3 py-3 text-center text-xs font-bold text-slate-700 hover:bg-white"
                        >
                          🎵 Músicos
                        </a>
                        <a
                          href={`#despesas-${evento.id}`}
                          className="border-r border-slate-200 px-3 py-3 text-center text-xs font-bold text-slate-700 hover:bg-white"
                        >
                          🧾 Despesas
                        </a>
                        <a
                          href={`#resumo-${evento.id}`}
                          className="px-3 py-3 text-center text-xs font-bold text-slate-700 hover:bg-white"
                        >
                          📊 Resumo
                        </a>
                      </div>
                    </div>

                    {evento.status ===
                      "nao_realizado" ? (
                      <div className="p-5 text-sm text-red-600">
                        Este evento não entra no
                        resultado da semana.
                      </div>
                    ) : (
                      <div className="space-y-5 border-t border-white/70 bg-white/80 p-5">

                        {/* RECEITAS */}

                        <div id={`receitas-${evento.id}`}>
                          <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
                            <div>
                              <h4 className="text-base font-extrabold text-slate-800">
                                Receitas do evento
                              </h4>
                              <p className="mt-1 text-xs text-slate-500">
                                Controle das entradas previstas e recebidas.
                              </p>
                            </div>

                            <div className="flex gap-2">
                              <div className="rounded-lg bg-emerald-50 px-3 py-2 text-right">
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

                              <div className="rounded-lg bg-emerald-50 px-3 py-2 text-right">
                                <p className="text-[10px] font-bold uppercase text-emerald-600">
                                  Total recebido
                                </p>
                                <p className="font-extrabold text-emerald-700">
                                  {moeda(
                                    receitasEvento
                                      .filter((r) => r.confirmed && r.status === "recebido")
                                      .reduce(
                                        (s, r) =>
                                          s + Number(r.actual_amount || r.expected_amount || 0),
                                        0
                                      )
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
                                <div className="hidden grid-cols-[1.45fr_0.9fr_0.95fr_1fr_1fr_0.8fr] items-center gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 text-[10px] font-bold uppercase tracking-wide text-slate-500 lg:grid">
                                  <div>Descrição</div>
                                  <div>Valor previsto</div>
                                  <div>Valor recebido</div>
                                  <div>Aconteceu?</div>
                                  <div>Status</div>
                                  <div>No caixa</div>
                                </div>

                                <div className="divide-y divide-slate-100">
                                  {receitasEvento.map((receita) => (
                                    <div
                                      key={receita.id}
                                      className="p-4 hover:bg-slate-50/60"
                                    >
                                      <div className="grid gap-4 lg:grid-cols-[1.45fr_0.9fr_0.95fr_1fr_1fr_0.8fr] lg:items-center lg:gap-3">
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
                                            Valor recebido
                                          </span>
                                          <input
                                            type="number"
                                            step="0.01"
                                            value={receita.actual_amount || ""}
                                            onChange={(e) =>
                                              alterarValorReceita(
                                                receita,
                                                e.target.value
                                              )
                                            }
                                            disabled={!receita.confirmed}
                                            placeholder="0,00"
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

                                        <div>
                                          <span className="mb-1 block text-[10px] font-bold uppercase text-slate-500 lg:hidden">
                                            No caixa
                                          </span>
                                          {receita.status === "recebido" &&
                                          receita.confirmed ? (
                                            <span className="inline-flex rounded-full bg-emerald-100 px-3 py-1.5 text-xs font-bold text-emerald-700">
                                              ✓ Lançado
                                            </span>
                                          ) : (
                                            <span className="inline-flex rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-500">
                                              A receber
                                            </span>
                                          )}
                                        </div>
                                      </div>

                                      <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
                                        {receita.confirmed
                                          ? receita.status === "recebido"
                                            ? "Receita confirmada e recebida. O valor foi lançado automaticamente no Caixa."
                                            : "Receita confirmada, mas ainda pendente de recebimento."
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
                          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
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
                              className="rounded-lg bg-blue-100 px-4 py-2 text-xs font-bold text-blue-700 hover:bg-blue-200"
                            >
                              + Adicionar músico
                            </button>
                          </div>

                          {eventoAdicionandoMusico === evento.id && (
                            <div className="mb-4 rounded-xl border border-blue-200 bg-blue-50 p-4">
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
                                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
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
                                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
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
                            <div className="overflow-x-auto">
                              <table className="w-full text-sm">
                                <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                                  <tr>
                                    <th className="px-3 py-3">
                                      Músico
                                    </th>
                                    <th className="px-3 py-3">
                                      Cachê
                                    </th>
                                    <th className="px-3 py-3">
                                      Pagamento
                                    </th>
                                    <th className="px-3 py-3">
                                      Ação
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
                                        <td className="px-3 py-3 font-semibold">
                                          {
                                            musico.musician_name
                                          }
                                        </td>

                                        <td className="px-3 py-3">
                                          {moeda(
                                            musico.event_cache
                                          )}
                                        </td>

                                        <td className="px-3 py-3">
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
                                              : "Pendente"}
                                          </span>
                                        </td>

                                        <td className="px-3 py-3">
                                          <button
                                            onClick={() =>
                                              alterarPagamento(
                                                musico
                                              )
                                            }
                                            className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-bold"
                                          >
                                            {musico.payment_status ===
                                            "pago"
                                              ? "Voltar pendente"
                                              : "Marcar pago"}
                                          </button> 
                                          <button
                                            onClick={() => removerMusicoDoEvento(musico)}
                                            className="ml-2 rounded-lg bg-red-50 px-3 py-2 text-xs font-bold text-red-700"
                                          >
                                            Remover
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
                              Despesas deste evento
                            </h4>

                            <span className="text-sm font-bold text-red-600">
                              {moeda(
                                despesasEvento.reduce(
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

                                      {despesa.notes && (
                                        <p className="text-xs text-slate-500">
                                          {
                                            despesa.notes
                                          }
                                        </p>
                                      )}
                                    </div>

                                    <div className="flex items-center gap-3">
                                      <strong className="text-red-600">
                                        {moeda(
                                          despesa.amount
                                        )}
                                      </strong>

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
                          <div className="flex flex-wrap items-center justify-between gap-4">
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
                                        s + Number(r.actual_amount || r.expected_amount || 0),
                                      0
                                    ) -
                                    despesasEvento.reduce(
                                      (s, d) => s + Number(d.amount || 0),
                                      0
                                    )
                                )}
                              </p>
                            </div>

                            <div className="text-right text-sm">
                              <p className="text-slate-600">
                                Receitas confirmadas:{" "}
                                <strong>
                                  {moeda(
                                    receitasEvento
                                      .filter((r) => r.confirmed)
                                      .reduce(
                                        (s, r) =>
                                          s + Number(r.actual_amount || r.expected_amount || 0),
                                        0
                                      )
                                  )}
                                </strong>
                              </p>
                              <p className="text-slate-600">
                                Despesas:{" "}
                                <strong className="text-red-600">
                                  {moeda(
                                    despesasEvento.reduce(
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

        {/* NOVA DESPESA */}

        <section className="mb-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">

          <h2 className="text-xl font-bold">
            Adicionar despesa de evento
          </h2>

          <p className="mb-5 mt-1 text-sm text-slate-500">
            Ex.: alimentação, gasolina, pedágio,
            estacionamento ou qualquer outro custo.
          </p>

          <div className="grid gap-4 md:grid-cols-3">

            <div>
              <label className="mb-1 block text-sm font-semibold">
                Evento
              </label>

              <select
                value={eventoDespesa}
                onChange={(e) =>
                  setEventoDespesa(e.target.value)
                }
                className="w-full rounded-lg border border-slate-300 px-3 py-3"
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
                placeholder="Ex.: Gasolina"
                className="w-full rounded-lg border border-slate-300 px-3 py-3"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-semibold">
                Valor
              </label>

              <input
                type="number"
                step="0.01"
                value={valorDespesa}
                onChange={(e) =>
                  setValorDespesa(
                    e.target.value
                  )
                }
                placeholder="0,00"
                className="w-full rounded-lg border border-slate-300 px-3 py-3"
              />
            </div>

          </div>

          <div className="mt-4 flex justify-end">
            <button
              onClick={salvarDespesa}
              disabled={salvandoDespesa}
              className="rounded-lg bg-red-600 px-5 py-3 font-bold text-white disabled:opacity-50"
            >
              {salvandoDespesa
                ? "Salvando..."
                : "+ Adicionar despesa"}
            </button>
          </div>

        </section>

        {/* ENSAIO */}

        <section className="mb-6 rounded-xl border border-purple-200 bg-white shadow-sm">

          <div className="border-b border-purple-100 bg-purple-50 p-5">

            <div className="flex flex-wrap items-center justify-between gap-4">

              <div>
                <h2 className="text-xl font-bold">
                  🎵 Ensaio da semana
                </h2>

                <p className="mt-1 text-sm text-slate-500">
                  Quinta-feira —{" "}
                  {dataBR(dataEnsaio)}
                </p>
              </div>

              <div className="rounded-lg bg-white px-4 py-2 text-sm font-bold shadow-sm">
                {presentes} presentes
              </div>

            </div>

          </div>

          <div className="p-5">

            <div className="mb-5 flex flex-wrap items-center gap-3">

              <span className="text-sm font-semibold">
                O ensaio aconteceu?
              </span>

              <button
                onClick={() =>
                  alterarEnsaio(true)
                }
                className={`rounded-lg px-4 py-2 text-sm font-bold ${
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
                className={`rounded-lg px-4 py-2 text-sm font-bold ${
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
                <div className="mb-4 rounded-lg bg-slate-50 p-4">
                  <p className="text-sm text-slate-500">
                    Marque os músicos que
                    participaram do ensaio.
                  </p>
                </div>

                <div className="grid gap-2 md:grid-cols-2">

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
                        className={`flex items-center justify-between rounded-lg border p-4 text-left ${
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

                <div className="mt-5 flex justify-end">

                  <button
                    onClick={salvarPresencas}
                    disabled={saving}
                    className="rounded-lg bg-purple-600 px-5 py-3 font-bold text-white disabled:opacity-50"
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

        <section className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-5 shadow-sm">
          <div className="mb-4">
            <h2 className="text-lg font-bold text-slate-800">
              Pagamento da distribuição
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Os valores de Rodrigo e Marlon só saem do Caixa quando você confirmar o pagamento.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="font-bold">Rodrigo</p>
                  <p className="text-lg font-bold text-slate-800">
                    {moeda(rodrigo)}
                  </p>
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

            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="font-bold">Marlon</p>
                  <p className="text-lg font-bold text-slate-800">
                    {moeda(marlon)}
                  </p>
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

        <div className="mb-10 flex justify-end">

          <button
            onClick={salvarFechamento}
            disabled={saving}
            className="rounded-lg bg-green-600 px-7 py-3 font-bold text-white shadow-sm disabled:opacity-50"
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
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-sm font-semibold text-slate-500">
        {titulo}
      </p>

      <p className="mt-2 text-2xl font-bold text-slate-800">
        {valor}
      </p>
    </div>
  );
}