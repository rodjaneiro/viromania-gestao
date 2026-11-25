import { supabase } from "@/lib/supabase";

/**
 * Bonificação mensal dos músicos fixos.
 *
 * Critérios:
 *   1. Frequência total (eventos realizados + ensaios)
 *   2. Frequência em ensaios
 *   3. Média de atrasos nos shows: excelente > bom > ruim
 *   4. Empate completo: divide o valor entre os empatados
 *
 * A avaliação de atrasos de cada músico fica gravada nas observações
 * da bonificação do mês (monthly_bonuses.notes):
 *
 *   [ATRASOS <id músico>=excelente <id>=bom] observação livre
 *
 * A bonificação é paga junto com o pagamento da semana (terça a
 * segunda) que contém o último dia do mês, e é marcada como paga ao
 * salvar o fechamento dessa semana.
 */

export type NotaAtraso = "ruim" | "bom" | "excelente";

export const NOTAS_ATRASO: { valor: NotaAtraso; rotulo: string }[] = [
  { valor: "excelente", rotulo: "Excelente" },
  { valor: "bom", rotulo: "Bom" },
  { valor: "ruim", rotulo: "Ruim" },
];

export function pontosAtraso(nota: NotaAtraso | "" | undefined) {
  return nota === "excelente" ? 3 : nota === "bom" ? 2 : nota === "ruim" ? 1 : 0;
}

const TAG = /\[ATRASOS([^\]]*)\]\s*/i;

export function lerAtrasos(notes: string | null | undefined): Record<string, NotaAtraso> {
  const r: Record<string, NotaAtraso> = {};
  const m = String(notes || "").match(TAG);
  if (!m) return r;
  for (const parte of m[1].trim().split(/\s+/)) {
    const [id, nota] = parte.split("=");
    if (id && (nota === "ruim" || nota === "bom" || nota === "excelente")) r[id] = nota;
  }
  return r;
}

export function observacaoSemTag(notes: string | null | undefined) {
  return String(notes || "").replace(TAG, "").trim();
}

export function montarNotasBonus(observacao: string, atrasos: Record<string, NotaAtraso | "">) {
  const partes = Object.entries(atrasos)
    .filter(([, nota]) => !!nota)
    .map(([id, nota]) => `${id}=${nota}`);
  const tag = partes.length ? `[ATRASOS ${partes.join(" ")}]` : "";
  return [tag, observacao.trim()].filter(Boolean).join(" ") || null;
}

function iso(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

/** Último dia do mês "AAAA-MM-01" ou "AAAA-MM". */
export function ultimoDiaDoMes(mes: string) {
  const [ano, m] = mes.split("-").map(Number);
  return iso(new Date(ano, m, 0));
}

export function nomeDoMes(mes: string) {
  const [ano, m] = mes.split("-").map(Number);
  return new Date(ano, m - 1, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
}

/** Meses ("AAAA-MM-01") cujo último dia cai dentro da semana informada. */
export function mesesQueFecham(semanaInicio: string, semanaFim: string) {
  const meses = new Set([`${semanaInicio.slice(0, 7)}-01`, `${semanaFim.slice(0, 7)}-01`]);
  return [...meses].filter((mes) => {
    const ultimo = ultimoDiaDoMes(mes);
    return ultimo >= semanaInicio && ultimo <= semanaFim;
  });
}

export type BonusDaSemana = {
  bonus_id: string;
  mes: string;
  paid: boolean;
  payment_date: string | null;
  musician_id: string;
  nome: string;
  valor: number;
};

/** Bonificações (por músico) que são pagas na semana informada. */
export async function bonificacoesDaSemana(
  semanaInicio: string,
  semanaFim: string
): Promise<BonusDaSemana[]> {
  const meses = mesesQueFecham(semanaInicio, semanaFim);
  if (meses.length === 0) return [];

  const { data: bonus, error } = await supabase
    .from("monthly_bonuses")
    .select("id,reference_month,paid,payment_date")
    .in("reference_month", meses);
  if (error) throw error;
  if (!bonus || bonus.length === 0) return [];

  const { data: awards, error: awardsError } = await supabase
    .from("monthly_bonus_awards")
    .select("bonus_id,musician_id,individual_amount")
    .in(
      "bonus_id",
      bonus.map((b: any) => b.id)
    );
  if (awardsError) throw awardsError;

  const ids = [...new Set((awards || []).map((a: any) => String(a.musician_id)))];
  const nomes = new Map<string, string>();
  if (ids.length) {
    const { data: musicos, error: musicosError } = await supabase
      .from("musicians")
      .select("id,name")
      .in("id", ids);
    if (musicosError) throw musicosError;
    for (const m of musicos || []) nomes.set(String(m.id), String(m.name));
  }

  return (awards || [])
    .map((a: any) => {
      const b: any = bonus.find((x: any) => x.id === a.bonus_id);
      return {
        bonus_id: String(a.bonus_id),
        mes: String(b?.reference_month || ""),
        paid: Boolean(b?.paid),
        payment_date: b?.payment_date || null,
        musician_id: String(a.musician_id),
        nome: nomes.get(String(a.musician_id)) || "Músico",
        valor: Number(a.individual_amount || 0),
      };
    })
    .filter((a) => a.valor > 0);
}

/** Marca como pagas (na data informada) as bonificações que fecham nesta semana. */
export async function pagarBonificacoesDaSemana(
  semanaInicio: string,
  semanaFim: string,
  dataPagamento: string
) {
  const meses = mesesQueFecham(semanaInicio, semanaFim);
  if (meses.length === 0) return 0;

  const { data, error } = await supabase
    .from("monthly_bonuses")
    .update({ paid: true, payment_date: dataPagamento })
    .in("reference_month", meses)
    .eq("paid", false)
    .gt("total_amount", 0)
    .select("id");
  if (error) throw error;
  return (data || []).length;
}

/** Semana (terça a segunda) em que a bonificação do mês é paga. */
export function semanaDePagamento(mes: string) {
  const ultimo = new Date(`${ultimoDiaDoMes(mes)}T12:00:00`);
  const inicio = new Date(ultimo);
  inicio.setDate(inicio.getDate() - ((inicio.getDay() - 2 + 7) % 7));
  const fim = new Date(inicio);
  fim.setDate(fim.getDate() + 6);
  return { inicio: iso(inicio), fim: iso(fim) };
}
