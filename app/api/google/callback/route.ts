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
      { error: "Estado OAuth inválido ou expirado." },
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

  try {
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );

    const { tokens } = await oauth2Client.getToken(code);

    if (!tokens.access_token) {
      throw new Error("Google não retornou access_token.");
    }

    let googleEmail: string | null = null;

    try {
      const tokenInfo = await oauth2Client.getTokenInfo(tokens.access_token);
      googleEmail = tokenInfo.email ?? null;
    } catch (error) {
      console.error("Não foi possível obter email Google:", error);
    }

    const { data: conexaoAtual } = await supabase
      .from("google_calendar_connections")
      .select("refresh_token")
      .eq("user_id", user.id)
      .maybeSingle();

    const refreshToken =
      tokens.refresh_token ?? conexaoAtual?.refresh_token ?? null;

    if (!refreshToken) {
      throw new Error("Google não retornou refresh_token.");
    }

    const { error: saveError } = await supabase
      .from("google_calendar_connections")
      .upsert(
        {
          user_id: user.id,
          google_email: googleEmail,
          access_token: tokens.access_token,
          refresh_token: refreshToken,
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
      console.error("Erro Supabase:", saveError);
      throw new Error("Não foi possível salvar a conexão Google.");
    }

    return NextResponse.redirect(
      new URL("/eventos?google=conectado", request.url)
    );
  } catch (error) {
    console.error("ERRO GOOGLE OAUTH:", error);

    return NextResponse.json(
      {
        error: "Não foi possível conectar ao Google Agenda.",
      },
      { status: 500 }
    );
  }
}

