import "server-only";

// The booking service wired to this app's adapters. Pages and actions import from here.

import { supabaseBookingDirectory } from "./adapters/supabase/directory";
import { supabaseBookingStore } from "./adapters/supabase/store";
import { BookingService } from "./service";

export const bookings = new BookingService(supabaseBookingStore, supabaseBookingDirectory);
