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
        { error: "Usuário não autenticado." },
        { status: 401 }
      );
    }

    /*
     * EVITA DUPLICAÇÃO
     * Se esse evento já foi enviado para o Google,
     * não cria outro.
     */
    const { data: existente, error: existenteError } = await supabase
      .from("google_calendar_events")
      .select("google_event_id")
      .eq("event_id", eventId)
      .maybeSingle();

    if (existenteError) {
      console.error(
        "Erro ao verificar sincronização Google:",
        existenteError
      );
    }

    if (existente) {
      return NextResponse.json({
        success: true,
        alreadySynced: true,
        googleEventId: existente.google_event_id,
      });
    }

    /*
     * BUSCA CONEXÃO GOOGLE
     */
    const { data: conexao, error: conexaoError } = await supabase
      .from("google_calendar_connections")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    if (conexaoError) {
      console.error("Erro ao buscar conexão Google:", conexaoError);
    }

    if (!conexao) {
      return NextResponse.json({
        success: false,
        notConnected: true,
        error: "Google Agenda não está conectado.",
      });
    }

    /*
     * BUSCA EVENTO
     */
    const { data: evento, error: eventoError } = await supabase
      .from("events")
      .select(
        "id,name,event_date,event_time,location,expected_amount,actual_amount,status,notes"
      )
      .eq("id", eventId)
      .single();

    if (eventoError || !evento) {
      console.error("Erro ao buscar evento:", eventoError);

      return NextResponse.json(
        { error: "Evento não encontrado." },
        { status: 404 }
      );
    }

    if (!evento.event_date) {
      return NextResponse.json(
        { error: "O evento não possui uma data válida." },
        { status: 400 }
      );
    }

    /*
     * GOOGLE OAUTH
     */
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

    /*
     * DATA
     */
    const data = String(evento.event_date).slice(0, 10);

    /*
     * VALOR
     */
    const valor = Number(evento.expected_amount || 0);

    const valorFormatado = valor.toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });

    /*
     * DESCRIÇÃO COMPLETA
     */
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

    /*
     * EVENTO COM HORÁRIO
     */
    if (evento.event_time) {
      const hora = String(evento.event_time).slice(0, 8);

      const inicioDate = new Date(`${data}T${hora}-03:00`);

      if (Number.isNaN(inicioDate.getTime())) {
        return NextResponse.json(
          {
            error: "Data ou horário do evento inválido.",
            data,
            hora,
          },
          { status: 400 }
        );
      }

      /*
       * Duração padrão de 3 horas
       */
      const fimDate = new Date(
        inicioDate.getTime() + 3 * 60 * 60 * 1000
      );

      requestBody = {
        summary: `ViroMania — ${evento.name}`,

        location: evento.location || undefined,

        description: descricao,

        /*
         * COR SÁLVIA DO GOOGLE CALENDAR
         */
        colorId: "2",

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
      /*
       * EVENTO DE DIA INTEIRO
       */
      const inicioDate = new Date(`${data}T00:00:00-03:00`);

      if (Number.isNaN(inicioDate.getTime())) {
        return NextResponse.json(
          {
            error: "Data do evento inválida.",
            data,
          },
          { status: 400 }
        );
      }

      const fimDate = new Date(
        inicioDate.getTime() + 24 * 60 * 60 * 1000
      );

      requestBody = {
        summary: `ViroMania — ${evento.name}`,

        location: evento.location || undefined,

        description: descricao,

        /*
         * COR SÁLVIA DO GOOGLE CALENDAR
         */
        colorId: "2",

        start: {
          date: data,
        },

        end: {
          date: fimDate.toISOString().slice(0, 10),
        },
      };
    }

    /*
     * CRIA EVENTO NO GOOGLE
     */
    const googleEvent = await calendar.events.insert({
      calendarId: "primary",
      requestBody,
    });

    if (!googleEvent.data.id) {
      throw new Error("Google não retornou o ID do evento.");
    }

    /*
     * SALVA O VÍNCULO ENTRE VIROMANIA E GOOGLE
     */
    const { error: mappingError } = await supabase
      .from("google_calendar_events")
      .insert({
        event_id: eventId,
        user_id: user.id,
        google_event_id: googleEvent.data.id,
      });

    if (mappingError) {
      console.error(
        "Erro ao salvar vínculo com Google:",
        mappingError
      );
    }

    return NextResponse.json({
      success: true,
      googleEventId: googleEvent.data.id,
    });
  } catch (error) {
    console.error(
      "Erro ao sincronizar Google Agenda:",
      error
    );

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