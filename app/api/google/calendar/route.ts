import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { google } from "googleapis";
import { lerObservacoes, textoHorario } from "@/lib/contato";

/*
 * Sincronização dos eventos com a Agenda do Google.
 *
 * POST   { eventId }  → cria o evento no Google ou, se já existir,
 *                       atualiza com os dados atuais do sistema.
 * DELETE ?eventId=... → remove o evento do Google (ao excluir no sistema).
 */

async function clienteSupabase() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        },
      },
    }
  );
}

async function clienteGoogle(supabase: Awaited<ReturnType<typeof clienteSupabase>>, userId: string) {
  const { data: conexao, error } = await supabase
    .from("google_calendar_connections")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) console.error("Erro ao buscar conexão Google:", error);
  if (!conexao) return null;

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );

  oauth2Client.setCredentials({
    access_token: conexao.access_token,
    refresh_token: conexao.refresh_token,
    expiry_date: conexao.token_expiry
      ? new Date(conexao.token_expiry).getTime()
      : undefined,
  });

  return google.calendar({ version: "v3", auth: oauth2Client });
}

function moeda(valor: number) {
  return Number(valor || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function dataBR(data: string | null | undefined) {
  if (!data) return "";
  return String(data).slice(0, 10).split("-").reverse().join("/");
}

function ehSinal(descricao: string) {
  const d = String(descricao || "").trim().toLowerCase();
  return d === "sinal" || d.startsWith("sinal ");
}

export async function POST(request: NextRequest) {
  try {
    const { eventId } = await request.json();

    if (!eventId) {
      return NextResponse.json({ error: "eventId obrigatório" }, { status: 400 });
    }

    const supabase = await clienteSupabase();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Usuário não autenticado." }, { status: 401 });
    }

    const calendar = await clienteGoogle(supabase, user.id);

    if (!calendar) {
      return NextResponse.json({
        success: false,
        notConnected: true,
        error: "Google Agenda não está conectado.",
      });
    }

    /*
     * EVENTO
     */
    const { data: evento, error: eventoError } = await supabase
      .from("events")
      .select(
        "id,name,event_date,event_time,location,expected_amount,expected_receipt_date,status,notes"
      )
      .eq("id", eventId)
      .single();

    if (eventoError || !evento) {
      console.error("Erro ao buscar evento:", eventoError);
      return NextResponse.json({ error: "Evento não encontrado." }, { status: 404 });
    }

    if (!evento.event_date) {
      return NextResponse.json(
        { error: "O evento não possui uma data válida." },
        { status: 400 }
      );
    }

    /*
     * SINAL
     */
    let valorSinal = 0;
    let dataSinal: string | null = null;

    const { data: receitas } = await supabase
      .from("event_revenues")
      .select("id")
      .eq("event_id", eventId);

    if (receitas && receitas.length > 0) {
      const { data: parcelas } = await supabase
        .from("event_revenue_receipts")
        .select("description,expected_amount,actual_amount,expected_receipt_date,actual_receipt_date,status")
        .in(
          "event_revenue_id",
          receitas.map((r) => r.id)
        );

      for (const p of parcelas || []) {
        if (!ehSinal(p.description)) continue;
        valorSinal += Number(p.actual_amount || p.expected_amount || 0);
        dataSinal = dataSinal || p.actual_receipt_date || p.expected_receipt_date || null;
      }
    }

    /*
     * DESCRIÇÃO
     */
    const valorTotal = Number(evento.expected_amount || 0);
    const restante = Math.max(valorTotal - valorSinal, 0);
    const obs = lerObservacoes(evento.notes);

    const descricao = [
      "🎵 VIROMANIA",
      "",
      `💰 Valor cobrado: ${moeda(valorTotal)}`,
      valorSinal > 0
        ? `💵 Sinal: ${moeda(valorSinal)}${dataSinal ? ` (recebido em ${dataBR(dataSinal)})` : ""}`
        : "💵 Sem sinal",
      evento.expected_receipt_date
        ? `📅 ${valorSinal > 0 ? `Restante (${moeda(restante)})` : "Recebimento total"}: ${dataBR(
            evento.expected_receipt_date
          )}`
        : "",
      evento.event_time
        ? `🕐 Horário: ${textoHorario(evento.event_time, obs.termino)}`
        : "🕐 Horário: Não informado",
      evento.location ? `📍 Local: ${evento.location}` : "",
      "",
      obs.responsavel ? `👤 Responsável: ${obs.responsavel}` : "",
      obs.telefone ? `📞 Telefone: ${obs.telefone}` : "",
      obs.texto ? `📝 Observações: ${obs.texto}` : "",
      "",
      "Evento cadastrado pelo ViroMania Gestão.",
    ]
      .filter((linha, i, lista) => linha !== "" || (i > 0 && lista[i - 1] !== ""))
      .join("\n");

    let requestBody: any;

    if (evento.event_time) {
      const data = String(evento.event_date).slice(0, 10);
      const hora = String(evento.event_time).slice(0, 8);
      const inicio = new Date(`${data}T${hora.length === 5 ? `${hora}:00` : hora}-03:00`);

      if (Number.isNaN(inicio.getTime())) {
        return NextResponse.json(
          { error: "Data ou horário do evento inválido.", data, hora },
          { status: 400 }
        );
      }

      // Fim: horário de término informado (se for menor que o início,
      // termina no dia seguinte). Sem término: 3 horas de duração.
      let fim = new Date(inicio.getTime() + 3 * 60 * 60 * 1000);
      if (obs.termino) {
        const fimInformado = new Date(`${data}T${obs.termino}:00-03:00`);
        if (!Number.isNaN(fimInformado.getTime())) {
          if (fimInformado.getTime() <= inicio.getTime()) {
            fimInformado.setTime(fimInformado.getTime() + 24 * 60 * 60 * 1000);
          }
          fim = fimInformado;
        }
      }

      requestBody = {
        summary: evento.name,
        location: evento.location || undefined,
        description: descricao,
        colorId: "2", // Sálvia
        start: { dateTime: inicio.toISOString(), timeZone: "America/Sao_Paulo" },
        end: { dateTime: fim.toISOString(), timeZone: "America/Sao_Paulo" },
      };
    } else {
      // Evento de dia inteiro
      const data = String(evento.event_date).slice(0, 10);
      const inicio = new Date(`${data}T12:00:00-03:00`);

      if (Number.isNaN(inicio.getTime())) {
        return NextResponse.json({ error: "Data do evento inválida.", data }, { status: 400 });
      }

      const fim = new Date(inicio.getTime() + 24 * 60 * 60 * 1000);

      requestBody = {
        summary: `ViroMania — ${evento.name}`,
        location: evento.location || undefined,
        description: descricao,
        colorId: "2",
        start: { date: data },
        end: { date: fim.toISOString().slice(0, 10) },
      };
    }

    /*
     * JÁ SINCRONIZADO? → ATUALIZA
     */
    const { data: existente } = await supabase
      .from("google_calendar_events")
      .select("google_event_id")
      .eq("event_id", eventId)
      .maybeSingle();

    if (existente?.google_event_id) {
      try {
        await calendar.events.update({
          calendarId: "primary",
          eventId: existente.google_event_id,
          requestBody,
        });

        return NextResponse.json({
          success: true,
          updated: true,
          googleEventId: existente.google_event_id,
        });
      } catch (erro: any) {
        const status = erro?.code || erro?.response?.status;
        // Evento apagado direto no Google: cria de novo abaixo
        if (status !== 404 && status !== 410) throw erro;

        await supabase.from("google_calendar_events").delete().eq("event_id", eventId);
      }
    }

    /*
     * CRIA NO GOOGLE
     */
    const googleEvent = await calendar.events.insert({
      calendarId: "primary",
      requestBody,
    });

    if (!googleEvent.data.id) {
      throw new Error("Google não retornou o ID do evento.");
    }

    const { error: mappingError } = await supabase.from("google_calendar_events").insert({
      event_id: eventId,
      user_id: user.id,
      google_event_id: googleEvent.data.id,
    });

    if (mappingError) {
      console.error("Erro ao salvar vínculo com Google:", mappingError);
    }

    return NextResponse.json({ success: true, googleEventId: googleEvent.data.id });
  } catch (error) {
    console.error("Erro ao sincronizar Google Agenda:", error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Erro ao sincronizar Google Agenda.",
      },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const eventId = request.nextUrl.searchParams.get("eventId");

    if (!eventId) {
      return NextResponse.json({ error: "eventId obrigatório" }, { status: 400 });
    }

    const supabase = await clienteSupabase();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Usuário não autenticado." }, { status: 401 });
    }

    const { data: existente } = await supabase
      .from("google_calendar_events")
      .select("google_event_id")
      .eq("event_id", eventId)
      .maybeSingle();

    if (!existente?.google_event_id) {
      return NextResponse.json({ success: true, notSynced: true });
    }

    const calendar = await clienteGoogle(supabase, user.id);

    if (calendar) {
      try {
        await calendar.events.delete({
          calendarId: "primary",
          eventId: existente.google_event_id,
        });
      } catch (erro: any) {
        const status = erro?.code || erro?.response?.status;
        if (status !== 404 && status !== 410) throw erro;
      }
    }

    await supabase.from("google_calendar_events").delete().eq("event_id", eventId);

    return NextResponse.json({ success: true, deleted: true });
  } catch (error) {
    console.error("Erro ao remover evento do Google Agenda:", error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Erro ao remover do Google Agenda.",
      },
      { status: 500 }
    );
  }
}
