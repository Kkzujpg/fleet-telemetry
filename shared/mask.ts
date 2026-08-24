const THREE_SEGMENT = /^([A-Za-z]+)-([A-Za-z0-9]+)-([A-Za-z0-9]+)$/;

/**
 * Enmascara el publicId de un device para roles no-admin, ej: "DEV-0001-XC54"
 * -> "DEV-****-XC54". Conserva prefijo y sufijo (útil para correlacionar en
 * soporte/logs) y oculta solo el segmento de secuencia que identifica al
 * vehículo específico. Requisito de privacidad de la prueba técnica: el
 * enmascarado se aplica en servidor (MaskingInterceptor + rooms de WS), nunca
 * en el cliente.
 */
export function maskDeviceId(publicId: string): string {
  const match = THREE_SEGMENT.exec(publicId);
  if (match) {
    const [, prefix, middle, suffix] = match;
    return `${prefix}-${"*".repeat(middle.length)}-${suffix}`;
  }

  if (publicId.length <= 4) {
    return "*".repeat(publicId.length);
  }

  return `${publicId.slice(0, 2)}${"*".repeat(publicId.length - 4)}${publicId.slice(-2)}`;
}
