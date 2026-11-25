/**
 * Despesas e descontos por pessoa (lançados no Fechamento).
 *
 * A divisão fica gravada nas observações da despesa (event_expenses.notes):
 *
 *   [AJUSTE tipo=reembolso rodrigo=100 musico:<id>=80] texto livre
 *   [AJUSTE tipo=desconto musico:<id>=70] texto livre
 *
 * (os formatos antigos [SOCIOS ...] e [REEMBOLSO ...] são lidos como reembolso)
 *
 * - REEMBOLSO (ex.: gasolina): o valor é SOMADO ao pagamento da pessoa
 *   e é uma despesa da semana. Sai do caixa quando a pessoa é paga.
 *   A parte de "outra pessoa / posto" sai do caixa como despesa comum.
 * - DESCONTO (ex.: consumo no bar, empréstimo): o valor é DESCONTADO do
 *   pagamento da pessoa. Não é despesa; o dinheiro fica no caixa do grupo.
 *
 * Pessoas: "rodrigo", "marlon" ou o id do músico.
 */

export type TipoAjuste = "reembolso" | "desconto";

export type Ajuste = {
  tipo: TipoAjuste;
  rodrigo: number;
  marlon: number;
  musicos: Record<string, number>;
};

const TAG = /\[(SOCIOS|REEMBOLSO|AJUSTE)([^\]]*)\]\s*/i;

function moeda(v: number) {
  return Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function lerAjuste(notes: string | null | undefined): Ajuste {
  const r: Ajuste = { tipo: "reembolso", rodrigo: 0, marlon: 0, musicos: {} };
  const m = String(notes || "").match(TAG);
  if (!m) return r;
  for (const parte of m[2].trim().split(/\s+/)) {
    const i = parte.lastIndexOf("=");
    if (i <= 0) continue;
    const chave = parte.slice(0, i).toLowerCase();
    const valor = parte.slice(i + 1);
    if (chave === "tipo") {
      r.tipo = valor.toLowerCase() === "desconto" ? "desconto" : "reembolso";
      continue;
    }
    const n = Number(valor);
    if (!Number.isFinite(n) || n <= 0) continue;
    if (chave === "rodrigo") r.rodrigo = n;
    else if (chave === "marlon") r.marlon = n;
    else if (chave.startsWith("musico:")) r.musicos[parte.slice(7, i)] = n;
  }
  return r;
}

export function ehDesconto(notes: string | null | undefined) {
  return lerAjuste(notes).tipo === "desconto";
}

/** Valor da pessoa: positivo = recebe (reembolso), negativo = desconta. */
export function valorPessoa(notes: string | null | undefined, pessoa: string) {
  const a = lerAjuste(notes);
  const v =
    pessoa === "rodrigo" ? a.rodrigo : pessoa === "marlon" ? a.marlon : a.musicos[pessoa] || 0;
  return a.tipo === "desconto" ? -v : v;
}

/** Soma (positiva) dos valores atribuídos a pessoas do grupo. */
export function totalPessoas(notes: string | null | undefined) {
  const a = lerAjuste(notes);
  return a.rodrigo + a.marlon + Object.values(a.musicos).reduce((s, v) => s + v, 0);
}

export function textoSemTag(notes: string | null | undefined) {
  return String(notes || "").replace(TAG, "").trim();
}

export function montarNotas(
  tipo: TipoAjuste,
  valores: { rodrigo?: number; marlon?: number; musicos?: Record<string, number> },
  texto = ""
) {
  const partes: string[] = [`tipo=${tipo}`];
  if ((valores.rodrigo || 0) > 0) partes.push(`rodrigo=${valores.rodrigo!.toFixed(2)}`);
  if ((valores.marlon || 0) > 0) partes.push(`marlon=${valores.marlon!.toFixed(2)}`);
  for (const [id, v] of Object.entries(valores.musicos || {})) {
    if (v > 0) partes.push(`musico:${id}=${v.toFixed(2)}`);
  }
  if (partes.length === 1) return texto.trim() || null;
  return [`[AJUSTE ${partes.join(" ")}]`, texto.trim()].filter(Boolean).join(" ");
}

/** "R$ 100,00 para Rodrigo e R$ 80,00 para Tikin" */
export function descreverAjuste(
  notes: string | null | undefined,
  nomeMusico: (id: string) => string = () => "músico"
) {
  const a = lerAjuste(notes);
  const prep = a.tipo === "desconto" ? "de" : "para";
  const partes: string[] = [];
  if (a.rodrigo > 0) partes.push(`${moeda(a.rodrigo)} ${prep} Rodrigo`);
  if (a.marlon > 0) partes.push(`${moeda(a.marlon)} ${prep} Marlon`);
  for (const [id, v] of Object.entries(a.musicos)) {
    partes.push(`${moeda(v)} ${prep} ${nomeMusico(id)}`);
  }
  return partes.join(", ");
}

export type ItemAjuste = { descricao: string; valor: number };

/** Lista de reembolsos (+) e descontos (−) de uma pessoa nas despesas informadas. */
export function ajustesDaPessoa(
  despesas: { description: string; notes: string | null }[],
  pessoa: string
): ItemAjuste[] {
  return despesas
    .map((d) => ({ descricao: d.description, valor: valorPessoa(d.notes, pessoa) }))
    .filter((r) => r.valor !== 0);
}

export function somaAjustes(lista: ItemAjuste[]) {
  return lista.reduce((s, r) => s + r.valor, 0);
}

/** "R$ 250,00 de cachê + R$ 80,00 de gasolina − R$ 70,00 de consumo no bar" */
export function detalharPagamento(base: number, rotuloBase: string, lista: ItemAjuste[]) {
  if (lista.length === 0) return null;
  return [
    `${moeda(base)} ${rotuloBase}`,
    ...lista.map(
      (r) =>
        `${r.valor >= 0 ? "+" : "−"} ${moeda(Math.abs(r.valor))} de ${r.descricao.toLowerCase()}`
    ),
  ].join(" ");
}
