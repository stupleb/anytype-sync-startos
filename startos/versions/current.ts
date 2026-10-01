import { IMPOSSIBLE, VersionInfo } from '@start9labs/start-sdk'
import { migrateFromMinio } from '../garage'

export const current = VersionInfo.of({
  version: '0.13.3:0',
  releaseNotes: {
    en_US:
      'Updates the sync node to 0.13.3 and the coordinator and consensus node to 0.13.1, moves file storage from MinIO to Garage, and makes client.yml carry the ports StartOS assigned. Your files are copied during the update; once they open in Anytype, run Delete Old MinIO Data to free the space the old copy uses.',
    es_ES:
      'Actualiza el nodo de sincronización a 0.13.3 y el coordinador y el nodo de consenso a 0.13.1, traslada el almacenamiento de archivos de MinIO a Garage y hace que client.yml lleve los puertos asignados por StartOS. Tus archivos se copian durante la actualización; cuando se abran en Anytype, ejecuta Eliminar datos antiguos de MinIO para liberar el espacio que ocupa la copia antigua.',
    de_DE:
      'Aktualisiert den Sync-Knoten auf 0.13.3 sowie den Koordinator und den Konsens-Knoten auf 0.13.1, verlegt den Dateispeicher von MinIO zu Garage und trägt in client.yml die von StartOS zugewiesenen Ports ein. Deine Dateien werden während des Updates kopiert; sobald sie sich in Anytype öffnen lassen, führe „Alte MinIO-Daten löschen“ aus, um den Platz der alten Kopie freizugeben.',
    pl_PL:
      'Aktualizuje węzeł synchronizacji do 0.13.3 oraz koordynatora i węzeł konsensusu do 0.13.1, przenosi magazyn plików z MinIO do Garage i wpisuje do client.yml porty przydzielone przez StartOS. Twoje pliki są kopiowane podczas aktualizacji; gdy otworzą się w Anytype, uruchom „Usuń stare dane MinIO”, aby zwolnić miejsce zajmowane przez starą kopię.',
    fr_FR:
      'Met à jour le nœud de synchronisation vers 0.13.3 ainsi que le coordinateur et le nœud de consensus vers 0.13.1, déplace le stockage des fichiers de MinIO vers Garage et inscrit dans client.yml les ports attribués par StartOS. Vos fichiers sont copiés pendant la mise à jour ; une fois qu’ils s’ouvrent dans Anytype, lancez « Supprimer les anciennes données MinIO » pour libérer l’espace occupé par l’ancienne copie.',
  },
  migrations: {
    up: async ({ effects, progress }) => migrateFromMinio(effects, progress),
    down: IMPOSSIBLE,
  },
})
