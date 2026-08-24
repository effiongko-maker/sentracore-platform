"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";

export type SignInState = {
  error?: string;
};

export async function signIn(
  _prev: SignInState,
  formData: FormData
): Promise<SignInState> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const password = String(formData.get("password") ?? "");
  const nextPath = String(formData.get("next") ?? "/");

  if (!email || !password) {
    return { error: "Email and password are required." };
  }

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return { error: "Invalid email or password." };
  }

  const safeNext =
    nextPath.startsWith("/") && !nextPath.startsWith("//") ? nextPath : "/";
  redirect(safeNext);
}

export async function signOut() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  await supabase.auth.signOut();
  redirect("/login");
}
