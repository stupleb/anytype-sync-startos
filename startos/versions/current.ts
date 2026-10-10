import { IMPOSSIBLE, VersionInfo } from '@start9labs/start-sdk'

export const current = VersionInfo.of({
  version: '0.13.4:0',
  releaseNotes: {
    en_US:
      'Updates the sync node to 0.13.4 and the coordinator, file node and consensus node to 0.13.2. These fix connections that go stale and make the server recover when setting up a channel’s membership records fails.',
    es_ES:
      'Actualiza el nodo de sincronización a 0.13.4 y el coordinador, el nodo de archivos y el nodo de consenso a 0.13.2. Corrigen las conexiones que quedan obsoletas y hacen que el servidor se recupere cuando falla la creación de los registros de miembros de un canal.',
    de_DE:
      'Aktualisiert den Sync-Knoten auf 0.13.4 sowie den Koordinator, den Datei-Knoten und den Konsens-Knoten auf 0.13.2. Damit werden veraltete Verbindungen behoben, und der Server erholt sich, wenn das Anlegen der Mitgliedereinträge eines Channels fehlschlägt.',
    pl_PL:
      'Aktualizuje węzeł synchronizacji do 0.13.4 oraz koordynatora, węzeł plików i węzeł konsensusu do 0.13.2. Poprawki usuwają problem nieaktualnych połączeń i pozwalają serwerowi wrócić do działania, gdy tworzenie wpisów członków kanału się nie powiedzie.',
    fr_FR:
      'Met à jour le nœud de synchronisation vers 0.13.4 ainsi que le coordinateur, le nœud de fichiers et le nœud de consensus vers 0.13.2. Ces versions corrigent les connexions devenues obsolètes et permettent au serveur de se rétablir lorsque la création des enregistrements de membres d’un canal échoue.',
  },
  migrations: {
    up: async () => {},
    down: IMPOSSIBLE,
  },
})
