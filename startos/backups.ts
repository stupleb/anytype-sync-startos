import { sdk } from './sdk'

/**
 * Everything except `cache`. Redis holds the filenode's blob index, which is
 * derived state rebuilt from the bucket, and its append-only file is the one
 * thing here that is safe to lose.
 *
 * `config` is the important one: it carries the network identity. Restore it
 * and every client already holding a client.yml keeps working, because the peer
 * IDs are unchanged.
 */
export const { createBackup, restoreInit } = sdk.setupBackups(async () =>
  sdk.Backups.ofVolumes('config', 'db', 'blobs', 'sync'),
)
