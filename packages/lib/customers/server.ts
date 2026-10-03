import "server-only";

// The customer service wired to this app's store. Pages and actions import
// from here.

import { supabaseCustomerStore } from "./adapters/supabase/store";
import { CustomerService } from "./service";

export const customers = new CustomerService(supabaseCustomerStore);
