import { deleteLegacyMinioData, legacyMinioSecret } from '../garage'
import { i18n } from '../i18n'
import { sdk } from '../sdk'

export const deleteOldMinioData = sdk.Action.withoutInput(
  'delete-old-minio-data',

  async ({ effects }) => ({
    name: i18n('Delete Old MinIO Data'),
    description: i18n(
      'Delete the copy of your files that MinIO kept before this service moved its file storage to Garage.',
    ),
    warning: i18n(
      'Check first that your images and files open in Anytype. The old copy cannot be brought back.',
    ),
    allowedStatuses: 'any',
    group: null,
    visibility: (await legacyMinioSecret.read().const(effects))
      ? 'enabled'
      : 'hidden',
  }),

  async () => {
    // Not awaited: StartOS gives an action two minutes, and a large store takes longer.
    deleteLegacyMinioData().catch((e) =>
      console.error('Deleting the old MinIO data failed:', e),
    )
    return {
      version: '1',
      title: i18n('Deleting Old MinIO Data'),
      message: i18n(
        'The space is freed in the background. This action disappears when it is done.',
      ),
      result: null,
    }
  },
)
