import "server-only";

// The vendor service wired to this app's database. Pages and actions import from here.

import { randomBytes, randomUUID } from "node:crypto";

import { sharpPreviewer } from "@repo/lib/files/adapters/sharp/previewer";
import { FileService } from "@repo/lib/files/service";
import { r2ObjectStore, r2Read, r2Write } from "@repo/lib/photos/adapters/r2/store";

import { notifyActor } from "@repo/lib/push/send";
import { createAdminClient } from "@repo/lib/supabase/admin";

import { vendorFileRepository } from "./adapters/supabase/drive";
import { supabaseJobStore } from "./adapters/supabase/jobs";
import { supabaseVendorStore } from "./adapters/supabase/store";
import { VendorJobService } from "./jobs";
import { VendorService } from "./service";

// The pictures live in the photo bucket, beside studios' logos.
export const vendors = new VendorService(supabaseVendorStore, r2ObjectStore, randomUUID);

/** Vendors' Drives: the files module on their own tables, their files under vendors/ in the bucket. */
export const vendorDrive = new FileService(
  vendorFileRepository,
  { ...r2ObjectStore, read: r2Read, write: r2Write },
  randomUUID,
  // Never used (a vendor's Drive isn't shared), but the service takes one.
  () => randomBytes(32).toString("base64url"),
  sharpPreviewer,
  "vendors",
);

export const vendorJobs = new VendorJobService(supabaseJobStore, supabaseVendorStore, {
  notify: (clientId, message) => notifyActor({ type: "client", id: clientId }, message),
  // Aming's boss (or bosses): staff who settle disputes and watch held money.
  tellBoss: async (message) => {
    const { data: bosses } = await createAdminClient().from("profiles").select("id").eq("role", "boss");
    await Promise.all((bosses ?? []).map((b: { id: string }) => notifyActor({ type: "dashboard_user", id: b.id }, message)));
  },
});
