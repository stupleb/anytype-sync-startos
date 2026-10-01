import { sdk } from './sdk'

/**
 * All six volumes. Nothing here is safely derivable, including the Redis cache.
 *
 * `cache` looks like a throwaway — it is the filenode's blob index, and the
 * index entries themselves are persisted into the S3 index bucket by
 * `PersistKeys`, so on the face of it Redis could be rebuilt from `objects`.
 * It cannot. The lookup in any-sync-filenode/index/loader.go:150-190 consults
 * Redis, then gates the fallback on a **bloom filter** — and if `BFExists`
 * returns false it returns "item not exists" and never reads the persistent
 * store at all. That bloom filter is written only by `BFAdd` into Redis and is
 * never persisted anywhere (`bloomFilterKey` has exactly three references in
 * the whole repo: its definition, the check, and the write).
 *
 * So an empty Redis after a restore does not cost a warm cache — it makes every
 * stored blob unreachable while the bytes sit intact in Garage. Attachments
 * would silently vanish from every restored space.
 *
 * `config` is the other volume that must not be lost: it carries the network
 * identity, and restoring it is what lets already-paired clients keep working
 * without re-importing client.yml.
 *
 * StartOS stops the service for the duration of a backup, so every volume here
 * is copied quiescent — Redis's append-only file included.
 */
export const { createBackup, restoreInit } = sdk.setupBackups(async () =>
  sdk.Backups.ofVolumes('config', 'db', 'cache', 'blobs', 'objects', 'sync'),
)
