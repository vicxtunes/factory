import "server-only";

// The task service wired to this app's adapters. Pages and actions import from here.

import { supabaseTaskDirectory } from "./adapters/supabase/directory";
import { supabaseTaskStore } from "./adapters/supabase/store";
import { TaskService } from "./service";

export const tasks = new TaskService(supabaseTaskStore, supabaseTaskDirectory);
