import bcrypt from "bcryptjs";

const ROUNDS = 12;
const MIN_LEN = 10;
const MAX_LEN = 200;

export function assertPasswordPolicy(plain: string): void {
  if (plain.length < MIN_LEN || plain.length > MAX_LEN) {
    throw new Error(`Пароль: от ${MIN_LEN} до ${MAX_LEN} символов`);
  }
  if (!/[A-Za-zА-Яа-я]/.test(plain) || !/[0-9]/.test(plain)) {
    throw new Error("Пароль должен содержать буквы и цифры");
  }
}

export async function hashPassword(plain: string): Promise<string> {
  assertPasswordPolicy(plain);
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
