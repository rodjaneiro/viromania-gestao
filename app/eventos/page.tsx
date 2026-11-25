"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { lerObservacoes, montarObservacoes, linkTelefone, textoHorario } from "@/lib/contato";

/*
 * EVENTOS
 *
 * Cadastro e edição dos eventos: nome, data, horário, local, valor cobrado,
 * sinal (valor + data em que foi recebido), data prevista do restante
 * (ou do recebimento total, quando não há sinal) e contato do responsável.
 *
 * O fechamento do evento, os músicos e o recebimento do restante ficam na
 * aba Fechamento. Tudo é sincronizado com a Agenda do Google.
 */

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
  expected_receipt_date: string | null;
  status: string;
  notes: string | null;
};

type Receita = {
  id: string;
  event_id: string;
  description: string;
  expected_amount: number;
  actual_amount: number;
  status: string;
};

type Parcela = {
  id: string;
  event_revenue_id: string;
  description: string;
  expected_amount: number;
  actual_amount: number;
  expected_receipt_date: string | null;
  actual_receipt_date: string | null;
  status: string;
};

function moeda(valor: number) {
  return Number(valor || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function numero(valor: string) {
  const s = String(valor || "").trim();
  if (!s) return 0;
  const n = Number(s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s);
  return Number.isFinite(n) ? n : NaN;
}

function dataBR(data: string | null | undefined) {
  if (!data) return "-";
  const [ano, mes, dia] = String(data).slice(0, 10).split("-");
  return `${dia}/${mes}/${ano}`;
}

function hojeISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function adicionarDias(data: string, dias: number) {
  const [a, m, d] = data.split("-").map(Number);
  const dt = new Date(a, m - 1, d);
  dt.setDate(dt.getDate() + dias);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

function diaSemana(data: string) {
  const [a, m, d] = data.split("-").map(Number);
  return new Date(a, m - 1, d).getDay();
}

function ehSinal(descricao: string) {
  const d = String(descricao || "").trim().toLowerCase();
  return d === "sinal" || d.startsWith("sinal ");
}

const DIAS = ["Todo domingo", "Toda segunda", "Toda terça", "Toda quarta", "Toda quinta", "Toda sexta", "Todo sábado"];

const STATUS: Record<string, { rotulo: string; classe: string }> = {
  agendado: { rotulo: "Agendado", classe: "bg-blue-100 text-blue-700" },
  realizado: { rotulo: "Realizado", classe: "bg-green-100 text-green-700" },
  nao_realizado: { rotulo: "Não realizado", classe: "bg-red-100 text-red-700" },
};

const FORM_VAZIO = {
  templateId: "",
  nome: "",
  data: "",
  horario: "",
  termino: "",
  local: "",
  valor: "",
  sinal: "",
  dataSinal: "",
  dataRestante: "",
  responsavel: "",
  telefone: "",
  observacoes: "",
};

export default function EventosPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [receitas, setReceitas] = useState<Receita[]>([]);
  const [parcelas, setParcelas] = useState<Parcela[]>([]);

  const [ano, setAno] = useState(new Date().getFullYear());
  const [busca, setBusca] = useState("");
  const [verRealizados, setVerRealizados] = useState(false);

  const [formAberto, setFormAberto] = useState(false);
  const [editando, setEditando] = useState<Evento | null>(null);
  const [form, setForm] = useState(FORM_VAZIO);
  const [salvando, setSalvando] = useState(false);
  const formRef = useRef<HTMLElement | null>(null);

  const [mensagem, setMensagem] = useState("");
  const [erro, setErro] = useState("");
  const [gerando, setGerando] = useState(false);

  // ---------------------------------------------------------
  // CARREGAMENTO
  // ---------------------------------------------------------
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
    setTemplates(data || []);
    return data || [];
  }

  async function carregarEventos() {
    const { data, error } = await supabase
      .from("events")
      .select("id,template_id,name,event_date,event_time,location,expected_amount,expected_receipt_date,status,notes")
      .order("event_date", { ascending: true });

    if (error) {
      console.error(error);
      setErro("Erro ao carregar os eventos.");
      return;
    }

    const lista = (data || []) as Evento[];
    setEventos(lista);

    const { data: rec, error: recError } = await supabase
      .from("event_revenues")
      .select("id,event_id,description,expected_amount,actual_amount,status");
    if (recError) {
      console.error(recError);
      return;
    }
    setReceitas((rec || []) as Receita[]);

    const { data: par, error: parError } = await supabase
      .from("event_revenue_receipts")
      .select("id,event_revenue_id,description,expected_amount,actual_amount,expected_receipt_date,actual_receipt_date,status");
    if (parError) {
      console.error(parError);
      return;
    }
    setParcelas((par || []) as Parcela[]);
  }

  // ---------------------------------------------------------
  // EVENTOS RECORRENTES (Lapa, Miami...)
  // Mantém as próximas ocorrências criadas automaticamente.
  // ---------------------------------------------------------
  async function receitasDoTemplate(template: Template, eventId: string, data: string) {
    const { data: modelos, error } = await supabase
      .from("recurring_event_revenue_templates")
      .select("description, default_amount, receipt_days_after")
      .eq("template_id", template.id)
      .eq("active", true)
      .order("created_at", { ascending: true });

    if (error) throw error;

    if (modelos && modelos.length > 0) {
      return modelos.map((r) => ({
        event_id: eventId,
        description: r.description,
        expected_amount: Number(r.default_amount || 0),
        actual_amount: 0,
        confirmed: true,
        status: "pendente",
        expected_receipt_date: adicionarDias(data, Number(r.receipt_days_after || 0)),
      }));
    }

    const nome = template.name.trim().toLowerCase();
    if (nome === "miami" || nome === "domingueira do miami") {
      return [
        { description: "Evento", expected_amount: 1300 },
        { description: "Aluguel de som", expected_amount: 400 },
      ].map((r) => ({
        event_id: eventId,
        ...r,
        actual_amount: 0,
        confirmed: true,
        status: "pendente",
        expected_receipt_date: adicionarDias(data, 1),
      }));
    }

    return [
      {
        event_id: eventId,
        description: "Evento",
        expected_amount: Number(template.default_amount || 0),
        actual_amount: 0,
        confirmed: true,
        status: "pendente",
        expected_receipt_date: adicionarDias(data, Number(template.receipt_days_after || 0)),
      },
    ];
  }

  async function gerarProximasOcorrencias(modelos = templates, anoAlvo?: number) {
    if (modelos.length === 0) return;

    setGerando(true);

    try {
      const anoAtual = new Date().getFullYear();
      const futuro = !!anoAlvo && anoAlvo > anoAtual;
      const inicio = futuro ? `${anoAlvo}-01-01` : hojeISO();
      const fim = futuro ? `${anoAlvo}-12-31` : adicionarDias(inicio, 35);

      const { data: existentes, error } = await supabase
        .from("events")
        .select("template_id, event_date")
        .in("template_id", modelos.map((t) => t.id))
        .gte("event_date", inicio)
        .lte("event_date", fim);

      if (error) throw error;

      const jaExiste = new Set((existentes || []).map((e) => `${e.template_id}|${e.event_date}`));

      for (const template of modelos) {
        let encontrados = 0;

        for (let i = 0; i <= (futuro ? 364 : 35) && encontrados < 5; i++) {
          const data = adicionarDias(inicio, i);
          if (diaSemana(data) !== Number(template.weekday)) continue;

          const chave = `${template.id}|${data}`;
          if (jaExiste.has(chave)) {
            encontrados += 1;
            continue;
          }

          // UNIQUE (template_id, event_date) evita duplicar
          const { data: criado, error: criarErro } = await supabase
            .from("events")
            .upsert(
              {
                template_id: template.id,
                name: template.name,
                event_date: data,
                location: template.location || null,
                expected_amount: Number(template.default_amount || 0),
                actual_amount: null,
                expected_receipt_date: adicionarDias(data, Number(template.receipt_days_after || 0)),
                actual_receipt_date: null,
                status: "agendado",
                notes: "Ocorrência criada automaticamente pelo sistema.",
              },
              { onConflict: "template_id,event_date", ignoreDuplicates: true }
            )
            .select("id")
            .maybeSingle();

          if (criarErro) throw criarErro;

          if (criado) {
            const linhas = await receitasDoTemplate(template, criado.id, data);
            const { error: recErro } = await supabase.from("event_revenues").insert(linhas);
            if (recErro) {
              await supabase.from("events").delete().eq("id", criado.id);
              throw recErro;
            }
          }

          jaExiste.add(chave);
          encontrados += 1;
        }
      }

      await carregarEventos();
    } catch (e: any) {
      console.error(e);
      setErro(`Erro ao gerar eventos recorrentes: ${e?.message || "erro desconhecido"}`);
    } finally {
      setGerando(false);
    }
  }

  useEffect(() => {
    (async () => {
      const modelos = await carregarTemplates();
      await carregarEventos();
      if (modelos.length > 0) await gerarProximasOcorrencias(modelos);
    })();
  }, []);

  useEffect(() => {
    if (templates.length === 0) return;
    if (ano > new Date().getFullYear()) gerarProximasOcorrencias(templates, ano);
  }, [ano, templates.length]);

  useEffect(() => {
    if (!formAberto) return;
    const t = window.setTimeout(
      () => formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
      60
    );
    return () => window.clearTimeout(t);
  }, [formAberto, editando]);

  // ---------------------------------------------------------
  // DADOS DE CADA EVENTO (valor, sinal, restante)
  // ---------------------------------------------------------
  function resumoFinanceiro(evento: Evento) {
    const rec = receitas.filter((r) => r.event_id === evento.id);
    const ids = new Set(rec.map((r) => r.id));
    const par = parcelas.filter((p) => ids.has(p.event_revenue_id));
    const sinais = par.filter((p) => ehSinal(p.description) && p.status === "recebido");
    const sinal = sinais.reduce((s, p) => s + Number(p.actual_amount || p.expected_amount || 0), 0);
    const dataSinal = sinais.map((p) => p.actual_receipt_date).filter(Boolean).sort()[0] || null;
    const valor = Number(evento.expected_amount || 0);

    return {
      receitas: rec,
      parcelas: par,
      valor,
      sinal,
      dataSinal,
      restante: Math.max(valor - sinal, 0),
    };
  }

  const anos = useMemo(() => {
    const atual = new Date().getFullYear();
    return Array.from(
      new Set([atual - 1, atual, atual + 1, ...eventos.map((e) => Number(e.event_date.slice(0, 4)))])
    ).sort((a, b) => a - b);
  }, [eventos]);

  const eventosDoAno = useMemo(() => {
    const termo = busca.trim().toLowerCase();

    return eventos
      .filter((e) => Number(e.event_date.slice(0, 4)) === ano)
      .filter((e) => (verRealizados ? e.status === "realizado" : e.status !== "realizado"))
      .filter((e) => {
        if (!termo) return true;
        const obs = lerObservacoes(e.notes);
        return [e.name, e.location || "", dataBR(e.event_date), obs.responsavel, obs.telefone]
          .join(" ")
          .toLowerCase()
          .includes(termo);
      })
      .sort((a, b) =>
        `${a.event_date}T${a.event_time || "00:00"}`.localeCompare(`${b.event_date}T${b.event_time || "00:00"}`)
      );
  }, [eventos, ano, busca, verRealizados]);

  const qtdRealizados = eventos.filter(
    (e) => Number(e.event_date.slice(0, 4)) === ano && e.status === "realizado"
  ).length;

  // ---------------------------------------------------------
  // FORMULÁRIO
  // ---------------------------------------------------------
  function abrirNovo() {
    setEditando(null);
    setForm(FORM_VAZIO);
    setErro("");
    setMensagem("");
    setFormAberto(true);
  }

  function abrirEdicao(evento: Evento) {
    const fin = resumoFinanceiro(evento);
    const obs = lerObservacoes(evento.notes);

    setEditando(evento);
    setForm({
      templateId: evento.template_id || "",
      nome: evento.name || "",
      data: evento.event_date || "",
      horario: evento.event_time ? String(evento.event_time).slice(0, 5) : "",
      termino: obs.termino,
      local: evento.location || "",
      valor: String(fin.valor || ""),
      sinal: fin.sinal > 0 ? String(fin.sinal) : "",
      dataSinal: fin.dataSinal || "",
      dataRestante: evento.expected_receipt_date || "",
      responsavel: obs.responsavel,
      telefone: obs.telefone,
      observacoes: obs.texto,
    });
    setErro("");
    setMensagem("");
    setFormAberto(true);
  }

  function escolherTemplate(id: string) {
    const t = templates.find((x) => x.id === id);
    setForm((f) => ({
      ...f,
      templateId: id,
      nome: t ? t.name : f.nome,
      local: t?.location || f.local,
      valor: t ? String(t.default_amount || "") : f.valor,
      dataRestante:
        t && f.data ? adicionarDias(f.data, Number(t.receipt_days_after || 0)) : f.dataRestante,
    }));
  }

  // Eventos com mais de uma receita (ex.: Miami = Evento + Aluguel de som)
  // têm o valor definido pelas receitas, não pelo campo.
  const valorBloqueado = useMemo(() => {
    if (!editando) return false;
    return receitas.filter((r) => r.event_id === editando.id).length > 1;
  }, [editando, receitas]);

  async function sincronizarGoogle(eventId: string) {
    try {
      const r = await fetch("/api/google/calendar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId }),
      });
      const j = await r.json();
      if (j.notConnected) return " (Google Agenda não está conectado)";
      if (!r.ok || !j.success) return ` (não sincronizou com o Google: ${j.error || "erro"})`;
      return j.updated ? " e atualizado na Agenda do Google" : " e enviado para a Agenda do Google";
    } catch {
      return " (não foi possível sincronizar com o Google)";
    }
  }

  async function salvar() {
    setErro("");
    setMensagem("");

    const valor = numero(form.valor);
    const sinal = numero(form.sinal);

    if (!form.nome.trim()) return setErro("Informe o nome do evento.");
    if (!form.data) return setErro("Informe a data do evento.");
    if (!valorBloqueado && (!Number.isFinite(valor) || valor <= 0))
      return setErro("Informe o valor cobrado.");
    if (!Number.isFinite(sinal) || sinal < 0) return setErro("Valor do sinal inválido.");
    if (!valorBloqueado && sinal > valor) return setErro("O sinal não pode ser maior que o valor cobrado.");
    if (sinal > 0 && !form.dataSinal) return setErro("Informe a data em que o sinal foi recebido.");

    if (form.termino && !form.horario) return setErro("Informe o horário de início.");

    const notas = montarObservacoes({
      termino: form.termino,
      responsavel: form.responsavel,
      telefone: form.telefone,
      texto: form.observacoes,
    });

    setSalvando(true);

    try {
      let eventId: string;

      if (!editando) {
        // ------------------- NOVO -------------------
        const template = templates.find((t) => t.id === form.templateId) || null;

        const { data: criado, error } = await supabase
          .from("events")
          .insert({
            template_id: template?.id || null,
            name: form.nome.trim(),
            event_date: form.data,
            event_time: form.horario || null,
            location: form.local.trim() || null,
            expected_amount: valor,
            actual_amount: null,
            expected_receipt_date: form.dataRestante || null,
            status: "agendado",
            notes: notas,
          })
          .select("id")
          .single();

        if (error || !criado) {
          throw new Error(
            error?.code === "23505"
              ? "Já existe esse evento recorrente nessa data."
              : error?.message || "Evento não criado."
          );
        }

        eventId = criado.id;

        try {
          const linhas = template
            ? await receitasDoTemplate(template, eventId, form.data)
            : [
                {
                  event_id: eventId,
                  description: "Evento",
                  expected_amount: valor,
                  actual_amount: 0,
                  confirmed: true,
                  status: "pendente",
                  expected_receipt_date: form.dataRestante || form.data,
                },
              ];

          if (!template && linhas.length === 1) linhas[0].expected_amount = valor;

          const { data: recCriadas, error: recErro } = await supabase
            .from("event_revenues")
            .insert(linhas)
            .select("id,description");
          if (recErro || !recCriadas?.length) throw recErro || new Error("Receita não criada.");

          const principal =
            recCriadas.find((r) => r.description === "Evento") || recCriadas[0];

          const novasParcelas: any[] = [];
          if (sinal > 0) {
            novasParcelas.push({
              event_revenue_id: principal.id,
              description: "Sinal",
              expected_amount: sinal,
              actual_amount: sinal,
              expected_receipt_date: form.dataSinal,
              actual_receipt_date: form.dataSinal,
              status: "recebido",
              payment_method: null,
              notes: "Sinal informado no cadastro do evento",
            });
          }
          if (!template && valor - sinal > 0) {
            novasParcelas.push({
              event_revenue_id: principal.id,
              description: "Saldo final",
              expected_amount: valor - sinal,
              actual_amount: 0,
              expected_receipt_date: form.dataRestante || form.data,
              actual_receipt_date: null,
              status: "pendente",
              payment_method: null,
              notes: null,
            });
          }
          if (novasParcelas.length) {
            const { error: parErro } = await supabase.from("event_revenue_receipts").insert(novasParcelas);
            if (parErro) throw parErro;
          }

          if (sinal > 0) {
            await supabase
              .from("event_revenues")
              .update({ actual_amount: sinal, status: "parcial" })
              .eq("id", principal.id);
          }
        } catch (e) {
          // Não deixa evento "pela metade"
          await supabase.from("events").delete().eq("id", eventId);
          throw e;
        }
      } else {
        // ------------------- EDIÇÃO -------------------
        eventId = editando.id;
        const fin = resumoFinanceiro(editando);

        const atualizacao: Record<string, any> = {
          name: form.nome.trim(),
          event_date: form.data,
          event_time: form.horario || null,
          location: form.local.trim() || null,
          expected_receipt_date: form.dataRestante || null,
          notes: notas,
        };
        if (!valorBloqueado) atualizacao.expected_amount = valor;

        const { error } = await supabase.from("events").update(atualizacao).eq("id", eventId);
        if (error) throw error;

        const principal =
          fin.receitas.find((r) => r.description === "Evento") || fin.receitas[0] || null;

        if (principal) {
          const valorPrincipal = valorBloqueado ? Number(principal.expected_amount || 0) : valor;

          if (!valorBloqueado && fin.receitas.length === 1) {
            const { error: e1 } = await supabase
              .from("event_revenues")
              .update({ expected_amount: valor, expected_receipt_date: form.dataRestante || null })
              .eq("id", principal.id);
            if (e1) throw e1;
          }

          // Sinal
          const sinaisAtuais = fin.parcelas.filter((p) => ehSinal(p.description));
          if (sinal > 0) {
            const dados = {
              expected_amount: sinal,
              actual_amount: sinal,
              expected_receipt_date: form.dataSinal,
              actual_receipt_date: form.dataSinal,
              status: "recebido",
            };
            if (sinaisAtuais.length > 0) {
              const { error: e2 } = await supabase
                .from("event_revenue_receipts")
                .update(dados)
                .eq("id", sinaisAtuais[0].id);
              if (e2) throw e2;
              if (sinaisAtuais.length > 1) {
                await supabase
                  .from("event_revenue_receipts")
                  .delete()
                  .in("id", sinaisAtuais.slice(1).map((p) => p.id));
              }
            } else {
              const { error: e3 } = await supabase.from("event_revenue_receipts").insert({
                event_revenue_id: principal.id,
                description: "Sinal",
                ...dados,
                payment_method: null,
                notes: "Sinal informado no cadastro do evento",
              });
              if (e3) throw e3;
            }
          } else if (sinaisAtuais.length > 0) {
            const { error: e4 } = await supabase
              .from("event_revenue_receipts")
              .delete()
              .in("id", sinaisAtuais.map((p) => p.id));
            if (e4) throw e4;
          }

          // Restante ainda pendente
          const pendente = fin.parcelas.find(
            (p) =>
              p.event_revenue_id === principal.id &&
              !ehSinal(p.description) &&
              p.status !== "recebido"
          );
          if (pendente) {
            await supabase
              .from("event_revenue_receipts")
              .update({
                expected_amount: Math.max(valorPrincipal - sinal, 0),
                expected_receipt_date: form.dataRestante || null,
              })
              .eq("id", pendente.id);
          }

          // Total recebido da receita = parcelas recebidas
          const { data: recebidas } = await supabase
            .from("event_revenue_receipts")
            .select("actual_amount,status")
            .eq("event_revenue_id", principal.id)
            .eq("status", "recebido");
          const recebido = (recebidas || []).reduce(
            (s: number, p: any) => s + Number(p.actual_amount || 0),
            0
          );
          await supabase
            .from("event_revenues")
            .update({
              actual_amount: recebido,
              status:
                principal.status === "recebido" || principal.status === "cancelado"
                  ? principal.status
                  : recebido > 0
                    ? "parcial"
                    : "pendente",
            })
            .eq("id", principal.id);
        }
      }

      const google = await sincronizarGoogle(eventId);

      setMensagem(`Evento ${editando ? "atualizado" : "cadastrado"}${google}.`);
      setFormAberto(false);
      setEditando(null);
      setForm(FORM_VAZIO);
      await carregarEventos();
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e: any) {
      console.error(e);
      setErro(e?.message || "Não foi possível salvar o evento.");
    } finally {
      setSalvando(false);
    }
  }

  async function excluir(evento: Evento) {
    if (
      !window.confirm(
        `Excluir o evento "${evento.name}" de ${dataBR(evento.event_date)}?\n\nEle também será removido da Agenda do Google.`
      )
    )
      return;

    setErro("");
    setMensagem("");

    try {
      await fetch(`/api/google/calendar?eventId=${encodeURIComponent(evento.id)}`, {
        method: "DELETE",
      });
    } catch (e) {
      console.error("Erro ao remover do Google:", e);
    }

    const { error } = await supabase.from("events").delete().eq("id", evento.id);

    if (error) {
      console.error(error);
      setErro("Erro ao excluir o evento.");
      return;
    }

    setMensagem("Evento excluído.");
    await carregarEventos();
  }

  // ---------------------------------------------------------
  // TELA
  // ---------------------------------------------------------
  const valorNum = numero(form.valor);
  const sinalNum = numero(form.sinal);
  const temSinal = Number.isFinite(sinalNum) && sinalNum > 0;

  const campo =
    "w-full rounded-lg border border-slate-400 bg-white px-3 py-2.5 text-base text-slate-900 outline-none focus:border-slate-800 disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400";
  const rotulo = "mb-1 block text-sm font-semibold text-slate-800";

  return (
    <main className="min-h-screen bg-slate-100 p-3 text-slate-800 sm:p-6">
      <div className="mx-auto max-w-7xl">
        {/* CABEÇALHO */}
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold sm:text-3xl">Eventos</h1>
            <p className="text-sm text-slate-600">
              Agenda de shows, valores e contato do responsável.
            </p>
          </div>

          <div className="flex w-full gap-2 sm:w-auto">
            <a
              href="/api/google/auth"
              className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-center text-xs font-bold text-slate-700 sm:flex-none sm:text-sm"
            >
              Conectar Google Agenda
            </a>
            <button
              onClick={abrirNovo}
              className="flex-1 rounded-lg bg-slate-900 px-4 py-2 text-sm font-bold text-white sm:flex-none"
            >
              + Novo evento
            </button>
          </div>
        </div>

        {mensagem && (
          <div className="mb-3 rounded-lg border border-green-300 bg-green-50 p-3 text-sm font-semibold text-green-800">
            {mensagem}
          </div>
        )}
        {erro && !formAberto && (
          <div className="mb-3 rounded-lg border border-red-300 bg-red-50 p-3 text-sm font-semibold text-red-700">
            {erro}
          </div>
        )}

        {/* FORMULÁRIO */}
        {formAberto && (
          <section
            ref={formRef}
            className="mb-4 scroll-mt-16 rounded-xl border border-slate-300 bg-white p-3 shadow-sm sm:p-5"
          >
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold">{editando ? "Editar evento" : "Novo evento"}</h2>
                <p className="text-xs text-slate-600">
                  {editando
                    ? "Corrija o que precisar e salve. A Agenda do Google é atualizada junto."
                    : "O evento é enviado automaticamente para a Agenda do Google."}
                </p>
              </div>
              <button
                onClick={() => {
                  setFormAberto(false);
                  setEditando(null);
                  setErro("");
                }}
                className="rounded-lg px-3 py-1.5 text-sm font-bold text-slate-500 hover:bg-slate-100"
              >
                Fechar
              </button>
            </div>

            {erro && (
              <div className="mb-3 rounded-lg border border-red-300 bg-red-50 p-3 text-sm font-semibold text-red-700">
                {erro}
              </div>
            )}

            <div className="grid gap-3 md:grid-cols-2">
              {!editando && templates.length > 0 && (
                <div className="md:col-span-2">
                  <label className={rotulo}>Tipo de evento</label>
                  <select
                    value={form.templateId}
                    onChange={(e) => escolherTemplate(e.target.value)}
                    className={campo}
                  >
                    <option value="">Evento particular</option>
                    {templates.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} (recorrente)
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="md:col-span-2">
                <label className={rotulo}>Nome do evento</label>
                <input
                  value={form.nome}
                  onChange={(e) => setForm({ ...form, nome: e.target.value })}
                  placeholder="Ex.: Aniversário da Maria"
                  className={campo}
                />
              </div>

              <div>
                  <label className={rotulo}>Data</label>
                  <input
                    type="date"
                    value={form.data}
                    onChange={(e) => {
                      const data = e.target.value;
                      const t = templates.find((x) => x.id === form.templateId);
                      setForm((f) => ({
                        ...f,
                        data,
                        dataRestante:
                          !editando && t && data
                            ? adicionarDias(data, Number(t.receipt_days_after || 0))
                            : f.dataRestante || (!editando ? data : f.dataRestante),
                      }));
                    }}
                    className={campo}
                  />
              </div>

              <div>
                <label className={rotulo}>Horário</label>
                <div className="flex items-center gap-2">
                  <input
                    type="time"
                    aria-label="Horário de início"
                    value={form.horario}
                    onChange={(e) => setForm({ ...form, horario: e.target.value })}
                    className={campo}
                  />
                  <span className="shrink-0 text-sm font-semibold text-slate-600">às</span>
                  <input
                    type="time"
                    aria-label="Horário de término"
                    value={form.termino}
                    onChange={(e) => setForm({ ...form, termino: e.target.value })}
                    className={campo}
                  />
                </div>
                {form.horario && form.termino && form.termino <= form.horario && (
                  <p className="mt-1 text-xs text-slate-600">Termina no dia seguinte.</p>
                )}
              </div>

              <div className="md:col-span-2">
                <label className={rotulo}>Local</label>
                <input
                  value={form.local}
                  onChange={(e) => setForm({ ...form, local: e.target.value })}
                  placeholder="Ex.: Salão do clube"
                  className={campo}
                />
              </div>

              {/* FINANCEIRO */}
              <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 md:col-span-2">
                <p className="mb-2 text-sm font-bold text-blue-900">Valores</p>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <label className={rotulo}>Valor cobrado</label>
                    <input
                      inputMode="decimal"
                      value={form.valor}
                      disabled={valorBloqueado}
                      onChange={(e) => setForm({ ...form, valor: e.target.value })}
                      placeholder="Ex.: 2.500,00"
                      className={campo}
                    />
                    {valorBloqueado && (
                      <p className="mt-1 text-xs text-slate-600">
                        Este evento tem mais de uma receita (ex.: evento + aluguel de som); o valor vem
                        delas.
                      </p>
                    )}
                  </div>

                  <div>
                    <label className={rotulo}>Sinal recebido (opcional)</label>
                    <input
                      inputMode="decimal"
                      value={form.sinal}
                      onChange={(e) => setForm({ ...form, sinal: e.target.value })}
                      placeholder="0,00"
                      className={campo}
                    />
                  </div>

                  <div>
                    <label className={rotulo}>Data em que recebeu o sinal</label>
                    <input
                      type="date"
                      value={form.dataSinal}
                      disabled={!temSinal}
                      onChange={(e) => setForm({ ...form, dataSinal: e.target.value })}
                      className={campo}
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className={rotulo}>
                      {temSinal
                        ? "Data prevista para receber o restante"
                        : "Data prevista para receber o valor total"}
                    </label>
                    <input
                      type="date"
                      value={form.dataRestante}
                      onChange={(e) => setForm({ ...form, dataRestante: e.target.value })}
                      className={campo}
                    />
                  </div>
                </div>

                {!valorBloqueado && Number.isFinite(valorNum) && valorNum > 0 && (
                  <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                    <div className="rounded-lg bg-white p-2">
                      <div className="text-slate-600">Cobrado</div>
                      <div className="text-sm font-bold">{moeda(valorNum)}</div>
                    </div>
                    <div className="rounded-lg bg-white p-2">
                      <div className="text-slate-600">Sinal</div>
                      <div className="text-sm font-bold text-green-700">
                        {moeda(temSinal ? sinalNum : 0)}
                      </div>
                    </div>
                    <div className="rounded-lg bg-white p-2">
                      <div className="text-slate-600">{temSinal ? "Restante" : "A receber"}</div>
                      <div className="text-sm font-bold text-blue-700">
                        {moeda(Math.max(valorNum - (temSinal ? sinalNum : 0), 0))}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* CONTATO */}
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 md:col-span-2">
                <p className="mb-2 text-sm font-bold text-slate-800">
                  Responsável pelo evento <span className="font-normal text-slate-600">(opcional)</span>
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className={rotulo}>Nome</label>
                    <input
                      value={form.responsavel}
                      onChange={(e) => setForm({ ...form, responsavel: e.target.value })}
                      placeholder="Ex.: Maria Souza"
                      className={campo}
                    />
                  </div>
                  <div>
                    <label className={rotulo}>Telefone</label>
                    <input
                      type="tel"
                      inputMode="tel"
                      value={form.telefone}
                      onChange={(e) => setForm({ ...form, telefone: e.target.value })}
                      placeholder="Ex.: (32) 99999-0000"
                      className={campo}
                    />
                  </div>
                </div>
              </div>

              <div className="md:col-span-2">
                <label className={rotulo}>Observações</label>
                <textarea
                  rows={3}
                  value={form.observacoes}
                  onChange={(e) => setForm({ ...form, observacoes: e.target.value })}
                  placeholder="Informações extras do evento"
                  className={campo}
                />
              </div>
            </div>

            <div className="mt-4 flex gap-2 sm:justify-end">
              <button
                onClick={() => {
                  setFormAberto(false);
                  setEditando(null);
                  setErro("");
                }}
                className="flex-1 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 sm:flex-none"
              >
                Cancelar
              </button>
              <button
                onClick={salvar}
                disabled={salvando}
                className="flex-1 rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50 sm:flex-none"
              >
                {salvando ? "Salvando..." : editando ? "Salvar alterações" : "Cadastrar evento"}
              </button>
            </div>
          </section>
        )}

        {/* FILTROS */}
        <section className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-2.5 shadow-sm">
          <select
            value={ano}
            onChange={(e) => setAno(Number(e.target.value))}
            className="rounded-lg border border-slate-300 px-2 py-2 text-sm font-semibold"
          >
            {anos.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>

          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar evento, local ou responsável"
            className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />

          <button
            onClick={() => setVerRealizados((v) => !v)}
            className={`w-full rounded-lg px-3 py-2 text-xs font-bold sm:w-auto ${
              verRealizados ? "bg-green-600 text-white" : "bg-slate-100 text-slate-700"
            }`}
          >
            {verRealizados ? "← Ver próximos eventos" : `Ver realizados (${qtdRealizados})`}
          </button>
        </section>

        {templates.length > 0 && !verRealizados && (
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-900">
            <span>
              Recorrentes criados automaticamente:{" "}
              {templates.map((t) => `${t.name} (${DIAS[Number(t.weekday)] || "-"})`).join(" · ")}
            </span>
            <button
              onClick={() => gerarProximasOcorrencias()}
              disabled={gerando}
              className="font-bold underline disabled:opacity-50"
            >
              {gerando ? "Atualizando..." : "Atualizar"}
            </button>
          </div>
        )}

        {/* LISTA */}
        {eventosDoAno.length === 0 ? (
          <div className="rounded-xl bg-white p-8 text-center text-sm text-slate-500 shadow-sm">
            Nenhum evento {verRealizados ? "realizado" : "agendado"} em {ano}.
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm lg:divide-y lg:divide-slate-100">
            {/* Cabeçalho das colunas (computador) */}
            <div className="hidden grid-cols-[56px_minmax(0,1fr)_110px_120px_120px_100px_150px] items-center gap-3 bg-slate-50 px-4 py-2 text-[11px] font-bold uppercase tracking-wide text-slate-500 lg:grid">
              <div>Data</div>
              <div>Evento</div>
              <div className="text-right">Cobrado</div>
              <div className="text-right">Sinal</div>
              <div className="text-right">Restante</div>
              <div className="text-center">Status</div>
              <div className="text-right">Ações</div>
            </div>

            {eventosDoAno.map((evento) => {
              const fin = resumoFinanceiro(evento);
              const obs = lerObservacoes(evento.notes);
              const st = STATUS[evento.status] || { rotulo: evento.status, classe: "bg-slate-100 text-slate-700" };
              const [a, m, d] = evento.event_date.split("-").map(Number);
              const dt = new Date(a, m - 1, d);
              const mostrarObs = obs.texto && !obs.texto.startsWith("Ocorrência criada automaticamente");

              const caixaData = (
                <div className="flex h-14 w-12 shrink-0 flex-col items-center justify-center rounded-lg border border-slate-300 bg-slate-50">
                  <span className="text-[10px] font-bold uppercase text-slate-500">
                    {dt.toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", "")}
                  </span>
                  <span className="text-lg font-extrabold leading-5">{String(d).padStart(2, "0")}</span>
                  <span className="text-[10px] font-semibold uppercase text-slate-500">
                    {dt.toLocaleDateString("pt-BR", { month: "short" }).replace(".", "")}
                  </span>
                </div>
              );

              const contato = (obs.responsavel || obs.telefone) && (
                <p className="mt-1 text-xs text-slate-700">
                  👤 {obs.responsavel || "Responsável"}
                  {obs.telefone && (
                    <>
                      {" · "}
                      <a href={linkTelefone(obs.telefone)} className="font-semibold text-blue-700 underline">
                        {obs.telefone}
                      </a>
                    </>
                  )}
                </p>
              );

              const botoes = (classe: string) => (
                <>
                  <button
                    onClick={() => abrirEdicao(evento)}
                    className={`${classe} rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-800 hover:bg-slate-200`}
                  >
                    Editar
                  </button>
                  <button
                    onClick={() => excluir(evento)}
                    className={`${classe} rounded-lg bg-red-50 px-3 py-1.5 text-xs font-bold text-red-700 hover:bg-red-100`}
                  >
                    Excluir
                  </button>
                </>
              );

              return (
                <div key={evento.id} className="border-b border-slate-100 last:border-0 lg:border-0">
                  {/* ===== COMPUTADOR: uma linha por evento ===== */}
                  <div className="hidden grid-cols-[56px_minmax(0,1fr)_110px_120px_120px_100px_150px] items-center gap-3 px-4 py-3 hover:bg-slate-50 lg:grid">
                    {caixaData}

                    <div className="min-w-0">
                      <h3 className="truncate font-bold">{evento.name}</h3>
                      <p className="truncate text-xs text-slate-600">
                        {evento.event_time ? `${textoHorario(evento.event_time, obs.termino)} · ` : ""}
                        {evento.location || "Local não informado"}
                      </p>
                      {contato}
                      {mostrarObs && <p className="truncate text-xs text-slate-500">📝 {obs.texto}</p>}
                    </div>

                    <div className="text-right text-sm font-bold">{moeda(fin.valor)}</div>

                    <div className="text-right">
                      <div className="text-sm font-bold text-green-700">{fin.sinal > 0 ? moeda(fin.sinal) : "—"}</div>
                      {fin.sinal > 0 && fin.dataSinal && (
                        <div className="text-[11px] text-slate-500">{dataBR(fin.dataSinal)}</div>
                      )}
                    </div>

                    <div className="text-right">
                      <div className="text-sm font-bold text-blue-700">{moeda(fin.restante)}</div>
                      {evento.expected_receipt_date && (
                        <div className="text-[11px] text-slate-500">{dataBR(evento.expected_receipt_date)}</div>
                      )}
                    </div>

                    <div className="text-center">
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${st.classe}`}>{st.rotulo}</span>
                    </div>

                    <div className="flex justify-end gap-2">{botoes("")}</div>
                  </div>

                  {/* ===== CELULAR: cartão ===== */}
                  <div className="flex gap-3 p-3 lg:hidden">
                    {caixaData}

                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-bold leading-tight">{evento.name}</h3>
                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${st.classe}`}>
                          {st.rotulo}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-slate-600">
                        {evento.event_time ? `${textoHorario(evento.event_time, obs.termino)} · ` : ""}
                        {evento.location || "Local não informado"}
                      </p>

                      <div className="mt-2 grid grid-cols-3 gap-1.5 text-[11px]">
                        <div className="rounded-md bg-slate-50 px-2 py-1">
                          <div className="text-slate-500">Cobrado</div>
                          <div className="font-bold text-slate-900">{moeda(fin.valor)}</div>
                        </div>
                        <div className="rounded-md bg-green-50 px-2 py-1">
                          <div className="text-slate-500">Sinal</div>
                          <div className="font-bold text-green-700">{fin.sinal > 0 ? moeda(fin.sinal) : "—"}</div>
                          {fin.sinal > 0 && fin.dataSinal && (
                            <div className="text-[10px] text-slate-500">{dataBR(fin.dataSinal)}</div>
                          )}
                        </div>
                        <div className="rounded-md bg-blue-50 px-2 py-1">
                          <div className="text-slate-500">{fin.sinal > 0 ? "Restante" : "Total"}</div>
                          <div className="font-bold text-blue-700">{moeda(fin.restante)}</div>
                          {evento.expected_receipt_date && (
                            <div className="text-[10px] text-slate-500">{dataBR(evento.expected_receipt_date)}</div>
                          )}
                        </div>
                      </div>

                      {contato}
                      {mostrarObs && <p className="mt-1 line-clamp-2 text-xs text-slate-500">📝 {obs.texto}</p>}

                      <div className="mt-2 flex gap-2">{botoes("flex-1")}</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
