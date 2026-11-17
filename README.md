# VELQOZA STUDIO

> **Development preview — not production-ready.**

VELQOZA STUDIO is an experimental Node.js video motion-graphics editor with browser Canvas rendering, a storyboard, templates, photo/image layers, a timeline with keyframes, editable objects, project history, account-based credits, and a bilingual Arabic/English command assistant. The command assistant is rule-based, not a generative AI model.

## Current milestone

Version: **1.0** (development). The full source is being prepared for this repository. Do not deploy this repository until the source files are present and tested.

## Run the source locally

Requires Node.js 22+ and FFmpeg. From the project root:

```bash
npm test
npm start
```

Open `http://localhost:8787`.

## Security and release status

- Browser preview and edits are free; successful MP4 conversion costs server-configured credits.
- The user database is stored locally in `data/` and **must never be committed**.
- Set any `STUDIO_ADMIN_KEY` in environment variables only; never in source code.
- There is **no credit purchase system** yet.
- Email verification, forgotten-password reset, production database/backups, browser/iPhone QA, and a real generative video backend are not ready.
- This repository should be treated as **development code**, not a live public service.

© 2026 VELQOZA STUDIO.
