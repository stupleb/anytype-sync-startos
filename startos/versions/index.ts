import { VersionGraph } from '@start9labs/start-sdk'
import { current } from './current'
import { v_0_13_3_0 } from './v0.13.3_0'

export const versionGraph = VersionGraph.of({
  current,
  other: [v_0_13_3_0],
})
