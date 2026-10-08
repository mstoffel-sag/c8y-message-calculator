# Cumulocity Message Calculator

Estimates the **Cumulocity messages and operational storage** a fleet of devices will use, per
contract period, from a description of the fleet. It produces **quantities only — never prices** —
and hands them over in an Excel workbook whose price column ships empty, ready for the account team
to price in the Sales Configurator.

## Use it

Three ways, all the same tool:

| | How | Needs |
|---|---|---|
| **Online** | <https://mstoffel-sag.github.io/c8y-message-calculator/> | a browser |
| **Offline, or to send to someone** | download `message-calculator-standalone-<version>.html` from the [latest release](https://github.com/mstoffel-sag/c8y-message-calculator/releases/latest) and double-click it | a browser — no install, no server |
| **Inside a Cumulocity tenant** | deploy it once (below), then open it from the application switcher | a tenant account |

Nothing is uploaded anywhere: every figure is computed in the browser, and scenarios are kept in
that browser's storage. **Export** saves a scenario as a JSON file and **Import** reads one back,
which is how a scenario moves between browsers or people.

### The five steps

| Step | What you enter |
|---|---|
| **Machines** | the kinds of machine in the fleet, how many of each, and what share is online |
| **Measurements** | every value a machine reports over time, and how often it is read. Values read on the same interval are grouped into one measurement — one message — automatically |
| **Events, alarms, inventory & commands** | everything that is not a measurement, one panel each |
| **Contract & deployment** | the contract periods, how the fleet grows across them, how long data is kept, and the other line items of the Sales Configurator |
| **Results** | the quote — see below — and the Excel download |

**Load example** fills in a worked fleet (1,000 rooftop HVAC units) to look around with. The
**Guidance** panel follows you through every step and flags designs that cost more messages than
they need to, with the saving per month.

### Reading the results

The results page leads with **what to quote**: one row per contract period, plus the whole term.

| | Messages a month | Over the period | Storage a month | Over the period |
|---|---|---|---|---|
| Period 1 · 12 months | 46,000,000 | 552,000,000 | 5 GiB | 60 GiB-months |

Each period is taken at its **busiest month**, rounded **up** to whole billing units — 100,000
messages, 1 GiB — and multiplied by its months. So the figures are never below what the fleet will
use, which is the safe side for a commit-to-consume contract.

Below it, **Deployment & add-ons** lists every deployment, add-on and support line you stated on the
Contract & deployment step, per period — the quantities the account team prices beside messages and
storage.

**Download Excel workbook** carries the same quantities in a Quote sheet laid out like the Sales
Configurator, with an empty price column: send it to your account team, who price it. It is safe to
email — it contains no prices.

**Expert mode**, in the header, shows how the figures were reached: the nine Configurator counters
with copy buttons, the storage breakdown and its range, a diagram of what each machine sends, the
month-by-month volume, and the exact JSON each device should send.

The page is in **English or German**, with a light and a dark theme, switched in the header. The Web
SDK build inside a tenant has no language switch: it follows the language in your Cumulocity
profile.

## Deploy it to a Cumulocity tenant

There are two builds of the same tool. Either one, or both, can be hosted in a tenant:

| | Web SDK build | Standalone build |
|---|---|---|
| What it is | an application inside the Cumulocity shell — the platform's navigator, header, branding, login and language | a self-contained page that draws its own frame |
| Opens at | `/apps/message-calculator/` | `/apps/message-calculator-standalone/` |
| Get the zip | build it: `npm run c8y:build` → `dist-c8y/message-calculator.zip` | download `message-calculator-standalone-<version>.zip` from the [latest release](https://github.com/mstoffel-sag/c8y-message-calculator/releases/latest), or build it: `npm run package` |

**Upload in the browser:** Administration → Ecosystem → Applications → **Add application** →
**Upload web application**, and choose the zip.

**Or from the command line** (Web SDK build), from a checkout of this repository:

```
export PATH="$HOME/.nvm/versions/node/v22.23.2/bin:$PATH"   # Node 20.19 or newer
npm install
npm run c8y:deploy -- -u https://<tenant>.cumulocity.com -U <user>
```

`c8y:deploy` builds and uploads in one go. To update a deployed app, run it again, or upload the
new zip over the existing application.

What a tenant needs to know:

- **The app calls nothing on the platform.** It needs no roles, no microservice and no
  configuration; Cumulocity's own login is what gates access to it.
- **Both builds read the same saved scenarios**, so one started in either is there in the other —
  in the same browser.
- **It contains no prices**, which is what makes it safe to host in a customer's tenant or share
  with a prospect.

## More

- [CONCEPT.md](CONCEPT.md) — the design, and the reasoning behind every rule the tool applies.
- [DEVELOPMENT.md](DEVELOPMENT.md) — building, testing, the code layout, and what is not done yet.
