import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Retorno del OAuth de Google: canjea el código por sesión y garantiza
 * que exista el perfil en public.users_profiles.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/hub";

  if (searchParams.get("error")) {
    return NextResponse.redirect(`${origin}/?error=oauth`);
  }

  if (!code) {
    return NextResponse.redirect(`${origin}/?error=missing_code`);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.user) {
    return NextResponse.redirect(`${origin}/?error=exchange`);
  }

  const { user } = data;
  const name =
    (user.user_metadata?.full_name as string | undefined) ??
    (user.user_metadata?.name as string | undefined) ??
    user.email?.split("@")[0] ??
    null;

  // Red de seguridad por si el trigger de auth.users no corrió.
  await supabase
    .from("users_profiles")
    .upsert(
      { user_id: user.id, name, notification_email: user.email ?? null },
      { onConflict: "user_id", ignoreDuplicates: true }
    );

  return NextResponse.redirect(`${origin}${next}`);
}
