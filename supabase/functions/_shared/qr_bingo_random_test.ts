import { secureUniformIndex } from "./qr_bingo_random.ts";

function assertEquals(actual: unknown, expected: unknown, message: string) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${expected}, received ${actual}`);
  }
}

Deno.test("secureUniformIndex rejection-samples the biased uint32 tail", () => {
  const samples = [0xffff_ffff, 5];
  let reads = 0;
  const selected = secureUniformIndex(3, () => {
    const sample = samples[reads];
    reads += 1;
    return sample;
  });

  assertEquals(reads, 2, "the out-of-range tail sample must be discarded");
  assertEquals(selected, 2, "the first accepted sample must select by modulo");
});

Deno.test("secureUniformIndex maps an equal deterministic preimage set", () => {
  const observed = [0, 1, 2, 3, 4, 5].map((sample) =>
    secureUniformIndex(3, () => sample)
  );
  assertEquals(
    JSON.stringify(observed),
    JSON.stringify([0, 1, 2, 0, 1, 2]),
    "each index must have the same number of accepted preimages",
  );
});

Deno.test("secureUniformIndex validates length and entropy source", () => {
  let invalidLengthRejected = false;
  try {
    secureUniformIndex(0, () => 0);
  } catch (error) {
    invalidLengthRejected = error instanceof RangeError;
  }
  assertEquals(
    invalidLengthRejected,
    true,
    "zero-length pools must fail closed",
  );

  let invalidEntropyRejected = false;
  try {
    secureUniformIndex(2, () => -1);
  } catch (error) {
    invalidEntropyRejected = error instanceof RangeError;
  }
  assertEquals(
    invalidEntropyRejected,
    true,
    "invalid entropy must fail closed",
  );
});
