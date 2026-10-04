import "server-only";

// The photo service wired to this app's adapters: R2 for the files, the
// database for the records. Pages and actions import from here.

import { randomBytes, randomUUID } from "node:crypto";

import { r2ObjectStore } from "./adapters/r2/store";
import { supabasePhotoRepository } from "./adapters/supabase/repository";
import { PhotoService } from "./service";

/** 32 random bytes, base64url: unguessable, so holding a share link is the permission. */
const newToken = () => randomBytes(32).toString("base64url");

export const photos = new PhotoService(supabasePhotoRepository, r2ObjectStore, randomUUID, newToken);
