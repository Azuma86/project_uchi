/**
 * 最小限の EXIF 読み取り (撮影日時のみ)。
 *
 * なぜ自前で書くか:
 *   ライブラリを入れるとバンドルが増える。必要なのは「撮影日時」だけなので、
 *   JPEG の APP1 セグメントから DateTimeOriginal を読むだけの実装で足りる。
 *
 * プライバシー上の注意:
 *   EXIF には GPS 座標や端末情報が含まれることがある。
 *   このアプリでは Canvas で再エンコードするため、アップロードされる画像から
 *   EXIF はすべて失われる (= 位置情報が家族外へ出る心配がない)。
 *   撮影日時だけは失いたくないので、変換前にここで読み出して
 *   Firestore の takenAt に保存する。
 */

/** JPEG の先頭からこのバイト数だけ読めば EXIF ヘッダは通常見つかる */
const HEADER_BYTES = 256 * 1024;

export async function readExifDateTaken(file: File): Promise<Date | null> {
  if (!file.type.includes('jpeg') && !file.type.includes('jpg')) return null;

  try {
    const buffer = await file.slice(0, Math.min(file.size, HEADER_BYTES)).arrayBuffer();
    const view = new DataView(buffer);
    if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) return null; // SOI ではない

    let offset = 2;
    while (offset + 4 < view.byteLength) {
      if (view.getUint8(offset) !== 0xff) break;
      const marker = view.getUint8(offset + 1);
      const size = view.getUint16(offset + 2);

      // APP1 (0xFFE1) が Exif を含む
      if (marker === 0xe1) {
        const exifStart = offset + 4;
        if (exifStart + 6 > view.byteLength) return null;
        // "Exif\0\0"
        if (
          view.getUint32(exifStart) !== 0x45786966 ||
          view.getUint16(exifStart + 4) !== 0x0000
        ) {
          return null;
        }
        return parseTiff(view, exifStart + 6);
      }

      if (marker === 0xda) break; // SOS 以降は画像データ
      offset += 2 + size;
    }
    return null;
  } catch {
    return null;
  }
}

function parseTiff(view: DataView, tiffStart: number): Date | null {
  if (tiffStart + 8 > view.byteLength) return null;

  const byteOrder = view.getUint16(tiffStart);
  const littleEndian = byteOrder === 0x4949; // "II"
  if (!littleEndian && byteOrder !== 0x4d4d) return null;
  if (view.getUint16(tiffStart + 2, littleEndian) !== 42) return null;

  const ifd0Offset = view.getUint32(tiffStart + 4, littleEndian);
  const exifIfdOffset = findTagValue(view, tiffStart, tiffStart + ifd0Offset, 0x8769, littleEndian);
  if (exifIfdOffset === null) return null;

  const dateString = readAsciiTag(
    view,
    tiffStart,
    tiffStart + exifIfdOffset,
    0x9003, // DateTimeOriginal
    littleEndian,
  );
  if (!dateString) return null;

  // "2026:09:04 14:30:00" 形式。撮影地のローカル時刻なので JST として解釈する。
  const match = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/.exec(dateString);
  if (!match) return null;
  const [, y, mo, d, h, mi, s] = match;
  const iso = `${y}-${mo}-${d}T${h}:${mi}:${s}+09:00`;
  const parsed = new Date(iso);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function eachEntry(
  view: DataView,
  ifdOffset: number,
  littleEndian: boolean,
  visit: (tag: number, type: number, count: number, valueOffset: number) => boolean,
): void {
  if (ifdOffset + 2 > view.byteLength) return;
  const entries = view.getUint16(ifdOffset, littleEndian);
  for (let i = 0; i < entries; i += 1) {
    const entry = ifdOffset + 2 + i * 12;
    if (entry + 12 > view.byteLength) return;
    const tag = view.getUint16(entry, littleEndian);
    const type = view.getUint16(entry + 2, littleEndian);
    const count = view.getUint32(entry + 4, littleEndian);
    if (visit(tag, type, count, entry + 8)) return;
  }
}

function findTagValue(
  view: DataView,
  _tiffStart: number,
  ifdOffset: number,
  tag: number,
  littleEndian: boolean,
): number | null {
  let result: number | null = null;
  eachEntry(view, ifdOffset, littleEndian, (entryTag, _type, _count, valueOffset) => {
    if (entryTag === tag) {
      result = view.getUint32(valueOffset, littleEndian);
      return true;
    }
    return false;
  });
  return result;
}

function readAsciiTag(
  view: DataView,
  tiffStart: number,
  ifdOffset: number,
  tag: number,
  littleEndian: boolean,
): string | null {
  let result: string | null = null;
  eachEntry(view, ifdOffset, littleEndian, (entryTag, type, count, valueOffset) => {
    if (entryTag !== tag || type !== 2) return false;
    // 4 バイトを超える値は「オフセット」が入っている
    const dataOffset =
      count <= 4 ? valueOffset : tiffStart + view.getUint32(valueOffset, littleEndian);
    if (dataOffset + count > view.byteLength) return true;
    let text = '';
    for (let i = 0; i < count - 1; i += 1) {
      text += String.fromCharCode(view.getUint8(dataOffset + i));
    }
    result = text;
    return true;
  });
  return result;
}
