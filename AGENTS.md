# AGENTS.md

Operating instructions for AI coding agents working in this repository. Read this fully before any task. If a rule here conflicts with a task prompt, follow this file and say so in your report.

---

## 1. Project

**AVIOR LMS** is a training platform for AVIOR, a training provider that sells programs to schools and training centers.

- AVIOR authors the courses. Clients come to AVIOR's single instance.
- Administrators create learner accounts and enroll them into batches.
- **This is not a marketplace.** Do not build or surface: course pricing, checkout, instructor payouts, public self-signup, "become an instructor" flows, star-rating marketplaces, or subscription management.
- Self-enrollment is a possible future feature. Do not build it.
- Multi-tenancy is not in scope. Custom DocTypes should carry an optional `organization` Link field for future use, but no tenancy or isolation logic is to be written.

Built on a fork of [Frappe LMS](https://github.com/frappe/lms).

---

## 2. Two apps — know which one you are in

| App     | Role                       | Edit freely?                                     |
| ------- | -------------------------- | ------------------------------------------------ |
| `lms`   | Forked upstream Frappe LMS | **No.** Every edit is a permanent rebase burden. |
| `avior` | AVIOR's own app            | **Yes.** All AVIOR work belongs here.            |

The landing page, marketing content, custom DocTypes, and business logic go in `avior`.

Touch `lms` only for frontend/Vue changes that genuinely cannot be made elsewhere — see the ladder below.

---

## 3. Environment

The only valid host working directory is:

```text
C:\Users\UPRHT-PC10-2025\Documents\LMS-PROJECT\new-lms\lms
```

Do not work from another checkout, parent directory, copied tree, or similarly named folder. If this exact folder is not open, stop and report.

|                    |                                      |
| ------------------ | ------------------------------------ |
| Bench              | `/home/frappe/frappe-bench`          |
| Site               | `lms.localhost`                      |
| Canonical app path | `/home/frappe/frappe-bench/apps/lms` |
| URL                | `http://lms.localhost:8000`          |
| Admin              | `Administrator` / `admin`            |

The host Windows checkout must be a **real bind mount** at `/home/frappe/frappe-bench/apps/lms`; it must never be a symlink. There is **one tree**. If you find yourself editing files that do not affect the running site, stop and report — that is the failure mode this setup exists to prevent.

The real bind mount is required because `frontend/src/socket.js` imports `../../../../sites/common_site_config.json` by relative path. Rollup resolves symlinks to their physical location, which makes that relative import resolve against the wrong directory and causes the build to fail.

`node_modules` directories are excluded from the bind mount by anonymous volumes. Do not attempt to install Node dependencies from the host.

New Docker volumes must be owned by the container user before they are used. Run `chown -R frappe:frappe <mount-point>` for each new volume before installing dependencies, building assets, or running any process that writes to it.

Git treats the bind-mounted checkout as a different owner. Before running Git inside the container, the repository needs this safe-directory exception:

```bash
git config --global --add safe.directory /home/frappe/frappe-bench/apps/lms
```

### Commands

```bash
cd /home/frappe/frappe-bench

bench --site lms.localhost migrate          # after DocType or patch changes
bench --site lms.localhost clear-cache
bench --site lms.localhost console          # Python REPL with site context
bench build --app lms                       # rebuild SPA assets
bench restart

cd apps/lms/frontend && yarn dev            # SPA hot reload
```

Python changes hot-reload (`developer_mode` is on). Vue changes do not.

---

## 4. Architecture

### Request flow

```
Browser → Frappe website router
            ├── /                → server-rendered page from avior/www/
            ├── /lms/**          → SPA shell (www/_lms.html)
            │                        → Vue Router → createResource
            │                        → POST /api/method/<dotted.path>
            │                        → @frappe.whitelist() Python
            └── /app/**          → desk (admin backend)
```

Two contracts that must never be confused: `/lms/...` is a **browser route**; `lms.lms.api.get_courses` is a **dotted Python path**. Renaming either breaks things silently.

Every endpoint the frontend calls must be decorated `@frappe.whitelist()`. Whitelisting is not authorization — permissions are enforced separately.

### Layout

```
lms/                              ← repo root (the fork)
├── lms/                          ← Python package
│   ├── hooks.py                  ← extension registry; read before changing behaviour
│   ├── install.py
│   ├── patches.txt               ← ordered migration list
│   ├── patches/
│   ├── lms/                      ← module "LMS"
│   │   ├── doctype/<name>/       ← .json schema, .py controller, test_*.py
│   │   ├── api.py                ← main whitelisted API surface
│   │   └── utils.py
│   ├── job/                      ← module "Job"
│   ├── overrides/                ← custom permission handlers
│   ├── www/_lms.py               ← SPA context
│   ├── www/_lms.html             ← GENERATED — never hand-edit
│   └── public/images/
├── frontend/                     ← Vue 3 SPA
│   └── src/{main.js,router.js,pages/,components/,stores/,composables/}
└── docker/                       ← local dev stack only
```

`avior` follows the same Frappe app structure.

---

## 5. Customization ladder

Always use the highest applicable level. Never drop lower than necessary.

| Level | Mechanism                                                                                                                                          | Upgrade-safe |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| 1     | Config/data — Website Settings, LMS Settings, Roles                                                                                                | Yes          |
| 2     | Custom Field / Property Setter, shipped as fixtures                                                                                                | Yes          |
| 3     | New DocType in `avior`                                                                                                                             | Yes          |
| 4     | Hook override in `avior` — `doc_events`, `override_whitelisted_methods`, `override_doctype_class`, `permission_query_conditions`, `has_permission` | Mostly       |
| 5     | Direct edit to the `lms` fork                                                                                                                      | **No**       |

**Levels 4 and 5 require justification in the commit message.** State the level used in every report.

Level 5 is for frontend/Vue changes only. If you are reaching for level 5 to change backend behaviour, you have missed a hook — stop and ask.

---

## 6. Never rename

Renaming any of these breaks migrations, upgrades, or the frontend contract, often silently:

- Python package / app names (`lms`, `frappe_lms`, `avior`)
- DocType names and stored document `name` fields
- Desktop Icon document `name` — change the `label` only
- Dotted API paths used by `createResource` / `call`
- Asset paths and build output locations
- Entries in `patches.txt`
- Route paths under `/lms/**`
- Role names, including `LMS Student`
- `lms/www/_lms.html` — it is generated; edit the source and rebuild

---

## 7. Branding

Target name: **AVIOR LMS**.

**Data-driven — do these first, no code:** Website Settings → App Name, App Logo, Banner Image, Favicon.

**Hardcoded — level 5, requires rebuild:**

| Surface                                  | Path                                             |
| ---------------------------------------- | ------------------------------------------------ |
| App title, Apps screen                   | `lms/hooks.py`                                   |
| SPA `<title>`, favicon fallback          | `lms/www/_lms.py`                                |
| PWA manifest                             | `lms/lms/api.py`                                 |
| "Powered by Frappe Learning", docs links | `frontend/src/components/Sidebar/AppSidebar.vue` |
| Install-PWA prompt                       | `frontend/src/components/InstallPrompt.vue`      |
| Default images                           | `frontend/public/`, `lms/public/images/`         |

Also present, lower priority: persona text, demo course content, default email signatures, README, payment doc links.

---

## 8. Design system

Binding. All values live as CSS custom properties in a single tokens file in `avior`. **No raw hex values anywhere else.**

**Colour**

- Primary: **blue** — buttons, links, active states, primary CTAs.
- Accent: **yellow** — pill labels, emphasized words in headings, highlight/active card states, small decorative shapes. Accent only; never a large surface.
- Background wash: warm off-white or faint cream. **Never pale blue** — it reads cold and generic.
- **Never yellow text on white. Never white text on yellow.** Yellow buttons take near-black text.
- All text/background pairs must meet WCAG AA (4.5:1 body, 3:1 large text).

**Type**

- Headings: **Playfair Display**, 20px and above only — its thin strokes break down below that.
- Body: **Montserrat**. It is wide; watch line length at mobile widths.
- Self-host both. Do not load from a third-party CDN.
- Define a type scale in tokens; do not use arbitrary sizes.

**Iconography**

- One icon set at one weight throughout. Do not mix sources.

---

## 9. Prohibited in UI work

These make output look machine-generated. Do not produce them:

- Mesh, rainbow, or multi-stop gradients. Flat fills, or a single subtle tint.
- Mixed icon sets, or icons at inconsistent weights.
- 3D-rendered, AI-generated, or generic stock imagery.
- Decorative floating blobs or shapes with no compositional purpose.
- Lorem ipsum.
- Invented testimonials, client names, statistics, or accreditations.
- Emoji as interface iconography.

---

## 10. Content rules

- **No user-facing copy hardcoded in templates.** Anything a marketer might edit comes from a DocType. Templates hold structure only.
- Every content DocType gets `published` (Check) and `sort_order` (Int) from its first version.
- Placeholder content must be realistic in length and phrasing — real-world program titles, not filler. Lorem ipsum hides wrapping bugs.
- Seeded placeholder records must be `published = 0`.
- Public endpoints return **explicitly whitelisted fields only**. Never pass a whole document to a public page.

---

## 11. Agent limitations

You must **not**:

1. Add any runtime dependency — JS library, Python package, CDN link — without explicit approval. **GSAP, Lenis, and Tailwind CDN are specifically not approved.**
2. Create or modify files outside `apps/avior` when the task is landing-page work.
3. Modify LMS DocType JSON directly. Use Custom Fields shipped as fixtures.
4. Invent copy, statistics, testimonials, client names, or accreditations.
5. Commit binary image assets without asking.
6. Run state-changing commands (`migrate`, `build`, `new-site`, anything writing to the database) without stating so explicitly in your report.
7. Exceed the landing-page performance budget: **under 100KB JavaScript, LCP under 2.5s**.
8. Continue past a failed verification group. Stop and report.
9. Fix a failure you discovered during verification. Report it; wait for direction.
10. Write `UNVERIFIED` facts as if verified. If you could not check it, say so.
11. Diagnose, repair, reconfigure, or otherwise modify the environment or infrastructure. These are out of scope for all tasks. If either appears broken or blocks the requested work, stop and report the exact condition instead.

---

## 12. Accessibility and performance

- Server-rendered content must be readable with JavaScript disabled. Animation is enhancement only.
- Honour `prefers-reduced-motion`.
- Explicit `width` and `height` on every image. Serve WebP.
- Mobile-first. Verify at 360px width.
- Semantic HTML: one `<h1>` per page, landmarks, labelled form controls.
- Keyboard navigable with a visible focus state.
- SEO in the first commit, not retrofitted: `<title>`, meta description, canonical URL, Open Graph tags via `context.metatags`.

---

## 13. Verification protocol

Every task runs **exactly three groups, in order**. **Stop at the first failure.** Do not attempt a fix.

Run from `/home/frappe/frappe-bench`.

### V1 — Static

Nothing executed, nothing changed.

```bash
ruff check apps/avior
ruff format --check apps/avior
python -m compileall -q apps/avior
```

If you modified the Vue SPA, additionally run the lint script defined in `apps/lms/frontend/package.json`. **TypeScript checking does not apply to `avior`** — it is Jinja, CSS, and plain JS. Run `npx vue-tsc --noEmit` only inside `apps/lms/frontend`, and only if a `tsconfig.json` exists there. Do not invent a check that the project has no tooling for.

### V2 — Integration

State-changing. Announce before running.

```bash
bench --site lms.localhost migrate
bench --site lms.localhost run-tests --app avior    # if tests exist
```

### V3 — Runtime

```bash
curl -s -o /dev/null -w "%{http_code}\n" -H "Host: lms.localhost" http://localhost:8000/
curl -s -o /dev/null -w "%{http_code}\n" -H "Host: lms.localhost" http://localhost:8000/lms
git status --porcelain
```

Expect `200` for both. `git status` must show no changes outside the task's stated scope and `docker/`.

### Reporting

Per group: **PASS / FAILED / NOT RUN**.

On failure, report: the group, the exact command, the exact error, your diagnosis of the cause, and what remains unverified as a consequence. Then stop.

---

## 14. Definition of done

Every change:

- States which ladder level was used, and why, if level 4 or 5
- Migrates cleanly
- Does not break `/` or `/lms`
- Includes a test where the logic is non-trivial
- Is one commit per slice, with a conventional commit message
- Leaves no `UNVERIFIED` claims presented as fact

---

## 15. Environment-specific facts to confirm

These vary and must be checked in the live environment rather than assumed. Do not treat any value below as known.

- Whether `lms` claims the site home page: `frappe.get_hooks("home_page")` and `frappe.db.get_single_value("Website Settings", "home_page")`. This determines whether `avior` can serve `/` without contention.
- Current HEAD SHA and branch of `apps/lms`.
- Whether `apps/lms/frontend` contains a `tsconfig.json`.
- Whether a lint script is defined in `apps/lms/frontend/package.json`.
- Installed app versions: `bench version`.
