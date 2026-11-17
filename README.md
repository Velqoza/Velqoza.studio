# VELQOZA STUDIO V1.0 — Studio Assistant command editor

## New in V1.0

- **Studio Assistant** command panel inside the editor, with Arabic and English input.
- Supported actions really change the Canvas video project: duration (10/15/20s), aspect ratio (9:16/16:9/1:1), cinematic/minimal/neon/luxury style, music selection, color hex or named colors, opening/closing headline, adding a new text layer, and moving/scaling/deleting/duplicating selected layers.
- Commands work on the existing storyboard/timeline and are included in preview, project save, and video export. New layer actions integrate with the existing Undo/Redo history.
- All messages are rendered as text (no HTML execution) and kept only in a bounded browser tab/session history. No API key needed, no AI call, no extra credit charge.
- **Important:** This is a deterministic command assistant, **not a generative AI model or open-ended chat**. Unsupported commands get a help message rather than fake success.
- V0.9 image layers, keyframes, histories, cloud projects, account login/security, and credits retained.

## Tests

Run `npm test` (Node 22+). Added direct command parser tests for English/Arabic, input handling, and UI integration contracts. Existing server tests verify export/credit deduction and account isolation. Full iPhone browser QA remains necessary before public release.

## Release status

Development preview only. No production deployment, card payments, email verification or generative video backend. The existing credit rule remains: preview and editing free; MP4 export costs server-configured credits after a successful conversion. No fixed video-count or edit-count quota.

# VELQOZA STUDIO V1.0 — Image Layers + Pro Timeline Controls

## New in V0.9

- **Free-position image layers:** Add up to three compressed overlay images anywhere on the timeline, separate from the two existing fixed scene photos. Images can be moved and scaled by touch, assigned to any time range, and animated using keyframes. PNG/WebP transparency is preserved when WebP encoding is available; uploaded imagery is converted to compressed embedded WebP or JPEG for portable project saves.
- **Layer animation presets:** Fade, Pop, Slide Up, or None. The chosen preset is applied during both preview and final video export because rendering uses the same Canvas engine.
- **Duplicate and reorder layers:** Duplicate any text, shape or image layer; move the layer backward/forward to change the stacking order.
- **Timeline Undo/Redo:** Up to 30 layer edit history checkpoints (layer creation/deletion, values, animation changes, keyframes, ordering, image replacements and drag end). Also Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z / Y, and Ctrl/Cmd+D to duplicate the selected layer while focus is outside fields. **Undo is for layer edits only**, not account actions or uploads to other project slots.
- Photo/image layer project payload is checked against approximately 1.55 MB during uploads to stay inside the server's 1.8 MB project save limit. You may need smaller images if the two older scene photos are already large.
- Existing credits and account security are unchanged. No purchases or third-party AI API were added.

## What works

- V0.7 features retained: motion-graphics editor, storyboard, templates, scene photos, editable layers/keyframes, cloud project library, local saves, and account-based credit charging for successful MP4 exports.
- **Version history for cloud projects:** whenever a changed project is saved again, the prior full project state (including embedded scene images) is archived. The most recent 12 previous versions are retained per project. History is available only to the project owner. Restoring an old version automatically archives the current version, so you can undo a restore.
- **Account security:** signed-in users can change their password by providing the current password. Old sessions across all devices are revoked and the current browser receives a fresh session. A separate **Log out on all devices** option revokes all sessions.
- Existing credit rules: welcome balance defaults to 50, successful MP4 conversion costs 10. Previews and edits are free. Failed conversions do not charge. No fixed quota of video/edit counts.
- **No credit purchase system, real AI video model, email verification or forgotten-password reset yet.** Do not present this prototype as production-ready.

## Run locally

Requires **Node.js 22+ and FFmpeg** installed and available on PATH.

```bash
cd VELQOZA_STUDIO_V10
npm start
```

Visit http://localhost:8787 in a supported browser. Run tests with `npm test`.

Database: `./data/studio.sqlite`. Set `STUDIO_DATA_DIR=/persistent/path` for a persistent disk. **Do not commit database files or secrets.** The built-in node:sqlite module is experimental on some Node 22 builds; plan a supported persistent database for production.

## Credit controls

Set `STUDIO_WELCOME_CREDITS` and `STUDIO_EXPORT_CREDITS` to integer amounts. Admin grant via private console:

```bash
STUDIO_DATA_DIR=/persistent/path node scripts/grant-credits.js creator@example.com 100
```

Or secure API `POST /api/admin/credits/grant` with `STUDIO_ADMIN_KEY` (32+ character server environment secret). Never put this secret in browser JS or an uploaded ZIP.

## New API routes

- `GET /api/projects/:id/versions` — list up to 12 earlier snapshots, owner only.
- `POST /api/projects/:id/restore` with JSON `{ "versionId": 123 }` — restore a snapshot; the current project is archived beforehand.
- `POST /api/account/change-password` with JSON `{ "currentPassword":"...", "newPassword":"..." }` — invalidate old sessions and issue a fresh secure session cookie.
- `POST /api/account/logout-all` — invalidate every session for the signed-in account.

## Tests and release status

`npm test` covers authentication, user isolation, cloud save/version/restore, password changes, session invalidation, credits, and real FFmpeg WebM-to-MP4 conversions with charging, plus non-charging failures.

Still needed **before a public launch**: verified email ownership (welcome credit abuse prevention), email password recovery, payments and refunds, managed production database/backups, secure HTTPS deployment, web abuse limits, browser/phone QA (especially iOS video capture), accessible UI, and optional true generative-video provider. The Chromium integration test in the development environment is blocked by an environment-level local networking restriction; no claim of complete real-browser QA is made.

**No other VELQOZA site or payment account was changed.**

## Test status (V0.9)

- `npm test` passes: FFmpeg conversion with credit deduction on success, invalid-conversion no charge, account/session isolation, version history and restore, plus new pure-function tests for image layer validation, keyframe interpolation and presence of controls.
- JavaScript parses with `node --check`.
- Browser-based interactive QA is **not complete**: the environment blocks local URLs in Chromium with `ERR_BLOCKED_BY_ADMINISTRATOR`, so do not infer that drag-and-drop or iOS export has been fully verified.
- V0.9 is a development preview, **not publicly released or deployed**. The ZIP intentionally contains no database, accounts, tokens or exported videos.
