import { IMPOSSIBLE, VersionInfo } from '@start9labs/start-sdk'

export const current = VersionInfo.of({
  version: '0.13.1:0',
  releaseNotes: {
    en_US:
      'Initial release for StartOS. Runs a complete single-node any-sync network: coordinator, sync node, file node and consensus node, with MongoDB, Redis and MinIO. Download client.yml from the Network Configuration interface and load it into the Anytype app.',
    es_ES: 'Lanzamiento inicial para StartOS',
    de_DE: 'Erstveröffentlichung für StartOS',
    pl_PL: 'Pierwsze wydanie dla StartOS',
    fr_FR: 'Version initiale pour StartOS',
  },
  migrations: {
    up: async ({ effects }) => {},
    down: IMPOSSIBLE,
  },
})
