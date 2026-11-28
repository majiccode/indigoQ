export function parseHexBytes(input: string): Uint8Array<ArrayBuffer> {
  const hex = input.replace(/\s/g, "");
  if (!hex || !/^(?:[0-9a-fA-F]{2})+$/.test(hex)) throw new Error("Enter complete hexadecimal byte pairs, for example DE AD BE EF");
  return new Uint8Array(hex.match(/.{2}/g)!.map((byte) => Number.parseInt(byte, 16)));
}

export function transferBytes(data: DataView): Uint8Array {
  return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
}
