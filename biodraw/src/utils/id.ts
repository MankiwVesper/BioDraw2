const byteToHex = Array.from({ length: 256 }, (_, index) =>
  index.toString(16).padStart(2, '0'),
);

const createUuidFromBytes = (bytes: Uint8Array) => {
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  return [
    byteToHex[bytes[0]],
    byteToHex[bytes[1]],
    byteToHex[bytes[2]],
    byteToHex[bytes[3]],
    '-',
    byteToHex[bytes[4]],
    byteToHex[bytes[5]],
    '-',
    byteToHex[bytes[6]],
    byteToHex[bytes[7]],
    '-',
    byteToHex[bytes[8]],
    byteToHex[bytes[9]],
    '-',
    byteToHex[bytes[10]],
    byteToHex[bytes[11]],
    byteToHex[bytes[12]],
    byteToHex[bytes[13]],
    byteToHex[bytes[14]],
    byteToHex[bytes[15]],
  ].join('');
};

const createFallbackId = () => {
  const bytes = new Uint8Array(16);
  if (typeof globalThis.crypto?.getRandomValues === 'function') {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  return createUuidFromBytes(bytes);
};

export const createId = () => {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return createFallbackId();
};
