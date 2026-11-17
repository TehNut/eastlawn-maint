# Equipment Log

Tracks equipment across locations, with maintenance logs, photos, QR labels and AI help.
Built with SvelteKit 2, Tailwind, shadcn-svelte, better-auth, Drizzle and an embedded Turso
database, served from one Docker container. AI runs on Cloudflare Workers AI through AI Gateway. Install it from the browser to run it as a home-screen app.

## Local development

```sh
bun install
cp .env.example .env   # set BETTER_AUTH_SECRET and SETUP_TOKEN: openssl rand -base64 32
bun run dev
```

The database, photos and manuals live in `data/` (`DATA_DIR`). Migrations run when the app opens the
database, on the first request. AI needs `CF_ACCOUNT_ID` and `CF_AI_TOKEN` in `.env`. Everything
else works without them.

## Deploy

```sh
cp .env.example .env   # set the secrets, and ORIGIN to the public URL
docker compose up -d --build
```

The app listens on port 3000 and keeps everything in the `data` volume, so back that up. Put it behind
a reverse proxy for HTTPS, and uncomment `ADDRESS_HEADER` in `compose.yaml` so sign-in rate limits see
the real client IP. Run one container: the database is an embedded
[Turso](https://github.com/tursodatabase/turso) file, and sign-in rate limits are kept in memory.

Then open `/setup` and enter `SETUP_TOKEN` to create the first admin. The page closes for good once
any account exists. Add everyone else from Account > Manage users.

## Users and permissions

There is no public sign-up. New users start with no flags, which is read-only access. Admins set
flags per user at Account > Manage users, and changes apply on the user's next request. Admins have
every flag implicitly and can't remove their own admin flag or delete themselves, so there is always
at least one. There is no
email reset: users change their own password under Account, and admins can set a new one.

An admin can restrict a user to one location. They then only see and change that location's
equipment, logs and photos, and manuals used there, and can't move equipment away.
Any users they create get the same restriction. Admins always see everything. Filter new list
queries with the helpers in `$lib/server/access`; routes with an id in the URL are checked in
`hooks.server.ts`.

Only admins manage locations, at Account > Manage locations. A location can't be deleted while it has
equipment or users restricted to it.

AI changes need `ai.modify` plus the flag for the action itself, and always wait for the user to tap
Apply. The AI can update equipment fields and add logs; it can't delete anything.

## Service schedules

Each item can have repeating service jobs, edited on its edit page with `equipment.update`. A job
has a meter interval, a calendar interval (days or months), or both, plus its consumables. Meter
intervals need the item to have a meter (hours or miles). Nothing about due dates is stored: the
rules in `$lib/schedule.ts` work them out from the logs that completed each job and the item's
meter readings, following the cemetery-maintenance records. A job with no logs has "no history",
not "due". "Due soon" means due within 14 days. For meters, the date is projected from average use
between readings at least a week apart. "Today" is the date in `APP_TIMEZONE`. The Due tab lists
everything that isn't retired, grouped by category. Run `bun run test` for the schedule tests.

New logs on an item with a meter must include a reading. A reading lower than an earlier one needs
the user to confirm the meter was replaced.

## Attachments, retiring and saved pages

An item can be attached to another one, like a trailer to a tractor. Attachment is one level deep.
The attached item takes its parent's location, and moving the parent moves its attachments.
Deleting the parent unlinks them (`ON DELETE SET NULL`, hand-added to migration 0009 because
drizzle-kit leaves it out of `ALTER TABLE`).

Deleting equipment is still possible, but the dialog offers "Retire instead" first and says how
many logs and photos would be lost.

From a manual opened on an item, the bookmark button saves the page on screen to that item,
optionally under one of its service jobs. Saved pages show on the item page and under their job.
Manual pages the Assistant cites link to the viewer at that page.

## Product standards

Admins keep the fleet's one brand per product at Account > Product standards. The list is seeded
with the cemetery-maintenance skill's rules: Shell Rotella T5 for diesel engine oil, Valvoline for
gasoline, and NAPA for filters. In the service schedule editor, a consumable whose item matches a
standard's keywords shows the brand. A spec that names a different brand gets a warning, but
saving isn't blocked. Filters get a helper that writes `NAPA <number>, crosses to <oem>` and leaves
out anything not typed in. Logs record what was actually installed, so standards don't apply to
them.

## Importing records

Admins can import the cemetery-maintenance records folder (`maintenance/records`) at Account >
Import records. The browser reads the YAML and checks it against the skill's rules in
`$lib/records.ts`, then shows a preview listing any records it will skip and why. After you pick a
location, it sends one record per request: equipment with its service jobs, then manual PDFs (text
extracted in the browser, as with uploads), then logs with their pictures. The server checks each
record again. Each imported row keeps its records id in `importKey`, so running the import again
skips what's already there and retries only what failed. The import matches items by that id, not
by name, so the preview warns when an item with the same name was added by hand. Imported logs
keep the importing admin as author, but the app doesn't show them as having done the work.

## Log presets

The add log page offers one-tap presets above the save button. Each sets the log type and adds its
text to the description. Equipment uses the defaults in `src/lib/constants.ts` until someone with
`equipment.update` saves its own list on the edit page; saving an empty list removes them.

## AI

Each item has Ask AI, which starts with that item's details and history and can propose changes for
the user to approve. The Assistant tab (`ai.use`) covers everything the user can access. It starts
with an overview of the app and an index of equipment names, and fetches details, history and
manual passages with read-only tools. It can't propose changes, because it can reach any item and
its notes and logs are model input. Each tool applies the user's location itself, in
`$lib/server/ai-lookups`. Conversations are kept in `sessionStorage` until the browser tab closes.

## Operator manuals

The browser extracts the PDF's text with pdf.js at upload, so the server does no parsing. The PDF
goes to `data/files/manuals/` and the text, split into small passages, to Turso's full-text index
(which has no stemmer, so searches also try each word's plain plural or singular). Identical files are stored
once, and a manual is deleted when the last item using it lets go.

The AI gets a `search_manual` tool rather than the manual: it pulls the top five passages when a
question needs them, and they aren't carried into later questions. Scanned PDFs have no text, so
they can be read but not searched.

## Configuration

Set in `.env` (see `.env.example`):

- `AI_MODELS`: comma-separated models an admin can choose from at Account; the first is the default,
  and is also used if the chosen model is later removed from this list.
- `AI_GATEWAY_ID`: the AI Gateway to route through.
- `APP_TIMEZONE`: the IANA timezone that decides "today" for due dates.
- `DATA_DIR`: where the database and files live (`data`, or `/data` in Docker).
- `S3_BUCKET` (optional): store photos and manuals in an S3-compatible bucket instead of
  `DATA_DIR/files`. Needs `S3_ACCESS_KEY_ID` and `S3_SECRET_ACCESS_KEY`; `S3_ENDPOINT` (default
  AWS) and `S3_REGION` (default `auto`) as needed. The database stays in `DATA_DIR`. Switching
  doesn't move existing files.

Sign-in is limited to 10 attempts a minute per IP (`$lib/server/rate-limit`).

## Schema changes

Edit `src/lib/server/db/schema.ts` and run `bun run db:generate`. The app applies new migrations
when it next starts.

## QR labels

Labels encode `/q/<equipment-id>` on the origin they were generated from, so print them from the
production URL.
