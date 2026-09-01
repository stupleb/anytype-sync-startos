# Updating the upstream version

The four any-sync daemons release as a coordinated set and **must be bumped together**. They are not independently versioned in practice — `any-sync-node` frequently sits a patch ahead of the other three, and mixing versions from different sets is unsupported.

anyproto publish the compatible combination as a machine-readable endpoint, which is the authority for this package. Do not derive the set from individual repository tags.

## Determining the upstream version

```
curl -fsSL https://puppetdoc.anytype.io/api/v1/prod-any-sync-compatible-versions/ \
  | jq -r 'to_entries | sort_by(.key | tonumber) | last | .value'
```

That returns the current set, keyed by package name:

```json
{
  "pkg::any-sync-node": "0.13.1",
  "pkg::any-sync-coordinator": "0.13.0",
  "pkg::any-sync-filenode": "0.13.0",
  "pkg::any-sync-consensusnode": "0.13.0"
}
```

`pkg::any-sync-filenode2` may also appear. It is the v2 file-node pool, which this package does not run — ignore it.

Confirm each image tag actually exists before bumping. GHCR rejects an unauthenticated `tags/list`, hence the token step; it needs no account:

```
for r in any-sync-node any-sync-coordinator any-sync-filenode any-sync-consensusnode any-sync-tools; do
  tok=$(curl -fsSL "https://ghcr.io/token?scope=repository:anyproto/$r:pull&service=ghcr.io" | jq -r .token)
  echo "== $r"
  curl -fsSL -H "Authorization: Bearer $tok" "https://ghcr.io/v2/anyproto/$r/tags/list" \
    | jq -r '.tags[]' | grep -E '^v[0-9]' | sort -V | tail -3
done
```

`any-sync-tools` is versioned independently of the daemon set — it only supplies `anyconf` at install time, so take its latest tag.

## Applying the bump

Update the version constants at the top of `startos/manifest/index.ts` — they are the only place the tags are written:

- `COORDINATOR_VERSION`
- `SYNC_NODE_VERSION`
- `FILENODE_VERSION`
- `CONSENSUSNODE_VERSION`
- `TOOLS_VERSION`

Then bump `version` and `releaseNotes` in `startos/versions/current.ts` per the standard packaging conventions. The package version tracks the sync-node version, since it is the one that moves most often.

## The other pins

MongoDB, Redis, MinIO, `mc` and Caddy are pinned separately in the same file and are not tied to the any-sync release cadence. Two constraints on them:

- **MongoDB must stay on a release with an `arm64` image**, and users on ARM need ARMv8.2-A or newer regardless — see `README.md` § Limitations and Differences. Do not move to a major version without checking the platform list.
- **Redis must remain `redis-stack-server` or another build carrying the RedisBloom module.** The filenode probes `BF.ADD` at startup and refuses to run without it, so a swap to plain Redis or Valkey breaks file sync at boot.

## Verifying a bump

Compiling proves nothing here. After bumping, install the package and confirm that:

1. Every health check goes green.
2. `client.yml` still downloads from the Network Configuration interface, and its `networkId` is **unchanged** from before the bump — a changed network ID means the identity was regenerated and every paired client is orphaned.
3. An already-paired client still syncs without re-importing its config.
