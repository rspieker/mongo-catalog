# Frequency, Limits & Caps

This document records the external limits this system operates under, how the current
batch/concurrency numbers were derived from them, and the behavioral caps we've observed
that affect "how long will this actually take" — as distinct from the mechanics already
covered in [CHORES.md](./CHORES.md).

Revisit this doc whenever: Docker Hub changes its published limits, the GitHub account's
plan changes, the total tracked version count grows substantially, or another repo in the
ecosystem adds heavy scheduled CI that competes for the same account-wide concurrency pool.

---

## 1. Ecosystem cadence

| Repo | Workflow | Trigger | Cadence | Gated by |
|---|---|---|---|---|
| mongo-test-extractor | `extract.yml` | schedule | Wed, Sat 06:00 UTC | only publishes a release if `test-cases.ndjson`'s checksum actually changed |
| mongo-catalog | `update-coverage.yml` | schedule | Wed, Sat 07:00 UTC (1h after extractor) | only commits if there's a new extraction release tag not yet in `meta.json` |
| mongo-catalog | `versions.yml` | schedule + push | Sun, Wed, Sat 07:00 UTC; also on push to `catalog/**`, `source/**`, `.github/workflows/**` | — |
| mongo-catalog | `scheduler.yml` | schedule | hourly, plus an extra `:30` run on Sat/Sun (24/day weekdays, 48/day weekends — 216 triggers/week) | only invokes `catalog.yml` if `update:workload` reports pending work |
| mongo-catalog | `catalog.yml` (`collect-versions`) | `workflow_call` from `scheduler.yml` | as above, when triggered | matrix of `BATCH_SIZE` versions, `max-parallel: BATCH_SIZE` |

**Known gap:** `versions.yml`'s push-trigger path filter does not include `automation/coverage/**`.
A coverage-only commit (from `update-coverage.yml`) does not itself trigger `versions.yml` via
push — it only gets picked up on `versions.yml`'s own schedule (Sun/Wed/Sat 07:00 UTC), run
independently of `update-coverage.yml` (Wed/Sat 07:00 UTC) with no defined ordering between
them. In practice this has worked out via schedule timing coincidence, not by design.

---

## 2. External rate limits (measured 2026-08-16)

Docker Hub has **two separate, unrelated rate-limit systems** — easy to conflate as "the Docker
Hub limit," but they're different endpoints with different budgets:

| Endpoint | Used by | Anonymous | Authenticated | Scope |
|---|---|---|---|---|
| Hub metadata API (`registry.hub.docker.com/v2/repositories/...`) — undocumented, backs the hub.docker.com website, no stability contract | `source/domain/docker.ts` (`getTags`, version discovery) | `x-ratelimit-limit: 180` | `x-ratelimit-limit: 600` | per-IP (anon) / per-account (auth) |
| Registry pull API (`registry-1.docker.io`) — the documented Distribution Spec API `docker pull`/`docker run` actually use | `catalog.yml`'s `docker run mongo:$TAG` | 100/hour | 200/hour | per-IP (anon, `docker-ratelimit-source: <ip>`) / per-account (auth, `docker-ratelimit-source: <docker id>`) |

The anonymous, per-IP scoping is what caused the original failures: GitHub Actions runners
share a large, heavily-used IP pool, so the 100/hour (or 180) anonymous budget was effectively
shared with unrelated CI jobs worldwide, not just our own usage. Authenticating via
`DOCKERHUB_USERNAME`/`DOCKERHUB_TOKEN` moves both to an account-scoped budget instead.

**GitHub Actions (Free plan, account rspieker):**

| Limit | Value | Scope |
|---|---|---|
| Concurrent jobs | 20 | **account-wide** — shared across every repo and workflow on the account, not just mongo-catalog |
| Matrix jobs per workflow | 256 | per workflow run (not a binding constraint here) |
| Standard runner minutes | unlimited on public repos | mongo-catalog is public, so this isn't a constraint either |

---

## 3. How `BATCH_SIZE = 15` was derived

Defined in `chore/workload.ts`, mirrored as `max-parallel: 15` in `catalog.yml`'s
`collect-versions` matrix.

1. **Empirical baseline:** at the old `BATCH_SIZE = 5`, clearing a full ~338-version backlog
   took about 5.5 days in practice.
2. **Target:** "a couple of days," not "as current as possible" — the explicit design goal is a
   middle ground, not maximum throughput. Scaling the baseline: `5 × (5.5 / 2) ≈ 14`, rounded to 15.
3. **Checked against Docker's pull limit:** worst case is the weekend schedule, which can
   trigger `catalog.yml` twice within the same hour (`:00` and `:30`). `15 × 2 = 30` pulls/hour
   against the 200/hour authenticated budget → **15%**, comfortably under a self-imposed 30%
   guardrail.
4. **Checked against GitHub's concurrency limit:** 30% of the account-wide 20-job pool would be
   6, not 15 — a strict guardrail here would cap `max-parallel` at 6. We deliberately went with
   15 instead (75% of the pool) rather than 6, reasoning: it still leaves 5 slots free for
   everything else on the account, and most other repos' workflows trigger on push/PR rather
   than schedule, so sustained overlap is unlikely. **This is a conscious deviation from the
   30% guideline for the GitHub dimension specifically** — worth revisiting if other scheduled
   (not push/PR-triggered) CI is added elsewhere on the account.

`BATCH_SIZE` (queued per run) and `max-parallel` (concurrent within a run) are deliberately set
equal today, so a run currently executes as one wave. If `BATCH_SIZE` is ever raised without
raising `max-parallel` to match, `max-parallel` becomes the actual throttle and a run will
process in multiple waves instead.

---

## 4. Known caps on "how many runs" / "how long"

These affect real-world completion time beyond the simple `total_versions / BATCH_SIZE` math:

- **A run's 15 slots is a lower bound on total runs needed, not a fixed count.** The
  binary-search bisection in `assignGroupPriorities` only marks a major.minor group "skip" once
  its latest and earliest patch are confirmed identical by checksum. If they differ, each run
  can surface *new* midpoint versions to test that weren't previously known to be pending — so
  the total backlog can grow mid-way through clearing it, not just shrink.
- **A version's planned work isn't guaranteed to finish in one run.** `update:mongo-collect`
  runs all of a version's pending catalogs sequentially against one container within a single
  job. If that's interrupted partway (a flaky query, the mongod container struggling under a
  GitHub runner's limited resources, a transient failure), whatever hadn't run yet stays pending
  in that version's `plan.json` — observed in practice as some versions needing a second run to
  finish what was planned in the first. Root cause not yet fully diagnosed.
- **Failed/halted versions back off exponentially**, not retried on the very next tick: 1, 2, 4,
  8, 16... days from the first failure (`getSkipInfo`/`shouldRetrySkip` in `chore/workload.ts`),
  unless the specific catalog that failed has since changed (making the failure "stale" and
  immediately eligible again). A version stuck in a failure sequence can therefore sit out of
  the queue for a while even with capacity to spare.
- **Scheduled triggers are "not before," not exact.** GitHub can delay or occasionally drop a
  scheduled workflow run under platform load. With 23 minimum runs needed against 24 available
  weekday slots, there's very little slack — a couple of skipped ticks can push completion into
  a second day even without any bisection growth or partial-run retries.

Net effect: "23 runs" (338 ÷ 15) is the optimistic floor. In practice, budget for **at least a
day, more likely two**.
