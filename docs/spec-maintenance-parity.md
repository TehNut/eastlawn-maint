# Spec: maintenance-records parity

Status: draft, 2026-11-03

## Background

`~/Documents/eastlawn/maintenance/records` is a version of Equipment Log that runs on files and a
local agent, with no app around it. It holds 11 equipment records (`equipment/*.yaml`), 13 logs
(`logs/*.yaml`, with photo folders), 8 operator manuals (PDF plus a `pdftotext -layout` copy), one
saved manual page image, and a fleet notes file (`notes.md`). The agent follows the
`cemetery-maintenance` skill (`~/Documents/eastlawn/.cursor/skills/cemetery-maintenance`: `SKILL.md`,
`schema.md`, `examples.md`). The skill is the authority on how records behave, so where it and the
existing records differ, this spec follows the skill.

Both versions already have equipment, statuses, logs, log photos, operator manuals and AI help that
searches the manuals. **This spec covers what the records have that the app does not.** The biggest
gap is that the records hold each machine's maintenance schedule, and the app has nowhere to put
one.

## Gap summary

| #   | Feature                                                | In the records                                                                                                                                                                               | In the app today                                                                      |
| --- | ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| 1   | Service schedule per item                              | `service[]`: id, name, interval, notes                                                                                                                                                       | None. Intervals only appear in free-text notes                                        |
| 2   | Intervals by meter and calendar, whichever comes first | `interval.meter {every, unit}`, `interval.calendar {every, unit}`                                                                                                                            | None                                                                                  |
| 3   | Consumables per service job                            | `consumables[]`: item, spec (brand, part no., crosses), qty                                                                                                                                  | None                                                                                  |
| 4   | Meter (hour meter or odometer)                         | `meter.unit` (`hours`, `miles` or `none`), `meter.reading`, `meter.read_on`. A log must have `meter_reading` when the asset has a meter                                                      | None. No meter readings on logs                                                       |
| 5   | Due and overdue                                        | Computed, never stored, by the rules in `schema.md` ("Due dates")                                                                                                                            | `needs_service` status, set by hand                                                   |
| 6   | Logs linked to service jobs                            | `service_ids[]`                                                                                                                                                                              | None                                                                                  |
| 7   | Parts used on a log                                    | `parts_used[]`: item, spec, qty                                                                                                                                                              | Free text only                                                                        |
| 8   | Performed by someone without an account                | `performed_by: Ron`, an outside welder                                                                                                                                                       | `authorId` must be an app user                                                        |
| 9   | Log summary separate from detail                       | `summary` plus `work_done`                                                                                                                                                                   | `description` only                                                                    |
| 10  | Photo captions                                         | `photos[].caption`                                                                                                                                                                           | Photos have no text                                                                   |
| 11  | Equipment category and kind                            | `category` (`vehicle`, `machinery` or `facility`), plus a free-text kebab-case `kind` (tractor, well-pump, septic…)                                                                          | None                                                                                  |
| 12  | Year                                                   | `year`                                                                                                                                                                                       | None (serial already exists)                                                          |
| 13  | Primary operator                                       | "Primary user: Ron" (now in notes)                                                                                                                                                           | None                                                                                  |
| 14  | Place on the grounds, attachments                      | `location` is free text ("Shop bay 2", "Attached to the John Deere 4005")                                                                                                                    | Only a site-level location                                                            |
| 15  | Saved manual pages                                     | `john-deere-z994r-deck-drive-belt.png`, page references in notes                                                                                                                             | Viewer opens at page 1. No bookmarks or page links                                    |
| 16  | Fleet-wide notes and links                             | `notes.md` (John Deere manual lookup sites)                                                                                                                                                  | None                                                                                  |
| 17  | Fleet product standards                                | One brand for each product: Shell Rotella T5 for diesel engine oil and Valvoline for gasoline, in the viscosity the manual gives. Filters are NAPA, written as `NAPA <no>, crosses to <oem>` | None                                                                                  |
| 18  | AI writes schedules from the manual                    | The agent searches the manual before it sets an interval, capacity or part, and never invents part numbers, readings or serials                                                              | AI can only edit basic fields and add logs                                            |
| 19  | Retire rather than delete                              | Logs and equipment are never deleted. Retire an asset with `status: retired`                                                                                                                 | Delete permissions exist for both. Deleting stays, but the app nudges toward retiring |

Everything else in the records already fits the app: name, make, model, serial, status, notes,
manual, and logs with a date, type and photos.

Out of scope: irrigation valves, lines and easements. The skill sends those to the separate
`cemetery-knowledge` records. Pumps and other irrigation machinery are in scope, as `machinery`.

## Requirements

### 1. Service schedule (gaps 1–3)

New table `service_job`, one row per recurring job on one item:

```ts
service_job: {
  id, equipmentId (cascade), name,             // "Engine oil and filter"
  slug,                                         // "engine-oil", unique per equipment, used on import
  meterEvery: integer | null,                   // 200
  calendarEvery: integer | null,                // 12
  calendarUnit: 'days' | 'months' | null,      // the skill's two units
  consumables: json<{ item: string; spec: string; qty: string }[]>,
  notes: text | null,
  sortOrder, createdAt
}
```

- A job needs an interval: meter, calendar or both, as the skill requires. When it has both, it is
  due when either threshold is reached. Daily checks like greasing linkage pins have no interval in
  the skill, so they stay in notes.
- A meter interval is allowed only when the item has a meter, and it uses the item's unit. An item
  with no meter gets calendar intervals only. Validate this in the form and in `parseServiceJobs`.
- `spec` may be `""` when the value is confirmed unknown. Show that as "Unknown", not as blank.
- `qty` is free text, because the records hold values like `"6.5 L (1.7 gal) housing + 1 L (1 qt)
each planetary"`.
- The meter unit comes from the equipment (section 2), not from the job.
- UI: a "Service schedule" section on the item page lists the jobs, each with its interval, last
  done and next due. Edit the jobs on the equipment edit page, the same way as log presets, with
  the existing `equipment.update` permission. There is no new permission.

### 2. Meter readings (gap 4)

- `equipment.meterUnit`: `'hours' | 'miles' | null`. Null is the skill's `none`, used for the
  trailer and for facility systems.
- `maintenance_log.meterReading: real | null`. When the item has a meter, the reading is
  **required** on new logs, as in the skill. Older imported logs may not have one.
- New table `meter_reading { id, equipmentId, value, readOn (YYYY-MM-DD), authorId, createdAt }`,
  for readings taken without any work. A log with a reading also writes a row here.
- The current reading is the reading with the latest `readOn`. A log dated before the current
  reading never replaces it, which matches the skill's "never lower a reading from an older log".
- The item page shows the latest reading and its date. Every record says "Hour reading … not
  recorded yet", so the app needs to make clear that a reading is missing.
- Don't accept a reading lower than an earlier-dated one without confirmation, because it's usually
  a typo. Allow it anyway, since meters get replaced.

### 3. Due and overdue (gap 5)

Compute due dates when they're read, never store them. This follows `schema.md` "Due dates":

1. Last done: the log linked to the job with the latest `performedOn`. If two tie, use the one
   with the higher meter reading.
2. No linked log: **no history**. It is not due, and the app doesn't invent a start date.
3. Meter: due when the current reading ≥ the last log's reading + `meterEvery`. Skip this check if
   the job has no meter interval or the last log has no reading.
4. Calendar: due when today ≥ the last date + `calendarEvery` (`days` or `months`). "Today" is
   the local date in one app-wide timezone, `APP_TIMEZONE` in `wrangler.jsonc` `vars`, because the
   app is single-region. It is never UTC.
5. When a job has both, it is due when either threshold is reached. Show the threshold that comes
   first and how much is left on the other, for example "Due at 2450 h (40 h left) · calendar
   2027-03-12".

States: `due`, `due_soon`, `not_due` (with what's left), `no_history`. `due_soon` is an addition
the skill doesn't have. It means the job will be due within 14 days, which is a fixed constant:

- Calendar: the calendar due date is within 14 days of today.
- Meter: project the date the meter threshold will be reached, from the average daily use between
  the two latest readings at least 7 days apart. If that date is within 14 days, the job is due
  soon. With fewer than two readings like that, the meter side can't be due soon, only due or not
  due.

Surfaces:

- An item's status badge stays manual, and a separate "Overdue" or "Due soon" chip is added next to
  it. `needs_service` keeps its current meaning.
- A new **Due** tab lists in-service equipment grouped by category, as in the skill's "List
  equipment". Each item shows its meter reading (or "no meter"), then due jobs and jobs with no
  history. It uses `inUserLocation` like the other lists.
- Putting this logic in `$lib/schedule.ts` as plain functions lets it be tested without D1. Use the
  two worked examples in `examples.md` (Cat 420, shop well) as test cases.

### 4. Log changes (gaps 6–10)

- Join table `log_service_job { logId, serviceJobId }`. One log can complete several jobs, but only
  jobs on that log's own item. The log form gets checkboxes for the item's jobs. Picking a job fills
  in the log text and copies that job's consumables into parts used as a starting point.
- `maintenance_log.partsUsed: json<{ item, spec, qty }[]>`, edited as rows in the log form and shown
  on the log page. It records what was actually installed, which can differ from the job's
  consumables, so the brand and viscosity used are kept. Leave it empty when nothing was installed.
- `maintenance_log.performedBy: text | null`, a free-text name for when the work was done by
  someone other than the author (Ron, an outside welder). Show it as "Ron (entered by Nick)".
  `authorId` stays the account that entered the log.
- `maintenance_log.summary: text | null`, a one-line title shown in lists. If it is empty, the list
  uses the first line of `description`.
- `photo.caption: text | null`, editable on log and equipment photos, and shown under the photo in
  the viewer.
- Log types: keep the current four. On import, the skill's `scheduled` becomes `service`, and
  `repair` and `inspection` stay as they are.
- Photos keep the file types the app already allows, which include all the types the skill allows.

### 5. Equipment fields (gaps 11–14)

- `equipment.category: 'vehicle' | 'machinery' | 'facility'`, required. The Due view and the
  equipment list group by it, and the AI's `find_equipment` can filter on it.
- `equipment.kind: text | null`, kebab-case. Suggest the skill's common kinds for each category:
  - vehicle: backhoe, excavator, tractor, utv, mower, truck, trailer
  - machinery: well-pump, irrigation, compressor, generator
  - facility: electrical, building, septic, fuel-tank

  Picking a kind fills in its category.

- `equipment.year: integer | null`.
- `equipment.operatorName: text | null`, "Primary operator", shown on the item page and in the
  list. It's free text and doesn't link to user accounts. `performedBy` works the same way.
- `equipment.place: text | null`, where the item sits within its location ("Shop bay 2", "North of
  the shop"). This is the skill's free-text `location`. The app's `location` stays the site.
- `equipment.attachedToId: text | null → equipment.id (set null)`. The item page shows "Attached
  to John Deere 4005", and the tractor shows its attachments. An attached item takes its parent's
  location. Moving the parent moves the attachments, and the location picker is disabled while
  something is attached. On import, the trailer's `location` text is mapped by hand.

### 6. Retire before delete (gap 19)

The skill never deletes logs or equipment. The app keeps deleting, under the existing
`equipment.delete` and `log.delete` flags, so mistakes can be fixed. It steers people toward
retiring:

- The equipment delete confirmation offers "Retire instead" as the default action. It also says
  how many logs and photos would be lost.
- Retired items are hidden from the Due view, but they still appear in lists, sorted last as they
  are today.

### 7. Manual pages (gap 15)

- Deep links: `/manuals/[id]?page=79` scrolls to that page. The AI's "(p. 79)" citations in chat
  become links to it.
- Saved pages: new table `manual_bookmark { id, manualId, equipmentId | null, serviceJobId | null,
page, label }`. A "Save page" button in the viewer makes one, and they show on the item page and
  under the related service job. These bookmarks replace saved page images like the deck belt PNG,
  so pages don't need to be stored as separate images.
- Optional: send the rendered page image to a vision-capable model when the AI cites a page with a
  diagram. This is out of scope for v1.

### 8. Fleet notes (gap 16)

- A single Markdown setting `fleet_notes` in the `setting` table, edited by admins under Account
  and shown read-only on a Notes page. Facts about one item belong on that item, not here.
- It is added to the general assistant's prompt as reference data, under the same "data, not
  instructions" framing as the other inventory text.

### 9. Fleet product standards (gap 17)

The skill fixes one brand for each product. The app holds this as data instead of a rule in the
prompt:

- New table `product_standard { id, product, brand, specFormat, notes }`, managed by admins. Seed
  it with these:
  - Diesel engine oil: Shell Rotella T5, in the manual's viscosity.
  - Gasoline engine oil: Valvoline, in the manual's viscosity.
  - Filters: NAPA.
- Hydraulic oil, gear oil, transmission oil, coolant and grease have no row until a brand is
  chosen. Until then they keep the manual's spec.
- The consumables editor suggests the standard for the item type, and warns (without blocking) when
  a consumable's brand differs from the standard.
- A filter spec helper offers three forms: `NAPA <number>, crosses to <oem>`, `NAPA, crosses to
<oem>`, and `NAPA`. It never fills in a NAPA number on its own.
- These standards apply to service job consumables, not to `partsUsed`. A log records what was
  actually installed.

### 10. AI (gap 18)

Add new proposal tools to item chat. Each goes through the existing approve-before-apply flow and
needs `ai.modify` plus the matching permission:

- `propose_service_jobs`: add or update jobs, including intervals, consumables and notes, using
  `search_manual` results. This is how the records were built. The apply screen shows a diff for
  each job, and the user picks which jobs to apply.
- `add_maintenance_log` gains `serviceJobIds`, `partsUsed`, `meterReading` and `performedBy`.
- `record_meter_reading`.

Rules for the prompt, taken from the skill:

- Search the manual before proposing an interval, capacity or part number the user didn't give. If
  the manual doesn't have it, leave the spec `""` or ask. Don't rebuild it from memory.
- Never invent serial numbers, meter readings, part numbers or oil types.
- Apply the product standards (section 9) to proposed consumables, and keep the manual's number
  only as the cross.
- Ask for a meter reading before proposing a log on an item that has a meter.
- Keep logs a record of the work done. Don't copy manual text into them.

In `systemPrompt`, `get_equipment` and the general assistant:

- Include the service schedule, the last and next due for each job, and the latest meter reading.
- `generalPrompt` currently gets "Today" from `new Date().toISOString()`, which is the UTC date.
  Change it to the `APP_TIMEZONE` date so the AI and the Due view agree.
- Add a read-only `list_due` tool to the general assistant, which answers "what needs service this
  week?".

### 11. Import the records (one-off)

An admin page, `/import`, where the user picks the `records` folder (`<input webkitdirectory>`).
It works in the browser, so it can reuse the pdf.js extraction pipeline:

1. Parse the YAML files in the browser and show a preview: N items, N jobs and N logs, with any
   problems listed (for example, an unknown `equipment_id`).
2. Ask which location to import into, since the records have no locations.
3. Upload the PDFs through the existing manual pipeline. Identical files are already stored once,
   so the two Gator TE records share one manual.
4. Create the equipment, jobs, logs and log photos, with captions. Set `performedBy` from
   `performed_by` and `authorId` to the importing admin. Map the fields:
   - Status: `in-service` becomes `active`, `out-of-service` becomes `out_of_service`, `retired`
     stays `retired`.
   - `serial` goes to `serialNumber`, `make` to `manufacturer`, `location` to `place`, and
     `summary` and `work_done` to `summary` and `description`.
   - `meter.reading` and `meter.read_on` become a `meter_reading` row.
5. If it's run again, skip anything that already exists: match equipment by import slug and logs
   by their record `id`. Store both in a nullable `importKey` column.

Notes text comes across as it is. "Primary user: X" lines move into `operatorName`. Ignore the
`.md` manual copies and the saved page PNG (section 7 makes a bookmark for page 79 of the Z994R
manual instead).

Run the skill's validation on each record before importing it:

- ids are kebab-case and match the filename
- the `equipment_id` exists
- every `service_ids` entry exists on that item
- meter intervals match `meter.unit`

List the records that fail. The admin can import the rest or stop.

## Phasing

1. **Schedule core**: sections 1–4, plus `category` from section 5, because the Due view groups by
   it. Without these, the app can't do what the records are for. This phase includes the schema
   migration, schedule functions with tests, item-page and log-form UI, and the Due view.
2. **Import**: section 11, so the real fleet data can be checked against the phase 1 screens.
3. **Rest of the equipment fields, retire before delete, product standards and manual pages**:
   sections 5, 6, 7 and 9.
4. **AI and fleet notes**: sections 8 and 10.

## Decisions

Settled 2026-11-03:

1. Service schedules are edited with `equipment.update`. There is no new permission.
2. `operatorName` and `performedBy` are free text and don't link to user accounts.
3. A job is due soon when it will be due within 2 weeks, a fixed 14 days (section 3).
4. Approximate dates are noted in the log text. There is no approximate-date flag, and import
   keeps the records' wording as it is.
5. Conditional intervals, such as hydraulic breaker use or high-sulfur fuel, stay in the job notes.
6. "Today" for due dates comes from one app-wide timezone setting.
7. Deleting stays, under the existing flags, and the app nudges toward retiring (section 6).
