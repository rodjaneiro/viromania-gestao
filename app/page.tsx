"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type Evento = {
  id: string;
  name: string;
  event_date: string;
  location: string | null;
  expected_amount: number;
  status: string;
};

type Fechamento = {
  id: string;
  week_start: string;
  week_end: string;
  total_confirmed: number;
  total_received: number;
  total_to_receive: number;
  total_musicians: number;
  total_other_expenses: number;
  net_result: number;
  rodrigo_amount: number;
  marlon_amount: number;
  group_cash_amount: number;
};

type Caixa = {
  transaction_date: string;
  amount: number;
  direction: "entrada" | "saida";
};

type Bonus = {
  reference_month: string;
  total_amount: number;
  paid: boolean;
};

function moeda(valor: number) {
  return Number(valor || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function dataBR(data: string) {
  if (!data) return "-";
  const [ano, mes, dia] = data.split("-");
  return `${dia}/${mes}/${ano}`;
}

function hojeISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

function inicioMes() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

function fimMes() {
  const d = new Date();
  const ultimo = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return `${ultimo.getFullYear()}-${String(ultimo.getMonth() + 1).padStart(
    2,
    "0"
  )}-${String(ultimo.getDate()).padStart(2, "0")}`;
}

function nomeMes(data: string) {
  const [ano, mes] = data.split("-");
  const nomes = [
    "janeiro",
    "fevereiro",
    "março",
    "abril",
    "maio",
    "junho",
    "julho",
    "agosto",
    "setembro",
    "outubro",
    "novembro",
    "dezembro",
  ];

  return `${nomes[Number(mes) - 1]} de ${ano}`;
}

function Card({
  titulo,
  valor,
  detalhe,
  destaque = false,
}: {
  titulo: string;
  valor: string;
  detalhe?: string;
  destaque?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border p-5 shadow-sm ${
        destaque
          ? "border-green-200 bg-green-50"
          : "border-slate-200 bg-white"
      }`}
    >
      <p className="text-sm font-semibold text-slate-500">{titulo}</p>
      <p
        className={`mt-2 text-2xl font-bold ${
          destaque ? "text-green-700" : "text-slate-900"
        }`}
      >
        {valor}
      </p>
      {detalhe && (
        <p className="mt-1 text-xs text-slate-500">{detalhe}</p>
      )}
    </div>
  );
}

const atalhos = [
  {
    href: "/eventos",
    titulo: "Eventos",
    descricao: "Agenda, receitas, músicos e fechamento dos eventos.",
  },
  {
    href: "/fechamento",
    titulo: "Fechamento semanal",
    descricao: "Feche a semana, pagamentos e distribuição.",
  },
  {
    href: "/caixa",
    titulo: "Caixa",
    descricao: "Saldo real, entradas, saídas e rendimentos.",
  },
  {
    href: "/relatorios",
    titulo: "Relatórios",
    descricao: "Resultados por período e desempenho dos músicos.",
  },
  {
    href: "/bonificacoes",
    titulo: "Bonificações",
    descricao: "Frequência, bônus mensais e histórico.",
  },
  {
    href: "/musicos",
    titulo: "Músicos",
    descricao: "Cadastro, cachês e instrumentos.",
  },
  {
    href: "/instrumentos",
    titulo: "Instrumentos",
    descricao: "Cadastro e vínculos dos instrumentos.",
  },
];

export default function HomePage() {
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [fechamento, setFechamento] = useState<Fechamento | null>(null);
  const [caixa, setCaixa] = useState<Caixa[]>([]);
  const [bonus, setBonus] = useState<Bonus | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");

  async function carregar() {
    try {
      setCarregando(true);
      setErro("");

      const inicio = inicioMes();
      const fim = fimMes();

      const [
        eventosRes,
        fechamentoRes,
        caixaRes,
        bonusRes,
      ] = await Promise.all([
        supabase
          .from("events")
          .select(
            "id,name,event_date,location,expected_amount,status"
          )
          .gte("event_date", inicio)
          .lte("event_date", fim)
          .order("event_date", { ascending: true }),

        supabase
          .from("weekly_closings")
          .select(
            "id,week_start,week_end,total_confirmed,total_received,total_to_receive,total_musicians,total_other_expenses,net_result,rodrigo_amount,marlon_amount,group_cash_amount"
          )
          .order("week_end", { ascending: false })
          .limit(1)
          .maybeSingle(),

        supabase
          .from("cash_transactions")
          .select("transaction_date,amount,direction")
          .order("transaction_date", { ascending: true }),

        supabase
          .from("monthly_bonuses")
          .select("reference_month,total_amount,paid")
          .eq("reference_month", inicio)
          .maybeSingle(),
      ]);

      if (eventosRes.error) throw eventosRes.error;
      if (fechamentoRes.error) throw fechamentoRes.error;
      if (caixaRes.error) throw caixaRes.error;
      if (bonusRes.error) throw bonusRes.error;

      setEventos(
        (eventosRes.data || []).map((item: any) => ({
          ...item,
          expected_amount: Number(item.expected_amount || 0),
        }))
      );

      setFechamento(fechamentoRes.data || null);

      setCaixa(
        (caixaRes.data || []).map((item: any) => ({
          ...item,
          amount: Number(item.amount || 0),
        }))
      );

      setBonus(bonusRes.data || null);
    } catch (e: any) {
      console.error(e);
      setErro(e.message || "Erro ao carregar o painel.");
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    carregar();
  }, []);

  const saldoAtual = useMemo(() => {
    return caixa.reduce((saldo, item) => {
      return item.direction === "entrada"
        ? saldo + item.amount
        : saldo - item.amount;
    }, 0);
  }, [caixa]);

  const entradasMes = useMemo(() => {
    const inicio = inicioMes();
    const fim = fimMes();

    return caixa
      .filter(
        (item) =>
          item.transaction_date >= inicio &&
          item.transaction_date <= fim &&
          item.direction === "entrada"
      )
      .reduce((total, item) => total + item.amount, 0);
  }, [caixa]);

  const saidasMes = useMemo(() => {
    const inicio = inicioMes();
    const fim = fimMes();

    return caixa
      .filter(
        (item) =>
          item.transaction_date >= inicio &&
          item.transaction_date <= fim &&
          item.direction === "saida"
      )
      .reduce((total, item) => total + item.amount, 0);
  }, [caixa]);

  const eventosRealizados = eventos.filter(
    (item) => item.status === "realizado"
  );

  const eventosPendentes = eventos.filter(
    (item) =>
      item.status === "agendado" || item.status === "realizado"
  );

  const proximosEventos = eventos
    .filter((item) => item.status === "agendado")
    .slice(0, 5);

  if (carregando) {
    return (
      <main className="min-h-screen bg-slate-100 p-6">
        <div className="mx-auto max-w-7xl">
          <div className="rounded-xl bg-white p-12 text-center shadow-sm">
            Carregando ViroMania Gestão...
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-100 p-6 text-slate-800">
      <div className="mx-auto max-w-7xl">
        <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-slate-500">
              VIROMANIA GESTÃO
            </p>
            <h1 className="mt-1 text-3xl font-bold">
              Painel principal
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Visão geral da banda e do caixa.
            </p>
          </div>

          <button
            onClick={carregar}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-bold text-white"
          >
            Atualizar painel
          </button>
        </header>

        {erro && (
          <div className="mb-5 rounded-lg border border-red-200 bg-red-50 p-4 font-semibold text-red-700">
            {erro}
          </div>
        )}

        <section className="mb-6 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card
            titulo="Saldo atual do grupo"
            valor={moeda(saldoAtual)}
            detalhe="Caixa real"
            destaque
          />

          <Card
            titulo="Entradas no mês"
            valor={moeda(entradasMes)}
          />

          <Card
            titulo="Saídas no mês"
            valor={moeda(saidasMes)}
          />

          <Card
            titulo="Eventos realizados"
            valor={String(eventosRealizados.length)}
            detalhe={`${eventos.length} eventos no mês`}
          />
        </section>

        <section className="mb-6 grid gap-4 lg:grid-cols-3">
          <Card
            titulo="Último resultado semanal"
            valor={moeda(fechamento?.net_result || 0)}
            detalhe={
              fechamento
                ? `${dataBR(fechamento.week_start)} a ${dataBR(
                    fechamento.week_end
                  )}`
                : "Nenhum fechamento registrado"
            }
          />

          <Card
            titulo="A receber do último fechamento"
            valor={moeda(fechamento?.total_to_receive || 0)}
            detalhe="Receitas confirmadas ainda não recebidas"
          />

          <Card
            titulo="Bonificação do mês"
            valor={moeda(bonus?.total_amount || 0)}
            detalhe={
              bonus
                ? bonus.paid
                  ? "Paga"
                  : "Pendente"
                : "Ainda não cadastrada"
            }
          />
        </section>

        <section className="mb-6 grid gap-6 lg:grid-cols-2">
          <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 p-5">
              <h2 className="text-xl font-bold">
                Próximos eventos
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                {nomeMes(inicioMes())}
              </p>
            </div>

            {proximosEventos.length === 0 ? (
              <div className="p-8 text-center text-slate-500">
                Nenhum evento agendado.
              </div>
            ) : (
              <div className="divide-y">
                {proximosEventos.map((evento) => (
                  <div
                    key={evento.id}
                    className="flex items-center justify-between gap-4 p-4"
                  >
                    <div>
                      <p className="font-bold">
                        {evento.name}
                      </p>
                      <p className="text-xs text-slate-500">
                        {dataBR(evento.event_date)}
                        {evento.location
                          ? ` • ${evento.location}`
                          : ""}
                      </p>
                    </div>

                    <div className="text-right">
                      <p className="font-bold text-green-700">
                        {moeda(evento.expected_amount)}
                      </p>
                      <span className="text-xs text-slate-500">
                        Agendado
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="border-t p-4">
              <a
                href="/eventos"
                className="font-semibold text-blue-600"
              >
                Ver todos os eventos →
              </a>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 p-5">
              <h2 className="text-xl font-bold">
                Último fechamento
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Distribuição semanal
              </p>
            </div>

            {!fechamento ? (
              <div className="p-8 text-center text-slate-500">
                Nenhum fechamento realizado.
              </div>
            ) : (
              <div className="p-5">
                <div className="grid gap-3 md:grid-cols-3">
                  <div className="rounded-lg bg-slate-50 p-4">
                    <p className="text-xs text-slate-500">
                      Rodrigo
                    </p>
                    <p className="mt-1 font-bold">
                      {moeda(fechamento.rodrigo_amount)}
                    </p>
                  </div>

                  <div className="rounded-lg bg-slate-50 p-4">
                    <p className="text-xs text-slate-500">
                      Marlon
                    </p>
                    <p className="mt-1 font-bold">
                      {moeda(fechamento.marlon_amount)}
                    </p>
                  </div>

                  <div className="rounded-lg bg-green-50 p-4">
                    <p className="text-xs text-green-700">
                      Caixa do grupo
                    </p>
                    <p className="mt-1 font-bold text-green-700">
                      {moeda(fechamento.group_cash_amount)}
                    </p>
                  </div>
                </div>

                <div className="mt-5 grid gap-3 md:grid-cols-3">
                  <Card
                    titulo="Confirmado"
                    valor={moeda(fechamento.total_confirmed)}
                  />
                  <Card
                    titulo="Recebido"
                    valor={moeda(fechamento.total_received)}
                  />
                  <Card
                    titulo="Músicos"
                    valor={moeda(fechamento.total_musicians)}
                  />
                </div>

                <a
                  href="/fechamento"
                  className="mt-5 inline-block font-semibold text-blue-600"
                >
                  Abrir fechamento →
                </a>
              </div>
            )}
          </div>
        </section>

        <section className="mb-6 rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 p-5">
            <h2 className="text-xl font-bold">
              Acesso rápido
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Todos os módulos do ViroMania Gestão.
            </p>
          </div>

          <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
            {atalhos.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="rounded-xl border border-slate-200 p-5 transition hover:border-blue-300 hover:bg-blue-50"
              >
                <p className="text-lg font-bold">
                  {item.titulo}
                </p>
                <p className="mt-2 text-sm leading-5 text-slate-500">
                  {item.descricao}
                </p>
              </a>
            ))}
          </div>
        </section>

        <footer className="pb-4 text-center text-xs text-slate-400">
          ViroMania Gestão • {hojeISO().slice(0, 4)}
        </footer>
      </div>
    </main>
  );
}
