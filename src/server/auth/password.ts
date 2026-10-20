import bcrypt from "bcryptjs";

const ROUNDS = 12;

export async function hashPassword(plain: string): Promise<string> {
  if (plain.length < 8) {
    throw new Error("Пароль должен быть не короче 8 символов");
  }
  return bcrypt.hash(plain, ROUNDS);
}

export async function verifyPassword(
  plain: string,
  passwordHash: string
): Promise<boolean> {
  if (!passwordHash || passwordHash.startsWith("!")) {
    // Запрет placeholder-хешей из старого seed
    return false;
  }
  return bcrypt.compare(plain, passwordHash);
}
