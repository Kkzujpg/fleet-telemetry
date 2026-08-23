const THREE_SEGMENT = /^([A-Za-z]+)-([A-Za-z0-9]+)-([A-Za-z0-9]+)$/;

/**
 * Masks a device public id for non-admin roles, e.g. "DEV-0001-XC54" ->
 * "DEV-****-XC54". Keeps the prefix and suffix (useful for support/log
 * correlation) and hides only the sequence segment that identifies the
 * specific vehicle.
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
