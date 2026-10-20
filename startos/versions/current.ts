import { IMPOSSIBLE, VersionInfo } from '@start9labs/start-sdk'

export const current = VersionInfo.of({
  version: '0.13.4:1',
  releaseNotes: {
    en_US:
      'Updates the consensus node to 0.13.3, which accepts connections only once it has fully started.',
    es_ES:
      'Actualiza el nodo de consenso a 0.13.3, que solo acepta conexiones cuando ha terminado de iniciarse.',
    de_DE:
      'Aktualisiert den Konsens-Knoten auf 0.13.3, der Verbindungen erst annimmt, wenn er vollständig gestartet ist.',
    pl_PL:
      'Aktualizuje węzeł konsensusu do 0.13.3, który przyjmuje połączenia dopiero po pełnym uruchomieniu.',
    fr_FR:
      'Met à jour le nœud de consensus vers 0.13.3, qui n’accepte les connexions qu’une fois entièrement démarré.',
  },
  migrations: {
    up: async () => {},
    down: IMPOSSIBLE,
  },
})
