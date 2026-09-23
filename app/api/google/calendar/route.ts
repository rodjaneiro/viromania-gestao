import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { google } from "googleapis";

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
        { error: "Não autenticado" },
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

    if (!evento.event_date) {
      return NextResponse.json(
        { error: "O evento não possui data válida." },
        { status: 400 }
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

    let requestBody: any;

    if (evento.event_time) {
      const data = String(evento.event_date).slice(0, 10);
      const hora = String(evento.event_time).slice(0, 8);

      const inicio = `${data}T${hora}`;
      const inicioDate = new Date(`${inicio}-03:00`);

      if (Number.isNaN(inicioDate.getTime())) {
        return NextResponse.json(
          {
            error: "Data/hora inválida.",
            data,
            hora,
          },
          { status: 400 }
        );
      }

      const fimDate = new Date(
        inicioDate.getTime() + 3 * 60 * 60 * 1000
      );

      requestBody = {
        summary: evento.name,
        location: evento.location || undefined,
        description:
          evento.notes || "Evento cadastrado no ViroMania Gestão.",
        start: {
          dateTime: inicioDate.toISOString(),
          timeZone: "America/Sao_Paulo",
        },
        end: {
          dateTime: fimDate.toISOString(),
          timeZone: "America/Sao_Paulo",
        },
      };
    } else {
      const data = String(evento.event_date).slice(0, 10);

      const inicioDate = new Date(`${data}T00:00:00-03:00`);

      if (Number.isNaN(inicioDate.getTime())) {
        return NextResponse.json(
          { error: "Data do evento inválida.", data },
          { status: 400 }
        );
      }

      const fimDate = new Date(
        inicioDate.getTime() + 24 * 60 * 60 * 1000
      );

      requestBody = {
        summary: evento.name,
        location: evento.location || undefined,
        description:
          evento.notes || "Evento cadastrado no ViroMania Gestão.",
        start: {
          date: data,
        },
        end: {
          date: fimDate.toISOString().slice(0, 10),
        },
      };
    }

    const googleEvent = await calendar.events.insert({
      calendarId: "primary",
      requestBody,
    });

    if (!googleEvent.data.id) {
      throw new Error("Google não retornou o ID do evento.");
    }

    const { error: mappingError } = await supabase
      .from("google_calendar_events")
      .insert({
        event_id: eventId,
        user_id: user.id,
        google_event_id: googleEvent.data.id,
      });

    if (mappingError) {
      console.error("Erro ao salvar vínculo Google:", mappingError);
    }

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
            : "Não foi possível sincronizar com o Google Agenda.",
      },
      { status: 500 }
    );
  }
}
