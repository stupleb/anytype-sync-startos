export const DEFAULT_LANG = 'en_US'

const dict = {
  // main.ts
  'Starting Anytype Sync Server': 0,
  'Accepting connections': 1,
  'Not accepting connections yet': 2,
  // interfaces.ts
  Coordinator: 3,
  'Sync Node': 4,
  'File Node': 5,
  'Consensus Node': 6,
  'Network Configuration': 7,
  'Manages spaces, members, and the node list that clients fetch': 8,
  'Synchronizes your documents between devices': 9,
  'Stores images and file attachments': 10,
  'Orders access-control records': 11,
  'Download the network configuration file to load into the Anytype app': 12,
  'The network configuration is ready to download': 13,
  'The network configuration is not ready': 14,
} as const

/**
 * Plumbing. DO NOT EDIT.
 */
export type I18nKey = keyof typeof dict
export type LangDict = Record<(typeof dict)[I18nKey], string>
export default dict
