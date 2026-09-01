import { i18n } from './i18n'
import { sdk } from './sdk'
import {
  configHostId,
  configInterfaceId,
  configPort,
  consensusInterfaceId,
  consensusPort,
  coordinatorInterfaceId,
  coordinatorPort,
  filenodeInterfaceId,
  filenodePort,
  syncHostId,
  syncNodeInterfaceId,
  syncNodePort,
} from './utils'

/**
 * The four any-sync daemons each get their own port on a shared host.
 *
 * These are NOT web interfaces and must not be given SSL. any-sync authenticates
 * with libp2p-TLS keyed on Ed25519 peer IDs — the client derives a peer ID from
 * the key in the presented certificate and drops the connection if it does not
 * match the one in its network config. A StartOS-issued certificate would fail
 * that check, so `secure: { ssl: false }` is correct rather than merely
 * convenient, and there is no ACME involvement anywhere in this package.
 *
 * Each bindPort covers TCP and UDP on the same number, so one call per daemon
 * serves both the yamux and QUIC listeners.
 */
const SYNC_INTERFACES = [
  {
    id: coordinatorInterfaceId,
    port: coordinatorPort,
    name: () => i18n('Coordinator'),
    description: () =>
      i18n('Manages spaces, members, and the node list that clients fetch'),
  },
  {
    id: syncNodeInterfaceId,
    port: syncNodePort,
    name: () => i18n('Sync Node'),
    description: () => i18n('Synchronizes your documents between devices'),
  },
  {
    id: filenodeInterfaceId,
    port: filenodePort,
    name: () => i18n('File Node'),
    description: () => i18n('Stores images and file attachments'),
  },
  {
    id: consensusInterfaceId,
    port: consensusPort,
    name: () => i18n('Consensus Node'),
    description: () => i18n('Orders access-control records'),
  },
]

export const setInterfaces = sdk.setupInterfaces(async ({ effects }) => {
  const receipts = []

  const syncMulti = sdk.MultiHost.of(effects, syncHostId)
  for (const spec of SYNC_INTERFACES) {
    const origin = await syncMulti.bindPort(spec.port, {
      protocol: null,
      preferredExternalPort: spec.port,
      addSsl: null,
      secure: { ssl: false },
    })
    const iface = sdk.createInterface(effects, {
      name: spec.name(),
      id: spec.id,
      description: spec.description(),
      type: 'p2p',
      masked: false,
      schemeOverride: { ssl: null, noSsl: null },
      username: null,
      path: '',
      query: {},
    })
    receipts.push(await origin.export([iface]))
  }

  // The only thing a user needs from this package is client.yml, and an action
  // can only return single-line values — so it is served as a file instead.
  const configMulti = sdk.MultiHost.of(effects, configHostId)
  const configOrigin = await configMulti.bindPort(configPort, {
    protocol: 'http',
  })
  const configIface = sdk.createInterface(effects, {
    name: i18n('Network Configuration'),
    id: configInterfaceId,
    description: i18n(
      'Download the network configuration file to load into the Anytype app',
    ),
    type: 'ui',
    masked: false,
    schemeOverride: null,
    username: null,
    path: '',
    query: {},
  })
  receipts.push(await configOrigin.export([configIface]))

  return receipts
})
