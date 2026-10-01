# AGENTS.md

This is a StartOS service-package repository — it builds a `.s9pk` for StartOS.

Develop it inside a StartOS packaging workspace created by `start-cli s9pk init-workspace`,
which provides the packaging guide and agent context one level up. If you're reading this in a
bare clone with no workspace, the full guide is at <https://docs.start9.com/packaging>.

**Start every task at the recipe index** — `../start-technologies/projects/start-sdk/docs/src/recipes.md`
(or <https://docs.start9.com/packaging/recipes.html>). It maps an intent ("prompt the user to create
admin credentials", "expose a web UI") to the constructs, the reference pages, and a named production
package to copy. Find the recipe before you read this package's neighbours: a package you reach by
grepping may be non-conformant, and the recipe outranks it.

Freshly scaffolded? Work the
[New Package Checklist](../start-technologies/projects/start-sdk/docs/src/new-package-checklist.md)
(or <https://docs.start9.com/packaging/new-package-checklist.html>) from top to bottom. It is a
guide page, not a file in this repo — read it, don't copy it in.

Keep `README.md` (technical reference for an AI support or administering agent) and
`instructions.md` (end-user docs) in sync with your changes.

**Fix a defect you spot rather than reporting it** — you have the package open and the
context to be sure. File **a GitHub issue on this repo** only when the call isn't yours to
make: you can't pin the cause down, two defensible fixes exist, or it's too large to ride on
the work in hand. An open issue is a report, not a queue — implement one when you're asked
to or when it's labelled `Approved`, then close it with `Closes #<n>`.

Don't record work in the repo instead: no `TODO.md`, no `NOTES.md`, no `PLAN.md`. What you
verified, tried, and decided belongs in the commit message and the PR body.

## This repo

- **The network identity in `config/generated/` is irreplaceable.** `.networkId`,
  `.networkSigningKey` and `account0..3.yml` are minted once on first start and
  define the peer IDs every paired client dials. Any change that could cause
  them to be regenerated orphans every device that already holds a `client.yml`.
  Treat that block in `main.ts` as create-if-absent, and verify the network ID is
  unchanged after any upstream bump.
- **`NODE_ORDER` in `startos/utils.ts` is positional and load-bearing.**
  `anyconf generate-nodes` pairs its `--t` flags with `accountN.yml` by index, so
  reordering that array silently gives each daemon the wrong identity.
- **Addresses are read reactively and republished.** The coordinator is
  authoritative for node addresses after a client's first contact, so any change
  to how addresses are derived must still reach the `publish-topology` oneshot.
  See `README.md` § Address advertisement.
- **Don't swap Redis for Valkey** and don't drop the `--loadmodule` flag: the
  filenode probes `BF.ADD` at startup and aborts without RedisBloom.
- **Don't drop the `blobs` volume or the `minio-legacy` and `rclone` images**
  because nothing mounts them in `main.ts`: an install updating from a MinIO
  release reaches its files only through them.
