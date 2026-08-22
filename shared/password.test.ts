import {
  hashPassword,
  verifyPassword,
  InvalidPasswordHashFormatError,
} from "./password";

describe("hashPassword/verifyPassword", () => {
  test("produces a hash matching the scrypt$N$r$p$salt$hash format", async () => {
    const hash = await hashPassword("correct horse battery staple");

    expect(hash).toMatch(/^scrypt\$\d+\$\d+\$\d+\$[0-9a-f]+\$[0-9a-f]+$/);
  });

  test("verifies a password against its own hash", async () => {
    const hash = await hashPassword("correct horse battery staple");

    await expect(
      verifyPassword("correct horse battery staple", hash),
    ).resolves.toBe(true);
  });

  test("rejects the wrong password", async () => {
    const hash = await hashPassword("correct horse battery staple");

    await expect(verifyPassword("wrong password", hash)).resolves.toBe(false);
  });

  test("produces a different salt (and hash) each time for the same password", async () => {
    const hashA = await hashPassword("same password");
    const hashB = await hashPassword("same password");

    expect(hashA).not.toBe(hashB);
    await expect(verifyPassword("same password", hashA)).resolves.toBe(true);
    await expect(verifyPassword("same password", hashB)).resolves.toBe(true);
  });

  test("rejects a malformed stored hash", async () => {
    await expect(verifyPassword("anything", "not-a-real-hash")).rejects.toThrow(
      InvalidPasswordHashFormatError,
    );
  });
});
