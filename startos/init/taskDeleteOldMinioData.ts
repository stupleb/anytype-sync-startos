import { deleteOldMinioData } from '../actions/deleteOldMinioData'
import { legacyMinioSecret } from '../garage'
import { i18n } from '../i18n'
import { sdk } from '../sdk'

export const taskDeleteOldMinioData = sdk.setupOnInit(async (effects) => {
  if (await legacyMinioSecret.read().once())
    await sdk.action.createOwnTask(effects, deleteOldMinioData, 'optional', {
      reason: i18n(
        'Your files were copied from MinIO to Garage during the update. Once they open in Anytype, delete the old copy to free its space.',
      ),
    })
})
