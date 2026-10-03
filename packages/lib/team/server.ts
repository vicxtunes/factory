import "server-only";

// The team service wired to this app's store. Pages and actions import from here.

import { supabaseTeamStore } from "./adapters/supabase/store";
import { TeamService } from "./service";

export const team = new TeamService(supabaseTeamStore);
