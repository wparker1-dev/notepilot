# NotePilot Pages verification

## Executed in the build environment

- `node --check static/app.js` — PASS
- `node --check static/web_api.js` — PASS
- `node --check optional-ai-worker/worker.js` — PASS
- `node tests/test_api.cjs` — PASS
  - Saved notes, source-linked flashcard generation, guides and exams
  - Persistent data operations, known/review flags, one-time coin rewards
  - Source-grounded rule-based lookup, manual edit/undo, stale write rejection
  - Shop purchases/themes, source deletion safety
- `node tests/test_worker.cjs` — PASS (mocked AI provider and KV)
  - Origin check, upstream request and protected secret, daily quota enforcement
- Validated HTML element IDs: no duplicate IDs and all JavaScript-referenced IDs exist.
- Checked all website CSS/JS references are relative to GitHub Pages path (except pinned library CDN).
- Converted and parsed the original prototype's included SQLite database to the supported workspace backup format and confirmed its materials' source IDs were present.

## Not executed here

- A real GitHub Pages deployment, which requires your GitHub account and repo permissions.
- Real Chrome/Edge/Firefox end-to-end tests. The available headless Chromium environment blocked all navigation with `ERR_BLOCKED_BY_ADMINISTRATOR` even for loopback and `data:` URLs. The simulated IndexedDB tests above do not substitute for this.
- Browser PDF/Word/PowerPoint extraction using CDNs and real-world file variations; static code and file formats were inspected but not live tested.
- A live paid AI request or Cloudflare deployment. The Worker test uses a mocked upstream response; service credentials and quotas are required for live testing.
- Penetration testing / third-party security review, cross-device sync (not supported), or broad production-load testing.

For a practical manual test plan, see **README.md → Test the public site**. Verify file formats, theme persistence and the optional AI Worker in your own browser after publishing.
