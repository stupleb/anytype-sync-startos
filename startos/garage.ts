import { FileHelper, T, utils } from '@start9labs/start-sdk'
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'fs/promises'
import { join } from 'path'
import { i18n } from './i18n'
import { sdk } from './sdk'

export const s3Port = 3900
export const s3Region = 'us-east-1'
export const s3Bucket = 'anytype'
// Garage refuses key ids shorter than 8 characters.
export const s3AccessKey = 'anytype-sync'

const rpcPort = 3901
const legacyMinioPort = 9000
const legacyMinioAccessKey = 'anytype'

// Deleted last by deleteLegacyMinioData, so it outlives any MinIO data.
export const legacyMinioSecret = FileHelper.string({
  base: sdk.volumes.config,
  subpath: 'generated/.minioSecret',
})

export const garageCommand: T.CommandType = [
  '/garage',
  'server',
  '--single-node',
  '--default-bucket',
  '--default-access-key',
]

const listening = (effects: T.Effects, port: number) => ({
  display: null,
  fn: () =>
    sdk.healthCheck.checkPortListening(effects, port, {
      successMessage: '',
      errorMessage: '',
    }),
})

// Garage opens its S3 port only after it has created the bucket and the key.
export const garageReady = (effects: T.Effects) => listening(effects, s3Port)

export const garageSub = (effects: T.Effects, name: string) =>
  sdk.SubContainer.of(
    effects,
    { imageId: 'garage' },
    sdk.Mounts.of()
      .mountVolume({
        volumeId: 'objects',
        subpath: null,
        mountpoint: '/var/lib/garage',
        readonly: false,
      })
      .mountVolume({
        volumeId: 'config',
        subpath: 'garage',
        mountpoint: '/etc/garage',
        readonly: true,
      })
      // The image is built from scratch and ships neither file.
      .mountVolume({
        volumeId: 'config',
        subpath: 'garage/passwd',
        mountpoint: '/etc/passwd',
        readonly: true,
        type: 'file',
      })
      .mountVolume({
        volumeId: 'config',
        subpath: 'garage/group',
        mountpoint: '/etc/group',
        readonly: true,
        type: 'file',
      }),
    name,
  )

async function secret(name: string, charset: string, len: number) {
  const path = sdk.volumes.config.subpath(`generated/${name}`)
  const existing = (await readFile(path, 'utf8').catch(() => '')).trim()
  if (existing) return existing
  const value = utils.getDefaultString({ charset, len })
  await writeFile(path, value)
  return value
}

// Must run before a garageSub is used: its mounts are read-only and need their sources.
export async function prepareGarage() {
  const dir = sdk.volumes.config.subpath('garage')
  await mkdir(dir, { recursive: true })
  await mkdir(sdk.volumes.config.subpath('generated'), { recursive: true })
  await writeFile(
    join(dir, 'garage.toml'),
    `metadata_dir = "/var/lib/garage/meta"
data_dir = "/var/lib/garage/data"
db_engine = "sqlite"
replication_factor = 1
rpc_bind_addr = "127.0.0.1:${rpcPort}"
rpc_public_addr = "127.0.0.1:${rpcPort}"

[s3_api]
api_bind_addr = "127.0.0.1:${s3Port}"
s3_region = "${s3Region}"
`,
  )
  await writeFile(join(dir, 'passwd'), 'root:x:0:0:root:/root:/bin/sh\n')
  await writeFile(join(dir, 'group'), 'root:x:0:\n')
  return {
    GARAGE_CONFIG_FILE: '/etc/garage/garage.toml',
    GARAGE_RPC_SECRET: await secret('.garageRpcSecret', 'a-f,0-9', 64),
    GARAGE_DEFAULT_ACCESS_KEY: s3AccessKey,
    GARAGE_DEFAULT_SECRET_KEY: await secret('.garageSecret', 'a-z,A-Z,0-9', 32),
    GARAGE_DEFAULT_BUCKET: s3Bucket,
    // Garage's defaults, minus a line per S3 request and per worker at shutdown.
    RUST_LOG:
      'netapp=info,garage=info,garage_api_common::generic_server=warn,garage_util::background::worker=warn',
  }
}

export async function deleteLegacyMinioData() {
  const root = sdk.volumes.blobs.path
  for (const entry of await readdir(root))
    await rm(join(root, entry), { recursive: true, force: true })
  await rm(legacyMinioSecret.path, { force: true })
}

async function dirSize(dir: string): Promise<number> {
  let size = 0
  for (const entry of await readdir(dir, { withFileTypes: true }))
    size += entry.isDirectory()
      ? await dirSize(join(dir, entry.name))
      : (await stat(join(dir, entry.name))).size
  return size
}

const rcloneRemote = (
  name: string,
  provider: string,
  port: number,
  accessKey: string,
  secretKey: string,
) => ({
  [`RCLONE_CONFIG_${name}_TYPE`]: 's3',
  [`RCLONE_CONFIG_${name}_PROVIDER`]: provider,
  [`RCLONE_CONFIG_${name}_ENDPOINT`]: `http://127.0.0.1:${port}`,
  [`RCLONE_CONFIG_${name}_ACCESS_KEY_ID`]: accessKey,
  [`RCLONE_CONFIG_${name}_SECRET_ACCESS_KEY`]: secretKey,
  [`RCLONE_CONFIG_${name}_REGION`]: s3Region,
  [`RCLONE_CONFIG_${name}_FORCE_PATH_STYLE`]: 'true',
})

export async function migrateFromMinio(
  effects: T.Effects,
  progress: utils.FullProgressTracker,
) {
  const minioSecret = (await legacyMinioSecret.read().once())?.trim()
  const legacyBucket = sdk.volumes.blobs.subpath(s3Bucket)
  const marker = sdk.volumes.objects.subpath('.migrated-from-minio')
  if (
    !minioSecret ||
    !(await readdir(legacyBucket).catch(() => [])).length ||
    (await stat(marker).catch(() => null))
  )
    return

  const phase = progress.addPhase(i18n('Copying files from MinIO to Garage'))
  phase.start()

  const garageEnv = await prepareGarage()
  const env = {
    ...rcloneRemote(
      'SRC',
      'Minio',
      legacyMinioPort,
      legacyMinioAccessKey,
      minioSecret,
    ),
    ...rcloneRemote(
      'DST',
      'Other',
      s3Port,
      s3AccessKey,
      garageEnv.GARAGE_DEFAULT_SECRET_KEY,
    ),
  }

  const rcloneSub = () =>
    sdk.SubContainer.of(effects, { imageId: 'rclone' }, null, 'rclone-sub')
  const withServers = (
    timeout: number,
    run: (
      rclone: ReturnType<typeof rcloneSub>,
      abort: AbortSignal,
    ) => Promise<void>,
  ) =>
    sdk.Daemons.of(effects)
      .addDaemon('garage', {
        subcontainer: garageSub(effects, 'garage-migrate-sub'),
        exec: { command: garageCommand, env: garageEnv },
        ready: garageReady(effects),
        requires: [],
      })
      .addDaemon('minio', {
        subcontainer: sdk.SubContainer.of(
          effects,
          { imageId: 'minio-legacy' },
          sdk.Mounts.of().mountVolume({
            volumeId: 'blobs',
            subpath: null,
            mountpoint: '/data',
            readonly: false,
          }),
          'minio-migrate-sub',
        ),
        exec: {
          command: [
            'minio',
            'server',
            '/data',
            '--address',
            `127.0.0.1:${legacyMinioPort}`,
            '--console-address',
            `127.0.0.1:${legacyMinioPort + 1}`,
          ],
          env: {
            MINIO_ROOT_USER: legacyMinioAccessKey,
            MINIO_ROOT_PASSWORD: minioSecret,
          },
        },
        ready: listening(effects, legacyMinioPort),
        requires: [],
      })
      .addOneshot('rclone', {
        subcontainer: rcloneSub(),
        exec: {
          fn: async (rclone, abort) => {
            await run(rclone, abort)
            return null
          },
        },
        requires: ['garage', 'minio'],
      })
      .runUntilSuccess(timeout)

  // Throws, and so is retried, until both servers answer with these credentials.
  await withServers(300_000, async (rclone) => {
    await rclone.execFail(['rclone', 'lsd', 'src:'], { env })
    await rclone.execFail(['rclone', 'lsd', 'dst:'], { env })
  })

  let exitCode: number | null = null
  // Never throws: a copy that failed is not worth retrying. Allows half an hour plus a second per MiB.
  await withServers(
    1_800_000 + (await dirSize(legacyBucket)) / 1048,
    async (rclone, abort) => {
      const child = await rclone.spawn(
        [
          'sh',
          '-c',
          `set -e
rclone copy src:${s3Bucket} dst:${s3Bucket} --checksum --transfers 8 --checkers 8 --stats 30s --stats-one-line
rclone check src:${s3Bucket} dst:${s3Bucket} --one-way --checksum
src=$(rclone size src:${s3Bucket} --json)
dst=$(rclone size dst:${s3Bucket} --json)
echo "MinIO: $src  Garage: $dst"
[ "$(echo "$src" | sed 's/.*"count":\\([0-9]*\\).*/\\1/')" -le "$(echo "$dst" | sed 's/.*"count":\\([0-9]*\\).*/\\1/')" ]`,
        ],
        { env, stdio: 'inherit' },
      )
      abort.addEventListener('abort', () => child.kill('SIGKILL'), {
        once: true,
      })
      exitCode = await new Promise((resolve) => child.on('exit', resolve))
    },
  )
  if (exitCode !== 0)
    throw new Error(
      `Copying files from MinIO to Garage failed: rclone exited with ${exitCode}`,
    )

  await writeFile(marker, `${new Date().toISOString()}\n`)
  phase.complete()
}
