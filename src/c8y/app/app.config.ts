/**
 * Where the calculator attaches to the shell.
 *
 * `hookNavigator` puts it in the left navigator, `hookRoute` gives it a page.
 * Everything else on screen -- the header, the user menu, the language, the
 * branding -- is the platform's, which is the whole point of building this on
 * the Web SDK rather than shipping another static page.
 *
 * One route per scenario, not one per step. The wizard's position lives in the
 * stepper, the same as it lived in a `useState` before: a route per step would
 * put step ordinals in the URL, and CONCEPT.md section 6 keeps ordinals in
 * exactly one table. A scenario id is not an ordinal -- it is the thing being
 * looked at -- so the navigator can link straight to one and the back button
 * works between them.
 *
 * The navigator node is a factory rather than a constant, because the list is
 * the user's library and changes while they work. `ScenarioNavigator` returns
 * an Observable, which is what lets a scenario added on the page appear in the
 * menu without a reload.
 */

import { type ApplicationConfig, importProvidersFrom, provideZoneChangeDetection } from '@angular/core';
import { provideAnimations } from '@angular/platform-browser/animations';
import { CoreModule, RouterModule, hookNavigator, hookRoute } from '@c8y/ngx-components';

import { ScenarioNavigator } from './scenario-navigator.js';
import { WizardComponent } from './wizard/wizard.component.js';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection(),
    provideAnimations(),
    importProvidersFrom(RouterModule.forRoot()),
    importProvidersFrom(CoreModule.forRoot()),

    hookRoute({ path: '', component: WizardComponent }),
    hookRoute({ path: 'scenario/:id', component: WizardComponent }),

    hookNavigator(ScenarioNavigator),
  ],
};
