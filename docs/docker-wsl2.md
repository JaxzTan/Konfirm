# Docker on WSL2 Ubuntu — install & setup

Step-by-step, written against **this machine's actual state** (Ubuntu 24.04 on
WSL2, checked 2026-09-05). `docs/docker.md` is a different thing entirely: a
historical record of a Docker setup that was built and then discarded on
2026-09-02. It has no install instructions and its file listings are stale.

> **Docker Engine is already installed and running here.** Steps 1–4 are the
> reference for a fresh machine (or a teammate's). Step 5 is the one that
> actually bit us — read that one even if everything else works.

## Current state on this machine

| Piece | State | Source |
|---|---|---|
| Docker Engine | 29.1.3, active | apt package `docker.io` (Ubuntu repo) |
| containerd | 2.2.1 | apt package `containerd` |
| Compose | v5.5.1 | **hand-dropped binary** in `~/.docker/cli-plugins/` |
| buildx / BuildKit | **not installed** | — falls back to the classic builder |
| systemd | enabled | `/etc/wsl.conf` |
| `docker.service` | enabled + active | starts on WSL boot |
| `docker` group | contains `jayci` | needs a WSL restart to take effect |

Two gaps worth closing are in step 6.

---

## Step 0 — Confirm you're on WSL2

In **PowerShell** (not the Ubuntu shell):

```powershell
wsl -l -v
```

`VERSION` must say `2`. If it says `1`:

```powershell
wsl --set-version Ubuntu 2
```

WSL1 has no real kernel and cannot run Docker Engine. This is not a
workaround-able limitation.

## Step 1 — Turn on systemd

This is the single most important WSL2-specific step. Without systemd there is
no `systemctl`, so `docker.service` can never start on boot and you end up
launching the daemon by hand every session.

Check first:

```bash
cat /etc/wsl.conf
```

You want to see:

```ini
[boot]
systemd=true
```

If it's missing, add it:

```bash
sudo tee /etc/wsl.conf > /dev/null <<'EOF'
[boot]
systemd=true
EOF
```

Then, from **PowerShell**, fully restart the VM (a plain terminal close is not
enough — the VM keeps running in the background):

```powershell
wsl --shutdown
```

Reopen Ubuntu and verify systemd is PID 1:

```bash
[ -d /run/systemd/system ] && echo "systemd OK"
```

## Step 2 — Install the engine

Two options. **You are on option A.**

### Option A — Ubuntu's own package (simplest)

```bash
sudo apt update
sudo apt install -y docker.io
```

One package, engine + CLI, maintained by Ubuntu. Slightly behind upstream and
does **not** include the Compose or buildx plugins — those are separate
packages (step 3).

### Option B — Docker's official repo (`docker-ce`)

Newer releases, and everything in one install. Adds Docker's apt repo:

```bash
sudo apt update
sudo apt install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
  -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc

echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io \
  docker-buildx-plugin docker-compose-plugin
```

Don't mix the two — uninstall `docker.io` before installing `docker-ce`.

## Step 3 — Compose and buildx plugins

Modern Compose is a **CLI plugin** (`docker compose`, a subcommand), not the
old standalone `docker-compose` script. On option A, install both:

```bash
sudo apt install -y docker-compose-v2 docker-buildx
```

They install to `/usr/libexec/docker/cli-plugins/`, which is system-wide.

> ⚠️ **On this machine, Compose was instead dropped into
> `~/.docker/cli-plugins/docker-compose` by hand.** That works, but it lives in
> *your home directory only*. Consequences:
> - `sudo docker compose ...` fails — root has its own `~/.docker` and won't
>   find the plugin. So `sudo make all` is **not** a valid workaround for a
>   permission problem.
> - `apt upgrade` will never update it. You patch it manually or not at all.

## Step 4 — Start the service and enable it at boot

```bash
sudo systemctl enable --now docker
```

`enable` = start on every WSL boot. `--now` = also start it right now.
Verify:

```bash
systemctl is-enabled docker   # -> enabled
systemctl is-active docker    # -> active
```

## Step 5 — The group setup (read this one)

This is where "I installed Docker but nothing works" comes from. The symptom:

```
permission denied while trying to connect to the docker API
at unix:///var/run/docker.sock
```

### Why it happens

The daemon runs as root and listens on a Unix socket:

```bash
ls -l /var/run/docker.sock
# srw-rw---- 1 root docker 0 ... /var/run/docker.sock
```

Mode `rw-rw----`, owned `root:docker`. No "other" permission bits at all. So
you can only talk to it as root, or as a member of the `docker` group. A fresh
Ubuntu install creates the group **empty** — your user is not in it, and every
`docker` command fails no matter how healthy the daemon is.

### The fix

```bash
sudo usermod -aG docker $USER
```

`-aG` is **append to group**. The `-a` is not optional: `usermod -G docker
$USER` without it *replaces* your entire group list, silently dropping you from
`sudo`, `adm`, and everything else. That is a genuinely painful mistake to
undo from inside WSL.

Verify the group file was updated:

```bash
getent group docker
# docker:x:109:jayci        <- your username must appear here
```

### Why it still doesn't work yet

Group membership is baked into a process **when it starts**. Your shell was
started before the change, so it still carries the old group list. `getent`
reads the file (updated); `id -nG` reports your process (stale). They will
disagree, and that disagreement is the whole confusion:

```bash
getent group docker   # shows jayci  -- the file
id -nG                # no docker    -- your running shell
```

Three ways forward, weakest to strongest:

```bash
# 1. One command, right now, no restart:
sg docker -c "make all"

# 2. New shell with the group, current terminal:
newgrp docker

# 3. Correct and permanent -- from PowerShell:
wsl --shutdown
```

Use **3**. Options 1 and 2 are per-shell escape hatches; any *other* terminal,
editor, or long-running process still has the stale list until the VM restarts.
That's why `make all` can fail in your terminal while the identical build
succeeds elsewhere.

### What not to do

```bash
sudo chmod 666 /var/run/docker.sock   # DON'T
```

It works, it does not survive a restart, and it hands every local process
root-equivalent access — the Docker socket is a trivial root escalation
(mount the host filesystem into a container and you own the box). Use the
group.

## Step 6 — Verify

```bash
docker --version
docker compose version
docker run --rm hello-world
```

`hello-world` is the real test: it exercises the socket, the daemon, image
pull, and container run in one shot. If it prints its greeting, you're done.

## Running this project

```bash
make all      # build images + start (nginx + nextjs), then
              # -> https://localhost:8443/
make ps       # status
make logs     # follow logs
make down     # stop
make re       # full rebuild from scratch
```

The cert is self-signed by openssl, so the browser will warn. Install `mkcert`
and delete `nginx/certs/` to get a locally-trusted one instead.

## Recommended on this machine

Two real gaps, both one command:

```bash
sudo apt install -y docker-buildx
```

Without buildx, Compose falls back to the **classic builder** — build output
reads `Step 23/32` instead of BuildKit's `[builder 4/6]`, and images get a
`com.docker.compose.image.builder=classic` label. Classic builds stages
serially, caches worse, and can't mount build caches. BuildKit is meaningfully
faster on rebuilds.

```bash
sudo apt install -y docker-compose-v2 && rm ~/.docker/cli-plugins/docker-compose
```

Replaces the hand-dropped binary with an apt-managed, system-wide one that gets
security updates and works under `sudo`.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `permission denied ... docker.sock` | not in `docker` group, or stale shell | step 5 |
| `Cannot connect to the Docker daemon` | daemon actually down | `sudo systemctl start docker` |
| `systemctl: command not found` | systemd off in WSL | step 1 |
| `docker: 'compose' is not a docker command` | plugin missing | step 3 |
| `sudo docker compose` fails, plain works | plugin is in `~/.docker`, root can't see it | step 3 note |
| Daemon dead after reboot | service not enabled | `sudo systemctl enable docker` |

**Diagnose in the right order** — is the daemon down, or can you not reach it?

```bash
systemctl is-active docker   # active + permission denied => group problem
                             # inactive                   => daemon problem
```

Those two failures look identical from `docker ps` but have completely
different fixes. We burned time on this exact confusion: the daemon had been
`active (running)` for 10 hours while every command returned permission denied.
