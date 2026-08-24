const ALERT_TYPE_LABEL: Record<string, string> = {
  LOW_FUEL: 'Combustible bajo',
};

/** Human-readable Spanish label for an alert type - falls back to the raw value for types not yet mapped. */
export function alertTypeLabel(type: string): string {
  return ALERT_TYPE_LABEL[type] ?? type;
}

/** Human-readable Spanish label for an alert severity ('CRITICAL' | 'WARNING'). */
export function alertSeverityLabel(severity: string): string {
  return severity === 'CRITICAL' ? 'Crítica' : 'Advertencia';
}
