import { IMPOSSIBLE, VersionInfo } from '@start9labs/start-sdk'

export const current = VersionInfo.of({
  version: '0.13.4:2',
  releaseNotes: {
    en_US:
      'Fixes passwords and keys showing in the server’s process list, and memory use that creeps up while the service runs.',
    es_ES:
      'Corrige que las contraseñas y claves aparezcan en la lista de procesos del servidor, y un uso de memoria que va creciendo mientras el servicio está en marcha.',
    de_DE:
      'Behebt, dass Passwörter und Schlüssel in der Prozessliste des Servers erscheinen, und einen Speicherverbrauch, der wächst, solange der Dienst läuft.',
    pl_PL:
      'Naprawia widoczność haseł i kluczy na liście procesów serwera oraz zużycie pamięci, które rośnie, gdy usługa działa.',
    fr_FR:
      'Corrige l’affichage des mots de passe et des clés dans la liste des processus du serveur, et une consommation de mémoire qui augmente tant que le service tourne.',
  },
  migrations: {
    up: async () => {},
    down: IMPOSSIBLE,
  },
})
