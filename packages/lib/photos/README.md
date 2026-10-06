# Photos module (studio showroom and galleries)

A business's photos, in albums, stored in **Cloudflare R2** within a **storage allowance**. For
studios it's **My Business → Showroom**: their best work, shown on their public page in the **same
showroom layout as Aming's** (its "Our work" tab), with each album also a standalone **Pinterest-style** page.
Generic and tenant-scoped.

## How photos are stored

- **Resized in the browser before upload** (`packages/ui/photos/browser.ts`): a large JPEG (~2400 px,
  for full screen) and a small one (~600 px, for grids), turned the right way up. A phone sends a
  fraction of the original, and the allowance holds far more: 1 GB ≈ 1,200 photos.
- **Straight to R2:** the server hands out short-lived (15 min) signed upload links; photos never
  pass through Vercel. The content type (`image/jpeg`) is part of the signature.
- **Checked before it counts:**
  - Uploads land under `incoming/`.
  - On confirm, the server reads each file's **real size from R2** (never what the browser said),
    refuses an oversized one, **moves** both copies into `studios/<studio>/albums/<album>/`, and
    records the photo.
  - `photos_record()` checks the allowance **in the database with the studio's row locked**, so
    two uploads at once can't both squeeze in.
  - A photo that doesn't fit has its files deleted.
  - Anything never confirmed stays in `incoming/`, which an **R2 lifecycle rule deletes after a day**.
- **Private bucket:** pages show photos through signed links that expire after an hour.
- **Deleting a photo or an album deletes its files** and frees the space at once.

## Client photo delivery (7b-2)

A project's finished photos go in a private **delivery album**: the same photos, storage and
allowance as portfolio albums, but **never public** (the database enforces it).
- **The studio** (a project's page → **Client photos**):
  - **Create photo gallery** (one per project), upload, manage.
  - **Share by link**: a new secret each time, so making a new link kills the old one, with an
    optional last day, **Send on WhatsApp**, and **Stop sharing**.
- **The client** sees **View your photos (N)** on their portal page (`/<studio>/me`), opening
  `/<studio>/me/photos/<project>`: only their own projects, signed in with phone + PIN.
- **Anyone with the link** opens `/<studio>/g/<secret>`. It needs no sign-in, works only at that
  studio's address and until its last day (the studio's calendar).
- **Downloads:**
  - Each photo's **Download** link is signed with `response-content-disposition: attachment`, so
    browsers save `photo-0001.jpg` instead of opening it.
  - **Download all** zips in the browser, in parts of 50 photos, nothing recompressed. A whole
    wedding is too big for one server function or one phone download.
- A pasted **Photos link** (Google Drive…) on a project still works alongside.

## Service media

A studio's service (packages/lib/offerings) gets a private album of kind **service**: its cover and
gallery, plus one **preview video** (MP4, WebM or MOV, up to 200 MB, not resized: uploaded as it is,
straight to R2 like photos, then checked and moved). The video counts toward the allowance;
`photos_set_video()` checks it in the database with the studio's row locked, the old video's space
counting as free when it's replaced, and the replaced file is deleted. Never public on its own and
never shared by link: it's shown through the service's page. Managed on the service's page
(`/studio/offerings/<id>`, `ServiceMediaPanel`).

## The allowance

- Photos and services' preview videos share it (`photos_used_bytes()`).
- Every studio starts with **1 GB** (`tenants.storage_quota_bytes`). The boss sets it per studio
  on the studio's page in the staff app.
- A **usage bar** shows on the studio's dashboard and Showroom pages, warning at 80%.
- When it's full, uploads are refused: "Not enough space: … left of 1 GB. Delete some photos, or
  ask Aming for more space."

## Screens

| Screen | Who | What |
| --- | --- | --- |
| My Business → **Showroom** (`/studio/showroom`) | Studio owner | Usage, albums (cover, count, public or hidden), create an album |
| `/studio/showroom/<album>` | Studio owner | Name, public or hidden, shareable address, delete; upload (progress per photo); cover, caption, delete per photo |
| `/<studio>` (public page) | Anyone | The studio's showroom: its banner is an album cover; the "Our work" tab lists the public albums |
| `/<studio>/gallery/<album>` | Anyone | The album as a standalone **masonry** page: tap for full screen, swipe, keyboard |
| A project's page → **Client photos** | Studio owner | Create the gallery, upload, manage, share by link (expiry, WhatsApp, stop) |
| `/<studio>/me/photos/<project>` | The signed-in client | Their photos: masonry, full screen, Download, Download all |
| `/<studio>/g/<secret>` | Anyone with the link | The same, without signing in, while the link lasts |
| Staff app → People → Studios → a studio | Boss | The studio's usage, and its allowance (GB) |

A service's page can show its photos in Aming's 3D scene (`packages/ui/showroom/ShowroomScene.tsx`),
which takes any two image URLs.

## Settings (environment variables)

Only the **client app** (Vercel project for `apps/client`) needs these:

| Variable | What |
| --- | --- |
| `R2_ACCOUNT_ID` | Your Cloudflare account ID (R2 → Overview) |
| `R2_ACCESS_KEY_ID` | From an R2 API token with **Object Read & Write** on the bucket |
| `R2_SECRET_ACCESS_KEY` | From the same token (shown once) |
| `R2_BUCKET` | `aming-studio-photos` |
| `R2_ENDPOINT` | *Optional*: only for testing against another S3-compatible server |

Until they're set, Showroom pages say "Photo storage isn't set up yet", and studios' public pages
still show, without albums.

## R2 setup (once, in the Cloudflare dashboard)

1. **R2 → Create bucket** `aming-studio-photos`. Keep it private (no public access).
2. **R2 → Manage API tokens → Create token:** permission *Object Read & Write*, applied to that
   bucket only. Copy the Access Key ID and Secret Access Key.
3. **The bucket → Settings → CORS policy:** paste this, putting your client app's address (and
   any preview addresses you test on) in `AllowedOrigins`:
   ```json
   [
     {
       "AllowedOrigins": ["https://client.<your-domain>", "http://localhost:3001"],
       "AllowedMethods": ["GET", "PUT", "HEAD"],
       "AllowedHeaders": ["content-type"],
       "MaxAgeSeconds": 3600
     }
   ]
   ```
   `PUT` lets browsers upload; `GET` lets the 3D scene load photos as images.
4. **The bucket → Settings → Object lifecycle rules → Add rule:** prefix `incoming/`, delete
   objects after **1 day**. This clears uploads that were never confirmed.

## Layout

```
packages/lib/photos/
  core/
    model.ts     Album, Photo, AlbumView / PhotoView (with signed links), Usage, UploadTicket.
    rules.ts     1 GB default, size limits, batch size, edges, photoKeys, slugs, formatBytes.
    schema.ts    zod: album, upload start (≤ 20, sizes), confirm, caption, quota in GB.
    core.test.ts
  ports.ts       ObjectStore (signed links, size, move, remove), PhotoRepository, PhotoError.
  service.ts     class PhotoService: usage, setQuota, albums, publicAlbum, create / update /
                 delete album, setCover, photos, startUpload, confirmUpload, setCaption, deletePhoto.
  service.test.ts
  adapters/r2/store.ts               R2 over its S3 API, signed with aws4fetch (no AWS SDK).
  adapters/supabase/repository.ts    photo_albums, photos, photos_record().
  server.ts, actions.ts
packages/ui/photos/  browser.ts (resize, signed PUT), PhotoUploader, UsageBar, AlbumControls, DownloadAll,
                     ProjectGalleryPanel,
                     MasonryGallery (+ full-screen viewer), QuotaForm.
supabase/migrations/20261003200000_studio_photos.sql
supabase/migrations/20261004100000_photo_deliveries.sql   delivery albums, share links
```

## Testing

- `npm test`:
  - The allowance maths, byte formatting, album addresses and file keys; upload request limits.
  - The service: real sizes count (not claimed ones); refused up front and again at confirm
    (files then deleted); missing or oversized uploads; deleting frees space and files; covers;
    hidden albums; studio separation.
- Against Postgres (every studio migration) and **moto** (an S3 emulator), the real adapters:
  - Signed uploads; sizes read back; files moved out of `incoming/`; signed links serve the moved
    files.
  - Covers; public vs hidden.
  - The allowance refusing up front and at confirm, with the file deleted.
  - A never-uploaded photo can't be confirmed.
  - Studio B refused everywhere, including by the database's composite keys.
  - Deletes free space and files.
- That run caught two bugs before they shipped:
  - **an ambiguous album ↔ photos link** (album and cover), so the relationship is now named;
  - **upload links that didn't sign the content type**, now signed (`allHeaders`).
- moto doesn't check signatures, so the content-type enforcement itself is R2's.
- Deliveries (`npm test` and the same Postgres + moto run):
  - One private gallery per project; another studio's project refused by the database.
  - Kept out of the portfolio and never public; a portfolio album can't be shared.
  - The same allowance; download links really save as files.
  - Share links expire, are replaced by a new one, and work only at their own studio.
  - Studio B refused.
