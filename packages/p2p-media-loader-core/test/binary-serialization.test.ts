import { describe, it, expect } from "vitest";
import { getRequiredBytesForInt } from "../src/p2p/commands/binary-serialization.js";

// Original toString(2) approach for testing equality
function getRequiredBytesForIntOld(num: number): number {
  const binaryString = num.toString(2);
  const necessaryBits = num < 0 ? binaryString.length : binaryString.length + 1;
  return Math.ceil(necessaryBits / 8);
}

describe("binary-serialization", () => {
  describe("getRequiredBytesForInt", () => {
    it("should match the original toString(2) approach for positive integers", () => {
      for (let i = 0; i <= 10000; i++) {
        expect(getRequiredBytesForInt(i)).toBe(getRequiredBytesForIntOld(i));
      }
    });

    it("should match the original toString(2) approach for negative integers", () => {
      for (let i = -10000; i < 0; i++) {
        expect(getRequiredBytesForInt(i)).toBe(getRequiredBytesForIntOld(i));
      }
    });

    it("should match the original toString(2) approach for extreme cases", () => {
      expect(getRequiredBytesForInt(Number.MAX_SAFE_INTEGER)).toBe(
        getRequiredBytesForIntOld(Number.MAX_SAFE_INTEGER),
      );
      expect(getRequiredBytesForInt(-Number.MAX_SAFE_INTEGER)).toBe(
        getRequiredBytesForIntOld(-Number.MAX_SAFE_INTEGER),
      );
    });
  });

  describe("serializeUniqueSimilarIntArray and deserializeUniqueSimilarIntArray", () => {
    // Tests for serializeUniqueSimilarIntArray
    it("should correctly serialize and deserialize a small array of unique integers", async () => {
      const { serializeUniqueSimilarIntArray, deserializeUniqueSimilarIntArray } = await import("../src/p2p/commands/binary-serialization.js");
      const original = [1, 5, 10, 256, 258, 512];
      const serialized = serializeUniqueSimilarIntArray(original);
      const deserialized = deserializeUniqueSimilarIntArray(serialized);
      expect(deserialized.numbers).toEqual(original);
    });

    it("should correctly serialize and deserialize exactly 256 contiguous integers (edge case fixed)", async () => {
      const { serializeUniqueSimilarIntArray, deserializeUniqueSimilarIntArray } = await import("../src/p2p/commands/binary-serialization.js");
      const original = Array.from({ length: 256 }, (_, i) => i);
      const serialized = serializeUniqueSimilarIntArray(original);
      const deserialized = deserializeUniqueSimilarIntArray(serialized);
      expect(deserialized.numbers).toEqual(original);
    });

    it("should correctly serialize and deserialize exactly 256 contiguous integers starting at an offset", async () => {
      const { serializeUniqueSimilarIntArray, deserializeUniqueSimilarIntArray } = await import("../src/p2p/commands/binary-serialization.js");
      const original = Array.from({ length: 256 }, (_, i) => i + 512);
      const serialized = serializeUniqueSimilarIntArray(original);
      const deserialized = deserializeUniqueSimilarIntArray(serialized);
      expect(deserialized.numbers).toEqual(original);
    });

    it("should correctly serialize and deserialize exactly 256 contiguous integers with other disjoint integers", async () => {
      const { serializeUniqueSimilarIntArray, deserializeUniqueSimilarIntArray } = await import("../src/p2p/commands/binary-serialization.js");
      const contiguous = Array.from({ length: 256 }, (_, i) => i + 256);
      const original = [1, 2, ...contiguous, 1024, 1025];
      const serialized = serializeUniqueSimilarIntArray(original);
      const deserialized = deserializeUniqueSimilarIntArray(serialized);
      expect(deserialized.numbers).toEqual(original);
    });

    it("should correctly serialize and deserialize > 256 contiguous integers (spanning multiple 256-item buckets)", async () => {
      const { serializeUniqueSimilarIntArray, deserializeUniqueSimilarIntArray } = await import("../src/p2p/commands/binary-serialization.js");
      const original = Array.from({ length: 1000 }, (_, i) => i);
      const serialized = serializeUniqueSimilarIntArray(original);
      const deserialized = deserializeUniqueSimilarIntArray(serialized);
      expect(deserialized.numbers).toEqual(original);
    });
  });
});
