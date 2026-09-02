export type Uint32Source = () => number;

function cryptoUint32() {
  const value = new Uint32Array(1);
  crypto.getRandomValues(value);
  return value[0];
}

// Rejection sampling gives every index exactly the same number of uint32
// preimages. A direct `% length` has a small but real bias unless length divides
// 2^32.
export function secureUniformIndex(
  length: number,
  nextUint32: Uint32Source = cryptoUint32,
) {
  if (!Number.isSafeInteger(length) || length < 1 || length > 0x1_0000_0000) {
    throw new RangeError("length must be an integer from 1 through 2^32");
  }
  const uint32Range = 0x1_0000_0000;
  const acceptanceLimit = Math.floor(uint32Range / length) * length;
  while (true) {
    const sample = nextUint32();
    if (!Number.isSafeInteger(sample) || sample < 0 || sample >= uint32Range) {
      throw new RangeError("uint32 source returned an invalid value");
    }
    if (sample < acceptanceLimit) return sample % length;
  }
}
