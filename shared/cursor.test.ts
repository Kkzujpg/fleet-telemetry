import { decodeCursor, encodeCursor } from "./cursor";

describe("cursor", () => {
  test("decodeCursor revierte encodeCursor", () => {
    const cursor = { orderKey: "2026-08-23T12:00:00.000Z", id: "abc-123" };
    expect(decodeCursor(encodeCursor(cursor))).toEqual(cursor);
  });

  test("el cursor codificado es url-safe", () => {
    const encoded = encodeCursor({
      orderKey: "2026-08-23T12:00:00.000Z",
      id: "abc-123",
    });
    expect(encoded).not.toMatch(/[+/=]/);
  });

  test("rechaza base64url inválido", () => {
    expect(() => decodeCursor("###")).toThrow(/cursor inválido/);
  });

  test("rechaza un cursor sin separador", () => {
    const noSeparator = Buffer.from("no-separator-here", "utf8").toString(
      "base64url",
    );
    expect(() => decodeCursor(noSeparator)).toThrow(/cursor inválido/);
  });

  test("rechaza orderKey o id vacío", () => {
    const emptyId = Buffer.from("key|", "utf8").toString("base64url");
    expect(() => decodeCursor(emptyId)).toThrow(/cursor inválido/);
  });
});
