import "server-only";

// The offering service wired to this app's store. Pages and actions import
// from here.

import { supabaseOfferingStore } from "./adapters/supabase/store";
import { OfferingService } from "./service";

export const offerings = new OfferingService(supabaseOfferingStore);
