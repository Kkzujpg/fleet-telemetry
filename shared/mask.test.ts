import { maskDeviceId } from "./mask";

describe("maskDeviceId", () => {
  test("enmascara el segmento de secuencia de un id de 3 segmentos", () => {
    expect(maskDeviceId("DEV-0001-XC54")).toBe("DEV-****-XC54");
  });

  test("preserva el largo del segmento enmascarado", () => {
    expect(maskDeviceId("DEV-12-XC54")).toBe("DEV-**-XC54");
  });

  test("recurre a enmascarar el centro cuando el formato no tiene 3 segmentos", () => {
    expect(maskDeviceId("ABCDEFGH")).toBe("AB****GH");
  });

  test("enmascara por completo un id demasiado corto para preservar bordes", () => {
    expect(maskDeviceId("AB12")).toBe("****");
  });
});
