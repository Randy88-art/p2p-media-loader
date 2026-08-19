import { describe, expect, it } from "vitest";
import type shaka from "shaka-player/dist/shaka-player.compiled.d.ts";
import {
  computeStreamIdentityHash,
  StreamProperties,
} from "p2p-media-loader-core";
import {
  getAudioStreamProperties,
  getVideoStreamProperties,
} from "../src/stream-properties.js";

// Cross-player parity: the hlsjs package pins its extractors to the SAME
// canonical properties and golden hashes
// (see p2p-media-loader-hlsjs/test/stream-properties.test.ts).
// If either side stops matching, hls.js and Shaka peers playing the same
// rendition no longer share swarms.

// Identical constant in the hlsjs parity test.
const CANONICAL_1080P: StreamProperties = {
  bitrate: 4521000,
  codecs: "avc1.64002a",
  width: 1920,
  height: 1080,
  frameRate: "29.970",
  videoRange: "SDR",
};

// Golden literals shared with the hlsjs parity test and
// p2p-media-loader-core/test/stream-identity.test.ts.
const MISSING_METADATA_IDENTITY_HASH = "UYnLxGhQilEV4D0HbCx+kRv0ZF0=";
const AUDIO_TRACK_IDENTITY_HASH = "bdjQ1B4N2yrcTDHyU5j7iDGV9sY=";

const makeVariant = (overrides: Partial<shaka.extern.Variant>) =>
  overrides as shaka.extern.Variant;

const makeStream = (overrides: Partial<shaka.extern.Stream>) =>
  overrides as shaka.extern.Stream;

describe("shaka stream properties extraction", () => {
  it("extracts a muxed 1080p video variant to the canonical identity", () => {
    const video = makeStream({
      // Shaka natively includes audio codecs of muxed streams in the video codec list.
      codecs: "avc1.64002A,mp4a.40.2",
      width: 1920,
      height: 1080,
      frameRate: 29.97,
      hdr: "SDR",
    });
    const variant = makeVariant({ bandwidth: 4521000, video });

    expect(
      computeStreamIdentityHash(getVideoStreamProperties(variant, video)),
    ).toBe(computeStreamIdentityHash(CANONICAL_1080P));
  });

  it("blanks all metadata when the variant has no bandwidth", () => {
    const video = makeStream({
      codecs: "avc1.64002a",
      width: 1920,
      height: 1080,
      frameRate: 29.97,
    });
    const variant = makeVariant({ bandwidth: 0, video });

    const properties = getVideoStreamProperties(variant, video);
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

  it("extracts a secondary audio stream to the canonical identity", () => {
    const audio = makeStream({
      codecs: "mp4a.40.2",
      language: "en-US",
      channelsCount: 2,
      label: "English",
    });
    const variant = makeVariant({ bandwidth: 128000, audio });

    const properties = getAudioStreamProperties(variant, audio, false);
    expect(properties.bitrate).toBe(0);
    expect(computeStreamIdentityHash(properties)).toBe(
      AUDIO_TRACK_IDENTITY_HASH,
    );
  });

  it("uses the variant bandwidth for audio-only master playlist variants", () => {
    const audio = makeStream({
      codecs: "mp4a.40.2",
      language: "en-US",
      channelsCount: 2,
      label: "English",
    });
    const variant = makeVariant({ bandwidth: 256000, audio });

    expect(getAudioStreamProperties(variant, audio, true)).toEqual({
      bitrate: 256000,
      codecs: undefined,
      language: undefined,
      channels: undefined,
      name: undefined,
    });
  });

  it("falls back from label to originalId for the audio name", () => {
    const audio = makeStream({
      codecs: "mp4a.40.2",
      language: "en",
      label: null,
      originalId: "audio-original",
    });
    const variant = makeVariant({ bandwidth: 128000, audio });

    expect(getAudioStreamProperties(variant, audio, false).name).toBe(
      "audio-original",
    );
  });
});
