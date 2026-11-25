import { supabase } from "@/lib/supabase";
import { lerAjuste, ehDesconto, totalPessoas, valorPessoa } from "@/lib/despesas";
import { inicioDaSemana, dataISO } from "@/lib/semana";

type AnyRow = Record<string, any>;

export const MANUAL_PREFIX = "MANUAL_CAIXA";

export function isSignal(description: string) {
  const d = String(description || "").trim().toLowerCase();
  return d === "sinal" || d.startsWith("sinal ");
}

/**
 * A antiga sincronização da tela de Eventos chegou a gravar o mesmo
 * recebimento automático 2 ou 3 vezes. Aqui consideramos cada cópia
 * idêntica (mesma receita, descrição, valor e data, criada
 * automaticamente) apenas uma vez.
 */
export function semDuplicadosAutomaticos<T extends Record<string, any>>(lista: T[]): T[] {
  const vistos = new Set<string>();
  return lista.filter((r) => {
    const notas = String(r.notes || "");
    const automatico =
      notas.startsWith("Recebimento sincronizado") ||
      notas.startsWith("Complemento automático");
    if (!automatico) return true;
    const chave = [
      r.event_revenue_id,
      String(r.description || "").trim().toLowerCase(),
      Number(r.actual_amount || 0).toFixed(2),
      r.actual_receipt_date || "",
      r.status,
    ].join("|");
    if (vistos.has(chave)) return false;
    vistos.add(chave);
    return true;
  });
}

export type CaixaSetup = {
  id: string | null;
  initialBalance: number;
  startDate: string;
};

export async function carregarCaixaSetup(): Promise<CaixaSetup> {
  const { data, error } = await supabase
    .from("cash_setup")
    .select("*")
    .limit(1)
    .maybeSingle();

  if (error) throw error;

  return {
    id: data?.id != null ? String(data.id) : null,
    initialBalance: Number(data?.initial_balance || 0),
    startDate: String(data?.start_date || "1900-01-01"),
  };
}

/**
 * Define o saldo de partida do caixa.
 * Só altera a tabela cash_setup: eventos, músicos, bonificações,
 * fechamentos e movimentações continuam intactos.
 */
export async function salvarCaixaSetup(initialBalance: number, startDate: string) {
  const atual = await carregarCaixaSetup();

  const payload = {
    initial_balance: initialBalance,
    start_date: startDate,
  };

  const { error } = atual.id
    ? await supabase.from("cash_setup").update(payload).eq("id", atual.id)
    : await supabase.from("cash_setup").insert(payload);

  if (error) throw error;
}

/**
 * Calcula o saldo do caixa de forma acumulada desde a data de início
 * configurada em cash_setup (ou desde o override informado).
 *
 * Regras:
 * - Sinais entram no caixa na data em que foram recebidos.
 * - O restante do evento entra na data em que foi recebido.
 * - O valor previsto (cobrado) nunca entra no caixa.
 * - Saídas (músicos, sócios, despesas, manuais) contam pela data de pagamento.
 * - Só conta o que tem data igual ou posterior à data de início.
 */
export async function calcularCaixa(override?: {
  initialBalance: number;
  startDate: string;
}) {
  const setup = override
    ? { id: null, ...override }
    : await carregarCaixaSetup();

  const initialBalance = setup.initialBalance;
  const startDate = setup.startDate;

  const [closingsRes, receiptsRes, revenuesRes, musiciansRes, expensesRes, manualRes] =
    await Promise.all([
      supabase
        .from("weekly_closings")
        .select(
          "id,week_start,week_end,rodrigo_amount,marlon_amount,rodrigo_paid,marlon_paid,rodrigo_payment_date,marlon_payment_date"
        )
        .order("week_end", { ascending: false }),
      supabase
        .from("event_revenue_receipts")
        .select("id,event_revenue_id,description,actual_amount,actual_receipt_date,status,notes")
        .eq("status", "recebido"),
      supabase.from("event_revenues").select("id,event_id"),
      supabase
        .from("event_musicians")
        .select("event_cache,payment_status,payment_date,event_id,musician_id")
        .eq("payment_status", "pago")
        .not("payment_date", "is", null)
        .gte("payment_date", startDate),
      supabase
        .from("event_expenses")
        .select("event_id,amount,payment_date,notes")
        .not("payment_date", "is", null),
      supabase
        .from("cash_transactions")
        .select("id,transaction_date,description,transaction_type,amount,direction,notes,created_at")
        .eq("transaction_type", "receita")
        .is("event_id", null)
        .is("musician_id", null)
        .gte("transaction_date", startDate)
        .order("transaction_date", { ascending: false })
        .order("created_at", { ascending: false }),
    ]);

  for (const r of [closingsRes, receiptsRes, revenuesRes, musiciansRes, expensesRes, manualRes]) {
    if (r.error) throw r.error;
  }

  const closings = (closingsRes.data || []) as AnyRow[];
  const receipts = semDuplicadosAutomaticos((receiptsRes.data || []) as AnyRow[]);
  const revenues = (revenuesRes.data || []) as AnyRow[];

  const lastClosing = closings[0] || null;
  const weekStart = lastClosing ? String(lastClosing.week_start) : "";
  const weekEnd = lastClosing ? String(lastClosing.week_end) : "";

  // ---------------------------------------------------------
  // Recebimentos de eventos
  //
  // Todo valor realmente recebido entra no caixa na data do
  // recebimento: o sinal na data em que foi pago e o restante
  // na data em que foi recebido (normalmente o fechamento).
  // O valor previsto nunca entra no caixa.
  // ---------------------------------------------------------
  const revenueToEvent = new Map<string, string>();
  for (const r of revenues) revenueToEvent.set(String(r.id), String(r.event_id));

  const eventIds = [...new Set(receipts.map((r) => revenueToEvent.get(String(r.event_revenue_id))).filter(Boolean))] as string[];

  const eventsById = new Map<string, AnyRow>();
  if (eventIds.length) {
    const eventsRes = await supabase
      .from("events")
      .select("id,name,event_date")
      .in("id", eventIds);
    if (eventsRes.error) throw eventsRes.error;
    for (const e of (eventsRes.data || []) as AnyRow[]) eventsById.set(String(e.id), e);
  }

  // Recebimentos antigos sem data usam a data do evento
  const receiptDate = (r: AnyRow) => {
    if (r.actual_receipt_date) return String(r.actual_receipt_date).slice(0, 10);
    const ev = eventsById.get(revenueToEvent.get(String(r.event_revenue_id)) || "");
    return ev ? String(ev.event_date) : "";
  };

  const receiptsInPeriod = receipts.filter((r) => {
    const d = receiptDate(r);
    return !!d && d >= startDate;
  });

  const signals = receiptsInPeriod.filter((r) => isSignal(String(r.description || "")));
  const signalsTotal = signals.reduce((s, r) => s + Number(r.actual_amount || 0), 0);

  const eventEntries = receiptsInPeriod
    .filter((r) => !isSignal(String(r.description || "")))
    .reduce((s, r) => s + Number(r.actual_amount || 0), 0);

  const breakdownMap = new Map<string, AnyRow>();
  for (const r of receiptsInPeriod) {
    const eventId = revenueToEvent.get(String(r.event_revenue_id)) || "";
    const ev = eventsById.get(eventId);
    const item = breakdownMap.get(eventId) || {
      event: ev?.name || "Evento",
      date: ev?.event_date || "",
      signals: 0,
      rest: 0,
      received: 0,
    };
    const v = Number(r.actual_amount || 0);
    if (isSignal(String(r.description || ""))) item.signals += v;
    else item.rest += v;
    item.received += v;
    breakdownMap.set(eventId, item);
  }
  const eventBreakdown = [...breakdownMap.values()].sort((x, y) =>
    String(y.date).localeCompare(String(x.date))
  );

  // ---------------------------------------------------------
  // Saídas
  // ---------------------------------------------------------
  const musicianRows = (musiciansRes.data || []) as AnyRow[];
  const allExpenses = (expensesRes.data || []) as AnyRow[];

  // Reembolsos (+) e descontos (−) dos músicos: acertados quando o
  // músico é pago em algum evento da mesma semana (terça a segunda).
  const expensesWithMusicians = allExpenses.filter(
    (d) => Object.keys(lerAjuste(d.notes).musicos).length > 0
  );

  const weekByEvent = new Map<string, string>();
  const eventIdsForWeeks = [
    ...new Set([
      ...expensesWithMusicians.map((d) => String(d.event_id)),
      ...musicianRows.map((m) => String(m.event_id)),
    ]),
  ];
  if (expensesWithMusicians.length && eventIdsForWeeks.length) {
    const evRes = await supabase
      .from("events")
      .select("id,event_date")
      .in("id", eventIdsForWeeks);
    if (evRes.error) throw evRes.error;
    for (const e of (evRes.data || []) as AnyRow[]) {
      weekByEvent.set(
        String(e.id),
        dataISO(inicioDaSemana(new Date(`${e.event_date}T12:00:00`)))
      );
    }
  }

  let musicianReimbursements = 0;
  for (const d of expensesWithMusicians) {
    const semana = weekByEvent.get(String(d.event_id));
    for (const musicianId of Object.keys(lerAjuste(d.notes).musicos)) {
      const pagoNaSemana = musicianRows.some(
        (m) =>
          String(m.musician_id) === musicianId &&
          weekByEvent.get(String(m.event_id)) === semana
      );
      if (pagoNaSemana) musicianReimbursements += valorPessoa(d.notes, musicianId);
    }
  }

  const musiciansPaid =
    musicianRows.reduce((s, p) => s + Number(p.event_cache || 0), 0) +
    musicianReimbursements;

  let rodrigoPaid = 0;
  let marlonPaid = 0;

  for (const c of closings) {
    if (c.rodrigo_paid && String(c.rodrigo_payment_date || "") >= startDate) {
      rodrigoPaid += Number(c.rodrigo_amount || 0);
    }
    if (c.marlon_paid && String(c.marlon_payment_date || "") >= startDate) {
      marlonPaid += Number(c.marlon_amount || 0);
    }
  }

  const partnersPaid = rodrigoPaid + marlonPaid;

  const expensesPaid = allExpenses
    .filter((d) => String(d.payment_date) >= startDate)
    .reduce(
      // Descontos não são despesa. A parte reembolsada a sócios/músicos
      // sai do caixa no pagamento deles.
      (s, d) =>
        ehDesconto(d.notes)
          ? s
          : s + Math.max(Number(d.amount || 0) - totalPessoas(d.notes), 0),
      0
    );

  // ---------------------------------------------------------
  // Movimentações manuais
  // ---------------------------------------------------------
  const manualTransactions = ((manualRes.data || []) as AnyRow[]).filter((t) =>
    String(t.notes || "").startsWith(MANUAL_PREFIX)
  );

  // Ajustes de saldo (rendimento, correção...) ficam registrados com data,
  // autor e motivo, e aparecem separados no resumo.
  const adjustments = manualTransactions.filter((t) => ehAjusteSaldo(t.notes));
  const commonManual = manualTransactions.filter((t) => !ehAjusteSaldo(t.notes));

  const manualEntries = commonManual
    .filter((t) => String(t.direction) === "entrada")
    .reduce((s, t) => s + Number(t.amount || 0), 0);

  const manualExits = commonManual
    .filter((t) => String(t.direction) === "saida")
    .reduce((s, t) => s + Number(t.amount || 0), 0);

  const adjustmentsTotal = adjustments.reduce(
    (s, t) =>
      s + (String(t.direction) === "entrada" ? 1 : -1) * Number(t.amount || 0),
    0
  );

  // ---------------------------------------------------------
  // Total
  // ---------------------------------------------------------
  const totalEntries = eventEntries + signalsTotal + manualEntries;
  // Bonificação mensal paga (junto com o fechamento da última semana do mês)
  const bonusRes = await supabase
    .from("monthly_bonuses")
    .select("id,reference_month,total_amount,paid,payment_date")
    .eq("paid", true)
    .gte("payment_date", startDate);
  if (bonusRes.error) throw bonusRes.error;
  const bonusesPaid = ((bonusRes.data || []) as AnyRow[]).reduce(
    (s, b) => s + Number(b.total_amount || 0),
    0
  );

  const totalExits =
    musiciansPaid + partnersPaid + expensesPaid + manualExits + bonusesPaid;
  const currentBalance = initialBalance + totalEntries - totalExits + adjustmentsTotal;

  return {
    initialBalance,
    startDate,
    weekStart,
    weekEnd,
    eventEntries,
    signalsTotal,
    manualEntries,
    manualExits,
    musiciansPaid,
    rodrigoPaid,
    marlonPaid,
    partnersPaid,
    expensesPaid,
    bonusesPaid,
    totalEntries,
    totalExits,
    currentBalance,
    eventBreakdown,
    signals,
    manualTransactions,
    adjustments: adjustments.map((t) => ({ ...t, ...lerAjusteSaldo(t.notes) })),
    adjustmentsTotal,
  };
}

// ---------------------------------------------------------
// Ajuste de saldo
// ---------------------------------------------------------
export const AJUSTE_SALDO = "AJUSTE_SALDO";

export function ehAjusteSaldo(notes: string | null | undefined) {
  return String(notes || "").includes(AJUSTE_SALDO);
}

/**
 * Lê as informações gravadas no ajuste:
 * MANUAL_CAIXA | AJUSTE_SALDO | por=email | de=123.45 | para=678.90 | motivo
 */
export function lerAjusteSaldo(notes: string | null | undefined) {
  const partes = String(notes || "").split(" | ");
  const valor = (chave: string) =>
    partes.find((p) => p.startsWith(`${chave}=`))?.slice(chave.length + 1) || "";
  const motivo = partes
    .filter(
      (p) =>
        p !== MANUAL_PREFIX &&
        p !== AJUSTE_SALDO &&
        !/^(por|de|para)=/.test(p)
    )
    .join(" | ");
  return {
    autor: valor("por"),
    saldoAnterior: Number(valor("de") || 0),
    saldoNovo: Number(valor("para") || 0),
    motivo,
  };
}

/**
 * Registra um ajuste no saldo do caixa como lançamento datado.
 * Nada é sobrescrito: o histórico mostra quem ajustou, quando,
 * de quanto para quanto e por quê.
 */
export async function registrarAjusteSaldo(params: {
  saldoNovo: number;
  motivo: string;
}) {
  const atual = await calcularCaixa();
  const saldoAnterior = Math.round(atual.currentBalance * 100) / 100;
  const diferenca = Math.round((params.saldoNovo - saldoAnterior) * 100) / 100;

  if (Math.abs(diferenca) < 0.01) {
    throw new Error("O saldo informado é igual ao saldo atual. Nada a ajustar.");
  }

  const { data: userData } = await supabase.auth.getUser();
  const autor = userData?.user?.email || "usuário desconhecido";

  const hoje = new Date();
  const dataHoje = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}-${String(hoje.getDate()).padStart(2, "0")}`;

  const { error } = await supabase.from("cash_transactions").insert({
    transaction_date: dataHoje,
    description: `Ajuste de saldo: ${params.motivo.trim()}`,
    transaction_type: "receita",
    amount: Math.abs(diferenca),
    direction: diferenca > 0 ? "entrada" : "saida",
    notes: [
      MANUAL_PREFIX,
      AJUSTE_SALDO,
      `por=${autor}`,
      `de=${saldoAnterior.toFixed(2)}`,
      `para=${params.saldoNovo.toFixed(2)}`,
      params.motivo.trim(),
    ].join(" | "),
  });

  if (error) throw error;

  return { saldoAnterior, diferenca };
}

export type CaixaResultado = Awaited<ReturnType<typeof calcularCaixa>>;
