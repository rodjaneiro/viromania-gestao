import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { google } from "googleapis";

const VIROMANIA_LABEL_ID = "viromania-salvia";
const VIROMANIA_SALVIA = "#7AE7BF";

async function garantirRotuloSalvia(calendar: any) {
  const calendario = await calendar.calendars.get({
    calendarId: "primary",
  });

  const labels = calendario.data.labelProperties?.eventLabels || [];

  const existente = labels.find(
    (label: any) => label.id === VIROMANIA_LABEL_ID
  );

  if (existente) {
    return;
  }

  await calendar.calendars.update({
    calendarId: "primary",
    requestBody: {
      labelProperties: {
        eventLabels: [
          ...labels,
          {
            id: VIROMANIA_LABEL_ID,
            name: "ViroMania - Sálvia",
            backgroundColor: VIROMANIA_SALVIA,
          },
        ],
      },
    },
  });
}

export async function POST(request: NextRequest) {
  try {
    const { eventId } = await request.json();

    if (!eventId) {
      return NextResponse.json(
        { error: "eventId obrigatório" },
        { status: 400 }
      );
    }

    const cookieStore = await cookies();

    const supabase = createServerClient(
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

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: "Usuário não autenticado." },
        { status: 401 }
      );
    }

    const { data: existente } = await supabase
      .from("google_calendar_events")
      .select("google_event_id")
      .eq("event_id", eventId)
      .maybeSingle();

    if (existente) {
      return NextResponse.json({
        success: true,
        alreadySynced: true,
      });
    }

    const { data: conexao } = await supabase
      .from("google_calendar_connections")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!conexao) {
      return NextResponse.json({
        success: false,
        notConnected: true,
        error: "Google Agenda não está conectado.",
      });
    }

    const { data: evento, error: eventoError } = await supabase
      .from("events")
      .select(
        "id,name,event_date,event_time,location,expected_amount,actual_amount,status,notes"
      )
      .eq("id", eventId)
      .single();

    if (eventoError || !evento) {
      return NextResponse.json(
        { error: "Evento não encontrado." },
        { status: 404 }
      );
    }

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

    const calendar = google.calendar({
      version: "v3",
      auth: oauth2Client,
    });

    await garantirRotuloSalvia(calendar);

    const data = String(evento.event_date).slice(0, 10);

    const valor = Number(evento.expected_amount || 0);

    const valorFormatado = valor.toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });

    const descricao = [
      "🎵 VIROMANIA",
      "",
      `💰 Valor do evento: ${valorFormatado}`,
      `📅 Data: ${data.split("-").reverse().join("/")}`,
      evento.event_time
        ? `🕐 Horário: ${String(evento.event_time).slice(0, 5)}`
        : "🕐 Horário: Não informado",
      evento.location ? `📍 Local: ${evento.location}` : "",
      evento.status ? `📌 Status: ${evento.status}` : "",
      "",
      evento.notes ? `📝 Observações: ${evento.notes}` : "",
      "",
      "Evento cadastrado pelo ViroMania Gestão.",
    ]
      .filter(Boolean)
      .join("\n");

    let requestBody: any;

    if (evento.event_time) {
      const hora = String(evento.event_time).slice(0, 8);

      const inicio = new Date(`${data}T${hora}-03:00`);

      if (Number.isNaN(inicio.getTime())) {
        return NextResponse.json(
          { error: "Data ou horário do evento inválido." },
          { status: 400 }
        );
      }

      const fim = new Date(inicio.getTime() + 3 * 60 * 60 * 1000);

      requestBody = {
        summary: `ViroMania — ${evento.name}`,
        location: evento.location || undefined,
        description: descricao,
        eventLabelId: VIROMANIA_LABEL_ID,
        start: {
          dateTime: inicio.toISOString(),
          timeZone: "America/Sao_Paulo",
        },
        end: {
          dateTime: fim.toISOString(),
          timeZone: "America/Sao_Paulo",
        },
      };
    } else {
      const inicio = new Date(`${data}T00:00:00-03:00`);
      const fim = new Date(inicio.getTime() + 24 * 60 * 60 * 1000);

      requestBody = {
        summary: `ViroMania — ${evento.name}`,
        location: evento.location || undefined,
        description: descricao,
        eventLabelId: VIROMANIA_LABEL_ID,
        start: {
          date: data,
        },
        end: {
          date: fim.toISOString().slice(0, 10),
        },
      };
    }

    const googleEvent = await calendar.events.insert({
      calendarId: "primary",
      requestBody,
      eventLabelVersion: 1,
    });

    if (!googleEvent.data.id) {
      throw new Error("Google não retornou o ID do evento.");
    }

    await supabase.from("google_calendar_events").insert({
      event_id: eventId,
      user_id: user.id,
      google_event_id: googleEvent.data.id,
    });

    return NextResponse.json({
      success: true,
      googleEventId: googleEvent.data.id,
    });
  } catch (error) {
    console.error("Erro ao sincronizar Google Agenda:", error);

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Erro ao sincronizar Google Agenda.",
      },
      { status: 500 }
    );
  }
}