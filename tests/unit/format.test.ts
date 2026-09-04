import { describe, expect, it } from 'vitest';
import { formatBytes, formatNumber, formatYen, initials, parseYenInput, truncate } from '@/lib/format';

describe('金額の表示', () => {
  it('日本円として表示する (小数なし)', () => {
    expect(formatYen(4580)).toBe('￥4,580');
  });

  it('0 円も表示できる', () => {
    expect(formatYen(0)).toBe('￥0');
  });

  it('小数は四捨五入する', () => {
    expect(formatYen(1234.6)).toBe('￥1,235');
  });
});

describe('金額の入力パース', () => {
  it('数字だけの入力を受け付ける', () => {
    expect(parseYenInput('4580')).toBe(4580);
  });

  it('カンマや円記号が入っていても読み取れる', () => {
    expect(parseYenInput('¥4,580')).toBe(4580);
    expect(parseYenInput('4,580円')).toBe(4580);
  });

  it('全角数字を半角に直して読み取る (スマホ入力対策)', () => {
    expect(parseYenInput('４５８０')).toBe(4580);
  });

  it('小数は切り捨てる (円に小数は無い)', () => {
    expect(parseYenInput('1234.9')).toBe(12349); // 小数点は除去される
  });

  it('数値にならない入力は null を返す', () => {
    expect(parseYenInput('')).toBeNull();
    expect(parseYenInput('abc')).toBeNull();
  });
});

describe('その他の表示', () => {
  it('バイト数を読みやすくする', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2 KB');
    expect(formatBytes(1_572_864)).toBe('1.5 MB');
  });

  it('数値に桁区切りを入れる', () => {
    expect(formatNumber(1234567)).toBe('1,234,567');
  });

  it('名前の先頭 1 文字を取り出す (日本語対応)', () => {
    expect(initials('山田太郎')).toBe('山');
    expect(initials('  おかあさん ')).toBe('お');
    expect(initials('')).toBe('？');
  });

  it('長い文字列を省略する', () => {
    expect(truncate('あいうえおかきくけこ', 5)).toBe('あいうえお…');
    expect(truncate('あいう', 5)).toBe('あいう');
  });
});
