# Files module (studio files)

Any file a business keeps (contracts, design files, videos, zips), in folders, stored **as
uploaded** in **Cloudflare R2** within the same **storage allowance** as its photos
(packages/lib/photos/README.md → "The allowance"). For studios it's **My Business → Drive**.
Generic and tenant-scoped.

- **Folders** nest to any depth. One name per place, whatever the capitals.
- **Files** go up to **1 GB** each, of any type; nothing is resized or split. A name already there
  gets a number: "report (2).pdf".
- **Rename, move, delete** on every row. A folder moves with everything in it, never into itself.
  Deleting a folder deletes what's in it, at any depth, and frees the space.
- **Download:** a file's name is a signed link (an hour) that saves it under its real name. A
  picture offers its **original** or its **optimised** copy; chosen files, or a folder with
  everything in it (its folders as paths), download as a **zip** of either, made in the browser in
  parts (300 files or 500 MB each).

## Small copies of pictures (previews)

- After a picture is uploaded (JPEG, PNG, WebP, HEIC, AVIF, TIFF, GIF; up to 80 MB), the server
  makes two copies with sharp: a **preview** (1,600 px, ~200–400 KB) and a **thumbnail** (400 px),
  JPEG, turned upright, **without location or camera details**. They sit beside the original
  (`<key>-preview.jpg`, `<key>-thumb.jpg`), count toward the storage, and go when it's deleted.
- Tiles load thumbnails and the viewer the preview, so folders open fast. The original is only
  fetched to download it.
- **Proofs never get the original:** where downloads aren't allowed (task links, shares without
  downloads), a picture shows only as its copies; without them yet it shows "Preparing…".
- Pictures uploaded before copies existed (or whose copies failed) get them in the background
  (`after()`), a batch at a time, whenever their folder is opened or a task is given on it.

## Proofs (task links)

Photos still in production, on a client's task link or task page: watermarked ("PROOF · the
business"), the browser's own Save / Copy image menu and dragging blocked, Ctrl/⌘+S and +P
blocked, nothing printed, and the photos covered while the page isn't in front (most desktop
screenshot tools take focus first) or after Print Screen. A page can't stop a phone's screenshot or
a photo of the screen: the watermark, and only ever sending the preview, are what protect them.
- **Who:** the owner, and team members given the **Files** area (packages/lib/team), have
  everything. A manager has it. Anyone else sees only what's shared with them (below).

## Project folders

- **Every project has a folder:** Files → **Projects** → the project's title. The database makes
  it in the same transaction as the project (a trigger on `projects`), so none is ever missing;
  projects from before got theirs in the migration.
- **Named after the project:** renaming the project renames its folder. Two projects with the same
  title get "Wedding" and "Wedding (2)".
- **Locked:** the Projects folder and each project's folder can be filled (files, folders inside)
  but never renamed, moved or deleted (`isLocked`; the service, the repository and
  `files_delete_folder()` all refuse).
- **Deleting a project keeps its files:** its folder becomes an ordinary one in Projects.
- The project's page links to its folder for anyone with the Files area.

## Sharing

Like Google Drive. Whoever has everything right-clicks a folder → **Share…**:

- **With whom:** one of the business's **clients** (it shows on their page, `/<studio>/me/files`),
  a **team member** without the Files area (in their Files), or **anyone with the link**
  (`/<studio>/f/<secret>`, no sign-in; one link per folder, which can end on a day).
- **Roles,** each including the one before:
  - **Viewer:** sees the folder and everything in it.
  - **Contributor:** also uploads files and adds folders (their uploads use the business's storage).
  - **Editor:** also renames, moves and deletes what's inside, but never the shared folder itself
    or anything outside it.
- **Downloads** can be switched off per share: files then show without links or previews.
- A share covers everything inside the folder, at any depth, including what's added later. Where
  shares overlap, the best counts.
- Someone with shares starts from the folders shared with them; the way back up stops there, and
  nothing beside them shows (`sharedRoots`, `canSee`).
- **Checked on the server, every time:** each action says where it comes from (`Via`: the studio,
  a client's page, a link) and `filesCaller()` works out the rights from the session or the link,
  never from the browser. The service refuses what the share doesn't allow (`rightsIn`). Folders
  outside a share are "not found".
- Deleting the folder, client or member ends their shares (`folder_shares`, cascades).

## Business (what the business sells)

Drive → **Business** → Services / Products → each category → each service or product. Not stored
folders: a view of packages/lib/offerings and packages/lib/photos, and changes go through their
own actions (and rules), the same as on Packages & Services and Products. Only for whoever
manages the catalog (Packages & showroom).

- **New category** in Services or Products; **New service / New product** in a category, named in
  place like a new folder.
- **Rename** a category, service or product in place (a product picked from Aming keeps Aming's
  name); **Delete** it for good (a category with everything in it); drag a service onto another
  category, or **Move to category…**.
- In a service's or product's folder: its **packages** (a product's **sizes**): add, change and
  delete them (name, price, description, what's included); then its photos (the cover starred)
  and preview video: drop photos to add them (resized for the web), a video to replace the preview,
  **Make cover**, **Delete**.

## Working like a desktop

- **Select:** click; Ctrl/⌘-click adds or removes one; Shift-click a range; drag a box over the
  space; Ctrl/⌘+A everything; Esc clears. On a phone, press and hold → **Select**, then tap.
- **Many at once:** right-click (or the bar that shows) → Rename, Move, Delete; drag them onto a
  folder.
- **Rename many** (`planRenames`): a pattern (`Nakato-Wedding-{#}`: `{#}` the number, `{name}` the
  old name, `{date}` the day added; start, digits, by name or date added) or find and replace.
  Extensions stay; every new name is previewed and clashes are shown first. Saved all or nothing
  (`files_rename_many()`), so names can even swap.
- **Open a file** (double-click, tap): the viewer, with Previous / Next, Download and comments.
  Pictures, videos and PDFs show (`previewUrl`) even when a share doesn't allow downloads; only the
  download link is withheld.

## Comments

- Anyone who can see a file comments on it: the business, its team, a client it's shared with,
  someone with the link (who gives their name, kept on their device).
- A comment can be pinned to a spot on a picture: numbered pins on the picture and in the thread.
- The business and editors resolve them (or open them again); only the business deletes one. A
  file's tile shows how many are open.

## Choosing (tasks in a folder)

A task (packages/lib/tasks) can point at a folder and be given to the project's client (or a team
member):

- **Choose photos:** between its least and most. The client taps ♥ on photos (or in the viewer),
  sees the count, and presses **Send my choice**; the business's owner is told. The database keeps
  to the most even with two taps at once (`files_pick()`). Only files in the task's folder (at any
  depth) and visible to them can be picked; nothing changes once it's sent, unless the business
  reopens the task.
- **Give feedback:** the client comments on the photos, then presses **I'm done**.
- The business opens the task's folder from the task (`?task=`): the client's picks are marked,
  **Only chosen** narrows to them, and **Copy for Lightroom** copies their names (no extensions,
  commas between) for Lightroom's text filter.
- Giving a task in a folder shares the folder: with the client to look at, without downloads (proofs);
  with a team member without the Files area, as an editor. A share they have stays as it is.

## Naming photos (captions)

- A file has a **caption**: a few words about it; for a school's photos, the children in each one
  ("Nakato Sarah, Joel K."). The business (and editors) write them; it shows under the file.
- A **Name the photos** task (packages/lib/tasks) gives a folder to the project's client (the
  school), shared to look at without downloads: a name box under every photo (and in the viewer),
  Enter saves and goes to the next, "12 / 40 named", then **Send names**; the owner is told how
  many were named. They can caption only the files in the task's folder, only until they send.
- The business opens the task's folder from the task: the names under each photo, **Use names as
  file names** (Rename many with `{caption}`, repeated names numbered: "Joel.jpg", "Joel (2).jpg";
  photos with no name are flagged) and **Download list** (a CSV: file, names, folder).

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
| The same page → right-click → **Share…** | Owner, team with Files | Share with clients, team members or by link; roles, downloads, link end day |
| The same page | Team without Files | Folders shared with them ("Shared with you") |
| `/<studio>/me/files` (and a card on `/<studio>/me`) | The signed-in client | Folders shared with them |
| `/<studio>/f/<secret>` | Anyone with the link | The shared folder, as far as the link's role goes |

Settings: the same R2 bucket and keys as photos (packages/lib/photos/README.md → "R2 setup").

## Layout

```
packages/lib/files/
  core/
    model.ts     Folder, StoredFile, FileView (with a signed link), FolderListing, UploadTicket.
    rules.ts     1 GB a file, batch size, name limits, fileKeys, cleanName, uniqueName, pathTo, isWithin, isLocked.
    sharing.ts   Roles, shares, FileAccess, grantOver, rightsIn, canSee, sharedRoots, linkLive.
    rename.ts    planRenames: renaming many by pattern or find and replace.
    comments.ts  FileComment, who wrote it, comment input.
    business.ts  The Business folders (businessTree, isBusinessId).
    schema.ts    zod: ids, names, upload start (≤ 20, sizes), confirm, new folder.
    core.test.ts
  ports.ts       ObjectStore (signed links, size, move, remove), FileRepository, FileError.
  service.ts     class FileService: usage, list, create / rename / move / delete folder,
                 startUpload, confirmUpload, rename / move / delete file.
  service.test.ts
  adapters/supabase/repository.ts    file_folders, files, files_record(), files_delete_folder().
  access.ts                          filesCaller(): whose files and rights, from Via.
  server.ts, actions.ts              (files use photos' R2 store.)
  business.ts                        The Business folders' contents (services' and products' media).
packages/ui/files/  FileBrowser, FileViewer, BatchRename, ContextMenu, ShareDialog, FolderArt, media-upload,
                    samples (development).
supabase/migrations/20261022100000_studio_files.sql
supabase/migrations/20261031100000_project_folders.sql
supabase/migrations/20261101100000_folder_shares.sql
supabase/migrations/20261102100000_files_rename_many.sql
supabase/migrations/20261103100000_file_comments.sql
supabase/migrations/20261104100000_client_tasks.sql   (file_picks, files_pick())
supabase/migrations/20261105100000_file_captions.sql  (files.caption, the "name" task kind)
```

## Testing

- `npm test`:
  - Names (cleaning, numbering a taken one), keys, paths and nesting; input rules.
  - The service: real sizes count (not claimed ones); refused up front and again at confirm (the
    file then deleted); missing, empty or oversized uploads; a folder never moves into itself;
    deleting frees space and files; studio separation; project folders and Projects are filled
    but never renamed, moved or deleted; sharing: a client sees only their folders and the way up
    stops there, viewer / contributor / editor rights (never the shared folder itself), downloads
    off, overlapping shares, links (last day, other studio, stopped), studio separation.
- Not yet run against Postgres and an S3 emulator, as photos are.
