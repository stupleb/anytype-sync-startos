import { sdk } from '../sdk'
import { deleteOldMinioData } from './deleteOldMinioData'

export const actions = sdk.Actions.of().addAction(deleteOldMinioData)
