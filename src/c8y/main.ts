/**
 * The Web SDK entry point.
 *
 * Nothing of the application is here on purpose: the shell has to fetch the
 * tenant's options and branding before Angular starts, so this file only holds
 * the loading bar away and hands over to @c8y/bootstrap, which then pulls in
 * ./bootstrap. Copied from the SDK's own application template.
 */

import './i18n';

const barHolder: HTMLElement | null = document.querySelector('body > .init-load');
export const removeProgress = () => barHolder?.parentNode?.removeChild(barHolder);

applicationSetup();

async function applicationSetup() {
  const { loadMetaDataAndPerformBootstrap } = await import('@c8y/bootstrap');
  const loadBootstrapModule = () =>
    import(
      /* webpackPreload: true */
      './bootstrap'
    );

  loadMetaDataAndPerformBootstrap(loadBootstrapModule).then(removeProgress);
}
