# Updating the upstream version

Every image is upstream's published image, pinned by tag in `startos/manifest/index.ts`, except Garage, pinned in `garage/Dockerfile`, which adds only the empty `/proc` and `/etc` its image lacks; nothing is built from source. The four any-sync daemons and `any-sync-tools` come from `ghcr.io/anyproto`. MongoDB (`mongo`), Redis (`redis/redis-stack-server`), Garage (`dxflrs/garage`), Caddy (`caddy`), `pgsty/minio` and `rclone/rclone` come from Docker Hub.

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
  "pkg::any-sync-node": "0.13.4",
  "pkg::any-sync-coordinator": "0.13.2",
  "pkg::any-sync-filenode": "0.13.2",
  "pkg::any-sync-consensusnode": "0.13.3"
}
```

`pkg::any-sync-filenode2` may also appear. It is the v2 file-node pool, which this package does not run — ignore it.

Confirm each image tag actually exists before bumping. GHCR rejects an unauthenticated `tags/list`, hence the token step; it needs no account. `n=1000` matters — the default page ends before the newest tags — and the filter keeps release tags only, because `sort -V` ranks a pre-release above the release it precedes:

```
for r in any-sync-node any-sync-coordinator any-sync-filenode any-sync-consensusnode any-sync-tools; do
  tok=$(curl -fsSL "https://ghcr.io/token?scope=repository:anyproto/$r:pull&service=ghcr.io" | jq -r .token)
  echo "== $r"
  curl -fsSL -H "Authorization: Bearer $tok" "https://ghcr.io/v2/anyproto/$r/tags/list?n=1000" \
    | jq -r '.tags[]' | grep -E '^v[0-9]+\.[0-9]+\.[0-9]+$' | sort -V | tail -3
done
```

A set can skip a daemon's newest tag — take the version the endpoint names, not the highest one listed.

`any-sync-tools` is versioned independently of the daemon set — it only supplies `anyconf` at install time, so take its latest tag.

For the Docker Hub images, list the newest tags with the Hub API; official images such as `mongo` and `caddy` live under `library/`:

```
curl -fsSL "https://hub.docker.com/v2/repositories/dxflrs/garage/tags?page_size=20&ordering=last_updated" | jq -r '.results[].name'
```

The MongoDB, Redis and Garage versions upstream's own compose stack runs are in `.env.example` in `anyproto/any-sync-dockercompose`.

**A tag does not mean both architectures exist.** Before pinning any image, confirm it lists `linux/amd64` and `linux/arm64`:

```
docker buildx imagetools inspect ghcr.io/anyproto/any-sync-node:<tag>
```

## Applying the bump

Update the version constants at the top of `startos/manifest/index.ts` — they are the only place the tags are written:

- `COORDINATOR_VERSION`
- `SYNC_NODE_VERSION`
- `FILENODE_VERSION`
- `CONSENSUSNODE_VERSION`
- `TOOLS_VERSION`

Then bump `version` and `releaseNotes` in `startos/versions/current.ts` per the standard packaging conventions. The package version tracks the sync-node version, since it is the one that moves most often.

Before bumping the daemons, read what changed in `docker-generateconfig/etc/` of `anyproto/any-sync-dockercompose` since the last bump (`git log -p -- docker-generateconfig/etc`). Those are upstream's config templates, and `startos/main.ts` writes each daemon's `config.yml` in full from the same keys, so a key upstream adds, renames or removes has to follow in `main.ts`.

## The other pins

MongoDB, Redis and Caddy are pinned separately in the same file, and Garage in `garage/Dockerfile`. None of them is tied to the any-sync release cadence. Constraints on them:

- **MongoDB must stay on a release with an `arm64` image**, and users on ARM need ARMv8.2-A or newer regardless — see `README.md` § Limitations and Differences. Do not move to a major version without checking the platform list.
- **MongoDB moves one major at a time.** A MongoDB major refuses data whose feature compatibility version is more than one major behind, so after each major bump the version has to be raised (`setFeatureCompatibilityVersion`) in a migration before the next major can run.
- **Redis must remain `redis-stack-server` or another build carrying the RedisBloom module.** The filenode probes `BF.ADD` at startup and refuses to run without it, so a swap to plain Redis or Valkey breaks file sync at boot.
- **Garage must keep `--single-node`, `--default-bucket` and `--default-access-key`**, which arrived in 2.3.0 and are how the bucket and key come to exist. Read Garage's upgrade notes before a major bump: a new major can need its metadata migrated, and then the bump needs a migration in `startos/versions/`.

`caddy:2-alpine` is a floating tag: each build takes the Caddy 2 release current at the time, so there is nothing to bump.

`pgsty/minio` and `rclone` are not part of the running service and take no bumps. They exist for the one-off copy out of MinIO, and the MinIO build has to keep reading the data directory an older install wrote.

## Verifying a bump

Compiling proves nothing here. After bumping, install the package and confirm that:

1. Every health check goes green.
2. `client.yml` still downloads from the Network Configuration interface, and its `networkId` is **unchanged** from before the bump — a changed network ID means the identity was regenerated and every paired client is orphaned.
3. An already-paired client still syncs without re-importing its config.
