import "server-only";

// The project service wired to this app's adapters. Pages and actions import from here.

import { supabaseProjectDirectory } from "./adapters/supabase/directory";
import { supabaseProjectStore } from "./adapters/supabase/store";
import { ProjectService } from "./service";

export const projects = new ProjectService(supabaseProjectStore, supabaseProjectDirectory);
