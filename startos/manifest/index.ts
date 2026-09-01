import { setupManifest } from '@start9labs/start-sdk'
import { long, short } from './i18n'

/**
 * The four any-sync daemons release as a coordinated set. Upstream publishes the
 * compatible combination at
 * https://puppetdoc.anytype.io/api/v1/prod-any-sync-compatible-versions/ —
 * bump these together from that endpoint, never individually. See UPDATING.md.
 */
export const COORDINATOR_VERSION = 'v0.13.0'
export const SYNC_NODE_VERSION = 'v0.13.1'
export const FILENODE_VERSION = 'v0.13.0'
export const CONSENSUSNODE_VERSION = 'v0.13.0'
export const TOOLS_VERSION = 'v0.7.0'

export const manifest = setupManifest({
  id: 'anytype',
  title: 'Anytype Sync Server',
  license: 'MIT',
  packageRepo: 'https://github.com/stupleb/anytype-startos',
  upstreamRepo: 'https://github.com/anyproto/any-sync',
  marketingUrl: 'https://anytype.io',
  donationUrl: null,
  description: { short, long },
  volumes: [
    // Generated network identity, per-daemon configs and the client.yml handed
    // to users. Minted once at install and never regenerated — the peer keys in
    // here are what every client's saved network config points at.
    'config',
    // MongoDB. Coordinator and consensusnode state.
    'db',
    // Redis append-only file. Filenode's blob index.
    'cache',
    // MinIO. The blobs themselves.
    'blobs',
    // The sync node's document storage (/storage, /anyStorage) plus each
    // daemon's networkStore.
    'sync',
  ],
  images: {
    coordinator: {
      source: {
        dockerTag: `ghcr.io/anyproto/any-sync-coordinator:${COORDINATOR_VERSION}`,
      },
      arch: ['x86_64', 'aarch64'],
    },
    'sync-node': {
      source: {
        dockerTag: `ghcr.io/anyproto/any-sync-node:${SYNC_NODE_VERSION}`,
      },
      arch: ['x86_64', 'aarch64'],
    },
    filenode: {
      source: {
        dockerTag: `ghcr.io/anyproto/any-sync-filenode:${FILENODE_VERSION}`,
      },
      arch: ['x86_64', 'aarch64'],
    },
    consensusnode: {
      source: {
        dockerTag: `ghcr.io/anyproto/any-sync-consensusnode:${CONSENSUSNODE_VERSION}`,
      },
      arch: ['x86_64', 'aarch64'],
    },
    // Ships `anyconf`, which mints the network identity and per-node keys at
    // install, and `any-sync-netcheck`, used as a health probe.
    'any-sync-tools': {
      source: {
        dockerTag: `ghcr.io/anyproto/any-sync-tools:${TOOLS_VERSION}`,
      },
      arch: ['x86_64', 'aarch64'],
    },
    // Coordinator and consensusnode both open change streams and the
    // coordinator runs multi-document transactions, so this must run as a
    // replica set — a single member is enough. MongoDB 5.0+ requires ARMv8.2-A,
    // which is why aarch64 here means Pi 5 and newer, not Pi 4.
    mongo: {
      source: { dockerTag: 'mongo:7.0.28' },
      arch: ['x86_64', 'aarch64'],
    },
    // Must be redis-stack, not plain Redis or Valkey: the filenode probes
    // `BF.ADD` at startup and refuses to run without the RedisBloom module.
    redis: {
      source: { dockerTag: 'redis/redis-stack-server:7.2.0-v6' },
      arch: ['x86_64', 'aarch64'],
    },
    minio: {
      source: {
        dockerTag: 'minio/minio:RELEASE.2024-07-04T14-25-45Z',
      },
      arch: ['x86_64', 'aarch64'],
    },
    // The filenode never creates its own bucket, so one oneshot run of `mc mb`
    // is required before it can store anything.
    mc: {
      source: { dockerTag: 'minio/mc:RELEASE.2025-08-13T08-35-41Z' },
      arch: ['x86_64', 'aarch64'],
    },
    // any-sync has no web UI of its own. The one thing a user must get out of
    // this package is client.yml, and a StartOS action can only return
    // single-line values — so a static file server is how they download it.
    // Same approach as searxng-startos.
    caddy: {
      source: { dockerTag: 'caddy:2-alpine' },
      arch: ['x86_64', 'aarch64'],
    },
  },
  dependencies: {},
})
