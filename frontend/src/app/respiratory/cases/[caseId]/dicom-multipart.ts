export type DicomMultipartPart = {
  bytes: Uint8Array;
  contentLocation: string | null;
};

const encoder = new TextEncoder();
const decoder = new TextDecoder("ascii");

function findBytes(source: Uint8Array, target: Uint8Array, from = 0): number {
  outer: for (let index = from; index <= source.length - target.length; index += 1) {
    for (let offset = 0; offset < target.length; offset += 1) {
      if (source[index + offset] !== target[offset]) continue outer;
    }
    return index;
  }
  return -1;
}

export function multipartBoundary(contentType: string): string {
  const match = contentType.match(/boundary\s*=\s*(?:"([^"]+)"|([^;\s]+))/i);
  const boundary = (match?.[1] ?? match?.[2] ?? "").trim();
  if (!boundary) throw new Error("DICOM Series multipart boundary가 없습니다.");
  return boundary;
}

export function parseDicomMultipart(buffer: ArrayBuffer, contentType: string): DicomMultipartPart[] {
  const source = new Uint8Array(buffer);
  const marker = encoder.encode(`--${multipartBoundary(contentType)}`);
  const markerWithPrefix = new Uint8Array([13, 10, ...marker]);
  const headerSeparator = new Uint8Array([13, 10, 13, 10]);
  const parts: DicomMultipartPart[] = [];
  let markerIndex = findBytes(source, marker);

  while (markerIndex >= 0) {
    let cursor = markerIndex + marker.length;
    if (source[cursor] === 45 && source[cursor + 1] === 45) break;
    if (source[cursor] === 13 && source[cursor + 1] === 10) cursor += 2;
    const headerEnd = findBytes(source, headerSeparator, cursor);
    if (headerEnd < 0) throw new Error("DICOM Series multipart header가 올바르지 않습니다.");
    const bodyStart = headerEnd + headerSeparator.length;
    const nextMarkerWithPrefix = findBytes(source, markerWithPrefix, bodyStart);
    if (nextMarkerWithPrefix < 0) throw new Error("DICOM Series multipart 종료 경계를 찾지 못했습니다.");
    const headerText = decoder.decode(source.subarray(cursor, headerEnd));
    const locationMatch = headerText.match(/^Content-Location:\s*(.+)$/im);
    parts.push({
      bytes: source.slice(bodyStart, nextMarkerWithPrefix),
      contentLocation: locationMatch?.[1]?.trim() ?? null,
    });
    markerIndex = nextMarkerWithPrefix + 2;
  }

  if (!parts.length) throw new Error("DICOM Series multipart에 Instance가 없습니다.");
  return parts;
}

export function sopUidFromContentLocation(location: string | null): string | null {
  if (!location) return null;
  const match = location.match(/\/instances\/([^/?#]+)/i);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}
