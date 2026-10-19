import "server-only";

// The vendor service wired to this app's database. Pages and actions import from here.

import { randomUUID } from "node:crypto";

import { r2ObjectStore } from "@repo/lib/photos/adapters/r2/store";

import { notifyActor } from "@repo/lib/push/send";

import { supabaseJobStore } from "./adapters/supabase/jobs";
import { supabaseVendorStore } from "./adapters/supabase/store";
import { VendorJobService } from "./jobs";
import { VendorService } from "./service";

// The pictures live in the photo bucket, beside studios' logos.
export const vendors = new VendorService(supabaseVendorStore, r2ObjectStore, randomUUID);

export const vendorJobs = new VendorJobService(supabaseJobStore, supabaseVendorStore, {
  notify: (clientId, message) => notifyActor({ type: "client", id: clientId }, message),
});
