import "server-only";

// The team service wired to this app's store. Pages and actions import from here.

import { randomBytes } from "node:crypto";

import { supabaseTeamAccounts, supabaseTeamStore } from "./adapters/supabase/store";
import { TeamService } from "./service";

export const team = new TeamService(supabaseTeamStore, supabaseTeamAccounts, () => randomBytes(32).toString("base64url"));
