import "server-only";

import { google } from "googleapis";

// Google Drive integration for order/item photo uploads. The company already
// uses Drive and trusts it, so files live there (organized by order/item
// folders) instead of in a storage bucket we'd own. A service account does
// the folder bookkeeping; actual file bytes go straight from the browser to
// Google via a resumable upload session (see createResumableSession) so they
// never pass through our server — this app deploys on Vercel, whose
// serverless functions cap request bodies around 4.5MB regardless of what
// Next's own bodySizeLimit is configured to.
//
// Setup (one-time, done by the company): create a GCP project, enable the
// Drive API, create a service account + JSON key, then create a Shared Drive
// (required if they're not on Google Workspace with domain-wide delegation —
// service accounts have no personal storage quota of their own) or a folder
// in a real Workspace user's Drive, and share it with the service account's
// email as Content Manager/Editor. Then set the three env vars below.

export class DriveNotConfiguredError extends Error {
  constructor() {
    super(
      "Google Drive isn't configured yet. Set GOOGLE_SERVICE_ACCOUNT_EMAIL, " +
        "GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY, and GOOGLE_DRIVE_ROOT_FOLDER_ID.",
    );
    this.name = "DriveNotConfiguredError";
  }
}

function rootFolderId(): string {
  const id = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID;
  if (!id) throw new DriveNotConfiguredError();
  return id;
}

function auth() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const rawKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;
  if (!email || !rawKey) throw new DriveNotConfiguredError();

  return new google.auth.JWT({
    email,
    key: rawKey.replace(/\\n/g, "\n"),
    scopes: ["https://www.googleapis.com/auth/drive"],
  });
}

function drive() {
  return google.drive({ version: "v3", auth: auth() });
}

// Sanitizes a display name (order number, product name) into something safe
// to embed in a Drive query's string literal.
function escapeForQuery(name: string): string {
  return name.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

async function findFolder(name: string, parentId: string): Promise<string | null> {
  const res = await drive().files.list({
    q:
      `name = '${escapeForQuery(name)}' and '${parentId}' in parents ` +
      `and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: "files(id, name)",
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });
  return res.data.files?.[0]?.id ?? null;
}

async function createFolder(name: string, parentId: string): Promise<string> {
  const res = await drive().files.create({
    requestBody: {
      name,
      mimeType: "application/vnd.google-apps.folder",
      parents: [parentId],
    },
    fields: "id",
    supportsAllDrives: true,
  });
  if (!res.data.id) throw new Error("Drive did not return a folder id.");
  return res.data.id;
}

export async function ensureFolder(name: string, parentId: string): Promise<string> {
  const existing = await findFolder(name, parentId);
  if (existing) return existing;
  return createFolder(name, parentId);
}

export async function ensureOrderFolder(orderNo: string): Promise<string> {
  return ensureFolder(orderNo, rootFolderId());
}

export async function ensureItemFolder(orderFolderId: string, itemLabel: string): Promise<string> {
  return ensureFolder(itemLabel || "Item", orderFolderId);
}

// Opens a resumable upload session and returns the Google-issued upload URL.
// The browser PUTs the file bytes to this URL directly — Google, not our
// server, receives them.
export async function createResumableSession(
  folderId: string,
  fileName: string,
  mimeType: string,
): Promise<string> {
  const client = auth();
  await client.authorize();
  const token = client.credentials.access_token;
  if (!token) throw new Error("Could not obtain a Google access token.");

  const res = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true&fields=id,name,mimeType,webViewLink",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Type": mimeType || "application/octet-stream",
      },
      body: JSON.stringify({ name: fileName, parents: [folderId] }),
    },
  );

  if (!res.ok) {
    throw new Error(`Failed to start Drive upload session: ${res.status} ${await res.text()}`);
  }

  const uploadUrl = res.headers.get("location");
  if (!uploadUrl) throw new Error("Drive did not return an upload session URL.");
  return uploadUrl;
}

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string | null;
  webViewLink: string | null;
  parents: string[];
}

// Re-fetches a file by id directly from Drive — used to verify an upload the
// browser claims to have completed before we trust it and write a DB row.
export async function getFile(fileId: string): Promise<DriveFile | null> {
  try {
    const res = await drive().files.get({
      fileId,
      fields: "id, name, mimeType, webViewLink, parents",
      supportsAllDrives: true,
    });
    if (!res.data.id) return null;
    return {
      id: res.data.id,
      name: res.data.name ?? "",
      mimeType: res.data.mimeType ?? null,
      webViewLink: res.data.webViewLink ?? null,
      parents: res.data.parents ?? [],
    };
  } catch {
    return null;
  }
}
