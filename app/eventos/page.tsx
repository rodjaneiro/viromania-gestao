"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

type Template = {
  id: string;
  name: string;
  weekday: number;
  default_amount: number;
  receipt_days_after: number;
  location: string | null;
  active: boolean;
};

type Evento = {
  id: string;
  template_id: string | null;
  name: string;
  event_date: string;
  event_time: string | null;
  location: string | null;
  expected_amount: number;
  actual_amount: number | null;
  expected_receipt_date: string | null;
  actual_receipt_date: string | null;
  status: string;
  notes: string | null;
};

type ReceitaEvento = {
  id: string;
  description: string;
  expected_amount: number;
  actual_amount: number;
  confirmed: boolean;
  status: "pendente" | "parcial" | "recebido" | "cancelado";
  expected_receipt_date: string | null;
  actual_receipt_date: string | null;
  notes: string | null;
};
type RecebimentoParcela = {
  id?: string;
  event_revenue_id: string;
  description: string;
  expected_amount: number;
  actual_amount: number;
  expected_receipt_date: string | null;
  actual_receipt_date: string | null;
  status: "pendente" | "recebido" | "cancelado";
  payment_method: string;
  notes: string;
};

type Musico = {
  id: string;
  name: string;
  type: string;
  cache: number;
  pix: string;
  active: boolean;
  instrumentos: Instrumento[];
};

type Instrumento = {
  id: string;
  name: string;
};

type MusicoEvento = {
  id: string;
  musician_id: string;
  musician_name: string;
  default_cache: number;
  use_default_cache: boolean;
  event_cache: number;
  instrumentos: Instrumento[];
  instrumentosSelecionados: string[];
  payment_status: "pendente" | "pago";
  payment_date: string | null;
  payment_method: string | null;
  payment_notes: string | null;
};

function moeda(valor: number) {
  return Number(valor || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function textoDiaSemana(weekday: number) {
  const dias = [
    "Todo domingo",
    "Toda segunda-feira",
    "Toda terça-feira",
    "Toda quarta-feira",
    "Toda quinta-feira",
    "Toda sexta-feira",
    "Todo sábado",
  ];

  return dias[weekday] || "Dia não definido";
}

export default function EventosPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [anoSelecionado, setAnoSelecionado] = useState(new Date().getFullYear());
  const [buscaEvento, setBuscaEvento] = useState("");

  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const formularioRef = useRef<HTMLElement | null>(null);
  const [eventoEditando, setEventoEditando] = useState<Evento | null>(null);

  const [nome, setNome] = useState("");
  const [dataEvento, setDataEvento] = useState("");
  const [horarioEvento, setHorarioEvento] = useState("");
  const [local, setLocal] = useState("");
  const [valorPrevisto, setValorPrevisto] = useState("");
  const [valorTotalEvento, setValorTotalEvento] = useState("");
  const [valorSinal, setValorSinal] = useState("");
  const [dataPagamentoSinal, setDataPagamentoSinal] = useState("");
  const [dataPagamentoSaldo, setDataPagamentoSaldo] = useState("");
  const [dataRecebimento, setDataRecebimento] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [templateSelecionado, setTemplateSelecionado] = useState("");

  const [carregando, setCarregando] = useState(false);
    const [musicos, setMusicos] = useState<Musico[]>([]);
  const [instrumentos, setInstrumentos] = useState<Instrumento[]>([]);

  const [eventoSelecionado, setEventoSelecionado] =
    useState<Evento | null>(null);

  const [musicosEvento, setMusicosEvento] =
    useState<MusicoEvento[]>([]);

  const [mostrarMusicos, setMostrarMusicos] =
    useState(false);

  const [salvandoMusicos, setSalvandoMusicos] =
    useState(false);
  const [eventoFechando, setEventoFechando] = useState<Evento | null>(null);
  const [receitasFechamento, setReceitasFechamento] = useState<ReceitaEvento[]>([]);
  const [salvandoFechamento, setSalvandoFechamento] = useState(false);

  const [eventoRecebimentos, setEventoRecebimentos] = useState<Evento | null>(null);
  const [recebimentosParcelas, setRecebimentosParcelas] = useState<RecebimentoParcela[]>([]);
  const [salvandoRecebimentos, setSalvandoRecebimentos] = useState(false);
  const recebimentosRef = useRef<HTMLElement | null>(null);

  const [gerandoRecorrencias, setGerandoRecorrencias] = useState(false);
  const [mensagemRecorrencia, setMensagemRecorrencia] = useState("");

  function nomePadraoEvento(nome: string) {
    const chave = nome.trim().toLowerCase();

    if (chave === "lapa" || chave === "pagode na lapa") {
      return "Pagode na Lapa";
    }

    if (
      chave === "miami" ||
      chave === "domingueira do miami"
    ) {
      return "Domingueira do Miami";
    }

    return nome;
  }

  function localPadraoEvento(nome: string, local: string | null) {
    const chave = nome.trim().toLowerCase();

    if (chave === "lapa" || chave === "pagode na lapa") {
      return "Lapa Beer";
    }

    if (
      chave === "miami" ||
      chave === "domingueira do miami"
    ) {
      return "Miami JF";
    }

    return local || "";
  }

  const eventosDoAno = useMemo(() => {
    const busca = buscaEvento.trim().toLowerCase();

    return eventos
      .filter(
        (evento) =>
          Number(evento.event_date.slice(0, 4)) === anoSelecionado
      )
      .filter((evento) => {
        if (!busca) return true;

        const texto = [
          evento.name,
          evento.location || "",
          evento.event_date,
          formatarData(evento.event_date),
          evento.status || "",
        ]
          .join(" ")
          .toLowerCase();

        return texto.includes(busca);
      })
      .sort((a, b) => {
        const dataA = `${a.event_date}T${a.event_time || "00:00"}`;
        const dataB = `${b.event_date}T${b.event_time || "00:00"}`;
        return dataA.localeCompare(dataB);
      });
  }, [eventos, anoSelecionado, buscaEvento]);

  const anosDisponiveis = useMemo(() => {
    const atual = new Date().getFullYear();
    const anos = new Set<number>([
      atual - 1,
      atual,
      atual + 1,
      ...eventos.map((evento) =>
        Number(evento.event_date.slice(0, 4))
      ),
    ]);

    return Array.from(anos).sort((a, b) => a - b);
  }, [eventos]);

  useEffect(() => {
    async function inicializar() {
      const modelos = await carregarTemplates();

      await Promise.all([
        carregarEventos(),
        carregarMusicos(),
        carregarInstrumentos(),
      ]);

      if (modelos.length > 0) {
        await gerarProximasOcorrencias(modelos);
      }
    }

    inicializar();
  }, []);

  useEffect(() => {
    if (templates.length === 0) return;

    /*
     * Ao trocar para um ano futuro, o sistema cria apenas as
     * próximas 4 ocorrências daquele ano, sem pré-cadastrar o ano inteiro.
     */
    if (anoSelecionado > new Date().getFullYear()) {
      gerarProximasOcorrencias(
        templates,
        anoSelecionado
      ).then(() => carregarEventos());
    }
  }, [anoSelecionado, templates.length]);

  async function carregarTemplates(): Promise<Template[]> {
    const { data, error } = await supabase
      .from("recurring_event_templates")
      .select("*")
      .eq("active", true)
      .order("weekday");

    if (error) {
      console.error(error);
      return [];
    }

    const lista = data || [];
    setTemplates(lista);
    return lista;
  }

  function dataHojeISO() {
    const hoje = new Date();
    const ano = hoje.getFullYear();
    const mes = String(hoje.getMonth() + 1).padStart(2, "0");
    const dia = String(hoje.getDate()).padStart(2, "0");
    return `${ano}-${mes}-${dia}`;
  }

  function adicionarDias(data: string, dias: number) {
    const partes = data.split("-").map(Number);
    const d = new Date(partes[0], partes[1] - 1, partes[2]);
    d.setDate(d.getDate() + dias);

    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  function diaSemana(data: string) {
    const [ano, mes, dia] = data.split("-").map(Number);
    return new Date(ano, mes - 1, dia).getDay();
  }

  async function gerarProximasOcorrencias(
    modelos = templates,
    anoAlvo?: number
  ) {
    if (modelos.length === 0) return;

    setGerandoRecorrencias(true);
    setMensagemRecorrencia("");

    try {
      const hoje = dataHojeISO();
      const anoAtual = new Date().getFullYear();

      /*
       * No ano atual, continuamos trabalhando a partir de hoje.
       * Ao consultar um ano futuro, começamos em 01/01 daquele ano.
       * Assim não precisamos criar 52 eventos antecipadamente.
       */
      const inicio =
        anoAlvo && anoAlvo > anoAtual
          ? `${anoAlvo}-01-01`
          : hoje;

      const fimAno =
        anoAlvo && anoAlvo > anoAtual
          ? `${anoAlvo}-12-31`
          : adicionarDias(inicio, 35);

      const { data: existentes, error: existentesError } = await supabase
        .from("events")
        .select("id, template_id, event_date")
        .in(
          "template_id",
          modelos.map((template) => template.id)
        )
        .gte("event_date", inicio)
        .lte("event_date", fimAno);

      if (existentesError) throw existentesError;

      const existentesSet = new Set(
        (existentes || []).map(
          (evento) => `${evento.template_id}|${evento.event_date}`
        )
      );

      let criados = 0;

      for (const template of modelos) {
        let encontrados = 0;

        for (
          let deslocamento = 0;
          deslocamento <=
            (anoAlvo && anoAlvo > anoAtual ? 364 : 35) &&
          encontrados < 4;
          deslocamento++
        ) {
          const dataOcorrencia = adicionarDias(inicio, deslocamento);

          if (diaSemana(dataOcorrencia) !== Number(template.weekday)) {
            continue;
          }

          const chave = `${template.id}|${dataOcorrencia}`;

          if (existentesSet.has(chave)) {
            encontrados += 1;
            continue;
          }

          // A restrição UNIQUE (template_id, event_date) no banco
          // protege contra duas execuções simultâneas (ex.: React StrictMode).
          const { data: eventoCriado, error: eventoError } = await supabase
            .from("events")
            .upsert(
              {
                template_id: template.id,
                name: template.name,
                event_date: dataOcorrencia,
                location: template.location || null,
                expected_amount: Number(template.default_amount || 0),
                actual_amount: null,
                expected_receipt_date: calcularDataRecebimento(
                  dataOcorrencia,
                  Number(template.receipt_days_after || 0)
                ),
                actual_receipt_date: null,
                status: "agendado",
                notes: "Ocorrência criada automaticamente pelo sistema.",
              },
              {
                onConflict: "template_id,event_date",
                ignoreDuplicates: true,
              }
            )
            .select("id")
            .maybeSingle();

          if (eventoError) {
            throw new Error(
              eventoError.message ||
                `Não foi possível criar ${template.name} em ${dataOcorrencia}.`
            );
          }

          // Outra execução pode ter criado a ocorrência exatamente ao mesmo
          // tempo. Nesse caso, ela já existe e não devemos criar receitas
          // novamente.
          if (!eventoCriado) {
            existentesSet.add(chave);
            encontrados += 1;
            continue;
          }

          let receitas: Array<{
            event_id: string;
            description: string;
            expected_amount: number;
            actual_amount: number;
            confirmed: boolean;
            status: "pendente";
            expected_receipt_date: string | null;
          }> = [];

          const { data: modelosReceita, error: receitasError } = await supabase
            .from("recurring_event_revenue_templates")
            .select("description, default_amount, receipt_days_after")
            .eq("template_id", template.id)
            .eq("active", true)
            .order("created_at", { ascending: true });

          if (receitasError) {
            await supabase.from("events").delete().eq("id", eventoCriado.id);
            throw receitasError;
          }

          if (modelosReceita && modelosReceita.length > 0) {
            receitas = modelosReceita.map((receita) => ({
              event_id: eventoCriado.id,
              description: receita.description,
              expected_amount: Number(receita.default_amount || 0),
              actual_amount: 0,
              confirmed: true,
              status: "pendente" as const,
              expected_receipt_date: calcularDataRecebimento(
                dataOcorrencia,
                Number(receita.receipt_days_after || 0)
              ),
            }));
          } else if (
            template.name.trim().toLowerCase() === "miami" ||
            template.name.trim().toLowerCase() === "domingueira do miami"
          ) {
            receitas = [
              {
                event_id: eventoCriado.id,
                description: "Evento",
                expected_amount: 1300,
                actual_amount: 0,
                confirmed: true,
                status: "pendente",
                expected_receipt_date: calcularDataRecebimento(dataOcorrencia, 1),
              },
              {
                event_id: eventoCriado.id,
                description: "Aluguel de som",
                expected_amount: 400,
                actual_amount: 0,
                confirmed: true,
                status: "pendente",
                expected_receipt_date: calcularDataRecebimento(dataOcorrencia, 1),
              },
            ];
          } else {
            receitas = [
              {
                event_id: eventoCriado.id,
                description: "Evento",
                expected_amount: Number(template.default_amount || 0),
                actual_amount: 0,
                confirmed: true,
                status: "pendente",
                expected_receipt_date: calcularDataRecebimento(
                  dataOcorrencia,
                  Number(template.receipt_days_after || 0)
                ),
              },
            ];
          }

          if (receitas.length > 0) {
            const { error: insertReceitasError } = await supabase
              .from("event_revenues")
              .insert(receitas);

            if (insertReceitasError) {
              await supabase.from("events").delete().eq("id", eventoCriado.id);
              throw insertReceitasError;
            }
          }

          existentesSet.add(chave);
          criados += 1;
          encontrados += 1;
        }
      }

      await carregarEventos();

      setMensagemRecorrencia(
        criados > 0
          ? `${criados} ocorrência(s) recorrente(s) criada(s) automaticamente.`
          : "As próximas ocorrências recorrentes já estavam cadastradas."
      );
    } catch (error: any) {
      console.error(error);
      setMensagemRecorrencia(
        `Erro ao gerar ocorrências recorrentes: ${error.message || "erro desconhecido"}`
      );
    } finally {
      setGerandoRecorrencias(false);
    }
  }

  async function carregarEventos() {
    const { data, error } = await supabase
      .from("events")
      .select("*")
      .order("event_date", { ascending: false });

    if (error) {
      console.error(error);
      return;
    }

    setEventos(data || []);
  }
  async function carregarInstrumentos() {
    const { data, error } = await supabase
      .from("instruments")
      .select("id, name")
      .order("name");

    if (error) {
      console.error(error);
      return;
    }

    setInstrumentos(data || []);
  }

  async function carregarMusicos() {
    const { data: musicosData, error: musicosError } =
      await supabase
        .from("musicians")
        .select("id, name, type, cache, pix, active")
        .eq("active", true)
        .order("name");

    if (musicosError) {
      console.error(musicosError);
      return;
    }

    const { data: relacoes, error: relacoesError } =
      await supabase
        .from("musician_instruments")
        .select("musician_id, instrument_id");

    if (relacoesError) {
      console.error(relacoesError);
      return;
    }

    const { data: instrumentosData, error: instrumentosError } =
      await supabase
        .from("instruments")
        .select("id, name");

    if (instrumentosError) {
      console.error(instrumentosError);
      return;
    }

    const musicosComInstrumentos: Musico[] =
      (musicosData || []).map((musico) => {
        const instrumentosDoMusico =
          (relacoes || [])
            .filter(
              (relacao) =>
                relacao.musician_id === musico.id
            )
            .map((relacao) => {
              return (instrumentosData || []).find(
                (instrumento) =>
                  instrumento.id ===
                  relacao.instrument_id
              );
            })
            .filter(
              (instrumento): instrumento is Instrumento =>
                Boolean(instrumento)
            );

        return {
          ...musico,
          instrumentos: instrumentosDoMusico,
        };
      });

    setMusicos(musicosComInstrumentos);
  }
  function formatarMoeda(valor: number | null | undefined) {
    return `R$ ${Number(valor || 0)
      .toFixed(2)
      .replace(".", ",")}`;
  }

  function formatarData(data: string | null) {
    if (!data) return "-";

    const [ano, mes, dia] = data.split("-");

    return `${dia}/${mes}/${ano}`;
  }

  function calcularDataRecebimento(
    data: string,
    dias: number
  ) {
    if (!data) return "";

    const dataObj = new Date(`${data}T12:00:00`);
    dataObj.setDate(dataObj.getDate() + dias);

    return dataObj.toISOString().split("T")[0];
  }

  function selecionarTemplate(id: string) {
    if (id) {
      setValorTotalEvento("");
      setValorSinal("");
      setDataPagamentoSinal("");
      setDataPagamentoSaldo("");
    }

    setTemplateSelecionado(id);

    const template = templates.find((item) => item.id === id);

    if (!template) return;

    setNome(template.name);
    setValorPrevisto(String(template.default_amount));

    setDataRecebimento(
      calcularDataRecebimento(
        dataEvento,
        template.receipt_days_after
      )
    );

    if (template.location) {
      setLocal(template.location);
    }
  }

  function alterarDataEvento(data: string) {
    setDataEvento(data);

    if (templateSelecionado) {
      const template = templates.find(
        (item) => item.id === templateSelecionado
      );

      if (template) {
        setDataRecebimento(
          calcularDataRecebimento(
            data,
            template.receipt_days_after
          )
        );
      }
    }
  }

  function novoEvento() {
    setEventoEditando(null);
    setNome("");
    setDataEvento("");
    setHorarioEvento("");
    setLocal("");
    setValorPrevisto("");
    setValorTotalEvento("");
    setValorSinal("");
    setDataPagamentoSinal("");
    setDataPagamentoSaldo("");
    setDataRecebimento("");
    setObservacoes("");
    setTemplateSelecionado("");
    setMostrarFormulario(true);
  }

  function editarEvento(evento: Evento) {
    setEventoEditando(evento);
    setNome(evento.name || "");
    setDataEvento(evento.event_date || "");
    setHorarioEvento(evento.event_time || "");
    setLocal(evento.location || "");
    setValorPrevisto(String(evento.expected_amount || 0));
    setValorTotalEvento(String(evento.expected_amount || 0));
    setDataRecebimento(evento.expected_receipt_date || "");
    setObservacoes(evento.notes || "");
    setTemplateSelecionado(evento.template_id || "");
    setMostrarFormulario(true);
  }

  function cancelarFormulario() {
    setMostrarFormulario(false);
    setEventoEditando(null);
  }

  useEffect(() => {
    if (!eventoRecebimentos) return;

    const timer = window.setTimeout(() => {
      recebimentosRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 80);

    return () => window.clearTimeout(timer);
  }, [eventoRecebimentos]);

  useEffect(() => {
    if (!mostrarFormulario) return;

    const timer = window.setTimeout(() => {
      formularioRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 50);

    return () => window.clearTimeout(timer);
  }, [mostrarFormulario, eventoEditando]);

  async function salvarEvento() {
    if (!nome.trim()) {
      alert("Informe o nome do evento.");
      return;
    }

    if (!dataEvento) {
      alert("Informe a data do evento.");
      return;
    }

    const valor = Number(
      (templateSelecionado ? valorPrevisto : valorTotalEvento).replace(",", ".")
    );
    const sinal = Number((valorSinal || "0").replace(",", "."));

    if (isNaN(valor) || valor <= 0) {
      alert("Informe o valor total do evento.");
      return;
    }

    if (!eventoEditando && !templateSelecionado) {
      if (isNaN(sinal) || sinal < 0 || sinal > valor) {
        alert("O valor do sinal deve estar entre R$ 0,00 e o valor total do evento.");
        return;
      }
      if (sinal > 0 && !dataPagamentoSinal) {
        alert("Informe a data em que o sinal foi pago.");
        return;
      }
      if (sinal < valor && !dataPagamentoSaldo) {
        alert("Informe a data prevista para pagamento do saldo.");
        return;
      }
    }

    setCarregando(true);

    try {
      if (eventoEditando) {
        const { error: updateError } = await supabase
          .from("events")
          .update({
            name: nome.trim(),
            event_date: dataEvento,
            event_time: horarioEvento || null,
            location: local.trim() || null,
            notes: observacoes.trim() || null,
            expected_amount: valor,
          })
          .eq("id", eventoEditando.id);

        if (updateError) throw updateError;

        const { data: receitasExistentes, error: receitasError } = await supabase
          .from("event_revenues")
          .select("id,description")
          .eq("event_id", eventoEditando.id);

        if (receitasError) throw receitasError;

        if (!templateSelecionado && (receitasExistentes || []).length === 1) {
          const principal = receitasExistentes?.[0];
          if (principal) {
            const { error: receitaUpdateError } = await supabase
              .from("event_revenues")
              .update({ expected_amount: valor })
              .eq("id", principal.id);

            if (receitaUpdateError) throw receitaUpdateError;
          }
        }

        alert("Evento atualizado com sucesso!");
        setMostrarFormulario(false);
        setEventoEditando(null);
        await carregarEventos();
        return;
      }

      const { data: eventoCriado, error: eventoError } = await supabase
        .from("events")
        .insert({
          template_id: templateSelecionado || null,
          name: nome.trim(),
          event_date: dataEvento,
          event_time: horarioEvento || null,
          location: local.trim() || null,
          expected_amount: valor,
          actual_amount: null,
          expected_receipt_date: (!templateSelecionado ? dataPagamentoSaldo : dataRecebimento) || null,
          status: "agendado",
          notes: observacoes.trim() || null,
        })
        .select()
        .single();

      if (eventoError || !eventoCriado) {
        console.error(eventoError);
        alert(`Erro ao cadastrar o evento: ${eventoError?.message || "evento não criado"}`);
        return;
      }

      let receitas: {
        event_id: string;
        description: string;
        expected_amount: number;
        actual_amount: number;
        confirmed: boolean;
        status: "pendente" | "parcial" | "recebido" | "cancelado";
        expected_receipt_date: string | null;
      }[] = [];

      if (templateSelecionado) {
        const { data: modelosReceita, error: modelosError } = await supabase
          .from("recurring_event_revenue_templates")
          .select("description, default_amount, receipt_days_after")
          .eq("template_id", templateSelecionado)
          .eq("active", true)
          .order("created_at", { ascending: true });

        if (modelosError) {
          console.error(modelosError);
          await supabase.from("events").delete().eq("id", eventoCriado.id);
          alert(`O evento não foi salvo porque as receitas não puderam ser carregadas: ${modelosError.message}`);
          return;
        }

        if (modelosReceita && modelosReceita.length > 0) {
          receitas = modelosReceita.map((receita) => ({
            event_id: eventoCriado.id,
            description: receita.description,
            expected_amount: Number(receita.default_amount || 0),
            actual_amount: 0,
            confirmed: true,
            status: "pendente",
            expected_receipt_date: calcularDataRecebimento(
              dataEvento,
              Number(receita.receipt_days_after || 0)
            ),
          }));
        } else {
          // Fallback de segurança para não criar um evento sem suas receitas.
          // Miami possui duas receitas: evento + aluguel de som.
          const template = templates.find((item) => item.id === templateSelecionado);
          const nomeTemplate = (template?.name || "").trim().toLowerCase();

          if (nomeTemplate === "miami") {
            receitas = [
              {
                event_id: eventoCriado.id,
                description: "Evento",
                expected_amount: 1300,
                actual_amount: 0,
                confirmed: true,
                status: "pendente",
                expected_receipt_date: calcularDataRecebimento(dataEvento, 1),
              },
              {
                event_id: eventoCriado.id,
                description: "Aluguel de som",
                expected_amount: 400,
                actual_amount: 0,
                confirmed: true,
                status: "pendente",
                expected_receipt_date: calcularDataRecebimento(dataEvento, 1),
              },
            ];
          } else {
            receitas = [
              {
                event_id: eventoCriado.id,
                description: "Evento",
                expected_amount: valor,
                actual_amount: 0,
                confirmed: true,
                status: "pendente",
                expected_receipt_date: dataRecebimento || null,
              },
            ];
          }
        }
      } else {
        receitas = [
          {
            event_id: eventoCriado.id,
            description: "Evento",
            expected_amount: valor,
            actual_amount: 0,
            confirmed: true,
            status: "pendente",
            expected_receipt_date: dataPagamentoSaldo || dataRecebimento || dataEvento,
          },
        ];
      }

      if (receitas.length === 0) {
        await supabase.from("events").delete().eq("id", eventoCriado.id);
        alert("O evento não foi salvo porque nenhuma receita foi configurada.");
        return;
      }

      const { error: receitaError } = await supabase
        .from("event_revenues")
        .insert(receitas);

      if (receitaError) {
        console.error(receitaError);
        await supabase.from("events").delete().eq("id", eventoCriado.id);
        alert(`O evento não foi salvo porque houve erro ao criar as receitas: ${receitaError.message}`);
        return;
      }

      if (!templateSelecionado) {
        const { data: receitaPrincipal, error: receitaPrincipalError } = await supabase
          .from("event_revenues")
          .select("id")
          .eq("event_id", eventoCriado.id)
          .eq("description", "Evento")
          .single();

        if (receitaPrincipalError || !receitaPrincipal) {
          await supabase.from("events").delete().eq("id", eventoCriado.id);
          alert("Não foi possível localizar a receita principal do evento.");
          return;
        }

        const parcelas: any[] = [];
        if (sinal > 0) {
          parcelas.push({
            event_revenue_id: receitaPrincipal.id,
            description: "Sinal",
            expected_amount: sinal,
            actual_amount: sinal,
            expected_receipt_date: dataPagamentoSinal,
            actual_receipt_date: dataPagamentoSinal,
            status: "recebido",
            payment_method: null,
            notes: "Sinal informado no cadastro do evento",
          });
        }

        const saldo = valor - sinal;
        if (saldo > 0) {
          parcelas.push({
            event_revenue_id: receitaPrincipal.id,
            description: "Saldo final",
            expected_amount: saldo,
            actual_amount: 0,
            expected_receipt_date: dataPagamentoSaldo || dataRecebimento || dataEvento,
            actual_receipt_date: null,
            status: "pendente",
            payment_method: null,
            notes: null,
          });
        }

        if (parcelas.length > 0) {
          const { error: parcelasError } = await supabase
            .from("event_revenue_receipts")
            .insert(parcelas);

          if (parcelasError) {
            console.error(parcelasError);
            await supabase.from("events").delete().eq("id", eventoCriado.id);
            alert(`O evento foi criado, mas houve erro ao criar os recebimentos: ${parcelasError.message}`);
            return;
          }
        }
      }

      alert("Evento e recebimentos cadastrados com sucesso!");
      setMostrarFormulario(false);
      await carregarEventos();
    } finally {
      setCarregando(false);
    }
  }

  async function abrirMusicosEvento(evento: Evento) {
    setEventoSelecionado(evento);

    const { data: participantes, error: participantesError } =
      await supabase
        .from("event_musicians")
        .select("*")
        .eq("event_id", evento.id);

    if (participantesError) {
      console.error(participantesError);
      alert("Erro ao carregar os músicos do evento.");
      return;
    }

    const { data: instrumentosEvento, error: instrumentosError } =
      await supabase
        .from("event_musician_instruments")
        .select("event_musician_id, instrument_id")
        .in(
          "event_musician_id",
          (participantes || []).map((item) => item.id)
        );

    if (instrumentosError) {
      console.error(instrumentosError);
      alert("Erro ao carregar os instrumentos do evento.");
      return;
    }

    const lista: MusicoEvento[] = musicos.map((musico) => {
      const participante = (participantes || []).find(
        (item) => item.musician_id === musico.id
      );

      const instrumentosSelecionados = participante
        ? (instrumentosEvento || [])
            .filter(
              (item) =>
                item.event_musician_id === participante.id
            )
            .map((item) => item.instrument_id)
        : [];

      return {
        id: participante?.id || "",
        musician_id: musico.id,
        musician_name: musico.name,
        default_cache: Number(musico.cache || 0),
        use_default_cache: participante
          ? participante.use_default_cache
          : true,
        event_cache: participante
          ? Number(participante.event_cache || musico.cache || 0)
          : Number(musico.cache || 0),
        instrumentos: musico.instrumentos || [],
        instrumentosSelecionados,
        payment_status: participante?.payment_status || "pendente",
        payment_date: participante?.payment_date || null,
        payment_method: participante?.payment_method || null,
        payment_notes: participante?.payment_notes || null,
      };
    });

    setMusicosEvento(lista);
    setMostrarMusicos(true);
  }
    async function salvarMusicosEvento() {
    if (!eventoSelecionado) return;

    setSalvandoMusicos(true);

    try {
      const { data: participantesAtuais, error: buscarError } = await supabase
        .from("event_musicians")
        .select("*")
        .eq("event_id", eventoSelecionado.id);

      if (buscarError) {
        console.error(buscarError);
        alert("Erro ao carregar os músicos atuais do evento.");
        return;
      }

      const selecionados = musicosEvento.filter(
        (musico) => musico.instrumentosSelecionados.length > 0
      );

      const idsSelecionados = new Set(
        selecionados.map((musico) => musico.musician_id)
      );

      // Remove somente quem foi retirado do evento.
      const participantesParaRemover = (participantesAtuais || []).filter(
        (participante) => !idsSelecionados.has(participante.musician_id)
      );

      for (const participante of participantesParaRemover) {
        const { error: instrumentosError } = await supabase
          .from("event_musician_instruments")
          .delete()
          .eq("event_musician_id", participante.id);

        if (instrumentosError) {
          console.error(instrumentosError);
          alert("Erro ao remover os instrumentos do músico.");
          return;
        }

        const { error: participanteError } = await supabase
          .from("event_musicians")
          .delete()
          .eq("id", participante.id);

        if (participanteError) {
          console.error(participanteError);
          alert("Erro ao remover o músico do evento.");
          return;
        }
      }

      for (const musico of selecionados) {
        const participanteExistente = (participantesAtuais || []).find(
          (item) => item.musician_id === musico.musician_id
        );

        let participanteId = participanteExistente?.id || "";

        if (participanteExistente) {
          const { error: participanteError } = await supabase
            .from("event_musicians")
            .update({
              use_default_cache: musico.use_default_cache,
              event_cache: musico.event_cache,
            })
            .eq("id", participanteExistente.id);

          if (participanteError) {
            console.error(participanteError);
            alert(`Erro ao atualizar o músico ${musico.musician_name}: ${participanteError.message}`);
            return;
          }
        } else {
          const { data: participante, error: participanteError } = await supabase
            .from("event_musicians")
            .insert({
              event_id: eventoSelecionado.id,
              musician_id: musico.musician_id,
              use_default_cache: musico.use_default_cache,
              event_cache: musico.event_cache,
              payment_status: "pendente",
            })
            .select("id")
            .single();

          if (participanteError || !participante) {
            console.error(participanteError);
            alert(`Erro ao salvar o músico ${musico.musician_name}: ${participanteError?.message || "erro desconhecido"}`);
            return;
          }

          participanteId = participante.id;
        }

        // Atualiza apenas os instrumentos. O registro do músico é preservado,
        // inclusive status/data do pagamento e, portanto, não dispara duplicidade no Caixa.
        const { error: limparInstrumentosError } = await supabase
          .from("event_musician_instruments")
          .delete()
          .eq("event_musician_id", participanteId);

        if (limparInstrumentosError) {
          console.error(limparInstrumentosError);
          alert(`Erro ao atualizar os instrumentos de ${musico.musician_name}.`);
          return;
        }

        const instrumentosParaSalvar = musico.instrumentosSelecionados.map(
          (instrumentId) => ({
            event_musician_id: participanteId,
            instrument_id: instrumentId,
          })
        );

        if (instrumentosParaSalvar.length > 0) {
          const { error: instrumentoError } = await supabase
            .from("event_musician_instruments")
            .insert(instrumentosParaSalvar);

          if (instrumentoError) {
            console.error(instrumentoError);
            alert(`Erro ao salvar os instrumentos de ${musico.musician_name}.`);
            return;
          }
        }
      }

      alert("Músicos do evento salvos com sucesso!");
      setMostrarMusicos(false);
      setEventoSelecionado(null);
      setMusicosEvento([]);
    } finally {
      setSalvandoMusicos(false);
    }
  }

  async function alterarStatus(
    id: string,
    status: string
  ) {
    const { error } = await supabase
      .from("events")
      .update({ status })
      .eq("id", id);

    if (error) {
      console.error(error);
      alert("Erro ao atualizar o evento.");
      return;
    }

    await carregarEventos();
  }

  async function abrirRecebimentosEvento(evento: Evento) {
    setEventoRecebimentos(evento);
    setRecebimentosParcelas([]);

    const { data: receitas, error: receitasError } = await supabase
      .from("event_revenues")
      .select("id,description,expected_amount,actual_amount,confirmed,status,expected_receipt_date,actual_receipt_date,notes")
      .eq("event_id", evento.id)
      .order("created_at", { ascending: true });

    if (receitasError) {
      console.error(receitasError);
      setEventoRecebimentos(null);
      alert(`Erro ao carregar as receitas: ${receitasError.message}`);
      return;
    }

    if (!receitas || receitas.length === 0) {
      alert("Este evento não possui receitas cadastradas.");
      setEventoRecebimentos(null);
      return;
    }

    const ids = receitas.map((r) => r.id);

    const { data: parcelas, error: parcelasError } = await supabase
      .from("event_revenue_receipts")
      .select("*")
      .in("event_revenue_id", ids)
      .order("expected_receipt_date", { ascending: true });

    if (parcelasError) {
      console.error(parcelasError);
      setEventoRecebimentos(null);
      alert(`Erro ao carregar os recebimentos: ${parcelasError.message}`);
      return;
    }

    const lista: RecebimentoParcela[] = [];

    for (const receita of receitas) {
      const existentes = (parcelas || []).filter(
        (p) => p.event_revenue_id === receita.id
      );

      if (existentes.length > 0) {
        for (const parcela of existentes) {
          lista.push({
            id: parcela.id,
            event_revenue_id: parcela.event_revenue_id,
            description: parcela.description || receita.description,
            expected_amount: Number(parcela.expected_amount || 0),
            actual_amount: Number(parcela.actual_amount || 0),
            expected_receipt_date: parcela.expected_receipt_date || null,
            actual_receipt_date: parcela.actual_receipt_date || null,
            status: parcela.status,
            payment_method: parcela.payment_method || "",
            notes: parcela.notes || "",
          });
        }
      } else if (
        receita.status === "recebido" &&
        Number(receita.actual_amount || 0) > 0
      ) {
        lista.push({
          event_revenue_id: receita.id,
          description: receita.description,
          expected_amount: Number(receita.actual_amount || receita.expected_amount || 0),
          actual_amount: Number(receita.actual_amount || 0),
          expected_receipt_date: receita.expected_receipt_date || evento.event_date,
          actual_receipt_date: receita.actual_receipt_date || null,
          status: "recebido",
          payment_method: "",
          notes: "Recebimento legado",
        });
      } else {
        lista.push({
          event_revenue_id: receita.id,
          description: receita.description,
          expected_amount: Number(receita.expected_amount || 0),
          actual_amount: 0,
          expected_receipt_date: receita.expected_receipt_date || evento.event_date,
          actual_receipt_date: null,
          status: "pendente",
          payment_method: "",
          notes: "",
        });
      }
    }

    setRecebimentosParcelas(lista);
  }

  function adicionarParcelaRecebimento(eventRevenueId: string, description: string, defaultDate: string) {
    setRecebimentosParcelas((atual) => [
      ...atual,
      {
        event_revenue_id: eventRevenueId,
        description: `${description} — Parcela`,
        expected_amount: 0,
        actual_amount: 0,
        expected_receipt_date: defaultDate || null,
        actual_receipt_date: null,
        status: "pendente",
        payment_method: "",
        notes: "",
      },
    ]);
  }

  function atualizarParcelaRecebimento(
    index: number,
    alteracoes: Partial<RecebimentoParcela>
  ) {
    setRecebimentosParcelas((atual) =>
      atual.map((item, i) => (i === index ? { ...item, ...alteracoes } : item))
    );
  }

  function removerParcelaRecebimento(index: number) {
    setRecebimentosParcelas((atual) => atual.filter((_, i) => i !== index));
  }

  async function salvarRecebimentosEvento() {
    if (!eventoRecebimentos) return;

    const porReceita = new Map<string, RecebimentoParcela[]>();

    for (const parcela of recebimentosParcelas) {
      if (parcela.expected_amount <= 0) {
        alert(`Informe o valor previsto da parcela: ${parcela.description}.`);
        return;
      }

      if (parcela.status === "recebido") {
        if (parcela.actual_amount <= 0) {
          alert(`Informe o valor recebido da parcela: ${parcela.description}.`);
          return;
        }
        if (!parcela.actual_receipt_date) {
          alert(`Informe a data do recebimento da parcela: ${parcela.description}.`);
          return;
        }
      }

      const lista = porReceita.get(parcela.event_revenue_id) || [];
      lista.push(parcela);
      porReceita.set(parcela.event_revenue_id, lista);
    }

    setSalvandoRecebimentos(true);

    try {
      const { data: receitas, error: receitasError } = await supabase
        .from("event_revenues")
        .select("id,expected_amount,confirmed")
        .eq("event_id", eventoRecebimentos.id);

      if (receitasError) throw receitasError;

      for (const receita of receitas || []) {
        const { error: deleteError } = await supabase
          .from("event_revenue_receipts")
          .delete()
          .eq("event_revenue_id", receita.id);

        if (deleteError) throw deleteError;

        const parcelasDaReceita = porReceita.get(receita.id) || [];

        if (parcelasDaReceita.length > 0) {
          const { error: insertError } = await supabase
            .from("event_revenue_receipts")
            .insert(
              parcelasDaReceita.map((p) => ({
                event_revenue_id: p.event_revenue_id,
                description: p.description,
                expected_amount: p.expected_amount,
                actual_amount: p.status === "recebido" ? p.actual_amount : 0,
                expected_receipt_date: p.expected_receipt_date,
                actual_receipt_date:
                  p.status === "recebido" ? p.actual_receipt_date : null,
                status: p.status,
                payment_method: p.payment_method || null,
                notes: p.notes || null,
              }))
            );

          if (insertError) throw insertError;
        }
      }

      alert("Recebimentos salvos com sucesso!");
      setEventoRecebimentos(null);
      setRecebimentosParcelas([]);
      await carregarEventos();
    } catch (error: any) {
      console.error(error);
      alert(`Erro ao salvar recebimentos: ${error.message || "erro desconhecido"}`);
    } finally {
      setSalvandoRecebimentos(false);
    }
  }

async function abrirFechamentoEvento(evento: Evento) {
    setEventoFechando(evento);
    setReceitasFechamento([]);

    const { data, error } = await supabase
      .from("event_revenues")
      .select(
        "id,description,expected_amount,actual_amount,confirmed,status,expected_receipt_date,actual_receipt_date,notes"
      )
      .eq("event_id", evento.id)
      .order("created_at", { ascending: true });

    if (error) {
      console.error(error);
      setEventoFechando(null);
      alert(`Erro ao carregar as receitas do evento: ${error.message}`);
      return;
    }

    if (!data || data.length === 0) {
      setEventoFechando(null);
      alert("Este evento não possui receitas cadastradas.");
      return;
    }

    setReceitasFechamento(
      data.map((receita) => ({
        id: receita.id,
        description: receita.description,
        expected_amount: Number(receita.expected_amount || 0),
        actual_amount: Number(receita.actual_amount || 0),
        confirmed: Boolean(receita.confirmed),
        status: receita.status as ReceitaEvento["status"],
        expected_receipt_date: receita.expected_receipt_date || null,
        actual_receipt_date: receita.actual_receipt_date || null,
        notes: receita.notes || null,
      }))
    );
  }

  function atualizarReceitaFechamento(
    id: string,
    alteracoes: Partial<ReceitaEvento>
  ) {
    setReceitasFechamento((atual) =>
      atual.map((receita) =>
        receita.id === id ? { ...receita, ...alteracoes } : receita
      )
    );
  }

  const totalConfirmadoFechamento = useMemo(
    () =>
      receitasFechamento
        .filter((receita) => receita.confirmed)
        .reduce((total, receita) => total + Number(receita.expected_amount || 0), 0),
    [receitasFechamento]
  );

  const totalRecebidoFechamento = useMemo(
    () =>
      receitasFechamento
        .filter(
          (receita) =>
            receita.confirmed && receita.status === "recebido"
        )
        .reduce((total, receita) => total + Number(receita.actual_amount || 0), 0),
    [receitasFechamento]
  );

  const totalAReceberFechamento =
    totalConfirmadoFechamento - totalRecebidoFechamento;

  async function salvarFechamentoEvento() {
    if (!eventoFechando) return;

    for (const receita of receitasFechamento) {
      if (!receita.confirmed) continue;

      if (receita.status === "recebido") {
        if (Number(receita.actual_amount || 0) <= 0) {
          alert(`Informe o valor recebido para: ${receita.description}.`);
          return;
        }

        if (!receita.actual_receipt_date) {
          alert(`Informe a data do recebimento para: ${receita.description}.`);
          return;
        }
      }
    }

    setSalvandoFechamento(true);

    try {
      for (const receita of receitasFechamento) {
        const atualizacao = !receita.confirmed
          ? {
              confirmed: false,
              status: "cancelado" as const,
              actual_amount: 0,
              actual_receipt_date: null,
            }
          : receita.status === "recebido"
            ? {
                confirmed: true,
                status: "recebido" as const,
                actual_amount: Number(receita.actual_amount || 0),
                actual_receipt_date: receita.actual_receipt_date,
              }
            : {
                confirmed: true,
                status: "pendente" as const,
                actual_amount: 0,
                actual_receipt_date: null,
              };

        const { error } = await supabase
          .from("event_revenues")
          .update(atualizacao)
          .eq("id", receita.id);

        if (error) {
          console.error(error);
          throw new Error(
            `Erro ao atualizar ${receita.description}: ${error.message}`
          );
        }
      }

      const receitasAtualizadas = receitasFechamento.map((receita) =>
        !receita.confirmed
          ? { ...receita, confirmed: false, status: "cancelado" as const, actual_amount: 0, actual_receipt_date: null }
          : receita.status === "recebido"
            ? { ...receita, confirmed: true, status: "recebido" as const, actual_amount: Number(receita.actual_amount || 0) }
            : { ...receita, confirmed: true, status: "pendente" as const, actual_amount: 0, actual_receipt_date: null }
      );

      const totalRecebido = receitasAtualizadas
        .filter((receita) => receita.confirmed && receita.status === "recebido")
        .reduce((total, receita) => total + Number(receita.actual_amount || 0), 0);

      const datasRecebimento = receitasAtualizadas
        .filter((receita) => receita.confirmed && receita.status === "recebido" && receita.actual_receipt_date)
        .map((receita) => receita.actual_receipt_date as string)
        .sort();

      const ultimaDataRecebimento =
        datasRecebimento.length > 0
          ? datasRecebimento[datasRecebimento.length - 1]
          : null;

      const { error: eventoError } = await supabase
        .from("events")
        .update({
          actual_amount: totalRecebido,
          actual_receipt_date: ultimaDataRecebimento,
          status: "realizado",
        })
        .eq("id", eventoFechando.id);

      if (eventoError) {
        console.error(eventoError);
        throw new Error(`Erro ao fechar o evento: ${eventoError.message}`);
      }

      alert(
        `Evento fechado com sucesso!\n\nConfirmado: ${formatarMoeda(totalConfirmadoFechamento)}\nRecebido: ${formatarMoeda(totalRecebido)}\nA receber: ${formatarMoeda(totalConfirmadoFechamento - totalRecebido)}`
      );

      setEventoFechando(null);
      setReceitasFechamento([]);
      await carregarEventos();
    } catch (error) {
      console.error(error);
      alert(error instanceof Error ? error.message : "Erro ao fechar o evento.");
    } finally {
      setSalvandoFechamento(false);
    }
  }

  async function excluirEvento(
    id: string,
    nomeEvento: string
  ) {
    const confirmar = confirm(
      `Deseja excluir o evento "${nomeEvento}"?`
    );

    if (!confirmar) return;

    const { error } = await supabase
      .from("events")
      .delete()
      .eq("id", id);

    if (error) {
      console.error(error);
      alert("Erro ao excluir o evento.");
      return;
    }

    await carregarEventos();
  }

  return (
    <main className="min-h-screen bg-slate-100 p-6">
      <div className="mx-auto max-w-7xl">

        {/* CABEÇALHO */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-800">
              Eventos
            </h1>

            <p className="mt-1 text-sm text-slate-500">
              Controle de eventos, receitas e pagamentos da banda
            </p>
          </div>

          <button
            onClick={novoEvento}
            className="rounded-lg bg-slate-800 px-5 py-3 text-sm font-semibold text-white shadow hover:bg-slate-700"
          >
            + Novo evento
          </button>
        </div>

        {/* RECURRÊNCIA AUTOMÁTICA */}
        <section className="mb-6 rounded-xl border border-blue-200 bg-white shadow-sm">

          <div className="border-b border-blue-100 bg-blue-50 p-5">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-slate-800">
                  Eventos recorrentes
                </h2>

                <p className="mt-1 text-sm text-slate-600">
                  O sistema cria automaticamente as próximas 4 ocorrências de cada evento ativo.
                </p>
              </div>

              <button
                onClick={() => gerarProximasOcorrencias()}
                disabled={gerandoRecorrencias}
                className="rounded-lg bg-blue-600 px-5 py-3 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {gerandoRecorrencias
                  ? "Gerando..."
                  : "Atualizar próximas ocorrências"}
              </button>
            </div>

            {mensagemRecorrencia && (
              <div className="mt-4 rounded-lg border border-blue-200 bg-white p-3 text-sm font-semibold text-blue-700">
                {mensagemRecorrencia}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 p-5 md:grid-cols-2">
            {templates.map((template) => (
              <div
                key={template.id}
                className="rounded-xl border border-slate-200 bg-slate-50 p-5"
              >
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h3 className="text-lg font-bold text-slate-800">
                      {nomePadraoEvento(template.name)}
                    </h3>

                    <p className="text-sm text-slate-500">
                      {textoDiaSemana(Number(template.weekday))}
                    </p>

                    <p className="mt-1 text-xs font-semibold text-slate-400">
                      {localPadraoEvento(
                        template.name,
                        template.location
                      )}
                    </p>
                  </div>

                  <div className="text-right">
                    <p className="text-xs text-slate-500">
                      Total padrão
                    </p>
                    <p className="text-xl font-bold text-green-600">
                      {formatarMoeda(template.default_amount)}
                    </p>
                  </div>
                </div>

                {template.name.trim().toLowerCase() === "miami" && (
                  <div className="mt-4 rounded-lg bg-white p-3 text-sm">
                    <div className="flex justify-between">
                      <span>Evento</span>
                      <strong>R$ 1.300,00</strong>
                    </div>
                    <div className="mt-1 flex justify-between">
                      <span>Aluguel de som</span>
                      <strong>R$ 400,00</strong>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* FORMULÁRIO */}
        {mostrarFormulario && (
          <section
            ref={formularioRef}
            className="mb-6 scroll-mt-24 rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
          >

            <div className="mb-5 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-slate-800">
                  {eventoEditando ? "Editar evento" : "Novo evento"}
                </h2>

                <p className="text-sm text-slate-500">
                  {eventoEditando
                    ? "Altere os dados do evento e salve as mudanças."
                    : "Cadastre um evento particular ou uma ocorrência recorrente."}
                </p>
              </div>

              <button
                onClick={cancelarFormulario}
                className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-200"
              >
                Cancelar
              </button>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">

              <div>
                <label className="mb-1 block text-sm font-semibold text-slate-700">
                  Tipo de evento
                </label>

                <select
                  value={templateSelecionado}
                  disabled={Boolean(eventoEditando)}
                  onChange={(e) =>
                    selecionarTemplate(e.target.value)
                  }
                  className="w-full rounded-lg border border-slate-300 px-3 py-3 outline-none focus:border-slate-500"
                >
                  <option value="">
                    Evento particular
                  </option>

                  {templates.map((template) => (
                    <option
                      key={template.id}
                      value={template.id}
                    >
                      {nomePadraoEvento(template.name)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm font-semibold text-slate-700">
                  Nome do evento
                </label>

                <input
                  value={nome}
                  onChange={(e) =>
                    setNome(e.target.value)
                  }
                  placeholder="Ex.: Aniversário João"
                  className="w-full rounded-lg border border-slate-300 px-3 py-3 outline-none focus:border-slate-500"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-semibold text-slate-700">
                  Data do evento
                </label>

                <input
                  type="date"
                  value={dataEvento}
                  onChange={(e) =>
                    alterarDataEvento(e.target.value)
                  }
                  className="w-full rounded-lg border border-slate-300 px-3 py-3 outline-none focus:border-slate-500"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-semibold text-slate-700">
                  Horário
                </label>
                <input
                  type="time"
                  value={horarioEvento}
                  onChange={(e) => setHorarioEvento(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-3 outline-none focus:border-slate-500"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-semibold text-slate-700">
                  Local
                </label>

                <input
                  value={local}
                  onChange={(e) =>
                    setLocal(e.target.value)
                  }
                  placeholder="Local do evento"
                  className="w-full rounded-lg border border-slate-300 px-3 py-3 outline-none focus:border-slate-500"
                />
              </div>

              {!eventoEditando && !templateSelecionado ? (
                <div className="md:col-span-2 rounded-xl border border-blue-200 bg-blue-50 p-4">
                  <div className="mb-4">
                    <h3 className="text-base font-bold text-slate-800">Financeiro do evento</h3>
                    <p className="text-xs text-slate-500">Informe o valor total, o sinal já pago e quando o restante será recebido.</p>
                  </div>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
                    <div>
                      <label className="mb-1 block text-sm font-semibold text-slate-700">Valor total do evento</label>
                      <input type="number" step="0.01" value={valorTotalEvento} onChange={(e) => setValorTotalEvento(e.target.value)} placeholder="0,00" className="w-full rounded-lg border border-slate-300 bg-white px-3 py-3 outline-none focus:border-slate-500" />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-semibold text-slate-700">Sinal já pago</label>
                      <input type="number" step="0.01" value={valorSinal} onChange={(e) => setValorSinal(e.target.value)} placeholder="0,00" className="w-full rounded-lg border border-slate-300 bg-white px-3 py-3 outline-none focus:border-slate-500" />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-semibold text-slate-700">Data do pagamento do sinal</label>
                      <input type="date" value={dataPagamentoSinal} onChange={(e) => setDataPagamentoSinal(e.target.value)} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-3 outline-none focus:border-slate-500" />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-semibold text-slate-700">Data do pagamento do saldo</label>
                      <input type="date" value={dataPagamentoSaldo} onChange={(e) => setDataPagamentoSaldo(e.target.value)} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-3 outline-none focus:border-slate-500" />
                    </div>
                  </div>
                  <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
                    <div className="rounded-lg bg-white p-3"><span className="text-xs font-semibold text-slate-500">Valor total</span><strong className="mt-1 block text-lg text-slate-800">{moeda(Number(valorTotalEvento || 0))}</strong></div>
                    <div className="rounded-lg bg-white p-3"><span className="text-xs font-semibold text-slate-500">Sinal</span><strong className="mt-1 block text-lg text-green-600">{moeda(Number(valorSinal || 0))}</strong></div>
                    <div className="rounded-lg bg-white p-3"><span className="text-xs font-semibold text-slate-500">Saldo restante</span><strong className="mt-1 block text-lg text-blue-600">{moeda(Math.max(0, Number(valorTotalEvento || 0) - Number(valorSinal || 0)))}</strong></div>
                  </div>
                </div>
              ) : (
                <>
                  <div>
                    <label className="mb-1 block text-sm font-semibold text-slate-700">Valor previsto</label>
                    <input type="number" step="0.01" value={valorPrevisto} onChange={(e) => setValorPrevisto(e.target.value)} placeholder="0,00" className="w-full rounded-lg border border-slate-300 px-3 py-3 outline-none focus:border-slate-500" />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-semibold text-slate-700">Recebimento previsto</label>
                    <input type="date" value={dataRecebimento} onChange={(e) => setDataRecebimento(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-3 outline-none focus:border-slate-500" />
                  </div>
                </>
              )}

              {eventoEditando && (
                <div className="md:col-span-2 rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-bold text-slate-800">Financeiro</p>
                      <p className="text-xs text-slate-500">
                        Para alterar sinal, saldo ou recebimentos, use o botão Recebimentos do evento.
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-slate-500">Valor total</p>
                      <p className="text-lg font-bold text-slate-800">{formatarMoeda(Number((templateSelecionado ? valorPrevisto : valorTotalEvento).replace(",", ".") || 0))}</p>
                    </div>
                  </div>
                </div>
              )}

              <div className="md:col-span-2">
                <label className="mb-1 block text-sm font-semibold text-slate-700">
                  Observações
                </label>

                <textarea
                  value={observacoes}
                  onChange={(e) =>
                    setObservacoes(e.target.value)
                  }
                  placeholder="Observações do evento..."
                  rows={3}
                  className="w-full rounded-lg border border-slate-300 px-3 py-3 outline-none focus:border-slate-500"
                />
              </div>

            </div>

            <div className="mt-5 flex justify-end">
              <button
                onClick={salvarEvento}
                disabled={carregando}
                className="rounded-lg bg-green-600 px-6 py-3 text-sm font-bold text-white hover:bg-green-700 disabled:opacity-50"
              >
                {carregando
                  ? "Salvando..."
                  : "Salvar evento"}
              </button>
            </div>

          </section>
        )}
{mostrarMusicos && eventoSelecionado && (
  <section className="mb-6 rounded-xl border border-blue-200 bg-white shadow-sm">
    <div className="border-b border-blue-100 bg-blue-50 p-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-800">
            Músicos do evento
          </h2>

          <p className="mt-1 text-sm text-slate-500">
            {eventoSelecionado.name} —{" "}
            {formatarData(eventoSelecionado.event_date)}
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            setMostrarMusicos(false);
            setEventoSelecionado(null);
            setMusicosEvento([]);
          }}
          className="rounded-lg bg-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-300"
        >
          Fechar
        </button>
      </div>
    </div>

    <div className="p-5">

      <div className="mb-5 rounded-lg bg-slate-50 p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-700">
              Músicos selecionados
            </p>

            <p className="text-xs text-slate-500">
              Selecione os músicos e os instrumentos que eles farão neste evento.
            </p>
          </div>

          <div className="text-right">
            <p className="text-2xl font-bold text-slate-800">
              {musicosEvento.filter(
                (musico) =>
                  musico.instrumentosSelecionados.length > 0
              ).length}
            </p>

            <p className="text-xs text-slate-500">
              músicos
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-4">

        {musicosEvento.map((musico, index) => {
          const selecionado =
            musico.instrumentosSelecionados.length > 0;

          return (
            <div
              key={musico.musician_id}
              className={`rounded-xl border p-4 ${
                selecionado
                  ? "border-blue-300 bg-blue-50/40"
                  : "border-slate-200 bg-white"
              }`}
            >

              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">

                <div className="flex-1">

                  <label className="flex cursor-pointer items-center gap-3">
                    <input
                      type="checkbox"
                      checked={selecionado}
                      onChange={(e) => {
                        setMusicosEvento((atual) =>
                          atual.map((item, i) => {
                            if (i !== index) return item;

                            if (e.target.checked) {
                              return {
                                ...item,
                                instrumentosSelecionados:
                                  item.instrumentosSelecionados.length > 0
                                    ? item.instrumentosSelecionados
                                    : item.instrumentos.length > 0
                                      ? [item.instrumentos[0].id]
                                      : [],
                              };
                            }

                            return {
                              ...item,
                              instrumentosSelecionados: [],
                            };
                          })
                        );
                      }}
                      className="h-5 w-5 rounded border-slate-300"
                    />

                    <span className="text-lg font-bold text-slate-800">
                      {musico.musician_name}
                    </span>
                  </label>

                  <div className="mt-3">

                    <p className="mb-2 text-sm font-semibold text-slate-600">
                      Instrumentos neste evento
                    </p>

                    {musico.instrumentos.length === 0 ? (
                      <p className="text-sm text-red-500">
                        Nenhum instrumento cadastrado para este músico.
                      </p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {musico.instrumentos.map((instrumento) => {
                          const marcado =
                            musico.instrumentosSelecionados.includes(
                              instrumento.id
                            );

                          return (
                            <label
                              key={instrumento.id}
                              className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                                marcado
                                  ? "border-blue-300 bg-blue-100 text-blue-800"
                                  : "border-slate-200 bg-white text-slate-600"
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={marcado}
                                onChange={() => {
                                  setMusicosEvento((atual) =>
                                    atual.map((item, i) => {
                                      if (i !== index) return item;

                                      const instrumentosAtuais =
                                        item.instrumentosSelecionados;

                                      const novosInstrumentos =
                                        marcado
                                          ? instrumentosAtuais.filter(
                                              (id) =>
                                                id !== instrumento.id
                                            )
                                          : [
                                              ...instrumentosAtuais,
                                              instrumento.id,
                                            ];

                                      return {
                                        ...item,
                                        instrumentosSelecionados:
                                          novosInstrumentos,
                                      };
                                    })
                                  );
                                }}
                                className="h-4 w-4 rounded border-slate-300"
                              />

                              {instrumento.name}
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>

                <div className="w-full lg:w-72">

                  <div className="rounded-lg border border-slate-200 bg-white p-4">

                    <p className="text-sm font-semibold text-slate-700">
                      Cachê
                    </p>

                    <p className="mt-1 text-xs text-slate-500">
                      Cadastrado:{" "}
                      {formatarMoeda(musico.default_cache)}
                    </p>

                    <label className="mt-3 flex cursor-pointer items-center gap-2 text-sm text-slate-700">
                      <input
                        type="checkbox"
                        checked={!musico.use_default_cache}
                        onChange={(e) => {
                          setMusicosEvento((atual) =>
                            atual.map((item, i) => {
                              if (i !== index) return item;

                              const alterar = e.target.checked;

                              return {
                                ...item,
                                use_default_cache: !alterar,
                                event_cache: alterar
                                  ? item.event_cache
                                  : item.default_cache,
                              };
                            })
                          );
                        }}
                        className="h-4 w-4 rounded border-slate-300"
                      />

                      Alterar cachê deste evento
                    </label>

                    {!musico.use_default_cache ? (
                      <div className="mt-3">
                        <label className="mb-1 block text-xs font-semibold text-slate-600">
                          Cachê neste evento
                        </label>

                        <input
                          type="number"
                          step="0.01"
                          value={musico.event_cache}
                          onChange={(e) => {
                            const valor = Number(
                              e.target.value
                            );

                            setMusicosEvento((atual) =>
                              atual.map((item, i) =>
                                i === index
                                  ? {
                                      ...item,
                                      event_cache: valor,
                                    }
                                  : item
                              )
                            );
                          }}
                          className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-blue-500"
                        />
                      </div>
                    ) : (
                      <div className="mt-3 rounded-lg bg-green-50 px-3 py-2">
                        <p className="text-xs text-green-700">
                          Cachê deste evento
                        </p>

                        <p className="text-lg font-bold text-green-700">
                          {formatarMoeda(
                            musico.default_cache
                          )}
                        </p>
                      </div>
                    )}

                  </div>
<div className="mt-4 border-t border-slate-200 pt-4">
  <p className="text-sm font-semibold text-slate-700 mb-2">
    Pagamento
  </p>

  <div className="flex items-center gap-3">
    <span
      className={`rounded-full px-3 py-1 text-xs font-semibold ${
        musico.payment_status === "pago"
          ? "bg-green-100 text-green-700"
          : "bg-yellow-100 text-yellow-700"
      }`}
    >
      {musico.payment_status === "pago" ? "Pago" : "Pendente"}
    </span>

    <button
      type="button"
      onClick={async () => {
        const novoStatus =
          musico.payment_status === "pago" ? "pendente" : "pago";

        const { error } = await supabase
          .from("event_musicians")
          .update({
            payment_status: novoStatus,
            payment_date:
              novoStatus === "pago"
                ? new Date().toISOString().split("T")[0]
                : null,
          })
          .eq("id", musico.id);

        if (error) {
          console.error(error);
          alert("Erro ao atualizar o pagamento.");
          return;
        }

        setMusicosEvento((atual) =>
          atual.map((item, i) =>
            i === index
              ? {
                  ...item,
                  payment_status: novoStatus,
                  payment_date:
                    novoStatus === "pago"
                      ? new Date().toISOString().split("T")[0]
                      : null,
                }
              : item
          )
        );
      }}
      className={`rounded-lg px-3 py-2 text-xs font-semibold ${
        musico.payment_status === "pago"
          ? "bg-slate-200 text-slate-700 hover:bg-slate-300"
          : "bg-green-100 text-green-700 hover:bg-green-200"
      }`}
    >
      {musico.payment_status === "pago"
        ? "Voltar para pendente"
        : "Marcar como pago"}
    </button>
  </div>

  {musico.payment_status === "pago" && musico.payment_date && (
    <p className="mt-2 text-xs text-slate-500">
      Pago em {formatarData(musico.payment_date)}
    </p>
  )}
</div>
                </div>

              </div>

            </div>
          );
        })}

      </div>

      <div className="mt-6 flex flex-col gap-4 rounded-xl bg-slate-800 p-5 text-white md:flex-row md:items-center md:justify-between">

        <div>
          <p className="text-sm text-slate-300">
            Total dos músicos selecionados
          </p>

          <p className="text-2xl font-bold">
            {formatarMoeda(
              musicosEvento
                .filter(
                  (musico) =>
                    musico.instrumentosSelecionados.length > 0
                )
                .reduce(
                  (total, musico) =>
                    total +
                    Number(
                      musico.use_default_cache
                        ? musico.default_cache
                        : musico.event_cache
                    ),
                  0
                )
            )}
          </p>
        </div>

        <button
          type="button"
          onClick={salvarMusicosEvento}
          disabled={salvandoMusicos}
          className="rounded-lg bg-green-500 px-6 py-3 text-sm font-bold text-white hover:bg-green-600 disabled:opacity-50"
        >
          {salvandoMusicos
            ? "Salvando..."
            : "Salvar músicos do evento"}
        </button>

      </div>

    </div>
  </section>
)}

{eventoRecebimentos && (
  <section
    ref={recebimentosRef}
    className="mb-6 scroll-mt-24 rounded-xl border border-violet-200 bg-white shadow-sm"
  >
    <div className="flex items-center justify-between border-b border-violet-200 bg-violet-50 px-5 py-4">
      <div>
        <h2 className="text-xl font-bold text-slate-800">Recebimentos</h2>
        <p className="text-sm text-slate-500">
          {eventoRecebimentos.name} — {formatarData(eventoRecebimentos.event_date)}
        </p>
      </div>

      <button
        onClick={() => {
          setEventoRecebimentos(null);
          setRecebimentosParcelas([]);
        }}
        className="rounded-lg bg-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-300"
      >
        Fechar
      </button>
    </div>

    <div className="p-5">
      <div className="mb-5 rounded-xl bg-slate-800 p-5 text-white">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div>
            <p className="text-xs uppercase text-slate-300">Total previsto</p>
            <p className="mt-1 text-xl font-bold">
              {formatarMoeda(
                recebimentosParcelas.reduce((s, p) => s + Number(p.expected_amount || 0), 0)
              )}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase text-slate-300">Recebido</p>
            <p className="mt-1 text-xl font-bold text-green-300">
              {formatarMoeda(
                recebimentosParcelas
                  .filter((p) => p.status === "recebido")
                  .reduce((s, p) => s + Number(p.actual_amount || 0), 0)
              )}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase text-slate-300">A receber</p>
            <p className="mt-1 text-xl font-bold text-yellow-300">
              {formatarMoeda(
                recebimentosParcelas
                  .reduce((s, p) => s + Number(p.expected_amount || 0), 0) -
                recebimentosParcelas
                  .filter((p) => p.status === "recebido")
                  .reduce((s, p) => s + Number(p.actual_amount || 0), 0)
              )}
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        {recebimentosParcelas.map((parcela, index) => (
          <div key={`${parcela.event_revenue_id}-${index}`} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-6">
              <div className="xl:col-span-2">
                <label className="mb-1 block text-xs font-semibold text-slate-600">
                  Descrição
                </label>
                <input
                  value={parcela.description}
                  onChange={(e) =>
                    atualizarParcelaRecebimento(index, { description: e.target.value })
                  }
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">
                  Valor previsto
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={parcela.expected_amount}
                  onChange={(e) =>
                    atualizarParcelaRecebimento(index, {
                      expected_amount: Number(e.target.value || 0),
                    })
                  }
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">
                  Data prevista
                </label>
                <input
                  type="date"
                  value={parcela.expected_receipt_date || ""}
                  onChange={(e) =>
                    atualizarParcelaRecebimento(index, {
                      expected_receipt_date: e.target.value || null,
                    })
                  }
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">
                  Status
                </label>
                <select
                  value={parcela.status}
                  onChange={(e) =>
                    atualizarParcelaRecebimento(index, {
                      status: e.target.value as RecebimentoParcela["status"],
                      actual_amount:
                        e.target.value === "recebido"
                          ? parcela.actual_amount || parcela.expected_amount
                          : 0,
                      actual_receipt_date:
                        e.target.value === "recebido"
                          ? parcela.actual_receipt_date ||
                            new Date().toISOString().split("T")[0]
                          : null,
                    })
                  }
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
                >
                  <option value="pendente">Pendente</option>
                  <option value="recebido">Recebido</option>
                  <option value="cancelado">Cancelado</option>
                </select>
              </div>

              <div className="flex items-end justify-end">
                <button
                  type="button"
                  onClick={() => removerParcelaRecebimento(index)}
                  className="rounded-lg bg-red-100 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-200"
                >
                  Remover
                </button>
              </div>

              {parcela.status === "recebido" && (
                <>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-600">
                      Valor recebido
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={parcela.actual_amount}
                      onChange={(e) =>
                        atualizarParcelaRecebimento(index, {
                          actual_amount: Number(e.target.value || 0),
                        })
                      }
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-600">
                      Data recebida
                    </label>
                    <input
                      type="date"
                      value={parcela.actual_receipt_date || ""}
                      onChange={(e) =>
                        atualizarParcelaRecebimento(index, {
                          actual_receipt_date: e.target.value || null,
                        })
                      }
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-600">
                      Forma de pagamento
                    </label>
                    <input
                      value={parcela.payment_method}
                      onChange={(e) =>
                        atualizarParcelaRecebimento(index, {
                          payment_method: e.target.value,
                        })
                      }
                      placeholder="PIX, dinheiro, transferência..."
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
                    />
                  </div>
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        {Array.from(
          new Map<string, string>(
            recebimentosParcelas.map((p) => [p.event_revenue_id, p.description.split(" — ")[0]] as [string, string])
          ).entries()
        ).map(([id, descricao]) => (
          <button
            key={id}
            type="button"
            onClick={() =>
              adicionarParcelaRecebimento(
                id,
                descricao,
                eventoRecebimentos.event_date
              )
            }
            className="rounded-lg bg-violet-100 px-4 py-2 text-sm font-semibold text-violet-700 hover:bg-violet-200"
          >
            + Parcela em {descricao}
          </button>
        ))}
      </div>
    </div>

    <div className="flex justify-end border-t border-slate-200 px-5 py-4">
      <button
        onClick={salvarRecebimentosEvento}
        disabled={salvandoRecebimentos}
        className="rounded-lg bg-violet-600 px-6 py-3 text-sm font-bold text-white hover:bg-violet-700 disabled:opacity-50"
      >
        {salvandoRecebimentos ? "Salvando..." : "Salvar recebimentos"}
      </button>
    </div>
  </section>
)}

{eventoFechando && (
  <section className="mb-6 rounded-xl border border-green-200 bg-white shadow-sm">
    <div className="flex items-center justify-between border-b border-green-200 bg-green-50 px-5 py-4">
      <div>
        <h2 className="text-xl font-bold text-slate-800">
          Fechar evento
        </h2>
        <p className="text-sm text-slate-500">
          {eventoFechando.name} — {formatarData(eventoFechando.event_date)}
        </p>
      </div>

      <button
        onClick={() => {
          setEventoFechando(null);
          setReceitasFechamento([]);
        }}
        className="rounded-lg bg-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-300"
      >
        Cancelar
      </button>
    </div>

    <div className="p-5">
      <div className="mb-5 grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="rounded-lg bg-slate-100 p-4">
          <p className="text-xs font-semibold uppercase text-slate-500">
            Confirmado
          </p>
          <p className="mt-1 text-xl font-bold text-slate-800">
            {formatarMoeda(totalConfirmadoFechamento)}
          </p>
        </div>

        <div className="rounded-lg bg-green-50 p-4">
          <p className="text-xs font-semibold uppercase text-green-700">
            Recebido
          </p>
          <p className="mt-1 text-xl font-bold text-green-700">
            {formatarMoeda(totalRecebidoFechamento)}
          </p>
        </div>

        <div className="rounded-lg bg-yellow-50 p-4">
          <p className="text-xs font-semibold uppercase text-yellow-700">
            A receber
          </p>
          <p className="mt-1 text-xl font-bold text-yellow-700">
            {formatarMoeda(totalAReceberFechamento)}
          </p>
        </div>
      </div>

      <div className="space-y-4">
        {receitasFechamento.map((receita) => (
          <div
            key={receita.id}
            className={`rounded-xl border p-4 ${
              receita.confirmed
                ? "border-slate-200 bg-white"
                : "border-red-200 bg-red-50"
            }`}
          >
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="flex-1">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-lg font-bold text-slate-800">
                      {receita.description}
                    </p>
                    <p className="text-sm text-slate-500">
                      Previsto: {formatarMoeda(receita.expected_amount)}
                    </p>
                  </div>

                  <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-slate-700">
                    <input
                      type="checkbox"
                      checked={receita.confirmed}
                      onChange={(e) =>
                        atualizarReceitaFechamento(receita.id, {
                          confirmed: e.target.checked,
                          status: e.target.checked ? "pendente" : "cancelado",
                          actual_amount: e.target.checked ? receita.actual_amount : 0,
                          actual_receipt_date: e.target.checked ? receita.actual_receipt_date : null,
                        })
                      }
                      className="h-5 w-5 rounded border-slate-300"
                    />
                    Aconteceu
                  </label>
                </div>

                {!receita.confirmed ? (
                  <div className="mt-4 rounded-lg border border-red-200 bg-white px-4 py-3 text-sm font-semibold text-red-700">
                    Esta receita será excluída do resultado e não entrará no Caixa.
                  </div>
                ) : (
                  <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-slate-600">
                        Situação
                      </label>
                      <select
                        value={
                          receita.status === "recebido"
                            ? "recebido"
                            : receita.status === "parcial"
                              ? "parcial"
                              : "pendente"
                        }
                        onChange={(e) => {
                          const novoStatus = e.target.value as "pendente" | "parcial" | "recebido";
                          atualizarReceitaFechamento(receita.id, {
                            status: novoStatus,
                            actual_amount:
                              novoStatus === "recebido"
                                ? receita.actual_amount || receita.expected_amount
                                : 0,
                            actual_receipt_date:
                              novoStatus === "recebido"
                                ? receita.actual_receipt_date || new Date().toISOString().split("T")[0]
                                : null,
                          });
                        }}
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-green-500"
                      >
                        <option value="pendente">Confirmado — ainda não recebido</option>
                        <option value="parcial">Recebido parcialmente</option>
                        <option value="recebido">Recebido</option>
                      </select>
                    </div>

                    <div>
                      <label className="mb-1 block text-xs font-semibold text-slate-600">
                        Valor recebido
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        value={receita.actual_amount}
                        disabled={receita.status !== "recebido"}
                        onChange={(e) =>
                          atualizarReceitaFechamento(receita.id, {
                            actual_amount: Number(e.target.value || 0),
                          })
                        }
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-green-500 disabled:bg-slate-100 disabled:text-slate-400"
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-xs font-semibold text-slate-600">
                        Data do recebimento
                      </label>
                      <input
                        type="date"
                        value={receita.actual_receipt_date || ""}
                        disabled={receita.status !== "recebido"}
                        onChange={(e) =>
                          atualizarReceitaFechamento(receita.id, {
                            actual_receipt_date: e.target.value || null,
                          })
                        }
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-green-500 disabled:bg-slate-100 disabled:text-slate-400"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 rounded-xl bg-slate-800 p-5 text-white">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div>
            <p className="text-xs uppercase text-slate-300">Confirmado</p>
            <p className="mt-1 text-xl font-bold">
              {formatarMoeda(totalConfirmadoFechamento)}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase text-slate-300">Recebido</p>
            <p className="mt-1 text-xl font-bold">
              {formatarMoeda(totalRecebidoFechamento)}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase text-slate-300">A receber</p>
            <p className="mt-1 text-xl font-bold">
              {formatarMoeda(totalAReceberFechamento)}
            </p>
          </div>
        </div>
      </div>
    </div>

    <div className="flex justify-end border-t border-slate-200 px-5 py-4">
      <button
        onClick={salvarFechamentoEvento}
        disabled={salvandoFechamento || receitasFechamento.length === 0}
        className="rounded-lg bg-green-600 px-6 py-3 text-sm font-bold text-white hover:bg-green-700 disabled:opacity-50"
      >
        {salvandoFechamento
          ? "Salvando..."
          : "Confirmar fechamento do evento"}
      </button>
    </div>
  </section>
)}
        {/* LISTA DE EVENTOS */}
        <section className="rounded-xl border border-slate-200 bg-white shadow-sm">

          <div className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 p-5">
            <div>
              <h2 className="text-xl font-bold text-slate-800">
                Eventos cadastrados
              </h2>

              <p className="mt-1 text-sm text-slate-500">
                Eventos futuros e eventos já realizados.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="min-w-[280px]">
                <label className="mb-1 block text-xs font-semibold uppercase text-slate-500">
                  Buscar evento
                </label>

                <div className="relative">
                  <input
                    type="text"
                    value={buscaEvento}
                    onChange={(e) => setBuscaEvento(e.target.value)}
                    placeholder="Nome, local, data ou status..."
                    className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 pr-10 text-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-100"
                  />

                  {buscaEvento && (
                    <button
                      type="button"
                      onClick={() => setBuscaEvento("")}
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md px-2 py-1 text-sm font-bold text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                      title="Limpar busca"
                    >
                      ×
                    </button>
                  )}
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold uppercase text-slate-500">
                  Ano
                </label>

                <select
                  value={anoSelecionado}
                  onChange={(e) =>
                    setAnoSelecionado(Number(e.target.value))
                  }
                  className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700"
                >
                  {anosDisponiveis.map((ano) => (
                    <option key={ano} value={ano}>
                      {ano}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {eventosDoAno.length === 0 ? (
            <div className="p-10 text-center text-slate-500">
              {buscaEvento.trim()
                ? `Nenhum evento encontrado para "${buscaEvento}".`
                : `Nenhum evento cadastrado em ${anoSelecionado}.`}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">

                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-5 py-4">
                      Evento
                    </th>

                    <th className="px-5 py-4">
                      Data
                    </th>

                    <th className="px-5 py-4">
                      Horário
                    </th>

                    <th className="px-5 py-4">
                      Valor
                    </th>

                    <th className="px-5 py-4">
                      Recebimento
                    </th>

                    <th className="px-5 py-4">
                      Status
                    </th>

                    <th className="px-5 py-4">
                      Ações
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100">

                  {eventosDoAno.map((evento) => (
                    <tr
                      key={evento.id}
                      className="hover:bg-slate-50"
                    >
                      <td className="px-5 py-4">
                        <div className="font-semibold text-slate-800">
                          {nomePadraoEvento(evento.name)}
                        </div>

                        {(evento.location || evento.name) && (
                          <div className="text-xs text-slate-500">
                            {localPadraoEvento(
                              evento.name,
                              evento.location
                            )}
                          </div>
                        )}
                      </td>

                      <td className="px-5 py-4 text-slate-600">
                        {formatarData(
                          evento.event_date
                        )}
                      </td>

                      <td className="px-5 py-4 text-slate-600">
                        {evento.event_time || "-"}
                      </td>

                      <td className="px-5 py-4 font-semibold text-slate-700">
                        {formatarMoeda(
  evento.status === "realizado" && evento.actual_amount !== null
    ? evento.actual_amount
    : evento.expected_amount
)}
                      </td>

                      <td className="px-5 py-4 text-slate-600">
                        {formatarData(
                          evento.expected_receipt_date
                        )}
                      </td>

                      <td className="px-5 py-4">
                        <select
                          value={evento.status}
                          onChange={(e) =>
                            alterarStatus(
                              evento.id,
                              e.target.value
                            )
                          }
                          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold"
                        >
                          <option value="agendado">
                            Agendado
                          </option>

                          <option value="realizado">
                            Realizado
                          </option>

                          <option value="nao_realizado">
                            Não realizado
                          </option>

                          <option value="cancelado">
                            Cancelado
                          </option>
                        </select>
                      </td>

<td className="px-5 py-4">
  <div className="flex flex-wrap gap-2">
    <button
      onClick={() => editarEvento(evento)}
      className="rounded-lg bg-slate-800 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-700"
    >
      Editar
    </button>

    <button
      onClick={() => abrirRecebimentosEvento(evento)}
      className="rounded-lg bg-violet-100 px-3 py-2 text-xs font-semibold text-violet-700 hover:bg-violet-200"
    >
      Recebimentos
    </button>

{evento.status !== "realizado" && evento.status !== "cancelado" && (
  <button
    onClick={() => abrirFechamentoEvento(evento)}
    className="rounded-lg bg-green-100 px-3 py-2 text-xs font-semibold text-green-700 hover:bg-green-200"
  >
    Fechar evento
  </button>
)}
    <button
      onClick={() => abrirMusicosEvento(evento)}
      className="rounded-lg bg-blue-100 px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-200"
    >
      Músicos
    </button>

    <button
      onClick={() =>
        excluirEvento(
          evento.id,
          evento.name
        )
      }
      className="rounded-lg bg-red-100 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-200"
    >
      Excluir
    </button>

  </div>
</td>
</tr>
))}

                </tbody>

              </table>
            </div>
          )}

        </section>

      </div>
    </main>
  );
}