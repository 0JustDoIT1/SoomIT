import { describe, expect, it } from "vitest";

import { multipartBoundary, parseDicomMultipart, sopUidFromContentLocation } from "./dicom-multipart";

const encoder = new TextEncoder();

describe("DICOM multipart parsing", () => {
  it("extracts binary DICOM parts and their SOP Instance locations", () => {
    const boundary = "dicom-boundary";
    const first = new Uint8Array([0, 1, 2, 255]);
    const second = new Uint8Array([9, 8, 7]);
    const chunks = [
      encoder.encode(`--${boundary}\r\nContent-Type: application/dicom\r\nContent-Location: /instances/1.2.3\r\n\r\n`),
      first,
      encoder.encode(`\r\n--${boundary}\r\nContent-Type: application/dicom\r\nContent-Location: /instances/1.2.4\r\n\r\n`),
      second,
      encoder.encode(`\r\n--${boundary}--\r\n`),
    ];
    const size = chunks.reduce((total, chunk) => total + chunk.length, 0);
    const body = new Uint8Array(size);
    let offset = 0;
    chunks.forEach((chunk) => { body.set(chunk, offset); offset += chunk.length; });

    const parts = parseDicomMultipart(body.buffer, `multipart/related; type="application/dicom"; boundary="${boundary}"`);

    expect(parts.map((part) => Array.from(part.bytes))).toEqual([Array.from(first), Array.from(second)]);
    expect(parts.map((part) => sopUidFromContentLocation(part.contentLocation))).toEqual(["1.2.3", "1.2.4"]);
  });

  it("rejects a response without a boundary", () => {
    expect(() => multipartBoundary("application/dicom")).toThrow(/boundary/);
  });
});
