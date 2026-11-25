/**
 * Semana de trabalho da ViroMania: de TERÇA a SEGUNDA.
 * Ex.: 17/11 (terça) até 23/11 (segunda).
 */

export function dataISO(date: Date) {
  const ano = date.getFullYear();
  const mes = String(date.getMonth() + 1).padStart(2, "0");
  const dia = String(date.getDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
}

/** Terça-feira que inicia a semana da data informada. */
export function inicioDaSemana(date: Date) {
  const d = new Date(date);
  const diferenca = (d.getDay() - 2 + 7) % 7; // 2 = terça
  d.setDate(d.getDate() - diferenca);
  return d;
}

/** Segunda-feira que encerra a semana. */
export function fimDaSemana(date: Date) {
  const d = inicioDaSemana(date);
  d.setDate(d.getDate() + 6);
  return d;
}

/** Quinta-feira da semana (dia do ensaio). */
export function quintaDaSemana(date: Date) {
  const d = inicioDaSemana(date);
  d.setDate(d.getDate() + 2);
  return d;
}

/**
 * Data de referência da semana a fechar.
 * Na segunda-feira é a própria semana (que termina hoje);
 * nos outros dias é a semana anterior, já encerrada.
 */
export function semanaParaFechar() {
  const d = new Date();
  if (d.getDay() !== 1) d.setDate(d.getDate() - 7);
  return dataISO(d);
}

/** Dia anterior (ISO). Usado para achar fechamentos antigos (segunda a domingo). */
export function diaAnteriorISO(iso: string) {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() - 1);
  return dataISO(d);
}
