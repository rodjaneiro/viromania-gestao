import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { google } from "googleapis";

export async function POST(request: NextRequest) {
  try {
    const { eventId } = await request.json();

    if (!eventId) {
      return NextResponse.json({ error: "eventId obrigatório" }, { status: 400 });
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
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
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
      });
    }

    const { data: evento, error: eventoError } = await supabase
      .from("events")
      .select("id,name,event_date,event_time,location,notes")
      .eq("id", eventId)
      .single();

    if (eventoError || !evento) {
      return NextResponse.json(
        { error: "Evento não encontrado" },
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

    const dataInicio = evento.event_time
      ? `${evento.event_date}T${evento.event_time}:00`
      : `${evento.event_date}T19:00:00`;

    const inicio = new Date(dataInicio);
    const fim = new Date(inicio.getTime() + 3 * 60 * 60 * 1000);

    const googleEvent = await calendar.events.insert({
      calendarId: "primary",
      requestBody: {
        summary: evento.name,
        location: evento.location || undefined,
        description: evento.notes || "Evento cadastrado no ViroMania Gestão.",
        start: {
          dateTime: inicio.toISOString(),
          timeZone: "America/Sao_Paulo",
        },
        end: {
          dateTime: fim.toISOString(),
          timeZone: "America/Sao_Paulo",
        },
      },
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
        error: "Não foi possível sincronizar com o Google Agenda.",
      },
      { status: 500 }
    );
  }
}