import type { IAddonConfiguration, IAddonDefinition } from '@zarya/addon-contracts/addons';
import { BusinessError, BusinessErrorCode } from '@zarya/addon-contracts/business-error';

export const participationDefinition: IAddonDefinition = {
  addonKey: 'participation',
  adminMenu: { en: 'Events', ru: 'События' },
  name: { en: 'Events', ru: 'События' },
  description: { en: 'Recurring events and participation requests', ru: 'Циклические события и заявки участников' },
  contractVersion: 1,
  implementationVersion: '0.2.0',
  configurationSchemaVersion: 1,
  adminComponentId: 'participation',
  snippetIds: ['ParticipationForm'],
};

export function validateParticipationConfiguration(configuration: IAddonConfiguration): void {
  const labels = configuration.values.adminMenuLabels;

  if (configuration.schemaVersion !== 1 || Object.keys(configuration.values).some((key) => key !== 'adminMenuLabels')
    || labels !== undefined && (!labels || typeof labels !== 'object' || Array.isArray(labels)
      || Object.entries(labels).some(([language, value]) => !['en', 'ru'].includes(language)
        || typeof value !== 'string' || value.length > 80))) {
    throw new BusinessError(BusinessErrorCode.Validation, 'Invalid events configuration');
  }
}
