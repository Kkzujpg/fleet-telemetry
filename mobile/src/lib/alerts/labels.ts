const ALERT_TYPE_LABEL: Record<string, string> = {
  LOW_FUEL: 'Combustible bajo',
};

/** Etiqueta legible en español para un tipo de alerta - recae en el valor crudo para tipos aún no mapeados. */
export function alertTypeLabel(type: string): string {
  return ALERT_TYPE_LABEL[type] ?? type;
}

/** Etiqueta legible en español para una severidad de alerta ('CRITICAL' | 'WARNING'). */
export function alertSeverityLabel(severity: string): string {
  return severity === 'CRITICAL' ? 'Crítica' : 'Advertencia';
}
