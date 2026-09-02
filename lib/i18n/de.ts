/**
 * German.
 *
 * Typed as `Record<Key, string>` against `en.ts`, so this file cannot fall
 * behind English without the build saying so.
 *
 * The vocabulary follows Cumulocity's own German terms where it has them --
 * Messung, Messtyp, Ereignis, Alarm, Inventar, Operation -- and keeps the
 * English word where translating it would hide what the platform calls the
 * thing: Managed Object, Fragment, commit-to-consume, Sales Configurator. The
 * teaching prose is argued rather than announced in English, and is translated
 * that way rather than flattened into instructions.
 */

import type { Key } from './en.js';

export const de: Record<Key, string> = {
  /* ------------------------------------------------------- app chrome */
  'app.tagline': 'Nachrichtenrechner — eine Mengenschätzung, niemals ein Angebot',
  'app.scenarioName': 'Name des Szenarios',
  'app.stat.peakMonth': 'Nachrichten / Spitzenmonat',
  'app.stat.vsUnbundled': 'gegenüber ungebündelt',
  'app.stat.findings': 'Hinweise',
  'app.stat.toFix': '{count} zu klären',
  'app.expert': 'Expertenmodus',
  'app.expert.title': 'Zeigt die rohen JSON-Payloads für alle, die den Gerätecode schreiben.',
  'app.language': 'Sprache',

  'nav.back': 'Zurück',
  'nav.progress': 'Schritt {step} von {total}',
  'nav.loadExample': 'Beispiel laden',
  'nav.reset': 'Zurücksetzen',
  'io.import': 'Importieren',
  'io.export': 'Szenario exportieren',
  'io.unreadable': 'Diese Datei ist kein Szenario, das dieses Werkzeug lesen kann.',

  /* ------------------------------------------------------- the wizard */
  'steps.fleet.title': 'Maschinen',
  'steps.fleet.lead': 'Welche Maschinentypen gibt es, und wie viele von jedem?',
  'steps.series.title': 'Messungen',
  'steps.series.lead': 'Was misst jede Maschine, und wie oft?',
  'steps.discrete.title': 'Ereignisse, Alarme, Inventar & Befehle',
  'steps.discrete.lead':
    'Was meldet eine Maschine sonst, was ist einfach wahr über sie, und was wird an sie zurückgesendet?',
  'steps.contract.title': 'Vertrag & Deployment',
  'steps.contract.lead':
    'Wie lang jede Periode ist, wie der Maschinenpark über sie hochläuft, und was in jeder ausgerollt wird.',
  'steps.results.title': 'Ergebnisse',
  'steps.results.lead': 'Nachrichten pro Kalendermonat, und wohin jede Zahl gehört.',

  /* ------------------------------------------------- shared controls */
  'copy.done': 'Kopiert',
  'copy.blocked': 'Blockiert',
  'copy.refused': 'Der Browser hat die Zwischenablage verweigert',
  'choice.other': 'Andere…',
  'every.prefix': 'alle',

  /* --------------------------------------------------------- numbers */
  'format.thousand': 'Tsd.',
  'format.million': 'Mio.',
  'format.billion': 'Mrd.',
  'format.interval': 'alle {duration}',

  /* ----------------------------------------------------------- units */
  'unit.ms.one': 'ms',
  'unit.ms.other': 'ms',
  'unit.s.one': 's',
  'unit.s.other': 's',
  'unit.min.one': 'min',
  'unit.min.other': 'min',
  'unit.h.one': 'h',
  'unit.h.other': 'h',
  'unit.day.one': 'Tag',
  'unit.day.other': 'Tage',
  'unit.week.one': 'Woche',
  'unit.week.other': 'Wochen',
  'unit.month.one': 'Monat',
  'unit.month.other': 'Monate',
  'unit.year.one': 'Jahr',
  'unit.year.other': 'Jahre',

  /* ------------------------------------------------- the metric kinds */
  'kind.continuous.one': 'Zeitreihe',
  'kind.continuous.other': 'Zeitreihen',
  'kind.state.one': 'Änderungsserie',
  'kind.state.other': 'Änderungsserien',
  'kind.occurrence.one': 'Ereignis',
  'kind.occurrence.other': 'Ereignisse',
  'kind.condition.one': 'Alarm',
  'kind.condition.other': 'Alarme',
  'kind.inventory.one': 'Inventareintrag',
  'kind.inventory.other': 'Inventareinträge',
  'kind.command.one': 'Befehl',
  'kind.command.other': 'Befehle',
  'measurementType.one': 'Messtyp',
  'measurementType.other': 'Messtypen',

  /* -------------------------------------- machine-type presets */
  'preset.hvac.blurb': 'Vier Klimawerte auf einem Takt, zwei Zustände, die stundenlang stillstehen.',
  'preset.meter.blurb': 'Zählerstände im 15-Minuten-Intervall; fast nichts sonst.',
  'preset.tracker.blurb': 'Position und Batterie gemeinsam; Bewegungsbeginn und -ende als Ereignisse.',
  'preset.gateway.blurb': 'Bündelt eine Linie und leitet eine Zusammenfassung weiter — der größte Mengenhebel, den es gibt.',
  'preset.machine.blurb': 'Schnelle Prozesswerte, ein Schichtzustand, und Alarme, auf die ein Bediener reagieren muss.',

  /* ----------------------------------------------------- fleet */
  'fleet.teach.title': 'Bei den Maschinen anfangen, nicht bei den Daten',
  'fleet.teach.body': 'Ein **Maschinentyp** ist eine Gruppe von Maschinen, die sich gleich verhalten — gleiche Sensoren, gleiche Firmware, gleiche Meldungen. Jede Maschine eines Typs erzeugt identischen Verkehr, also skaliert die gesamte Schätzung über die Anzahl.\n\nNur dort in eigene Typen aufteilen, wo sich die *Daten* unterscheiden. Zweihundert Pumpen in Hamburg und zweihundert in Lissabon sind ein Typ; eine Pumpe und ein Gateway sind zwei.',
  'fleet.empty': 'Fügen Sie unten einen Maschinentyp hinzu, um zu beginnen.',
  'fleet.col.type': 'Maschinentyp',
  'fleet.col.talks': 'Spricht',
  'fleet.col.count': 'Wie viele',
  'fleet.col.online': 'Online %',
  'fleet.namePlaceholder': 'Dach-Klimagerät',
  'fleet.nothingModelled': 'noch nichts modelliert',
  'fleet.protocolPlaceholder': 'Protokoll benennen',
  'fleet.protocolOther': 'Etwas anderes…',
  'fleet.online.title': 'Einschaltdauer oder Verfügbarkeit der Verbindung. Eine Maschine, die offline ist, sendet nichts.',
  'fleet.remove': 'Entfernen',
  'fleet.total.one': '{count} Typ',
  'fleet.total.other': '{count} Typen',
  'fleet.add': 'Hinzufügen',
  'fleet.addBlank': 'Leerer Maschinentyp',
  'fleet.presetNote': 'Vorlagen kommen vollständig modelliert und sind zum Bearbeiten gedacht — jede ist so gebaut, wie dieses Werkzeug es empfiehlt, ein Start von einer Vorlage ist also ein Start mit einem guten Entwurf.',

  /* ------------ platform elements, and the machine-type header */
  'element.measurements': 'Messungen',
  'element.events': 'Ereignisse',
  'element.alarms': 'Alarme',
  'element.inventory': 'Inventar',
  'element.operations': 'Operationen',
  'machine.unnamed': 'Unbenannter Maschinentyp',
  'machine.machines': '{count} Maschinen',
  'machine.onlinePct': '{pct} % online',
  'machine.none': 'keine',
  'machine.nothingModelled': 'noch nichts modelliert',
  'machine.messagesPerMonth': 'Nachrichten / Monat',
  'machine.perMachine': '{count} pro Maschine',
  'machine.intervals': '{count} Intervalle',

  /* --------------------------------- events, alarms, inventory */
  'discrete.teach.title': 'Vier verschiedene Dinge, und der Unterschied zählt',
  'discrete.teach.body': 'Alles bisher war eine Zahl über die Zeit. Was bleibt, ist alles Übrige, das zwischen einer Maschine und Cumulocity unterwegs ist: drei Orte für das, was die Maschine meldet, und einer für das, was an sie zurückgesendet wird. Den falschen zu wählen ist keine Feinheit der Modellierung — es verändert, was Sie später mit den Daten tun können, und es verändert, was Sie zahlen.\n\nDie Ein-Satz-Probe: **ein Ereignis ist etwas, das passiert ist**, **ein Alarm ist etwas, das nicht stimmt**, **Inventar ist etwas, das jetzt über die Maschine wahr ist**, und **ein Befehl ist etwas, das die Maschine tun soll**.',
  'discrete.none': 'Keine.',
  'discrete.occurrence.heading': 'Ereignisse',
  'discrete.occurrence.element': 'Ereignis',
  'discrete.occurrence.question': 'Etwas ist passiert, das festgehalten werden soll, und niemand muss handeln.',
  'discrete.occurrence.rate': 'Pro Maschine / Tag',
  'discrete.occurrence.placeholder': 'Tür geöffnet',
  'discrete.occurrence.add': '+ Ereignis',
  'discrete.occurrence.teach': 'Ein Ereignis ist eine **nicht numerische** Sache, die passiert ist, mit einem Zeitstempel: eine Tür wurde geöffnet, eine Fahrt hat begonnen, ein Service wurde durchgeführt, eine Anmeldung erfolgte. Ein `POST`, eine Nachricht.\n\n**Keine Zahlen in Ereignisse packen.** Ein Wert, der im Rumpf eines Ereignisses steckt, lässt sich nicht so aggregieren, zeichnen oder abfragen wie eine Serie. Wenn es eine Zahl ist, die Sie darstellen wollen, ist es eine Serie — gehen Sie einen Schritt zurück.',
  'discrete.condition.heading': 'Alarme',
  'discrete.condition.element': 'Alarm',
  'discrete.condition.question': 'Etwas stimmt nicht, und jemand muss handeln.',
  'discrete.condition.rate': 'Auslösungen / Maschine / Tag',
  'discrete.condition.placeholder': 'Filter verstopft',
  'discrete.condition.add': '+ Alarm',
  'discrete.condition.teach': 'Ein Alarm ist ein **Zustand mit Lebenszyklus**, keine Benachrichtigung. Er wird ausgelöst, bleibt aktiv, solange die Bedingung anhält, und wird aufgehoben, wenn sie endet.\n\n**Das sind zwei Nachrichten pro Vorfall, nicht eine:** die Auslösung zählt als Alarms Created, die Aufhebung als Alarms Updated. Das Werkzeug zählt beide automatisch.\n\nEinen Alarmtyp auszulösen, der *bereits aktiv* ist, erzeugt keinen zweiten Alarm — Cumulocity aktualisiert den bestehenden, was trotzdem zählt. Ein Gerät, das denselben Alarm jede Minute erneut auslöst, während eine Störung anhält, zahlt jede Minute und sagt einem Bediener nichts Neues. Wenn Sie „das ist wieder passiert“ meinen, ist das ein Ereignis.',
  'discrete.inventory.heading': 'Inventar — was die Maschine jetzt ist',
  'discrete.inventory.element': 'Inventar',
  'discrete.inventory.question': 'Etwas, das einfach über die Maschine wahr ist, und kein Messwert über die Zeit.',
  'discrete.inventory.rate': 'Änderungen',
  'discrete.inventory.placeholder': 'Firmware-Version',
  'discrete.inventory.add': '+ Inventareintrag',
  'discrete.inventory.teach': 'Das Managed Object ist der Ort für den **aktuellen Zustand** einer Maschine: Firmware-Version, Seriennummer, Konfiguration, Standort, zu welcher Anlage sie gehört. Es zu schreiben ist ein `PUT`, und ein `PUT` zählt genau wie ein `POST`.\n\n**Inventar ist kein Zeitreihenspeicher.** Einen sich ändernden Wert hier zu schreiben kostet jedes Mal, überschreibt das Vorhandene und lässt nichts zum Darstellen übrig. Wenn er sich ändert und die Historie zählt, ist es eine Serie.\n\n**Die teure Gewohnheit:** die Plattform vergleicht keine Payloads, ein erfolgreicher Schreibvorgang, der nichts ändert, zählt also trotzdem. Firmware, die ihr ganzes Managed Object bei jedem Start oder auf einem Heartbeat erneut sendet, zahlt für jeden dieser Schreibvorgänge und speichert keine neue Information. Kreuzen Sie das Feld unten an, wenn Ihre Geräte das tun — es ist die häufigste unsichtbare Position in einem echten Tenant, und im Gerätecode vollständig behebbar.',
  'discrete.inventory.registrationNote': 'Eine Maschine erstmals zu registrieren ist **Inventories Created**, einmal pro Maschine aus Ihren Rollout-Zahlen gezählt. Hier geben Sie das nicht ein.',
  'discrete.inventory.timerColumn': 'Auf einem Timer gesendet?',
  'discrete.inventory.timerLabel': 'auch unverändert erneut gesendet',
  'discrete.chooseOne': 'Eines wählen…',
  'discrete.perMachineMonth': '{count} pro Maschine in einem 31-Tage-Monat',

  /* ------------------------------------- shared wizard strings */
  'wizard.addMachineFirst': 'Fügen Sie zuerst einen Maschinentyp hinzu.',

  /* ----------------------------------- dropdown group headings */
  'group.access': 'Zugang',
  'group.buildingAndMetering': 'Gebäude und Zählung',
  'group.climate': 'Klima',
  'group.configuration': 'Konfiguration',
  'group.connectivity': 'Konnektivität',
  'group.control': 'Steuerung',
  'group.deviceHealth': 'Gerätezustand',
  'group.diagnostics': 'Diagnose',
  'group.electrical': 'Elektrik',
  'group.fault': 'Störung',
  'group.general': 'Allgemein',
  'group.identity': 'Identität',
  'group.lifecycle': 'Lebenszyklus',
  'group.lowPowerWan': 'Low-Power-WAN',
  'group.maintenance': 'Wartung',
  'group.mechanical': 'Mechanik',
  'group.movement': 'Bewegung',
  'group.physical': 'Physikalisch',
  'group.position': 'Position',
  'group.process': 'Prozess',
  'group.production': 'Produktion',
  'group.security': 'Sicherheit',
  'group.shopFloor': 'Fertigung',
  'group.somethingElse': 'Etwas anderes',
  'group.status': 'Status',
  'group.straightToCumulocity': 'Direkt zu Cumulocity',
  'protocol.undecided': 'Noch nicht entschieden',

  /* -------------------------------- command status transitions */
  'transitions.0': 'keine gemeldet — 1 Nachricht pro Befehl',
  'transitions.1': '1 — nur SUCCESSFUL — 2 Nachrichten',
  'transitions.2': '2 — EXECUTING, SUCCESSFUL — 3 Nachrichten',
  'transitions.3': '3 — PENDING, EXECUTING, SUCCESSFUL — 4 Nachrichten',
  'transitions.4': '4 — mit Wiederholung oder Fehlschlag — 5 Nachrichten',
  'transitions.6': '6 — Fortschritt über den Status gemeldet — 7 Nachrichten',
  'transitions.10': '10 — feingranularer Fortschritt — 11 Nachrichten',

  /* -------------------------------------------------- commands */
  'commands.heading': 'Befehle',
  'commands.element': 'Operation',
  'commands.teach.title': 'Dieser läuft nach außen, und er kostet mehr, als er aussieht',
  'commands.teach.body': 'Alles darüber ist die Maschine, die mit Cumulocity spricht. Eine **Operation** geht den anderen Weg: ein Firmware-Update, eine Konfiguration, ein Neustart, eine Sollwertänderung.\n\n**Ein Befehl ist nicht eine Nachricht.** Das Anlegen der Operation zählt, und dann zählt jeder Status, den das Gerät zurückmeldet, ebenfalls — `PENDING`, `EXECUTING`, `SUCCESSFUL` sind drei weitere. Ein einzelner Befehl sind realistisch **drei oder vier Nachrichten**, weshalb eine Schätzung, die eine Firmware-Kampagne als eine Nachricht pro Maschine modelliert, um den Faktor vier daneben liegt.\n\nWenn Ihr Gerät feingranularen Fortschritt über den Operationsstatus meldet, zählen Sie diesen mit. Dieses Muster wird schnell teuer, und Fortschritt gehört meist in ein Ereignis.',
  'commands.add': '+ Befehl',
  'commands.none': 'Keine. Wenn Cumulocity nie etwas an diese Maschinen sendet, ist das eine legitime Antwort — aber Firmware-Updates zählen, und die hat fast jeder Maschinenpark.',
  'commands.col.command': 'Befehl',
  'commands.col.howOften': 'Wie oft',
  'commands.col.transitions': 'Zurückgemeldete Statusübergänge',
  'commands.col.each': 'Nachrichten je',
  'commands.namePlaceholder': 'Selbst benennen',
  'commands.chooseOne': 'Einen Befehl wählen…',
  'commands.perMachineMonth': '{count} pro Maschine / Monat',
  'commands.breakdown': '1 Anlegen + {count} Aktualisierungen',
  'commands.transitionsSuffix': 'Übergänge',

  /* ----------------------------- contract periods and the ramp */
  'contract.ramp.heading': 'Perioden und Hochlauf',
  'contract.ramp.sub': 'Monate → D21 · Maschinen pro Periode',
  'contract.teach.title': 'Die Abrechnung läuft auf echten Kalendermonaten',
  'contract.teach.body': 'Februar hat 28 Tage und Januar 31 — ein **Unterschied von 11 %** an Nachrichten für einen Maschinenpark, der genau dasselbe tut. Das Werkzeug rechnet mit echten Monatslängen, statt sie wegzumitteln, und nennt eine Spanne mit dem Spitzenmonat. Eine einzelne Zahl wäre elf von zwölf Monaten falsch.\n\n**Die Registrierung folgt aus dem Hochlauf.** Jede Periode trägt *Inventories Created* nur für die Maschinen bei, die sie *hinzufügt*, einmalig, in ihrem ersten Monat. Eine Periode, die niemanden hinzufügt, registriert niemanden — das Onboarding in die monatliche Rate zu packen überschätzt jede spätere Periode.',
  'contract.rampStarts': 'Hochlauf beginnt',
  'contract.year': 'Jahr',
  'contract.retention': 'Daten aufbewahrt',
  'contract.retention.suffix': 'Tage',
  'contract.retention.title': 'Tage, die die Aufbewahrungsregeln des Tenants die Daten halten. Bestimmt die Schätzung des operativen Speichers im Schritt Ergebnisse; die Zahl der Nachrichten ändert sich dadurch nicht.',
  'contract.bytesPerValue': 'Bytes / Wert',
  'contract.bytesPerValue.title': 'Bytes pro gespeicherten Wert, für die Speicherzahl in der ODS-Zelle des Configurators. Die Belege sagen 100-400 B und sind unbestätigt, deshalb zeigen der Schritt Ergebnisse und die Arbeitsmappe immer die ganze Spanne neben dem hier eingestellten Wert.',
  'contract.col.period': 'Periode',
  'contract.col.months': 'Monate',
  'contract.periodN': 'Periode {index}',
  'contract.remove': 'Entfernen',
  'contract.addPeriod': 'Periode hinzufügen',
  'contract.addPeriod.hint': 'Der Configurator erlaubt fünf. Ein Vertrag verlängert sich automatisch um 12 Monate, wenn er ohne neue Vereinbarung endet, und nicht verbrauchte Verpflichtung verfällt, statt übertragen zu werden.',

  /* -------------------------------------------- unnamed things */
  'machine.unnamedShort': 'Unbenannt',

  /* ------------------------------------ deployment and add-ons */
  'deployment.heading': 'Deployment & Add-ons',
  'deployment.sub': 'Eine Spalte pro Periode → Configurator-Zeilen 23–26',
  'deployment.teach.title': 'Die Teile des Angebots, die der Maschinenpark nicht verrät',
  'deployment.teach.body': 'Das Nachrichtenvolumen kommt aus den Maschinen. Alles in diesem Abschnitt nicht: wie viele Deployments, welche Add-ons, wie viele Tenants. Irgendwer muss sie nennen, also fragt der Assistent, statt zu raten.\n\nCumulocity wird **commit-to-consume** verkauft. Ein Kunde verpflichtet sich auf einen Betrag, nicht auf Mengen — es gibt keine Stückliste, die Nutzung wird täglich gemessen und gegen die Verpflichtung verrechnet. Nichts hier ist also eine Bestellung; es ist die Form der Schätzung.\n\n**Dieses Werkzeug zeigt keine Preise.** Es sammelt die Mengen und nennt Ihnen die Zelle, in die jede gehört. Was sie kosten, ist die Aufgabe des Sales Configurators.',
  'deployment.col.item': 'Position',
  'deployment.col.unit': 'Einheit',
  'deployment.copyAcross': 'Periode 1 in alle Perioden kopieren',
  'deployment.copyAcross.hint': 'Die meisten Angebote wiederholen dasselbe Deployment in jeder Periode; hochlaufen tut der Maschinenpark.',
  'deployment.notAsked': '**Absichtlich nicht gefragt:** Rabatte, Währung, Mindestverpflichtungen und Genehmigungsschwellen. Die stehen im Configurator und haben in einem Werkzeug, das einem Kunden gezeigt werden kann, nichts zu suchen.',
  'deployment.yes': 'Ja',
  'deployment.no': 'Nein',
  'deployment.estimate': 'Schätzung {value} GiB',
  'deployment.estimatedAt': 'geschätzt mit {bytes} B / Wert · {low}–{high} GiB über die Spanne',
};
