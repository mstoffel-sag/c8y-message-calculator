/**
 * The Cumulocity application manifest for the Web SDK build.
 *
 * The devkit reads this file (cosmiconfig, `cumulocity.config.ts` at the
 * workspace root) and writes it into the build as `cumulocity.json`, which is
 * what a tenant reads when the zip is uploaded. It is the Angular app's
 * equivalent of the hand-written `cumulocity.json` the static build ships --
 * see README, "Two builds, two manifests".
 *
 * The version comes from package.json so there is one place to bump.
 */

import type { ConfigurationOptions } from '@c8y/devkit';
import { version, description } from './package.json';

/**
 * Said once, because the icon's URL has to contain it.
 *
 * An application icon is applied as a CSS `background-image`, so the platform
 * needs a path that resolves from the server root rather than from the app --
 * which means the context path is spelled into it. Changing one and not the
 * other gives a working app with no icon, and nothing reports that.
 */
const contextPath = 'message-calculator';
const icon = `url('/apps/${contextPath}/assets/app-icon.svg')`;

export default {
  runTime: {
    name: 'Message Calculator',
    contextPath,
    key: 'message-calculator-application-key',
    version,
    description,
    /** The shell asks the tenant for branding and options at run time. */
    dynamicOptionsUrl: true,
    availability: 'PRIVATE',
    /** A presales tool belongs in the app switcher next to Cockpit. */
    noAppSwitcher: false,
    globalTitle: 'Message Calculator',
    /**
     * `src/c8y/assets/app-icon.svg`, copied to the build by the `assets` entry
     * in angular.json. The app switcher and the header bar both read this.
     */
    icon: { url: icon },
    faviconUrl: `/apps/${contextPath}/assets/app-icon.svg`,
    /**
     * The calculator reaches no API and stores nothing in the tenant, so there
     * is no platform documentation to link into and no plugin surface to
     * expose. Turning both off keeps the right drawer honest.
     */
    noPlugins: true
  },
  buildTime: {
    /**
     * Shared with the shell rather than bundled again: an app that ships its
     * own Angular is an app that fights the shell's.
     */
    federation: [
      '@angular/animations',
      '@angular/cdk',
      '@angular/common',
      '@angular/compiler',
      '@angular/core',
      '@angular/forms',
      '@angular/platform-browser',
      '@angular/platform-browser-dynamic',
      '@angular/router',
      '@c8y/client',
      '@c8y/ngx-components',
      'ngx-bootstrap',
      '@ngx-translate/core',
      '@ngx-formly/core'
    ],
    /**
     * Nothing in the wizard opens a Monaco editor, and its language workers are
     * the single largest thing the SDK would otherwise copy into the zip.
     */
    skipMonacoLanguageSupport: true,
    /**
     * `lib/` is written as real ESM: every import inside it names the file it
     * resolves to, extension and all, because that is what Node needs to run
     * the test suite without a bundler. Webpack does not follow a `.js`
     * specifier to a `.ts` source on its own, so it is told to.
     */
    extraWebpackConfig: {
      resolve: {
        extensionAlias: { '.js': ['.ts', '.js'] }
      }
    }
  }
} satisfies ConfigurationOptions;
