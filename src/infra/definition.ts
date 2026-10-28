import type { IAddonConfiguration, IAddonDefinition } from '@zarya/addon-contracts/addons';
import { BusinessError, BusinessErrorCode } from '@zarya/addon-contracts/business-error';

export const participationDefinition: IAddonDefinition = {
  addonKey: 'participation',
  name: { en: 'Event bookings', ru: 'Запись на события' },
  description: { en: 'Recurring events and participation requests', ru: 'Циклические события и заявки участников' },
  contractVersion: 1,
  implementationVersion: '0.1.0',
  configurationSchemaVersion: 1,
  adminComponentId: 'participation',
  snippetIds: ['ParticipationForm'],
};

export function validateParticipationConfiguration(configuration: IAddonConfiguration): void {
  if (configuration.schemaVersion !== 1 || Object.keys(configuration.values).length) {
    throw new BusinessError(BusinessErrorCode.Validation,
      'Participation configuration requires version 1 and empty values');
  }
}
