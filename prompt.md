# Task: Discovery Audit → Author `AGENTS.md`

## Role

You are the implementer and auditor on an internal corporate/school training LMS built on Frappe LMS, branded **AVIOR LMS**. This task is **discovery + one file**. Do not refactor, rebrand, or implement features.

## Scope — hard limits

- **Read-only** across the codebase, with exactly one exception: create `AGENTS.md` at the repo root.
- Do not modify any existing file. Do not run `migrate`, `build`, or any state-changing bench command.
- If a fact cannot be verified by inspection, write `UNVERIFIED` rather than inferring it.

## Canonical paths

- Bench: `/home/frappe/frappe-bench`
- App under development: `/home/frappe/frappe-bench/apps/lms` ← **the only tree that affects the running site**
- Site: `lms.localhost`

Confirm the git remote of `apps/lms` points to the AVIOR fork, not `frappe/lms`. If it does not, stop and report.

---

## Phase 1 — Discovery (read-only)

Inventory and record:

1. **Environment** — bench version, installed apps with versions and commit SHAs, site name, `developer_mode` state.
2. **Repository** — remote URLs, branch, HEAD SHA, working-tree status of `apps/lms`.
3. **Backend** — modules; DocType count per module; the 15–20 DocTypes that carry core domain meaning (courses, lessons, batches, enrollments, quizzes, assignments, certificates, programs) with a one-line purpose each; every hook declared in `hooks.py` and what it registers; the whitelisted API surface in `lms/lms/api.py`; custom permission handlers.
4. **Frontend** — route count and the route→page mapping for the main flows; Pinia stores and what each holds; how components call the backend (`createResource`, `createListResource`, `call`); the Vite build output path and how `_lms.html` is generated.
5. **Branding surfaces** — every location where "Frappe" or "Frappe Learning" appears in user-visible output, separated into (a) data-driven, changeable via Website Settings, and (b) hardcoded, requiring a code change.
6. **Roles and permissions** — every role the app defines and what each can do.

---

## Phase 2 — Author `AGENTS.md`

Write it at the repo root. Required sections:

1. **Project** — what AVIOR LMS is: internal training/education, not a marketplace. No public course selling, no instructor payouts.
2. **Environment** — bench/site/paths, canonical edit path, daily commands.
3. **Architecture** — request flow (browser → Frappe route → SPA shell → Vue Router → `/api/method/...` → whitelisted Python), directory map with a one-line purpose per directory.
4. **Domain model** — the core DocTypes and how they relate.
5. **Customization ladder** — the required preference order, most-preferred first:
    1. Config/data (Website Settings, LMS Settings, Roles)
    2. Custom Field / Property Setter, shipped as fixtures
    3. New DocType in the separate `avior` app
    4. Hook override in `avior` (`doc_events`, `override_whitelisted_methods`, `override_doctype_class`, `permission_query_conditions`)
    5. Direct edit to the `lms` fork — **last resort, frontend/Vue only**

    State plainly: never use a lower level when a higher one suffices; justify in the commit message whenever level 4 or 5 is used.

6. **Never rename** — package/app names, DocType names, stored `name` fields, Desktop Icon `name`, dotted API paths, asset paths, `patches.txt` entries, `/lms/**` routes, role names, generated `_lms.html`.
7. **Branding rules** — data-driven first; hardcoded surfaces listed with file paths; rebuild required after frontend edits.
8. **Conventions** — DocType naming for custom objects (`AVIOR ` prefix), Python/Vue style as observed in the codebase, test file placement, patch authoring rules.
9. **Definition of done** — every change: migrates cleanly, has a test where logic is non-trivial, does not break `/lms` route, states which ladder level was used and why.

Keep it dense and factual. No filler.

---

## Phase 3 — Verification

Run exactly **three** verification groups, in order. **Stop at the first failure.** Do not attempt later groups.

**V1 — Environment**
Bench reachable; `lms.localhost` present; `apps/lms` remote is the AVIOR fork; branch and HEAD SHA recorded.

**V2 — Architecture inventory**
DocType counts per module match what is on disk; `hooks.py` parses and every hook is accounted for; every route in `router.js` maps to an existing page component; `AGENTS.md` exists and every required section is populated with verified content.

**V3 — Runtime**
`GET /lms` on the running site returns HTTP 200; no file other than `AGENTS.md` is modified (`git status` shows exactly one new untracked file).

---

## Output

Report in this structure:

- **Environment**
- **Architecture**
- **Important files** — path + why it matters
- **Branding inventory** — data-driven vs hardcoded
- **Verification results** — per group: PASS / FAILED / NOT RUN

On failure: name the group, the exact command and error, your diagnosis of the cause, and what remains unverified as a result. Do not continue past it. Do not attempt a fix.
