<p align="center">
  <img src="icon.png" alt="Anytype Sync Server Logo" width="21%">
</p>

# Anytype Sync Server on StartOS

> Everything not listed in this document should behave the same as upstream
> any-sync. If a feature, setting, or behavior is not mentioned here, the
> upstream documentation is accurate and fully applicable — see the
> Documentation section of `instructions.md` for links.

Runs a complete, self-contained [any-sync](https://github.com/anyproto/any-sync) network — the sync, backup and collaboration backend for the Anytype apps. Anytype itself is local-first: the desktop and mobile clients hold a full copy of the user's data and work offline. This package is what they sync *through*.

There is no application UI here. The package's only web interface exists to hand the user the network configuration file their client needs.

---

## Table of Contents

- [Image and Container Runtime](#image-and-container-runtime)
- [Volume and Data Layout](#volume-and-data-layout)
- [File Models](#file-models)
- [Dependencies](#dependencies)
- [Network Access and Interfaces](#network-access-and-interfaces)
- [Installation and First-Run Flow](#installation-and-first-run-flow)
- [Actions](#actions)
- [Tasks](#tasks)
- [Health Checks](#health-checks)
- [Backups and Restore](#backups-and-restore)
- [Limitations and Differences](#limitations-and-differences)
- [Quick Reference for AI Consumers](#quick-reference-for-ai-consumers)

---

## Image and Container Runtime

Nine upstream images, all unmodified, all `x86_64` and `aarch64`. There is no custom Dockerfile — every daemon runs its image's default entrypoint, and configuration is supplied entirely through generated YAML on the `config` volume.

| Subcontainer      | Image                             | Role                                                   |
| ----------------- | --------------------------------- | ------------------------------------------------------ |
| `coordinator-sub` | `ghcr.io/anyproto/any-sync-coordinator` | Space registry, membership, ACL; serves the node list |
| `sync-node-sub`   | `ghcr.io/anyproto/any-sync-node`  | Document sync — the encrypted CRDT trees                |
| `filenode-sub`    | `ghcr.io/anyproto/any-sync-filenode` | Blob storage for images and attachments              |
| `consensus-sub`   | `ghcr.io/anyproto/any-sync-consensusnode` | Orders ACL records                              |
| `mongo-sub`       | `mongo`                           | Coordinator and consensus state                         |
| `redis-sub`       | `redis/redis-stack-server`        | Filenode blob index                                     |
| `minio-sub`       | `minio/minio`                     | S3 backend for the filenode                             |
| `mc-sub`          | `minio/mc`                        | Creates the bucket once, then exits                     |
| `tools-sub`       | `ghcr.io/anyproto/any-sync-tools` | Runs `anyconf` to mint the network identity             |
| `caddy-sub`       | `caddy`                           | Serves `client.yml` over the config interface           |

Attach with `start-cli package attach anytype -n <subcontainer-name>`.

**Upstream runs three sync nodes; this package runs one.** That count is not a protocol requirement — `ReplicationFactor` is a compile-time constant of 3, and the consistent-hash ring returns the replication factor *or the total member count, whichever is smaller*. anyproto's own network generator creates a single sync node on its default path; three appear only in its `--auto` mode. On a single-box deployment three nodes would triple the storage and the port count to replicate data onto the same disk.

**The node count cannot be raised after install.** The resharder's drain path is gated on a shared S3 archive bucket, which this package does not enable, so a ring change would not hand spaces off. Treat the topology as fixed.

## Volume and Data Layout

Five volumes. `config` is the one that matters: it holds the network's cryptographic identity.

| Volume   | Mounted at                                             | Contents                                                     |
| -------- | ------------------------------------------------------ | ------------------------------------------------------------ |
| `config` | `/config` (tools), `/etc/any-sync-*` (each daemon)     | Network identity, per-daemon configs, `client.yml`           |
| `db`     | `/data/db`                                             | MongoDB                                                      |
| `cache`  | `/data`                                                | Redis append-only file                                       |
| `blobs`  | `/data`                                                | MinIO bucket — the actual file attachments                   |
| `sync`   | `/storage`, `/anyStorage`, `/networkStore`             | Document trees and each daemon's cached node config          |

Inside `config`:

- `generated/` — `anyconf` output. `.networkId`, `.networkSigningKey`, `nodes.yml`, `account0.yml` … `account3.yml`, `.minioSecret`. **Minted once at first start and never regenerated.** The peer IDs derived from these keys are what every paired client dials; losing or regenerating them orphans every device.
- `coordinator/`, `sync-node/`, `filenode/`, `consensusnode/` — per-daemon `config.yml`, rewritten on every start.
- `aws/credentials` — the filenode's S3 profile.
- `public/` — `client.yml` and the download page.

`account0.yml` … `account3.yml` map positionally to the node order the package passes to `anyconf`: sync node, coordinator, file node, consensus node. `anyconf` leaves the coordinator's `signingKey` empty, so the package patches the network signing key into the coordinator's and the consensus node's account files, matching upstream's own init script.

## File Models

None. Every daemon config is generated wholesale on each start from the stored identity plus the currently advertised addresses, rather than being a user-editable file the package merges into. There is nothing on disk a user is expected to hand-edit.

## Dependencies

None.

## Network Access and Interfaces

Five interfaces. The four sync interfaces carry the any-sync protocol; the fifth is an ordinary web page.

| Interface  | Type  | Port  | Purpose                                       |
| ---------- | ----- | ----- | --------------------------------------------- |
| `coordinator` | p2p | 33010 | Space registry and node list                  |
| `sync-node`   | p2p | 33011 | Document sync                                 |
| `filenode`    | p2p | 33012 | Blobs                                         |
| `consensus`   | p2p | 33013 | ACL ordering                                  |
| `config`      | ui  | 8080  | Downloads `client.yml`                        |

**The four sync interfaces are bound with `secure: { ssl: false }`, and that is required, not a shortcut.** any-sync authenticates with libp2p-TLS: the certificate is a self-signed carrier for the node's Ed25519 public key, and the client derives a peer ID from it and drops the connection if it does not match the peer ID in its network config. A StartOS-issued certificate would fail that check. No ACME, no certificate renewal, and no domain is required for the sync interfaces to work.

**One bound port carries both transports.** A StartOS port forward matches `meta l4proto { tcp, udp }`, so each daemon listens for yamux over TCP and QUIC over UDP on the same number. A client given a bare `host:port` dials TCP; a `quic://` entry is the UDP path. Both are advertised, and a client skips any scheme it cannot use — so the package works on a network that blocks UDP.

Upstream's default ports (TCP 1001–1006, UDP 1011–1016) are unusable on StartOS, which refuses to bind anything at or below 1024 for a package. Everything is shifted into 33010–33013.

**Clients dial every daemon directly.** There is no single front door — the coordinator does not proxy for the others. All four ports must be reachable from any device that is to sync.

### Address advertisement — the subtle part

The addresses a client dials are *not* the addresses the daemons bind. Daemons bind `0.0.0.0` inside their containers; what clients dial comes from the node config, which the package builds from whatever hostnames StartOS currently offers for each binding.

**After first contact, the coordinator is authoritative.** The client refreshes its node list from the coordinator every 600 seconds and replaces its stored entries; only *coordinator* addresses are merged back from the client's local `client.yml`. So a changed address that reaches `client.yml` but not the coordinator's published topology leaves clients dialling a dead endpoint indefinitely.

The package handles this by reading its addresses reactively — adding a domain or changing the LAN address re-runs `main`, which rewrites the configs and re-runs the `publish-topology` oneshot. If a client stops syncing after a network change, this is the first thing to check: confirm the addresses in `public/client.yml` match what the coordinator has in Mongo.

## Installation and First-Run Flow

No setup action, no credentials to create. On first start the package mints the network identity — a network key via `anyconf create-network`, then one Ed25519 keypair per node via `anyconf generate-nodes` — and writes it to the `config` volume. Every subsequent start reuses it and only rewrites addresses.

Startup order is enforced with `requires`:

1. `mongo`, `redis`, `minio` come up independently.
2. `mongo-replset` initiates the single-member replica set.
3. `create-bucket` creates the MinIO bucket — the filenode never creates its own.
4. `publish-topology` runs `any-sync-confapply`, writing the node topology into Mongo.
5. `coordinator` starts, then `consensusnode`, `sync-node` and `filenode`.

`any-sync-confapply` is **not idempotent** — every invocation inserts a new topology document with an incremented epoch. Re-running it is harmless (the sync node skips its drain cycle when the tree-node peer set is unchanged) but it is write amplification, which is why it is ordered as a oneshot rather than run per daemon.

## Actions

None. The package has nothing for a user to configure: the network identity is generated, the addresses are derived from StartOS, and the one artifact a user needs is served as a file rather than returned by an action — a StartOS action can only return single-line values, and `client.yml` is a multi-line document.

## Tasks

None.

## Health Checks

One per user-visible daemon; the datastores report internally with no display name.

| Check                  | What it means                                                        |
| ---------------------- | -------------------------------------------------------------------- |
| `coordinator`          | Accepting connections on its port                                     |
| `sync-node`            | Accepting connections on its port                                     |
| `filenode`             | Accepting connections on its port                                     |
| `consensusnode`        | Accepting connections on its port                                     |
| `config-ui`            | The download page is being served                                     |

The Redis check issues `BF.ADD`, not `PING`. The filenode probes the RedisBloom module at startup and aborts without it, so a plain `PING` would report a healthy Redis that cannot actually serve this package.

These checks confirm a daemon is listening, not that a client can reach it. A green board with a client that will not sync almost always means an addressing problem — see the address advertisement note above.

## Backups and Restore

`config`, `db`, `blobs` and `sync` are backed up. `cache` is excluded: Redis holds the filenode's blob index, which is derived from the bucket contents.

**`config` is the critical volume.** It carries the network identity, and restoring it is what makes a restored server keep working with clients that were already paired — the peer IDs are unchanged, so no client needs a new `client.yml`. A restore that lost `config` but kept the data volumes would produce a server no existing client would talk to.

## Limitations and Differences

1. **Raspberry Pi 4 and earlier will not run this.** MongoDB 5.0 and later require ARMv8.2-A; the Pi 4's Cortex-A72 is ARMv8.0-A and the binaries die with `Illegal instruction`. x86_64 and Pi 5 (Cortex-A76) are fine. There is no riscv64 build, because there is no riscv64 MongoDB image.
2. **No Tor.** Neither any-sync nor the Anytype client has any SOCKS or proxy support — the client's outbound dial is a bare Go `net.Dialer`, which ignores proxy environment variables. Publishing an onion address would produce something no client can dial. Reachability is LAN, VPN, or a forwarded port.
3. **One sync node, fixed at install.** See Image and Container Runtime.
4. **Redis cannot be swapped for Valkey.** The filenode requires the RedisBloom module.
5. **A self-hosted network is a separate identity.** Spaces on an anytype.io account do not migrate; upstream advises exporting and re-importing.
6. **Clients still contact anytype.io for push notifications** unless `ANYTYPE_PUSH_PEERID` and `ANYTYPE_PUSH_ADDRESS` are overridden on the client. This is outbound from the user's device and is not something this package can change.
7. **`netcheck` is not used as a health probe.** Upstream's tool checks only coordinator addresses by default, so a green result would not say anything about the other three daemons.

---

## Quick Reference for AI Consumers

```yaml
package_id: anytype
image: ghcr.io/anyproto/any-sync-coordinator # plus any-sync-node, any-sync-filenode, any-sync-consensusnode, any-sync-tools, mongo, redis/redis-stack-server, minio/minio, minio/mc, caddy
architectures: [x86_64, aarch64]
subcontainers:
  - coordinator-sub
  - sync-node-sub
  - filenode-sub
  - consensus-sub
  - mongo-sub
  - redis-sub
  - minio-sub
  - mc-sub
  - tools-sub
  - caddy-sub
volumes:
  config: /config
  db: /data/db
  cache: /data
  blobs: /data
  sync: /storage
file_models: []
startos_managed_env_vars:
  - MINIO_ROOT_USER
  - MINIO_ROOT_PASSWORD
dependencies: none
interfaces:
  coordinator: { type: p2p, port: 33010 }
  sync-node: { type: p2p, port: 33011 }
  filenode: { type: p2p, port: 33012 }
  consensus: { type: p2p, port: 33013 }
  config: { type: ui, port: 8080 }
actions: []
tasks: []
health_checks:
  - coordinator
  - sync-node
  - filenode
  - consensusnode
  - config-ui
```
