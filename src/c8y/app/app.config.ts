/**
 * Where the calculator attaches to the shell.
 *
 * `hookNavigator` puts it in the left navigator, `hookRoute` gives it a page.
 * Everything else on screen -- the header, the user menu, the language, the
 * branding -- is the platform's, which is the whole point of building this on
 * the Web SDK rather than shipping another static page.
 *
 * One route, not one per step. The wizard's position lives in the stepper, the
 * same as it lived in a `useState` before: a route per step would put step
 * ordinals in the URL, and CONCEPT.md section 6 keeps ordinals in exactly one
 * table.
 */

import { type ApplicationConfig, importProvidersFrom, provideZoneChangeDetection } from '@angular/core';
import { provideAnimations } from '@angular/platform-browser/animations';
import { CoreModule, NavigatorNode, RouterModule, hookNavigator, hookRoute } from '@c8y/ngx-components';

import { WizardComponent } from './wizard/wizard.component.js';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection(),
    provideAnimations(),
    importProvidersFrom(RouterModule.forRoot()),
    importProvidersFrom(CoreModule.forRoot()),

    hookRoute({ path: '', component: WizardComponent }),

    hookNavigator(
      new NavigatorNode({
        label: 'Message calculator',
        // The navigator is the shell's furniture, so its label goes through the
        // shell's own translation pipeline rather than through lib/i18n.
        translateLabel: true,
        icon: 'calculator',
        path: '/',
        priority: 100,
      }),
    ),
  ],
};
