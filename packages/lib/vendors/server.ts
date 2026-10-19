import "server-only";

// The vendor service wired to this app's database. Pages and actions import from here.

import { randomUUID } from "node:crypto";

import { r2ObjectStore } from "@repo/lib/photos/adapters/r2/store";

import { supabaseVendorStore } from "./adapters/supabase/store";
import { VendorService } from "./service";

// The pictures live in the photo bucket, beside studios' logos.
export const vendors = new VendorService(supabaseVendorStore, r2ObjectStore, randomUUID);
