# Files module (studio files)

Any file a business keeps (contracts, design files, videos, zips), in folders, stored **as
uploaded** in **Cloudflare R2** within the same **storage allowance** as its photos
(packages/lib/photos/README.md → "The allowance"). For studios it's **My Business → Files**.
Generic and tenant-scoped.

- **Folders** nest to any depth. One name per place, whatever the capitals.
- **Files** go up to **1 GB** each, of any type; nothing is resized or split. A name already there
  gets a number: "report (2).pdf".
- **Rename, move, delete** on every row. A folder moves with everything in it, never into itself.
  Deleting a folder deletes what's in it, at any depth, and frees the space.
- **Download:** a file's name is a signed link (an hour) that saves it under its real name.
- **Who:** the owner, and team members given the **Files** area (packages/lib/team). A manager
  has it.

## How files are stored

- **Straight to R2:** the server hands out short-lived (15 min) signed upload links, 20 files a
  request, three uploading at a time; files never pass through Vercel. The content type is part of
  the signature (a file with none is `application/octet-stream`).
- **Checked before it counts:**
  - Uploads land under `incoming/` (the bucket's rule clears what's left there after a day).
  - On confirm, the server reads the file's **real size from R2** (never what the browser said),
    refuses an empty or oversized one, **moves** it to `studios/<studio>/files/<id>` and records it.
  - `files_record()` checks the allowance **in the database with the studio's row locked**, so two
    uploads at once can't both squeeze in. A file that doesn't fit is deleted.
- Keys carry ids only, never the name a person typed.

## Studio separation

- The tenant comes from the caller's studio, and every query filters by it.
- **Composite foreign keys** make the database refuse a file in another studio's folder, or a
  folder inside another studio's.
- `tenant_id` has no default; row-level security with no policies; no grants to the public roles.

## Screens

| Screen | Who | What |
| --- | --- | --- |
| My Business → **Files** (`/studio/files`, `?folder=<id>`) | Owner, team with Files | Usage, the way back up, folders and files, new folder, upload (progress per file), rename / move / delete, download |
| The same page → **Get more space** | Owner | Buy extra storage from the wallet (packages/lib/photos/README.md → "The allowance") |

Settings: the same R2 bucket and keys as photos (packages/lib/photos/README.md → "R2 setup").

## Layout

```
packages/lib/files/
  core/
    model.ts     Folder, StoredFile, FileView (with a signed link), FolderListing, UploadTicket.
    rules.ts     1 GB a file, batch size, name limits, fileKeys, cleanName, uniqueName, pathTo, isWithin.
    schema.ts    zod: ids, names, upload start (≤ 20, sizes), confirm, new folder.
    core.test.ts
  ports.ts       ObjectStore (signed links, size, move, remove), FileRepository, FileError.
  service.ts     class FileService: usage, list, create / rename / move / delete folder,
                 startUpload, confirmUpload, rename / move / delete file.
  service.test.ts
  adapters/supabase/repository.ts    file_folders, files, files_record(), files_delete_folder().
  server.ts, actions.ts              (files use photos' R2 store.)
packages/ui/files/  FileBrowser.
supabase/migrations/20261022100000_studio_files.sql
```

## Testing

- `npm test`:
  - Names (cleaning, numbering a taken one), keys, paths and nesting; input rules.
  - The service: real sizes count (not claimed ones); refused up front and again at confirm (the
    file then deleted); missing, empty or oversized uploads; a folder never moves into itself;
    deleting frees space and files; studio separation.
- Not yet run against Postgres and an S3 emulator, as photos are.
