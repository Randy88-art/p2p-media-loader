import { describe, expect, it } from "vitest";
import type { LevelParsed, ManifestLoadedData } from "hls.js";
import {
  computeStreamIdentityHash,
  StreamProperties,
} from "p2p-media-loader-core";
import {
  getAudioStreamProperties,
  getVideoStreamProperties,
} from "../src/stream-properties.js";

// Cross-player parity: the shaka package pins its extractors to the SAME
// canonical properties and golden hashes
// (see p2p-media-loader-shaka/test/stream-properties.test.ts).
// If either side stops matching, hls.js and Shaka peers playing the same
// rendition no longer share swarms.

// Identical constant in the shaka parity test.
const CANONICAL_1080P: StreamProperties = {
  bitrate: 4521000,
  codecs: "avc1.64002a",
  width: 1920,
  height: 1080,
  frameRate: "29.970",
  videoRange: "SDR",
};

// Golden literals shared with the shaka parity test and
// p2p-media-loader-core/test/stream-identity.test.ts.
const MISSING_METADATA_IDENTITY_HASH = "UYnLxGhQilEV4D0HbCx+kRv0ZF0=";
const AUDIO_TRACK_IDENTITY_HASH = "bdjQ1B4N2yrcTDHyU5j7iDGV9sY=";

type ParsedLevel = LevelParsed & { maxBitrate?: number };

const makeLevel = (overrides: Partial<ParsedLevel>): ParsedLevel =>
  ({ attrs: {}, ...overrides }) as ParsedLevel;

const makeAudioTrack = (
  overrides: Partial<ManifestLoadedData["audioTracks"][number]>,
) => overrides as ManifestLoadedData["audioTracks"][number];

describe("hls.js stream properties extraction", () => {
  it("extracts a 1080p video level to the canonical identity", () => {
    const level = makeLevel({
      bitrate: 4200000,
      maxBitrate: 4521000,
      videoCodec: "avc1.64002a",
      width: 1920,
      height: 1080,
      attrs: {
        "FRAME-RATE": "29.970",
        "VIDEO-RANGE": "SDR",
      } as ParsedLevel["attrs"],
    });

    expect(computeStreamIdentityHash(getVideoStreamProperties(level))).toBe(
      computeStreamIdentityHash(CANONICAL_1080P),
    );
  });

  it("prefers maxBitrate (peak BANDWIDTH) over bitrate (AVERAGE-BANDWIDTH)", () => {
    const level = makeLevel({ bitrate: 999999, maxBitrate: 1000000 });
    expect(getVideoStreamProperties(level).bitrate).toBe(1000000);

    const levelWithoutMax = makeLevel({ bitrate: 999999 });
    expect(getVideoStreamProperties(levelWithoutMax).bitrate).toBe(999999);
  });

  it("blanks all metadata when the level has no bandwidth", () => {
    const level = makeLevel({
      bitrate: 0,
      videoCodec: "avc1.64002a",
      width: 1920,
      height: 1080,
      attrs: { "FRAME-RATE": "29.970" } as ParsedLevel["attrs"],
    });

    const properties = getVideoStreamProperties(level);
    expect(properties).toEqual({
      bitrate: 0,
      codecs: undefined,
      width: undefined,
      height: undefined,
      frameRate: undefined,
      videoRange: undefined,
    });
    expect(computeStreamIdentityHash(properties)).toBe(
      MISSING_METADATA_IDENTITY_HASH,
    );
  });

  it("extracts an audio track to the canonical identity", () => {
    const track = makeAudioTrack({
      audioCodec: "mp4a.40.2",
      lang: "en-US",
      channels: "2/0",
      name: "English",
    });

    const properties = getAudioStreamProperties(track);
    expect(properties.bitrate).toBe(0); // Match Shaka behavior for audio stream without variant
    expect(computeStreamIdentityHash(properties)).toBe(
      AUDIO_TRACK_IDENTITY_HASH,
    );
  });
});
