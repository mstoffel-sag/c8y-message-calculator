/**
 * What the wizard offers in its dropdowns.
 *
 * A guided wizard should not hand a customer an empty number box. CONCEPT.md
 * section 10 names "garbage in" as the first risk: customers do not know their
 * change rates, and they certainly do not know their command transition counts.
 * A list of plausible values with the consequence spelled out in the label is
 * the cheapest mitigation there is -- and it makes two people modelling the
 * same fleet agree, which a free-text box never does.
 *
 * Every list stays open: the control that renders these always offers "Other",
 * because a catalogue that cannot be escaped is worse than no catalogue.
 */

export interface Choice<T> {
  value: T;
  label: string;
  /** Optional group heading, rendered as an optgroup. */
  group?: string;
}

/* -------------------------------------------------------------- protocols */

/**
 * How a machine's data reaches Cumulocity.
 *
 * None of these changes the message count -- a message is one request to the
 * platform however the reading was produced -- so the field is descriptive, and
 * the tool does not pretend otherwise by attaching a multiplier to it. It is
 * asked because it is the first thing the solution architect reading the
 * finished workbook wants to know, and because one answer carries a real
 * consequence: SmartREST's static measurement templates carry one series per
 * row, so bundling several series into one message needs a custom template.
 *
 * Grouped by who does the talking: straight to the platform, through a
 * shop-floor protocol, through building services, or over a low-power network.
 */
export const PROTOCOLS: Array<Choice<string>> = [
  { value: '', label: 'Not decided yet' },

  { value: 'MQTT (Cumulocity SmartREST 2.0)', label: 'MQTT — Cumulocity SmartREST 2.0', group: 'Straight to Cumulocity' },
  { value: 'HTTP / REST (Cumulocity API)', label: 'HTTP / REST — Cumulocity API', group: 'Straight to Cumulocity' },
  { value: 'MQTT (Sparkplug B)', label: 'MQTT — Sparkplug B', group: 'Straight to Cumulocity' },
  { value: 'LwM2M', label: 'LwM2M', group: 'Straight to Cumulocity' },

  { value: 'OPC UA', label: 'OPC UA', group: 'Shop floor' },
  { value: 'Modbus TCP', label: 'Modbus TCP', group: 'Shop floor' },
  { value: 'Modbus RTU', label: 'Modbus RTU (serial)', group: 'Shop floor' },
  { value: 'Siemens S7', label: 'Siemens S7', group: 'Shop floor' },
  { value: 'EtherNet/IP', label: 'EtherNet/IP', group: 'Shop floor' },
  { value: 'PROFINET', label: 'PROFINET', group: 'Shop floor' },
  { value: 'PROFIBUS DP', label: 'PROFIBUS DP', group: 'Shop floor' },
  { value: 'IO-Link', label: 'IO-Link', group: 'Shop floor' },
  { value: 'CAN bus / J1939', label: 'CAN bus / J1939', group: 'Shop floor' },
  { value: 'OPC DA', label: 'OPC DA (legacy)', group: 'Shop floor' },

  { value: 'BACnet/IP', label: 'BACnet/IP', group: 'Building and metering' },
  { value: 'KNX', label: 'KNX', group: 'Building and metering' },
  { value: 'M-Bus', label: 'M-Bus', group: 'Building and metering' },
  { value: 'DLMS/COSEM', label: 'DLMS/COSEM', group: 'Building and metering' },

  { value: 'LoRaWAN', label: 'LoRaWAN', group: 'Low-power WAN' },
  { value: 'NB-IoT / LTE-M', label: 'NB-IoT / LTE-M', group: 'Low-power WAN' },

  { value: 'Custom agent or SDK', label: 'Custom agent or SDK', group: 'Something else' },
  { value: 'File / CSV import', label: 'File / CSV import', group: 'Something else' },
];

/* ------------------------------------------------------------- datapoints */

export interface DatapointSeed {
  name: string;
  unit: string;
  group: string;
  /** A sane starting interval for this kind of reading. */
  seconds?: number;
}

/**
 * Common industrial datapoints. Picking one fills in the unit, because the unit
 * is the part customers leave blank and the part L6 reads.
 */
export const DATAPOINTS: DatapointSeed[] = [
  { name: 'Temperature', unit: 'C', group: 'Climate', seconds: 60 },
  { name: 'Supply air temp', unit: 'C', group: 'Climate', seconds: 60 },
  { name: 'Return air temp', unit: 'C', group: 'Climate', seconds: 60 },
  { name: 'Humidity', unit: '%', group: 'Climate', seconds: 60 },
  { name: 'CO2', unit: 'ppm', group: 'Climate', seconds: 60 },
  { name: 'Air pressure', unit: 'Pa', group: 'Climate', seconds: 60 },

  { name: 'Voltage', unit: 'V', group: 'Electrical', seconds: 900 },
  { name: 'Current', unit: 'A', group: 'Electrical', seconds: 900 },
  { name: 'Active power', unit: 'kW', group: 'Electrical', seconds: 900 },
  { name: 'Active energy import', unit: 'kWh', group: 'Electrical', seconds: 900 },
  { name: 'Active energy export', unit: 'kWh', group: 'Electrical', seconds: 900 },
  { name: 'Power factor', unit: '', group: 'Electrical', seconds: 900 },
  { name: 'Frequency', unit: 'Hz', group: 'Electrical', seconds: 900 },

  { name: 'Spindle speed', unit: 'rpm', group: 'Mechanical', seconds: 10 },
  { name: 'Motor current', unit: 'A', group: 'Mechanical', seconds: 10 },
  { name: 'Vibration', unit: 'mm/s', group: 'Mechanical', seconds: 10 },
  { name: 'Torque', unit: 'Nm', group: 'Mechanical', seconds: 10 },
  { name: 'Runtime hours', unit: 'h', group: 'Mechanical', seconds: 3600 },

  { name: 'Flow rate', unit: 'l/s', group: 'Process', seconds: 60 },
  { name: 'Tank level', unit: '%', group: 'Process', seconds: 300 },
  { name: 'Line pressure', unit: 'bar', group: 'Process', seconds: 60 },
  { name: 'Coolant temp', unit: 'C', group: 'Process', seconds: 10 },
  { name: 'Throughput', unit: 'units/min', group: 'Process', seconds: 60 },
  { name: 'Reject rate', unit: '%', group: 'Process', seconds: 60 },
  { name: 'Cycle time', unit: 's', group: 'Process', seconds: 60 },

  { name: 'Latitude', unit: 'deg', group: 'Position', seconds: 300 },
  { name: 'Longitude', unit: 'deg', group: 'Position', seconds: 300 },
  { name: 'Altitude', unit: 'm', group: 'Position', seconds: 300 },
  { name: 'Speed', unit: 'km/h', group: 'Position', seconds: 300 },
  { name: 'Heading', unit: 'deg', group: 'Position', seconds: 300 },
  { name: 'Odometer', unit: 'km', group: 'Position', seconds: 3600 },

  { name: 'Battery', unit: '%', group: 'Device health', seconds: 300 },
  { name: 'Signal strength', unit: 'dBm', group: 'Device health', seconds: 300 },
  { name: 'CPU load', unit: '%', group: 'Device health', seconds: 300 },
  { name: 'Memory used', unit: '%', group: 'Device health', seconds: 300 },
  { name: 'Disk used', unit: '%', group: 'Device health', seconds: 3600 },
];

/** Values that hold steady and then move. */
export const STATES: DatapointSeed[] = [
  { name: 'On/off', unit: '', group: 'Status' },
  { name: 'Compressor on/off', unit: '', group: 'Status' },
  { name: 'Pump on/off', unit: '', group: 'Status' },
  { name: 'Machine mode', unit: '', group: 'Status' },
  { name: 'Door open/closed', unit: '', group: 'Status' },
  { name: 'Valve position', unit: '', group: 'Status' },
  { name: 'Filter status', unit: '', group: 'Status' },
  { name: 'Uplink state', unit: '', group: 'Connectivity' },
  { name: 'Charging state', unit: '', group: 'Connectivity' },
  { name: 'Occupancy', unit: '', group: 'Status' },
];

export const EVENTS: DatapointSeed[] = [
  { name: 'Door opened', unit: '', group: 'Access' },
  { name: 'Badge scanned', unit: '', group: 'Access' },
  { name: 'Trip started', unit: '', group: 'Movement' },
  { name: 'Trip ended', unit: '', group: 'Movement' },
  { name: 'Geofence entered', unit: '', group: 'Movement' },
  { name: 'Part completed', unit: '', group: 'Production' },
  { name: 'Batch started', unit: '', group: 'Production' },
  { name: 'Service performed', unit: '', group: 'Maintenance' },
  { name: 'Device rebooted', unit: '', group: 'Maintenance' },
  { name: 'Configuration applied', unit: '', group: 'Maintenance' },
];

export const ALARMS: DatapointSeed[] = [
  { name: 'Temperature out of range', unit: '', group: 'Process' },
  { name: 'Pressure out of range', unit: '', group: 'Process' },
  { name: 'Filter blocked', unit: '', group: 'Maintenance' },
  { name: 'Tool wear limit', unit: '', group: 'Maintenance' },
  { name: 'Overdue service', unit: '', group: 'Maintenance' },
  { name: 'Motor overload', unit: '', group: 'Fault' },
  { name: 'Communication lost', unit: '', group: 'Fault' },
  { name: 'Power failure', unit: '', group: 'Fault' },
  { name: 'Tamper detected', unit: '', group: 'Security' },
  { name: 'Geofence breach', unit: '', group: 'Security' },
];

export const INVENTORY: DatapointSeed[] = [
  { name: 'Firmware version', unit: '', group: 'Identity' },
  { name: 'Hardware revision', unit: '', group: 'Identity' },
  { name: 'Serial number', unit: '', group: 'Identity' },
  { name: 'Configuration', unit: '', group: 'Configuration' },
  { name: 'Installed location', unit: '', group: 'Configuration' },
  { name: 'Owning asset', unit: '', group: 'Configuration' },
  { name: 'SIM / connectivity details', unit: '', group: 'Configuration' },
  { name: 'Maintenance due date', unit: '', group: 'Lifecycle' },
  { name: 'Warranty expiry', unit: '', group: 'Lifecycle' },
];

export const COMMANDS: DatapointSeed[] = [
  { name: 'Firmware update', unit: '', group: 'Lifecycle' },
  { name: 'Configuration push', unit: '', group: 'Lifecycle' },
  { name: 'Reboot', unit: '', group: 'Control' },
  { name: 'Setpoint change', unit: '', group: 'Control' },
  { name: 'Recipe change', unit: '', group: 'Control' },
  { name: 'Relay switch', unit: '', group: 'Control' },
  { name: 'Log request', unit: '', group: 'Diagnostics' },
  { name: 'Remote session', unit: '', group: 'Diagnostics' },
];

export function catalogFor(kind: string): DatapointSeed[] {
  switch (kind) {
    case 'continuous': return DATAPOINTS;
    case 'state': return STATES;
    case 'occurrence': return EVENTS;
    case 'condition': return ALARMS;
    case 'inventory': return INVENTORY;
    case 'command': return COMMANDS;
    default: return [];
  }
}

export function seedByName(kind: string, name: string): DatapointSeed | undefined {
  return catalogFor(kind).find((d) => d.name === name);
}

/* -------------------------------------------------------------------- units */

export const UNITS: Array<Choice<string>> = [
  { value: '', label: 'none', group: 'General' },
  { value: 'C', label: 'C — degrees Celsius', group: 'General' },
  { value: '%', label: '% — percent', group: 'General' },
  { value: 'count', label: 'count', group: 'General' },
  { value: 'ppm', label: 'ppm', group: 'General' },

  { value: 'V', label: 'V — volts', group: 'Electrical' },
  { value: 'A', label: 'A — amps', group: 'Electrical' },
  { value: 'kW', label: 'kW — kilowatts', group: 'Electrical' },
  { value: 'kWh', label: 'kWh — kilowatt hours', group: 'Electrical' },
  { value: 'Hz', label: 'Hz — hertz', group: 'Electrical' },

  { value: 'Pa', label: 'Pa — pascals', group: 'Physical' },
  { value: 'bar', label: 'bar', group: 'Physical' },
  { value: 'l/s', label: 'l/s — litres per second', group: 'Physical' },
  { value: 'm3/h', label: 'm³/h — cubic metres per hour', group: 'Physical' },
  { value: 'rpm', label: 'rpm — revolutions per minute', group: 'Physical' },
  { value: 'mm/s', label: 'mm/s — millimetres per second', group: 'Physical' },
  { value: 'Nm', label: 'Nm — newton metres', group: 'Physical' },
  { value: 'km/h', label: 'km/h', group: 'Physical' },
  { value: 'm', label: 'm — metres', group: 'Physical' },
  { value: 'km', label: 'km — kilometres', group: 'Physical' },
  { value: 'deg', label: 'deg — degrees', group: 'Physical' },
  { value: 's', label: 's — seconds', group: 'Physical' },
  { value: 'h', label: 'h — hours', group: 'Physical' },
  { value: 'dBm', label: 'dBm', group: 'Physical' },
  { value: 'units/min', label: 'units/min', group: 'Physical' },
];

/**
 * Operation status transitions. Every one of these is an Operations Updated, so
 * the label states the total rather than leaving the customer to add one.
 */
export const TRANSITIONS: Array<Choice<number>> = [
  { value: 0, label: 'none reported — 1 message per command' },
  { value: 1, label: '1 — SUCCESSFUL only — 2 messages' },
  { value: 2, label: '2 — EXECUTING, SUCCESSFUL — 3 messages' },
  { value: 3, label: '3 — PENDING, EXECUTING, SUCCESSFUL — 4 messages' },
  { value: 4, label: '4 — with a retry or a failure — 5 messages' },
  { value: 6, label: '6 — progress reported through status — 7 messages' },
  { value: 10, label: '10 — fine-grained progress — 11 messages' },
];
