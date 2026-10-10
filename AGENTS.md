# AGENTS.md

This is a StartOS service-package repository — it builds a `.s9pk` for StartOS.

Develop it inside a StartOS packaging workspace created by `start-cli s9pk init-workspace`,
which provides the packaging guide and agent context one level up. If you're reading this in a
bare clone with no workspace, the full guide is at <https://docs.start9.com/packaging>.

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
