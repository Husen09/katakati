import type { NextFunction, Request, Response } from "express";
import { supabaseAdmin } from "./supabase.js";

export type Profile = {
  id: string;
  email: string;
  displayName: string;
};

export type AuthenticatedRequest = Request & {
  profile: Profile;
};

export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const token = readBearerToken(req);
    const { data, error } = await supabaseAdmin.auth.getUser(token);

    if (error || !data.user) {
      throw new Error("Please sign in first.");
    }

    const profile = await upsertProfile(data.user.id, data.user.email ?? "", data.user.user_metadata?.display_name);
    (req as AuthenticatedRequest).profile = profile;
    next();
  } catch (error) {
    next(error);
  }
}

async function upsertProfile(userId: string, email: string, displayNameInput: unknown): Promise<Profile> {
  const displayName = normalizeDisplayName(displayNameInput, email);

  const { data, error } = await supabaseAdmin
    .from("profiles")
    .upsert(
      {
        id: userId,
        email,
        display_name: displayName
      },
      {
        onConflict: "id"
      }
    )
    .select("id, email, display_name")
    .single();

  if (error || !data) {
    throw new Error("Unable to load your profile.");
  }

  return {
    id: data.id,
    email: data.email,
    displayName: data.display_name
  };
}

function readBearerToken(req: Request): string {
  const header = req.header("authorization");

  if (!header?.startsWith("Bearer ")) {
    throw new Error("Missing authorization token.");
  }

  return header.slice("Bearer ".length).trim();
}

function normalizeDisplayName(value: unknown, email: string): string {
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (trimmed) {
    return trimmed.slice(0, 40);
  }

  const emailPrefix = email.split("@")[0]?.trim();
  if (emailPrefix) {
    return emailPrefix.slice(0, 40);
  }

  return "Player";
}
