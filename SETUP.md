# AVIOR LMS — Development Environment Setup

Reproducible setup for a fresh Windows machine. Written after two from-scratch setups; every step and every warning here corresponds to a failure that actually happened. Follow the order exactly.

Expected time: ~45 minutes, most of it waiting for the first boot.

---

## 0. Prerequisites

- **Docker Desktop** installed, running, with **WSL2 backend** enabled
- **Git for Windows**
- A GitHub account with access to both private repos

Set this globally **before cloning anything** — it prevents the CRLF corruption that breaks `init.sh`:

```powershell
git config --global core.autocrlf input
```

---

## 1. Clone both repos — structure is load-bearing

The compose file uses relative mount paths, so the folder layout must be exactly:

```
<anywhere>\LMS-PROJECT\
  lms\      <- the Frappe LMS fork
  avior\    <- the AVIOR custom app (repo name: avior-frontend)
```

```powershell
mkdir LMS-PROJECT
cd LMS-PROJECT
git clone https://github.com/JomariTheAnalyst/LMS-AVIOR_EXAMPLE.git lms
git clone https://github.com/JomariTheAnalyst/avior-frontend.git avior
```

`avior` must be a **sibling of `lms`**, named exactly `avior`. If it is anywhere else, Docker silently creates an empty directory at the mount path and you get `No module named 'avior'` twenty minutes later.

---

## 2. Verify line endings

`init.sh` is executed by bash inside a Linux container. CRLF line endings produce `$'\r': command not found` and nothing boots.

```powershell
cd lms\docker
if ([IO.File]::ReadAllText((Join-Path $PWD "init.sh")) -match "`r") { "CRLF - FIX NEEDED" } else { "LF - good" }
```

If it says CRLF:

```powershell
$p = Join-Path $PWD "init.sh"
[IO.File]::WriteAllText($p, ([IO.File]::ReadAllText($p) -replace "`r`n", "`n"))
```

Re-run the check. Do not proceed until it says `LF - good`.

**Repeat this fix after every edit to `init.sh`, forever.** Windows editors reintroduce CRLF.

---

## 3. First boot

All commands from the `lms` repo root (`cd ..` from docker).

### 3a. Ensure a truly clean slate

```powershell
docker compose -f docker\docker-compose.yml down -v
docker volume ls
```

`docker volume ls` must show **no** `lms_bench-data` and **no** `lms_mariadb-data`.

If a volume refuses to delete with "volume is in use", orphaned containers are pinning it:

```powershell
docker ps -a --filter volume=lms_bench-data
docker rm -f <the container IDs listed>
docker volume rm lms_bench-data
```

### 3b. Create volumes, fix ownership, start

Docker creates named volumes owned by root; the container runs as `frappe` and cannot write to them. The order below is deliberate: create the volumes, fix ownership **before** init runs, then start.

```powershell
docker compose -f docker\docker-compose.yml up -d
docker compose -f docker\docker-compose.yml stop frappe
docker compose -f docker\docker-compose.yml run --rm --user root --entrypoint bash frappe -lc 'chown -R frappe:frappe /home/frappe/frappe-bench'
docker compose -f docker\docker-compose.yml start frappe
docker compose -f docker\docker-compose.yml logs -f frappe
```

### 3c. Watch the log

The **first line must be `Creating new bench...`**

If it says `Bench already exists, skipping init`, the volume was not cleared — stop, go back to 3a. Continuing from here always fails.

First boot takes 15–25 minutes: venv creation, cloning frappe and payments, pip installs, two yarn installs, asset build, site creation. It ends with the Procfile processes starting (`web.1`, `socketio.1`, `schedule.1`, `worker.1`).

`init.sh` has `set -e` — it stops at the first real failure. If it stops, read the **last** error, not the first log line, and check the Troubleshooting table below.

### 3d. If yarn fails with EACCES

The two `node_modules` anonymous volumes were created root-owned and the in-script chown didn't take. Fix them **with `exec`, not `run`** — anonymous volumes are per-container, so `run` fixes a throwaway container's copies and changes nothing:

```powershell
docker compose -f docker\docker-compose.yml exec --user root frappe bash -lc 'chown -R frappe:frappe /home/frappe/frappe-bench/apps/lms/node_modules /home/frappe/frappe-bench/apps/lms/frontend/node_modules'
docker compose -f docker\docker-compose.yml restart frappe
```

---

## 4. Post-boot configuration

One-time, after the first successful boot:

```powershell
docker compose -f docker\docker-compose.yml exec frappe bash -lc 'git config --global --add safe.directory /home/frappe/frappe-bench/apps/lms && git config --global --add safe.directory /home/frappe/frappe-bench/apps/avior'
docker compose -f docker\docker-compose.yml exec frappe bash -lc 'cd /home/frappe/frappe-bench && uv pip install ruff --python env/bin/python'
```

The first line lets git run inside the bind-mounted repos (Windows mounts appear root-owned; git refuses "dubious ownership" without it). The second installs the linter that verification steps expect.

If `lms.localhost` does not resolve in the browser, add to `C:\Windows\System32\drivers\etc\hosts` (as Administrator):

```
127.0.0.1 lms.localhost
```

---

## 5. Verify

```powershell
docker compose -f docker\docker-compose.yml exec frappe bash -lc 'cd /home/frappe/frappe-bench && bench --site lms.localhost list-apps'
```

Expect: `frappe`, `payments`, `lms`, `avior`.

Then in the browser — always `lms.localhost`, never `127.0.0.1` (Frappe resolves the site from the Host header):

| URL | Expect |
|---|---|
| `http://lms.localhost:8000/` | AVIOR landing page |
| `http://lms.localhost:8000/login` | AVIOR-styled login |
| `http://lms.localhost:8000/lms` | LMS app |
| `http://lms.localhost:8000/app` | Desk (after login) |

Credentials: `Administrator` / `admin`.

**This is a fresh, empty database.** No courses, no users beyond Administrator, no email account. To carry data over from another machine, take `bench backup --with-files` there and restore here with `bench restore`.

The Gmail app password is deliberately not in any repo — reconfigure the Email Account in `/app/email-account` by hand, and re-enable the scheduler check afterwards (`bench --site lms.localhost doctor`).

---

## 6. Daily use

| Task | Command |
|---|---|
| Start | `docker compose -f docker\docker-compose.yml start` |
| Stop (keeps everything) | `docker compose -f docker\docker-compose.yml stop` |
| Logs | `docker compose -f docker\docker-compose.yml logs -f frappe` |
| Shell | `docker compose -f docker\docker-compose.yml exec frappe bash` |
| **Destroy everything** | `down -v` — only when you mean it |

`docker compose down` (no `-v`) is safe: named volumes survive. `-v` deletes the bench and the database.

---

## 7. Rules that prevent repeat disasters

**PowerShell quoting.** Any container command containing quotes, pipes, `$`, `%`, or `^` goes in a **script file** under `docker\`, never inline. PowerShell mangles them silently and bash receives fragments:

```powershell
@'
<bash commands here, single-quotes fine>
'@ | Set-Content -Encoding ASCII docker\tmp.sh -NoNewline
docker compose -f docker\docker-compose.yml exec frappe bash /workspace/tmp.sh
del docker\tmp.sh
```

**`exec` vs `run`.** `exec` enters the live service container — use it for anything touching the real bench or the anonymous node_modules volumes. `run` creates a fresh throwaway container with its **own** anonymous volumes; fine for fixing the named bench volume while the service is stopped, useless for node_modules. Interrupted `run` containers linger and pin volumes — clean with `docker container prune -f`.

**`apps/lms` and `apps/avior` are real bind mounts, never symlinks.** `frontend/src/socket.js` resolves `../../../../sites/common_site_config.json` relative to the physical path; a symlink breaks the frontend build with `No common_site_config.json found`.

**Never edit `init.sh` by appending.** Replace lines. A duplicated `bench init` line cost a full failed cycle — the old line runs first and the fix never executes. After any edit: `Select-String -Path docker\init.sh -Pattern "bench init"` must return exactly one line.

**AI agents do not touch this file, `docker-compose.yml`, mounts, or the bench.** Environment repair is the operator's job. See `AGENTS.md` §11.

---

## 8. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `$'\r': command not found` | CRLF in `init.sh` | Step 2 |
| `Permission denied: 'frappe-bench/...'` at boot | Root-owned named volume | Step 3b, in order |
| `EACCES ... node_modules/...` from yarn | Root-owned anonymous volumes | Step 3d — must use `exec` |
| `Bench already exists, skipping init` on a fresh setup | Volume not cleared | Step 3a; verify with `docker volume ls` |
| `Device or resource busy` renaming to `apps/lms` | Something tried to clone over the bind mount | `init.sh` must install mounted apps, never `bench get-app` them |
| `No module named 'lms'` / `'avior'` | `apps.txt` lists apps that aren't pip-installed — poisoned volume, or `avior` folder in the wrong place | Check folder layout (step 1); otherwise full reset from 3a |
| `vite: not found` during build | `frontend/node_modules` empty | `yarn install` in `apps/lms` **and** `apps/lms/frontend` |
| `Enter mysql super user` prompt hangs site creation | bench needs the username | `--db-root-username root` on `bench new-site` |
| `ERR_EMPTY_RESPONSE` in browser, server looks fine | Web process bound to 127.0.0.1 in the container | Procfile web line must be `bench serve --host 0.0.0.0 --port 8000` |
| Site loads at `lms.localhost` but not `127.0.0.1` | Host-header site resolution | Expected. Use `lms.localhost` |
| `dubious ownership` from git in container | Bind mount appears root-owned | `safe.directory` config, step 4 |
| `volume is in use` on `docker volume rm` | Orphaned containers from interrupted `run` | `docker ps -a --filter volume=...`, `docker rm -f`, retry |
| Emails stuck at Not Sent | Scheduler disabled | `bench --site lms.localhost enable-scheduler`, check `/app/email-queue` |

---

*Update this file whenever setup reality changes. A runbook that has drifted from the truth is worse than none — the next person trusts it.*