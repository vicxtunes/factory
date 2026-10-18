import "server-only";

// The vendor service wired to this app's database. Pages and actions import from here.

import { supabaseVendorStore } from "./adapters/supabase/store";
import { VendorService } from "./service";

export const vendors = new VendorService(supabaseVendorStore);
