// Opaque cursor over an (orderKey, id) pair, base64url-encoded so it's
// URL-safe as a query param. orderKey must be a value that never changes
// after the row is created (e.g. createdAt), so a page boundary stays valid
// even while unrelated columns on other rows keep changing underneath it.
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
    throw new Error("invalid cursor: not valid base64url");
  }

  const sepIndex = decoded.indexOf("|");
  if (sepIndex === -1) {
    throw new Error("invalid cursor: missing separator");
  }

  const orderKey = decoded.slice(0, sepIndex);
  const id = decoded.slice(sepIndex + 1);
  if (!orderKey || !id) {
    throw new Error("invalid cursor: empty orderKey or id");
  }

  return { orderKey, id };
}
