import { randomInt } from 'node:crypto';

/**
 * 招待コードの生成。
 *
 * - 紛らわしい文字 (0/O, 1/I/L) を除いた 32 文字の英数字を使う。
 *   家族に口頭で伝えることを想定しているため。
 * - 10 桁 = 32^10 ≈ 1.1 × 10^15 通り。総当たりは現実的でない。
 * - Math.random() ではなく crypto の乱数を使う (予測困難性のため)。
 */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 10;

export function generateInviteCode(): string {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i += 1) {
    code += ALPHABET[randomInt(0, ALPHABET.length)];
  }
  return code;
}

/** 招待コードの既定の有効期限 (7日) */
export const INVITE_CODE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function normalizeInviteCode(input: string): string {
  return input.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}
