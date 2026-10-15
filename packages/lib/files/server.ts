import "server-only";

// The file service wired to this app's adapters: the same R2 bucket as photos
// for the files, the database for the records. Pages and actions import from
// here.

import { randomBytes, randomUUID } from "node:crypto";

import { r2ObjectStore, r2Read, r2Write } from "@repo/lib/photos/adapters/r2/store";

import { sharpPreviewer } from "./adapters/sharp/previewer";

import { supabaseFileRepository } from "./adapters/supabase/repository";
import { FileService } from "./service";

const newToken = () => randomBytes(32).toString("base64url");

export const files = new FileService(supabaseFileRepository, { ...r2ObjectStore, read: r2Read, write: r2Write }, randomUUID, newToken, sharpPreviewer);
