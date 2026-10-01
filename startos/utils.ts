import { T, YAML } from '@start9labs/start-sdk'
import { sdk } from './sdk'

// ---------------------------------------------------------------------------
// Hosts and interfaces
// ---------------------------------------------------------------------------

export const syncHostId = 'any-sync'
export const configHostId = 'config'

export const coordinatorInterfaceId = 'coordinator'
export const syncNodeInterfaceId = 'sync-node'
export const filenodeInterfaceId = 'filenode'
export const consensusInterfaceId = 'consensus'
export const configInterfaceId = 'config'

// ---------------------------------------------------------------------------
// Ports
// ---------------------------------------------------------------------------

/**
 * Upstream's defaults (TCP 1001-1006, UDP 1011-1016) are all at or below 1024,
 * and StartOS refuses those for a package — `may_claim` in
 * shared-libs/crates/start-core/src/net/forward.rs only admits `port > 1024`.
 * So the whole set moves into 33xxx.
 *
 * One number per daemon covers BOTH transports. A StartOS port forward matches
 * `meta l4proto { tcp, udp }` (build/lib/scripts/forward-port), so a single
 * bindPort carries yamux-over-TCP and QUIC-over-UDP on the same number, and the
 * daemon listens on both. That is why there are four ports here and not eight.
 */
export const coordinatorPort = 33010
export const syncNodePort = 33011
export const filenodePort = 33012
export const consensusPort = 33013

/** Static file server for client.yml. Fronted by StartOS, so http internally. */
export const configPort = 8080

// Internal to the package — never bound to a host interface.
export const mongoPort = 27017
export const redisPort = 6379

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

/**
 * Where `anyconf` output lives on the `config` volume. Minted once and never
 * regenerated: these keys are the network's identity, and every client's saved
 * network config points at the peer IDs derived from them.
 */
export const GENERATED_SUBPATH = 'generated'

/** Per-daemon config directories on the `config` volume. */
export const CONFIG_SUBPATHS = {
  coordinator: 'coordinator',
  'sync-node': 'sync-node',
  filenode: 'filenode',
  consensusnode: 'consensusnode',
} as const

export const AWS_SUBPATH = 'aws'
export const PUBLIC_SUBPATH = 'public'

/**
 * Node ordering passed to `anyconf generate-nodes`. The index is positional —
 * accountN.yml lines up with the Nth `--t` flag — so this array is the single
 * source of truth for which account file belongs to which daemon.
 */
export const NODE_ORDER = [
  { type: 'tree', daemon: 'sync-node' },
  { type: 'coordinator', daemon: 'coordinator' },
  { type: 'file', daemon: 'filenode' },
  { type: 'consensus', daemon: 'consensusnode' },
] as const

/**
 * `anyconf generate-nodes` leaves `signingKey` empty for the coordinator
 * (gen.go passes a nil network key), and upstream's own init script patches the
 * network signing key into both the coordinator and the consensus node. These
 * are the indices into NODE_ORDER that need that patch.
 */
export const NETWORK_SIGNING_KEY_INDICES = [1, 3]

// ---------------------------------------------------------------------------
// Addressing
// ---------------------------------------------------------------------------

export type DaemonAddresses = Record<string, string[]>

// `port` is the one StartOS assigned, which is not the bound port when that was already taken.
export type BoundHost = { hostname: string; port: number }

/**
 * Build the advertised address list for one daemon.
 *
 * A bare `host:port` is dialled as yamux over TCP; a `quic://` entry is the
 * UDP path. Clients try them in order and skip any scheme they have no
 * transport for, so listing both is safe even where UDP is blocked.
 *
 * IPv6 literals are bracketed — `net.SplitHostPort` on the client side requires
 * it, and an unbracketed v6 address would be parsed as host + port.
 */
export function buildAddresses(hosts: BoundHost[]): string[] {
  const out: string[] = []
  for (const { hostname, port } of hosts) {
    const host =
      hostname.includes(':') && !hostname.startsWith('[')
        ? `[${hostname}]`
        : hostname
    const hostPort = `${host}:${port}`
    if (!out.includes(hostPort)) out.push(hostPort)
    const quic = `quic://${hostPort}`
    if (!out.includes(quic)) out.push(quic)
  }
  return out
}

/**
 * Every address StartOS currently offers for a binding.
 *
 * `nonLocal` drops localhost and IPv6 link-local, which are useless to a client
 * on another device. Everything else is kept deliberately: a LAN IP, a `.local`
 * name and a public domain are all legitimate ways to reach the same box, and
 * any-sync tries the list in order.
 */
export async function readBindingHostnames(
  effects: T.Effects,
  hostId: string,
  port: number,
  interfaceId: string,
): Promise<BoundHost[]> {
  const result = await sdk.host
    .getOwn(effects, hostId, (host) =>
      (
        host?.bindings[port]?.interfaces[interfaceId]?.addressInfo?.nonLocal
          .hostnames ?? []
      ).flatMap((h) =>
        h.port === null ? [] : [{ hostname: h.hostname, port: h.port }],
      ),
    )
    .const()
  return result ?? []
}

// ---------------------------------------------------------------------------
// Config assembly
// ---------------------------------------------------------------------------

/** Shape of one node entry in nodes.yml / client.yml. */
export type NodeEntry = {
  peerId: string
  addresses: string[]
  types: string[]
}

export type NetworkConfiguration = {
  id: string
  networkId: string
  nodes: NodeEntry[]
  creationTime?: unknown
}

/**
 * Rewrite the addresses in a generated network configuration.
 *
 * Upstream's setListenIp.py keeps the Docker-internal hostname as each node's
 * first address, which on StartOS would be a dead dial candidate costing every
 * client a failed connect before it reaches a working address. This replaces
 * the list outright instead of appending to it.
 */
export function withAddresses(
  network: NetworkConfiguration,
  addressesByDaemon: DaemonAddresses,
): NetworkConfiguration {
  return {
    ...network,
    nodes: network.nodes.map((node, i) => {
      const daemon = NODE_ORDER[i]?.daemon
      const addresses = daemon ? addressesByDaemon[daemon] : undefined
      return addresses?.length ? { ...node, addresses } : node
    }),
  }
}

/** Serialize a network configuration the way the daemons expect to read it. */
export function toYaml(value: unknown): string {
  return YAML.stringify(value, { indent: 2 })
}

export function parseYaml<T = any>(raw: string): T {
  return YAML.parse(raw) as T
}

/**
 * Common config block shared by every daemon.
 *
 * `metric.addr` is deliberately empty, which is NOT what upstream's common.yml
 * does. Upstream gives every daemon `0.0.0.0:8000` because each runs in its own
 * Docker network namespace; StartOS subcontainers share one, so four daemons
 * binding 8000 would collide and three would fail to start. An empty address
 * makes the listener a no-op (any-sync/metric/metric.go:105) and nothing here
 * exports metrics anyway.
 */
export function commonConfig(networkStorePath: string) {
  return {
    metric: { addr: '' },
    log: { defaultLevel: '', namedLevels: {}, production: false },
    networkStorePath,
  }
}

/** drpc block — identical across daemons in upstream's per-role configs. */
export const drpcConfig = {
  stream: { timeoutMilliseconds: 1000, maxMsgSizeMb: 256 },
}

/**
 * Listen addresses are deliberately NOT the advertised addresses: the daemon
 * binds every interface inside its container, while what clients dial comes
 * from the nodeconf entry. Upstream's compose conflates the two, which only
 * works because it publishes host ports 1:1.
 */
export function listenConfig(port: number) {
  return {
    yamux: {
      listenAddrs: [`0.0.0.0:${port}`],
      writeTimeoutSec: 10,
      dialTimeoutSec: 10,
    },
    quic: {
      listenAddrs: [`0.0.0.0:${port}`],
      writeTimeoutSec: 10,
      dialTimeoutSec: 10,
    },
  }
}
