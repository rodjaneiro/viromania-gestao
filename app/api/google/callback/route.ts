import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { google } from "googleapis";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");

  if (!code || !state) {
    return NextResponse.json(
      { error: "Resposta do Google incompleta." },
      { status: 400 }
    );
  }

  const cookieStore = await cookies();
  const savedState = cookieStore.get("google_oauth_state")?.value;

  if (!savedState || savedState !== state) {
    return NextResponse.json(
      { error: "Estado de segurança OAuth inválido." },
      { status: 400 }
    );
  }

  cookieStore.delete("google_oauth_state");

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
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.redirect(
      new URL("/login?error=google_auth", request.url)
    );
  }

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );

  try {
    const { tokens } = await oauth2Client.getToken(code);

    oauth2Client.setCredentials(tokens);

    const oauth2 = google.oauth2({
      version: "v2",
      auth: oauth2Client,
    });

    const { data: googleUser } = await oauth2.userinfo.get();

    const { error: saveError } = await supabase
      .from("google_calendar_connections")
      .upsert(
        {
          user_id: user.id,
          google_email: googleUser.email ?? null,
          access_token: tokens.access_token ?? null,
          refresh_token: tokens.refresh_token ?? null,
          token_expiry: tokens.expiry_date
            ? new Date(tokens.expiry_date).toISOString()
            : null,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: "user_id",
        }
      );

    if (saveError) {
      console.error("Erro ao salvar conexão Google:", saveError);

      return NextResponse.json(
        { error: "Não foi possível salvar a conexão com o Google." },
        { status: 500 }
      );
    }

    return NextResponse.redirect(
      new URL("/eventos?google=conectado", request.url)
    );
  } catch (error) {
    console.error("Erro no OAuth Google:", error);

    return NextResponse.json(
      { error: "Não foi possível conectar ao Google Agenda." },
      { status: 500 }
    );
  }
}