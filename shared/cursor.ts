// Cursor opaco sobre un par (orderKey, id), codificado en base64url para que
// sea seguro como query param en una URL. orderKey debe ser un valor que
// nunca cambie después de crear la fila (ej: createdAt), así el límite de
// una página sigue siendo válido aunque otras columnas de otras filas
// cambien por debajo.
export interface Cursor {
  orderKey: string;
  id: string;
}

export function encodeCursor(cursor: Cursor): string {
  return Buffer.from(`${cursor.orderKey}|${cursor.id}`, "utf8").toString(
    "base64url",
  );
}

export function decodeCursor(raw: string): Cursor {
  let decoded: string;
  try {
    decoded = Buffer.from(raw, "base64url").toString("utf8");
  } catch {
    throw new Error("cursor inválido: base64url no válido");
  }

  const sepIndex = decoded.indexOf("|");
  if (sepIndex === -1) {
    throw new Error("cursor inválido: falta separador");
  }

  const orderKey = decoded.slice(0, sepIndex);
  const id = decoded.slice(sepIndex + 1);
  if (!orderKey || !id) {
    throw new Error("cursor inválido: orderKey o id vacío");
  }

  return { orderKey, id };
}
