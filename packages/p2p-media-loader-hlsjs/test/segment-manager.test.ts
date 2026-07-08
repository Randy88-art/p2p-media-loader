import { describe, expect, it } from "vitest";
import type { ManifestLoadedData } from "hls.js";
import { Core } from "p2p-media-loader-core";
import { SegmentManager } from "../src/segment-manager.js";

const MANIFEST_URL = "https://example.com/hls/master.m3u8";

const makeLevel = (url: string, bitrate: number, height: number) =>
  ({
    url,
    bitrate,
    videoCodec: "avc1.64002a",
    width: Math.round((height * 16) / 9),
    height,
    attrs: {},
  }) as unknown as ManifestLoadedData["levels"][number];

describe("hls.js segment manager stream registration", () => {
  it("isolates per-stream registration failures", () => {
    // A collision-prone builder keyed on height only: two 1080p rungs with
    // different bitrates collide, which makes the core throw on the second.
    const core = new Core({
      streamSwarmIdBuilder: ({ swarmId, streamType, properties }) =>
        `k-${swarmId}-${streamType}-${properties.height ?? 0}`,
    });
    core.setManifestResponseUrl(MANIFEST_URL);
    const segmentManager = new SegmentManager(core);

    const data = {
      levels: [
        makeLevel("https://example.com/hls/1080-high.m3u8", 8000000, 1080),
        makeLevel("https://example.com/hls/1080-low.m3u8", 5000000, 1080),
        makeLevel("https://example.com/hls/720.m3u8", 3000000, 720),
      ],
      audioTracks: [],
    } as unknown as ManifestLoadedData;

    // Runs inside hls.js event dispatch in production — must never throw.
    expect(() => segmentManager.processMainManifest(data)).not.toThrow();

    // The colliding stream is skipped; every other stream still registers.
    expect(
      core.getStream("https://example.com/hls/1080-high.m3u8"),
    ).toBeDefined();
    expect(
      core.getStream("https://example.com/hls/1080-low.m3u8"),
    ).toBeUndefined();
    expect(core.getStream("https://example.com/hls/720.m3u8")).toBeDefined();
  });

  it("registers all streams of a well-formed manifest", () => {
    const core = new Core();
    core.setManifestResponseUrl(MANIFEST_URL);
    const segmentManager = new SegmentManager(core);

    segmentManager.processMainManifest({
      levels: [
        makeLevel("https://example.com/hls/1080.m3u8", 8000000, 1080),
        makeLevel("https://example.com/hls/720.m3u8", 3000000, 720),
      ],
      audioTracks: [],
    } as unknown as ManifestLoadedData);

    expect(core.getStream("https://example.com/hls/1080.m3u8")?.type).toBe(
      "main",
    );
    expect(core.getStream("https://example.com/hls/720.m3u8")?.type).toBe(
      "main",
    );
  });
});
