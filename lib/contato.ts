/**
 * Informações extras do evento, gravadas no início das observações
 * (events.notes), todas opcionais:
 *
 *   Término: 02:00
 *   Responsável: Maria
 *   Telefone: (32) 99999-0000
 *   texto livre das observações...
 *
 * O horário de início fica em events.event_time. Assim tudo aparece nas
 * observações e também na Agenda do Google, sem mudar o banco.
 */

export type ObservacoesEvento = {
  termino: string; // "HH:MM" ou ""
  responsavel: string;
  telefone: string;
  texto: string;
};

export function lerObservacoes(notes: string | null | undefined): ObservacoesEvento {
  let termino = "";
  let responsavel = "";
  let telefone = "";
  const resto: string[] = [];

  for (const linha of String(notes || "").split(/\r?\n/)) {
    const l = linha.trim();
    const f = l.match(/^T[ée]rmino:\s*(\d{1,2}:\d{2})/i);
    const r = l.match(/^Respons[áa]vel:\s*(.*)$/i);
    const t = l.match(/^Telefone:\s*(.*)$/i);
    if (f && !termino) termino = f[1].padStart(5, "0");
    else if (r && !responsavel) responsavel = r[1].trim();
    else if (t && !telefone) telefone = t[1].trim();
    else resto.push(linha);
  }

  return { termino, responsavel, telefone, texto: resto.join("\n").trim() };
}

export function montarObservacoes({ termino, responsavel, telefone, texto }: ObservacoesEvento) {
  const linhas: string[] = [];
  if (termino.trim()) linhas.push(`Término: ${termino.trim().slice(0, 5)}`);
  if (responsavel.trim()) linhas.push(`Responsável: ${responsavel.trim()}`);
  if (telefone.trim()) linhas.push(`Telefone: ${telefone.trim()}`);
  if (texto.trim()) linhas.push(texto.trim());
  return linhas.join("\n") || null;
}

/** "22:00 às 02:00", "22:00" ou "" */
export function textoHorario(inicio: string | null | undefined, termino: string | null | undefined) {
  const i = String(inicio || "").slice(0, 5);
  const f = String(termino || "").slice(0, 5);
  if (i && f) return `${i} às ${f}`;
  return i;
}

/** Link para ligar a partir do telefone digitado. */
export function linkTelefone(telefone: string) {
  const digitos = telefone.replace(/\D/g, "");
  return digitos ? `tel:${digitos}` : "";
}
