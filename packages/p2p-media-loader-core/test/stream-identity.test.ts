import { describe, expect, it } from "vitest";
import {
  generateStreamShortId,
  getStreamSwarmId,
} from "../src/utils/stream.js";
import { getStreamHash } from "../src/utils/peer.js";
import { Stream, StreamType } from "../src/types.js";

// Golden vectors freezing the v2 wire protocol. These literals were generated
// by executing the implementation itself and MUST NOT change: any difference
// splits every existing default swarm between client versions.
// If a change to the derivation is ever intended, it requires a major version
// bump AND a peer protocol version bump.

const SWARM_ID = "https://example.com/hls/master.m3u8";

const computeIdentityHash = (
  props: Parameters<typeof generateStreamShortId>[0],
) => generateStreamShortId(props);

const computeSwarmKey = (streamType: StreamType, identityHash: string) => {
  const stream: Stream = {
    runtimeId: "runtime-id",
    type: streamType,
    index: identityHash,
  };
  return getStreamSwarmId(SWARM_ID, stream);
};

const GOLDEN_VECTORS = [
  {
    name: "hls 1080p video variant",
    props: {
      bitrate: 4521000,
      codecs: "avc1.64002a,mp4a.40.2",
      width: 1920,
      height: 1080,
      frameRate: "29.970",
      videoRange: "SDR",
    },
    streamType: "main" as StreamType,
    identityHash: "mskAojmI+F5YyLLvSP3sdMO5nII=",
    swarmKey:
      "v2-https://example.com/hls/master.m3u8-main-mskAojmI+F5YyLLvSP3sdMO5nII=",
    infoHash: "aEnMPupzZeID9k+gkk5Y",
  },
  {
    name: "decimal RFC 4281 avc1 codec (normalized to hex)",
    props: { bitrate: 800000, codecs: "avc1.66.30", width: 640, height: 360 },
    streamType: "main" as StreamType,
    identityHash: "NCMJrr57E8a6HDMfQTyx2FBIVq8=",
    swarmKey:
      "v2-https://example.com/hls/master.m3u8-main-NCMJrr57E8a6HDMfQTyx2FBIVq8=",
    infoHash: "KyXU7oYavEYFE/jxdEBu",
  },
  {
    name: "audio track",
    props: {
      bitrate: 0,
      codecs: "mp4a.40.2",
      language: "en-US",
      channels: "2/0",
      name: "English",
    },
    streamType: "secondary" as StreamType,
    identityHash: "bdjQ1B4N2yrcTDHyU5j7iDGV9sY=",
    swarmKey:
      "v2-https://example.com/hls/master.m3u8-secondary-bdjQ1B4N2yrcTDHyU5j7iDGV9sY=",
    infoHash: "Brw7M7eJYTdtKRTVLdah",
  },
  {
    name: "missing metadata (bitrate 0 only)",
    props: { bitrate: 0 },
    streamType: "main" as StreamType,
    identityHash: "UYnLxGhQilEV4D0HbCx+kRv0ZF0=",
    swarmKey:
      "v2-https://example.com/hls/master.m3u8-main-UYnLxGhQilEV4D0HbCx+kRv0ZF0=",
    infoHash: "P78ZUY66tgmtYL6JoePW",
  },
  {
    name: "dash hdr video variant",
    props: {
      bitrate: 6000000,
      codecs: "hvc1.2.4.L153.B0",
      width: 3840,
      height: 2160,
      frameRate: 25,
      videoRange: "hlg",
    },
    streamType: "main" as StreamType,
    identityHash: "xRZQlAX26agaIEVBIZ0SppKubi0=",
    swarmKey:
      "v2-https://example.com/hls/master.m3u8-main-xRZQlAX26agaIEVBIZ0SppKubi0=",
    infoHash: "HC9QZIUjD8lNeTcsspkz",
  },
];

describe("stream identity golden vectors (v2 wire protocol)", () => {
  for (const vector of GOLDEN_VECTORS) {
    it(vector.name, () => {
      const identityHash = computeIdentityHash(vector.props);
      expect(identityHash).toBe(vector.identityHash);

      const swarmKey = computeSwarmKey(vector.streamType, identityHash);
      expect(swarmKey).toBe(vector.swarmKey);

      expect(getStreamHash(swarmKey)).toBe(vector.infoHash);
    });
  }

  it("info hash is exactly 20 ASCII characters", () => {
    for (const vector of GOLDEN_VECTORS) {
      const infoHash = getStreamHash(vector.swarmKey);
      expect(infoHash).toHaveLength(20);
      expect(new TextEncoder().encode(infoHash)).toHaveLength(20);
    }
  });
});

describe("stream identity normalization semantics", () => {
  it("treats bitrate 0, undefined, and empty props as the same identity", () => {
    const zero = computeIdentityHash({ bitrate: 0 });
    expect(computeIdentityHash({})).toBe(zero);
    expect(computeIdentityHash({ bitrate: undefined })).toBe(zero);
  });

  it("is insensitive to codec order and case", () => {
    const base = computeIdentityHash({ codecs: "avc1.64002a,mp4a.40.2" });
    expect(computeIdentityHash({ codecs: "mp4a.40.2,avc1.64002a" })).toBe(base);
    expect(computeIdentityHash({ codecs: "AVC1.64002A,MP4A.40.2" })).toBe(base);
  });

  it("normalizes frame rate representations", () => {
    const base = computeIdentityHash({ frameRate: 29.97 });
    expect(computeIdentityHash({ frameRate: "29.970" })).toBe(base);
  });

  it("normalizes language to a two-letter lowercase code", () => {
    const base = computeIdentityHash({ language: "en" });
    expect(computeIdentityHash({ language: "en-US" })).toBe(base);
    expect(computeIdentityHash({ language: "EN" })).toBe(base);
    expect(computeIdentityHash({ language: "und" })).toBe(
      computeIdentityHash({}),
    );
  });

  it("normalizes channels to the count before the slash", () => {
    const base = computeIdentityHash({ channels: 2 });
    expect(computeIdentityHash({ channels: "2/0" })).toBe(base);
    expect(computeIdentityHash({ channels: "2" })).toBe(base);
  });

  it("normalizes video range case", () => {
    expect(computeIdentityHash({ videoRange: "hlg" })).toBe(
      computeIdentityHash({ videoRange: "HLG" }),
    );
  });

  it("normalizes name case and whitespace", () => {
    expect(computeIdentityHash({ name: " English " })).toBe(
      computeIdentityHash({ name: "english" }),
    );
  });
});
