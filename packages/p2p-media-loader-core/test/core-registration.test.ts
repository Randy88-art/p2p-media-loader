import { describe, expect, it, vi } from "vitest";
import { Core } from "../src/core.js";
import { computeInfoHash } from "../src/stream-identity.js";
import {
  CoreConfig,
  StreamProperties,
  StreamSwarmIdBuilderContext,
} from "../src/types.js";

const MANIFEST_URL = "https://example.com/hls/master.m3u8";

// Matches the "hls 1080p video variant" golden vector (see stream-identity.test.ts).
const PROPS_1080P: StreamProperties = {
  bitrate: 4521000,
  codecs: "avc1.64002a,mp4a.40.2",
  width: 1920,
  height: 1080,
  frameRate: "29.970",
  videoRange: "SDR",
};

const PROPS_360P: StreamProperties = {
  bitrate: 800000,
  codecs: "avc1.66.30",
  width: 640,
  height: 360,
};

function createCore(config?: Partial<CoreConfig>) {
  const core = new Core(config);
  core.setManifestResponseUrl(`${MANIFEST_URL}?token=abc`);
  return core;
}

describe("stream registration", () => {
  it("computes the default identity matching the golden vectors", () => {
    const core = createCore();
    core.addStreamIfNoneExists({
      runtimeId: "level-0",
      type: "main",
      properties: PROPS_1080P,
    });

    const stream = core.getStream("level-0");
    expect(stream).toBeDefined();
    expect(stream?.swarmId).toBe(MANIFEST_URL); // query parameters stripped
    expect(stream?.identityHash).toBe("mskAojmI+F5YyLLvSP3sdMO5nII=");
    expect(stream?.streamSwarmId).toBe(
      `v2-${MANIFEST_URL}-main-mskAojmI+F5YyLLvSP3sdMO5nII=`,
    );
    expect(stream?.infoHash).toBe("aEnMPupzZeID9k+gkk5Y");
  });

  it("prefers the configured swarmId over the manifest URL", () => {
    const core = createCore({ swarmId: "my-swarm" });
    core.addStreamIfNoneExists({
      runtimeId: "level-0",
      type: "main",
      properties: PROPS_1080P,
    });

    const stream = core.getStream("level-0");
    expect(stream?.swarmId).toBe("my-swarm");
    expect(stream?.streamSwarmId).toBe(
      "v2-my-swarm-main-mskAojmI+F5YyLLvSP3sdMO5nII=",
    );
  });

  it("throws when neither swarmId nor manifest response URL is set", () => {
    const core = new Core();
    expect(() =>
      core.addStreamIfNoneExists({
        runtimeId: "level-0",
        type: "main",
        properties: PROPS_1080P,
      }),
    ).toThrow(/manifest response URL is not set/);
  });

  it("uses the streamSwarmIdBuilder output verbatim", () => {
    let receivedContext: StreamSwarmIdBuilderContext | undefined;
    const core = createCore({
      streamSwarmIdBuilder: (context) => {
        receivedContext = context;
        return `custom-${context.streamType}-${context.properties.height ?? 0}`;
      },
    });

    core.addStreamIfNoneExists({
      runtimeId: "level-0",
      type: "main",
      properties: PROPS_1080P,
    });

    const stream = core.getStream("level-0");
    expect(stream?.streamSwarmId).toBe("custom-main-1080");
    expect(stream?.infoHash).toBe(computeInfoHash("custom-main-1080"));

    expect(receivedContext).toMatchObject({
      swarmId: MANIFEST_URL,
      runtimeId: "level-0",
      streamType: "main",
      identityHash: "mskAojmI+F5YyLLvSP3sdMO5nII=",
      defaultStreamSwarmId: `v2-${MANIFEST_URL}-main-mskAojmI+F5YyLLvSP3sdMO5nII=`,
      peerProtocolVersion: "v2",
    });
    expect(receivedContext?.properties).toEqual(PROPS_1080P);
  });

  it("supports building on the default stream swarm ID from the context", () => {
    const core = createCore({
      streamSwarmIdBuilder: ({ defaultStreamSwarmId }) =>
        `tenant-a-${defaultStreamSwarmId}`,
    });
    core.addStreamIfNoneExists({
      runtimeId: "level-0",
      type: "main",
      properties: PROPS_1080P,
    });

    const expectedId = `tenant-a-v2-${MANIFEST_URL}-main-mskAojmI+F5YyLLvSP3sdMO5nII=`;
    const stream = core.getStream("level-0");
    expect(stream?.streamSwarmId).toBe(expectedId);
    expect(stream?.infoHash).toBe(computeInfoHash(expectedId));
  });

  it("falls back to the default derivation when the builder returns undefined", () => {
    const core = createCore({ streamSwarmIdBuilder: () => undefined });
    core.addStreamIfNoneExists({
      runtimeId: "level-0",
      type: "main",
      properties: PROPS_1080P,
    });

    expect(core.getStream("level-0")?.infoHash).toBe("aEnMPupzZeID9k+gkk5Y");
  });

  it("throws when the builder returns an empty or non-string value", () => {
    const emptyCore = createCore({ streamSwarmIdBuilder: () => "" });
    expect(() =>
      emptyCore.addStreamIfNoneExists({
        runtimeId: "level-0",
        type: "main",
        properties: PROPS_1080P,
      }),
    ).toThrow(/non-empty string/);

    const nonStringCore = createCore({
      streamSwarmIdBuilder: () => 42 as unknown as string,
    });
    expect(() =>
      nonStringCore.addStreamIfNoneExists({
        runtimeId: "level-0",
        type: "main",
        properties: PROPS_1080P,
      }),
    ).toThrow(/non-empty string/);
  });

  it("throws when different stream identities collide on one stream swarm ID", () => {
    const core = createCore({ streamSwarmIdBuilder: () => "same-key" });
    const onStreamAdded = vi.fn();
    core.addEventListener("onStreamAdded", onStreamAdded);
    core.addStreamIfNoneExists({
      runtimeId: "level-0",
      type: "main",
      properties: PROPS_1080P,
    });

    expect(() =>
      core.addStreamIfNoneExists({
        runtimeId: "level-1",
        type: "main",
        properties: PROPS_360P,
      }),
    ).toThrow(/same stream swarm ID/);

    // A failed registration must not leave partial state behind.
    expect(core.getStream("level-1")).toBeUndefined();
    expect(core.getStream("level-0")).toBeDefined();
    expect(onStreamAdded).toHaveBeenCalledTimes(1);
  });

  it("throws when a builder collapses different stream types onto one ID", () => {
    // A builder that ignores streamType merges a main and a secondary stream
    // that happen to share an identityHash (both have blanked/{bitrate:0}
    // metadata) into one swarm — peers would then swap audio/video segments.
    const core = createCore({
      streamSwarmIdBuilder: ({ properties }) => `k-${properties.bitrate ?? 0}`,
    });
    core.addStreamIfNoneExists({
      runtimeId: "video",
      type: "main",
      properties: { bitrate: 0 },
    });

    expect(() =>
      core.addStreamIfNoneExists({
        runtimeId: "audio",
        type: "secondary",
        properties: { bitrate: 0 },
      }),
    ).toThrow(/different identities/);
  });

  it("allows identical identities under different runtime IDs to share a swarm", () => {
    const core = createCore();
    core.addStreamIfNoneExists({
      runtimeId: "cdn-a/playlist.m3u8",
      type: "main",
      properties: PROPS_1080P,
    });
    core.addStreamIfNoneExists({
      runtimeId: "cdn-b/playlist.m3u8",
      type: "main",
      properties: PROPS_1080P,
    });

    expect(core.getStream("cdn-a/playlist.m3u8")?.infoHash).toBe(
      core.getStream("cdn-b/playlist.m3u8")?.infoHash,
    );
  });

  it("registers a stream only once and fires onStreamAdded once", () => {
    const core = createCore();
    const onStreamAdded = vi.fn();
    core.addEventListener("onStreamAdded", onStreamAdded);

    const registration = {
      runtimeId: "level-0",
      type: "main",
      properties: PROPS_1080P,
    } as const;
    core.addStreamIfNoneExists(registration);
    core.addStreamIfNoneExists(registration);

    expect(onStreamAdded).toHaveBeenCalledTimes(1);
    const { stream } = onStreamAdded.mock.calls[0][0];
    expect(stream).toBe(core.getStream("level-0"));
    expect(stream.infoHash).toBe("aEnMPupzZeID9k+gkk5Y");
  });

  it("freezes stream properties at registration", () => {
    const core = createCore();
    const mutableProperties = { ...PROPS_1080P };
    core.addStreamIfNoneExists({
      runtimeId: "level-0",
      type: "main",
      properties: mutableProperties,
    });

    const stream = core.getStream("level-0");
    expect(Object.isFrozen(stream?.properties)).toBe(true);
    // Mutating the caller's object must not affect the registered stream.
    mutableProperties.height = 720;
    expect(stream?.properties.height).toBe(1080);
  });

  it("keeps identity fields stable across segment updates", () => {
    const core = createCore();
    core.addStreamIfNoneExists({
      runtimeId: "level-0",
      type: "main",
      properties: PROPS_1080P,
    });
    const infoHashBefore = core.getStream("level-0")?.infoHash;

    core.updateStream("level-0", [
      {
        runtimeId: "segment-1",
        externalId: 1,
        url: "https://example.com/hls/segment-1.ts",
        startTime: 0,
        endTime: 4,
      },
    ]);

    const stream = core.getStream("level-0");
    expect(stream?.segments.size).toBe(1);
    expect(stream?.infoHash).toBe(infoHashBefore);
  });
});
