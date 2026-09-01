import { utils } from '@start9labs/start-sdk'
import { mkdir, readFile, writeFile } from 'fs/promises'
import { i18n } from './i18n'
import { sdk } from './sdk'
import {
  AWS_SUBPATH,
  buildAddresses,
  commonConfig,
  configPort,
  CONFIG_SUBPATHS,
  configHostId,
  configInterfaceId,
  consensusInterfaceId,
  consensusPort,
  coordinatorInterfaceId,
  coordinatorPort,
  drpcConfig,
  filenodeInterfaceId,
  filenodePort,
  GENERATED_SUBPATH,
  listenConfig,
  minioAccessKey,
  minioBucket,
  minioConsolePort,
  minioPort,
  mongoPort,
  NETWORK_SIGNING_KEY_INDICES,
  NODE_ORDER,
  parseYaml,
  PUBLIC_SUBPATH,
  readBindingHostnames,
  redisPort,
  syncHostId,
  syncNodeInterfaceId,
  syncNodePort,
  toYaml,
  withAddresses,
  type NetworkConfiguration,
} from './utils'

export const main = sdk.setupMain(async ({ effects }) => {
  console.info(i18n('Starting Anytype Sync Server'))

  // -------------------------------------------------------------------------
  // Advertised addresses
  //
  // These are read reactively: adding a domain or changing the LAN address
  // re-runs main, which rewrites the configs and re-runs confapply below. That
  // matters more than it looks — after first contact the client refreshes the
  // node list from the coordinator every 600s and only merges coordinator
  // addresses back from its own client.yml, so a changed address that never
  // reaches the coordinator leaves clients dialling a dead endpoint forever.
  // -------------------------------------------------------------------------
  const [coordHosts, nodeHosts, fileHosts, consensusHosts] = await Promise.all([
    readBindingHostnames(
      effects,
      syncHostId,
      coordinatorPort,
      coordinatorInterfaceId,
    ),
    readBindingHostnames(effects, syncHostId, syncNodePort, syncNodeInterfaceId),
    readBindingHostnames(effects, syncHostId, filenodePort, filenodeInterfaceId),
    readBindingHostnames(
      effects,
      syncHostId,
      consensusPort,
      consensusInterfaceId,
    ),
  ])

  const addressesByDaemon = {
    coordinator: buildAddresses(coordHosts, coordinatorPort),
    'sync-node': buildAddresses(nodeHosts, syncNodePort),
    filenode: buildAddresses(fileHosts, filenodePort),
    consensusnode: buildAddresses(consensusHosts, consensusPort),
  }

  // Logged because the failure here is silent and expensive: if StartOS offers
  // no hostnames yet, every list is empty, withAddresses leaves the generator's
  // placeholders in place, and the package serves a client.yml that looks
  // perfectly well-formed while pointing at nothing. Every health check would
  // still be green. This is the one line that distinguishes that from success.
  for (const [daemon, addrs] of Object.entries(addressesByDaemon)) {
    if (!addrs.length) {
      console.warn(
        `${daemon}: no reachable address available yet — client.yml will not be usable until StartOS offers one`,
      )
    } else {
      console.info(`${daemon} advertising: ${addrs.join(', ')}`)
    }
  }

  // -------------------------------------------------------------------------
  // Subcontainers
  // -------------------------------------------------------------------------
  const toolsSub = await sdk.SubContainer.of(
    effects,
    { imageId: 'any-sync-tools' },
    sdk.Mounts.of()
      .mountVolume({
        volumeId: 'config',
        subpath: null,
        mountpoint: '/config',
        readonly: false,
      }),
    'tools-sub',
  )

  const mongoSub = await sdk.SubContainer.of(
    effects,
    { imageId: 'mongo' },
    sdk.Mounts.of().mountVolume({
      volumeId: 'db',
      subpath: null,
      mountpoint: '/data/db',
      readonly: false,
    }),
    'mongo-sub',
  )

  const redisSub = await sdk.SubContainer.of(
    effects,
    { imageId: 'redis' },
    sdk.Mounts.of().mountVolume({
      volumeId: 'cache',
      subpath: null,
      mountpoint: '/data',
      readonly: false,
    }),
    'redis-sub',
  )

  const minioSub = await sdk.SubContainer.of(
    effects,
    { imageId: 'minio' },
    sdk.Mounts.of().mountVolume({
      volumeId: 'blobs',
      subpath: null,
      mountpoint: '/data',
      readonly: false,
    }),
    'minio-sub',
  )

  const mcSub = await sdk.SubContainer.of(
    effects,
    { imageId: 'mc' },
    sdk.Mounts.of(),
    'mc-sub',
  )

  const coordinatorSub = await sdk.SubContainer.of(
    effects,
    { imageId: 'coordinator' },
    sdk.Mounts.of()
      .mountVolume({
        volumeId: 'config',
        subpath: CONFIG_SUBPATHS.coordinator,
        mountpoint: '/etc/any-sync-coordinator',
        readonly: false,
      })
      .mountVolume({
        volumeId: 'sync',
        subpath: 'networkStore/coordinator',
        mountpoint: '/networkStore',
        readonly: false,
      }),
    'coordinator-sub',
  )

  const syncNodeSub = await sdk.SubContainer.of(
    effects,
    { imageId: 'sync-node' },
    sdk.Mounts.of()
      .mountVolume({
        volumeId: 'config',
        subpath: CONFIG_SUBPATHS['sync-node'],
        mountpoint: '/etc/any-sync-node',
        readonly: false,
      })
      .mountVolume({
        volumeId: 'sync',
        subpath: 'node/storage',
        mountpoint: '/storage',
        readonly: false,
      })
      .mountVolume({
        volumeId: 'sync',
        subpath: 'node/anyStorage',
        mountpoint: '/anyStorage',
        readonly: false,
      })
      .mountVolume({
        volumeId: 'sync',
        subpath: 'networkStore/node',
        mountpoint: '/networkStore',
        readonly: false,
      }),
    'sync-node-sub',
  )

  const filenodeSub = await sdk.SubContainer.of(
    effects,
    { imageId: 'filenode' },
    sdk.Mounts.of()
      .mountVolume({
        volumeId: 'config',
        subpath: CONFIG_SUBPATHS.filenode,
        mountpoint: '/etc/any-sync-filenode',
        readonly: false,
      })
      .mountVolume({
        volumeId: 'config',
        subpath: AWS_SUBPATH,
        mountpoint: '/root/.aws',
        readonly: true,
      })
      .mountVolume({
        volumeId: 'sync',
        subpath: 'networkStore/filenode',
        mountpoint: '/networkStore',
        readonly: false,
      }),
    'filenode-sub',
  )

  const consensusSub = await sdk.SubContainer.of(
    effects,
    { imageId: 'consensusnode' },
    sdk.Mounts.of()
      .mountVolume({
        volumeId: 'config',
        subpath: CONFIG_SUBPATHS.consensusnode,
        mountpoint: '/etc/any-sync-consensusnode',
        readonly: false,
      })
      .mountVolume({
        volumeId: 'sync',
        subpath: 'networkStore/consensusnode',
        mountpoint: '/networkStore',
        readonly: false,
      }),
    'consensus-sub',
  )

  const caddySub = await sdk.SubContainer.of(
    effects,
    { imageId: 'caddy' },
    sdk.Mounts.of().mountVolume({
      volumeId: 'config',
      subpath: PUBLIC_SUBPATH,
      mountpoint: '/srv',
      readonly: true,
    }),
    'caddy-sub',
  )

  // -------------------------------------------------------------------------
  // Network identity — minted once, then never again
  //
  // The peer IDs derived from these keys are what every client's saved network
  // config points at. Regenerating them would orphan every device already
  // paired with this server, so this block is strictly create-if-absent.
  // -------------------------------------------------------------------------
  const toolsRoot = await toolsSub.rootfs
  const genDir = `${toolsRoot}/config/${GENERATED_SUBPATH}`
  await mkdir(genDir, { recursive: true })

  const readIfPresent = async (path: string): Promise<string | null> => {
    try {
      return await readFile(path, 'utf8')
    } catch {
      return null
    }
  }

  let networkId = (await readIfPresent(`${genDir}/.networkId`))?.trim() ?? null
  let networkSigningKey =
    (await readIfPresent(`${genDir}/.networkSigningKey`))?.trim() ?? null

  if (!networkId || !networkSigningKey) {
    const created = await toolsSub.exec([
      'sh',
      '-c',
      `cd /config/${GENERATED_SUBPATH} && anyconf create-network`,
    ])
    if (created.exitCode !== 0) {
      throw new Error(
        `anyconf create-network failed: ${created.stderr.toString()}`,
      )
    }
    const seedNodes = parseYaml<NetworkConfiguration>(
      (await readFile(`${genDir}/nodes.yml`, 'utf8')) ?? '',
    )
    const seedAccount = parseYaml<{ account: { signingKey: string } }>(
      await readFile(`${genDir}/account.yml`, 'utf8'),
    )
    networkId = seedNodes.networkId
    networkSigningKey = seedAccount.account.signingKey
    await writeFile(`${genDir}/.networkId`, networkId)
    await writeFile(`${genDir}/.networkSigningKey`, networkSigningKey)
  }

  if (!(await readIfPresent(`${genDir}/account0.yml`))) {
    // `--t` and `--addresses` pair positionally, so NODE_ORDER is the single
    // source of truth for which accountN.yml belongs to which daemon. The
    // addresses given here are placeholders — the real ones are written into
    // nodes.yml below on every start, since they can change at any time.
    const flags = NODE_ORDER.flatMap((n) => ['--t', n.type])
    const addrFlags = NODE_ORDER.flatMap((n) => [
      '--addresses',
      `${n.daemon}:0`,
    ])
    const generated = await toolsSub.exec([
      'sh',
      '-c',
      `cd /config/${GENERATED_SUBPATH} && anyconf generate-nodes ${[
        ...flags,
        ...addrFlags,
      ].join(' ')}`,
    ])
    if (generated.exitCode !== 0) {
      throw new Error(
        `anyconf generate-nodes failed: ${generated.stderr.toString()}`,
      )
    }
    // generate-nodes passes a nil network key, so the coordinator's signingKey
    // comes back empty. Upstream's own init script patches the network signing
    // key into the coordinator and the consensus node; so does this.
    for (const idx of NETWORK_SIGNING_KEY_INDICES) {
      const path = `${genDir}/account${idx}.yml`
      const account = parseYaml<{ account: Record<string, string> }>(
        await readFile(path, 'utf8'),
      )
      account.account.signingKey = networkSigningKey
      await writeFile(path, toYaml(account))
    }
  }

  // MinIO's root credentials never leave the package, but they still should not
  // be a constant. Generated once alongside the network identity.
  let minioSecret = (await readIfPresent(`${genDir}/.minioSecret`))?.trim() || ''
  if (!minioSecret) {
    minioSecret = utils.getDefaultString({ charset: 'a-z,A-Z,0-9', len: 32 })
    await writeFile(`${genDir}/.minioSecret`, minioSecret)
  }

  // -------------------------------------------------------------------------
  // Per-daemon configuration, rewritten on every start
  // -------------------------------------------------------------------------
  const baseNetwork = parseYaml<NetworkConfiguration>(
    await readFile(`${genDir}/nodes.yml`, 'utf8'),
  )
  baseNetwork.networkId = networkId
  delete baseNetwork.creationTime

  const network = withAddresses(baseNetwork, addressesByDaemon)
  const accounts = await Promise.all(
    NODE_ORDER.map(async (_, i) =>
      parseYaml<{ account: Record<string, string> }>(
        await readFile(`${genDir}/account${i}.yml`, 'utf8'),
      ),
    ),
  )

  const accountFor = (daemon: string) => {
    const idx = NODE_ORDER.findIndex((n) => n.daemon === daemon)
    return accounts[idx]
  }

  const writeDaemonConfig = async (
    subpath: string,
    config: Record<string, unknown>,
  ) => {
    const dir = `${toolsRoot}/config/${subpath}`
    await mkdir(dir, { recursive: true })
    await writeFile(`${dir}/config.yml`, toYaml(config))
  }

  await writeDaemonConfig(CONFIG_SUBPATHS.coordinator, {
    network,
    ...commonConfig('/networkStore'),
    ...accountFor('coordinator'),
    mongo: {
      connect: `mongodb://127.0.0.1:${mongoPort}`,
      database: 'coordinator',
      log: 'log',
      spaces: 'spaces',
    },
    spaceStatus: { runSeconds: 5, deletionPeriodDays: 0 },
    drpc: drpcConfig,
    ...listenConfig(coordinatorPort),
    defaultLimits: {
      spaceMembersRead: 1000,
      spaceMembersWrite: 1000,
      sharedSpacesLimit: 1000,
    },
  })

  await writeDaemonConfig(CONFIG_SUBPATHS['sync-node'], {
    network,
    ...commonConfig('/networkStore'),
    ...accountFor('sync-node'),
    // Empty disables the debug DRPC listener entirely
    // (any-sync/net/rpc/debugserver/debugserver.go:53). Left on, it would bind
    // 8080 in the shared namespace and collide with the config-ui daemon.
    apiServer: { listenAddr: '' },
    drpc: drpcConfig,
    ...listenConfig(syncNodePort),
    space: { gcTTL: 60, syncPeriod: 600 },
    storage: { path: '/storage', anyStorePath: '/anyStorage' },
    nodeSync: { periodicSyncHours: 2, syncOnStart: true },
    // Resharding's drain path is gated on a shared archive bucket, and this
    // package runs a single tree node, so both stay off.
    s3Store: { enabled: false },
    archive: { enabled: false },
  })

  await writeDaemonConfig(CONFIG_SUBPATHS.filenode, {
    network,
    ...commonConfig('/networkStore'),
    ...accountFor('filenode'),
    s3Store: {
      bucket: minioBucket,
      indexBucket: minioBucket,
      maxThreads: 16,
      profile: 'default',
      region: 'us-east-1',
      endpoint: `http://127.0.0.1:${minioPort}`,
      forcePathStyle: true,
    },
    redis: {
      isCluster: false,
      url: `redis://127.0.0.1:${redisPort}?dial_timeout=3&read_timeout=6s`,
    },
    drpc: drpcConfig,
    ...listenConfig(filenodePort),
    // 1 TiB per space, matching upstream's default.
    defaultLimit: 1099511627776,
  })

  await writeDaemonConfig(CONFIG_SUBPATHS.consensusnode, {
    network,
    ...commonConfig('/networkStore'),
    ...accountFor('consensusnode'),
    mongo: {
      // `w=majority` and `logCollection` (NOT `log`, which is what the
      // coordinator uses) both come from upstream's consensusnode.yml. Getting
      // the key wrong makes the daemon try to create collection "" and abort
      // with `(InvalidNamespace) Invalid namespace specified 'consensus.'`.
      connect: `mongodb://127.0.0.1:${mongoPort}/?w=majority`,
      database: 'consensus',
      logCollection: 'log',
    },
    drpc: drpcConfig,
    ...listenConfig(consensusPort),
  })

  // The coordinator reads this file to publish the topology into Mongo.
  await writeFile(
    `${toolsRoot}/config/${CONFIG_SUBPATHS.coordinator}/network.yml`,
    toYaml(network),
  )

  // S3 credentials for the filenode's `default` profile.
  const awsDir = `${toolsRoot}/config/${AWS_SUBPATH}`
  await mkdir(awsDir, { recursive: true })
  await writeFile(
    `${awsDir}/credentials`,
    `[default]\naws_access_key_id = ${minioAccessKey}\naws_secret_access_key = ${minioSecret}\n`,
  )

  // client.yml — the whole point of the package, served over the config UI.
  const publicDir = `${toolsRoot}/config/${PUBLIC_SUBPATH}`
  await mkdir(publicDir, { recursive: true })
  await writeFile(`${publicDir}/client.yml`, toYaml(network))
  await writeFile(`${publicDir}/index.html`, renderConfigPage(network.networkId))

  // -------------------------------------------------------------------------
  // Daemons
  // -------------------------------------------------------------------------
  return sdk.Daemons.of(effects)
    .addDaemon('mongo', {
      subcontainer: mongoSub,
      exec: {
        command: [
          'mongod',
          // Without this every health-check connection logs four INFO lines;
          // that was ~2,000 of the 2,500 lines in the first install's export.
          '--quiet',
          '--replSet',
          'rs0',
          '--port',
          String(mongoPort),
          '--bind_ip',
          '127.0.0.1',
        ],
      },
      ready: {
        display: null,
        fn: async () => {
          const res = await mongoSub.exec([
            'mongosh',
            '--quiet',
            '--port',
            String(mongoPort),
            '--eval',
            'db.adminCommand({ping:1}).ok',
          ])
          return res.stdout.toString().trim() === '1'
            ? { result: 'success', message: null }
            : { result: 'failure', message: null }
        },
      },
      requires: [],
    })
    // A replica set is not optional: the coordinator runs multi-document
    // transactions and both it and the consensus node open change streams,
    // none of which exist on a standalone mongod. One member is enough.
    .addOneshot('mongo-replset', {
      subcontainer: mongoSub,
      exec: {
        command: [
          'mongosh',
          '--quiet',
          '--port',
          String(mongoPort),
          '--eval',
          // Initiating is not enough: rs.initiate() returns as soon as the
          // config is accepted, while the member needs another beat to elect
          // itself PRIMARY. Returning early let the coordinator and consensus
          // node start against a non-primary and die with
          // `(NotWritablePrimary) not primary`. Block until it is writable.
          `try { rs.initiate({_id:'rs0',members:[{_id:0,host:'127.0.0.1:${mongoPort}'}]}) } catch (e) { }
           var waited = 0;
           while (!db.hello().isWritablePrimary && waited < 60000) { sleep(250); waited += 250; }
           if (!db.hello().isWritablePrimary) { print('replica set did not reach PRIMARY'); quit(1); }
           print('PRIMARY after ' + waited + 'ms');`,
        ],
      },
      requires: ['mongo'],
    })
    .addDaemon('redis', {
      subcontainer: redisSub,
      exec: {
        // LC_ALL is pinned because StartOS exports a locale this image has no
        // data for, and Redis treats that as fatal, not cosmetic: main() does
        // `if (setlocale(LC_COLLATE,"") == NULL) { ...; return 1; }`. The only
        // symptom is "Failed to configure LOCALE for invalid locale name."
        // followed by exit 1 and an endless restart loop.
        env: { LC_ALL: 'C', LANG: 'C' },
        command: [
          'redis-server',
          '--port',
          String(redisPort),
          '--dir',
          '/data/',
          '--appendonly',
          'yes',
          '--maxmemory',
          '256mb',
          '--maxmemory-policy',
          'noeviction',
          '--loadmodule',
          '/opt/redis-stack/lib/redisbloom.so',
        ],
      },
      ready: {
        display: null,
        fn: async () => {
          // BF.ADD, not PING: the filenode probes the bloom module at startup
          // and aborts without it, so a plain PING would report ready on a
          // Redis that cannot actually serve this package.
          const res = await redisSub.exec([
            'redis-cli',
            '-p',
            String(redisPort),
            'BF.ADD',
            '_startos_probe',
            '1',
          ])
          return res.exitCode === 0
            ? { result: 'success', message: null }
            : { result: 'failure', message: res.stderr.toString().trim() }
        },
      },
      requires: [],
    })
    .addDaemon('minio', {
      subcontainer: minioSub,
      exec: {
        command: [
          'minio',
          'server',
          '/data',
          '--address',
          `127.0.0.1:${minioPort}`,
          // Pinned rather than left to MinIO's random choice: subcontainers
          // share one network namespace, so an arbitrary console port could
          // land on something else in this package.
          '--console-address',
          `127.0.0.1:${minioConsolePort}`,
        ],
        env: {
          MINIO_ROOT_USER: minioAccessKey,
          MINIO_ROOT_PASSWORD: minioSecret,
        },
      },
      ready: {
        display: null,
        fn: () =>
          sdk.healthCheck.checkPortListening(effects, minioPort, {
            successMessage: '',
            errorMessage: '',
          }),
      },
      requires: [],
    })
    // The filenode never creates its bucket — it just fails to store anything.
    .addOneshot('create-bucket', {
      subcontainer: mcSub,
      exec: {
        command: [
          'sh',
          '-c',
          `mc alias set minio http://127.0.0.1:${minioPort} ${minioAccessKey} ${minioSecret} && mc mb --ignore-existing minio/${minioBucket}`,
        ],
      },
      requires: ['minio'],
    })
    // Publishes the node topology into Mongo. Clients refresh their node list
    // from here, so this must re-run whenever the advertised addresses change —
    // which it does, because main re-runs on any address change.
    .addOneshot('publish-topology', {
      subcontainer: coordinatorSub,
      exec: {
        command: [
          '/bin/any-sync-confapply',
          '-c',
          '/etc/any-sync-coordinator/config.yml',
          '-n',
          '/etc/any-sync-coordinator/network.yml',
          '-e',
        ],
      },
      requires: ['mongo-replset'],
    })
    .addDaemon('coordinator', {
      subcontainer: coordinatorSub,
      exec: { command: sdk.useEntrypoint() },
      ready: {
        display: i18n('Coordinator'),
        fn: () =>
          sdk.healthCheck.checkPortListening(effects, coordinatorPort, {
            successMessage: i18n('Accepting connections'),
            errorMessage: i18n('Not accepting connections yet'),
          }),
      },
      requires: ['publish-topology'],
    })
    .addDaemon('consensusnode', {
      subcontainer: consensusSub,
      exec: { command: sdk.useEntrypoint() },
      ready: {
        display: i18n('Consensus Node'),
        fn: () =>
          sdk.healthCheck.checkPortListening(effects, consensusPort, {
            successMessage: i18n('Accepting connections'),
            errorMessage: i18n('Not accepting connections yet'),
          }),
      },
      requires: ['mongo-replset', 'coordinator'],
    })
    .addDaemon('sync-node', {
      subcontainer: syncNodeSub,
      exec: { command: sdk.useEntrypoint() },
      ready: {
        display: i18n('Sync Node'),
        fn: () =>
          sdk.healthCheck.checkPortListening(effects, syncNodePort, {
            successMessage: i18n('Accepting connections'),
            errorMessage: i18n('Not accepting connections yet'),
          }),
      },
      requires: ['coordinator'],
    })
    .addDaemon('filenode', {
      subcontainer: filenodeSub,
      exec: { command: sdk.useEntrypoint() },
      ready: {
        display: i18n('File Node'),
        fn: () =>
          sdk.healthCheck.checkPortListening(effects, filenodePort, {
            successMessage: i18n('Accepting connections'),
            errorMessage: i18n('Not accepting connections yet'),
          }),
      },
      requires: ['redis', 'create-bucket', 'coordinator'],
    })
    .addDaemon('config-ui', {
      subcontainer: caddySub,
      exec: {
        command: [
          'caddy',
          'file-server',
          '--root',
          '/srv',
          '--listen',
          `:${configPort}`,
        ],
      },
      ready: {
        display: i18n('Network Configuration'),
        fn: () =>
          sdk.healthCheck.checkPortListening(effects, configPort, {
            successMessage: i18n(
              'The network configuration is ready to download',
            ),
            errorMessage: i18n('The network configuration is not ready'),
          }),
      },
      requires: [],
    })
})

/**
 * The landing page for the config interface. Deliberately plain: its only job
 * is to hand over client.yml and say what to do with it.
 */
function renderConfigPage(networkId: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Anytype Sync Server</title>
<style>
  :root { color-scheme: light dark; }
  body { font-family: system-ui, -apple-system, sans-serif; line-height: 1.6;
         max-width: 42rem; margin: 0 auto; padding: 2.5rem 1.25rem; }
  h1 { font-size: 1.6rem; margin-bottom: .25rem; }
  p.sub { margin-top: 0; opacity: .7; }
  a.dl { display: inline-block; margin: 1.25rem 0; padding: .7rem 1.1rem;
         border: 1px solid currentColor; border-radius: 4px;
         text-decoration: none; font-weight: 600; }
  ol { padding-left: 1.2rem; }
  code { font-family: ui-monospace, Menlo, monospace; font-size: .9em;
         padding: .1em .35em; border: 1px solid rgba(128,128,128,.35);
         border-radius: 3px; }
  .id { word-break: break-all; font-size: .85em; opacity: .75; }
</style>
</head>
<body>
<h1>Anytype Sync Server</h1>
<p class="sub">Your own any-sync network.</p>

<a class="dl" href="client.yml" download>Download client.yml</a>

<ol>
  <li>Download the file above onto the device running Anytype.</li>
  <li>In the Anytype app, log out of your current vault.</li>
  <li>Open the settings gear, choose <strong>Self-hosted</strong> under Networks.</li>
  <li>Upload <code>client.yml</code>, then create or log into a vault.</li>
</ol>

<p>Desktop, iOS and Android all support self-hosted networks. A self-hosted
network is a separate identity from an anytype.io account, so existing spaces
need to be exported and re-imported.</p>

<p>Your devices must be able to reach this server: on the same network, over a
VPN, or through a forwarded port. The Anytype apps cannot connect over Tor.</p>

<p class="id">Network ID: ${networkId}</p>
</body>
</html>
`
}
