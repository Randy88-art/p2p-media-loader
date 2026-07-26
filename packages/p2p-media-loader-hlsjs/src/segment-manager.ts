import * as Utils from "./utils.js";
import type {
  ManifestLoadedData,
  LevelUpdatedData,
  AudioTrackLoadedData,
} from "hls.js";
import {
  Core,
  Segment,
  StreamRegistration,
  debug,
} from "p2p-media-loader-core";
import {
  getAudioStreamProperties,
  getVideoStreamProperties,
} from "./stream-properties.js";

export class SegmentManager {
  core: Core;
  private readonly logger = debug("p2pml-hlsjs:segment-manager");

  constructor(core: Core) {
    this.core = core;
  }

  processMainManifest(data: ManifestLoadedData) {
    const { levels, audioTracks } = data;
    // in the case of audio only stream it is stored in levels

    for (const level of levels) {
      const { url } = level;
      this.addStream({
        runtimeId: Array.isArray(url) ? (url as string[])[0] : url,
        type: "main",
        properties: getVideoStreamProperties(level),
      });
    }

    for (const track of audioTracks) {
      const { url } = track;
      this.addStream({
        runtimeId: Array.isArray(url) ? (url as string[])[0] : url,
        type: "secondary",
        properties: getAudioStreamProperties(track),
      });
    }
  }

  private addStream(stream: StreamRegistration) {
    // Isolate per-stream registration failures: this method runs inside
    // hls.js event dispatch, so a throw would abort manifest processing.
    // A stream that fails to register stays unknown to the core and its
    // segments load through the default hls.js loader without P2P.
    try {
      this.core.addStreamIfNoneExists(stream);
    } catch (error) {
      this.logger(`failed to register stream ${stream.runtimeId}:`, error);
    }
  }

  updatePlaylist(data: LevelUpdatedData | AudioTrackLoadedData) {
    const {
      details: { url, fragments, live },
    } = data;

    const registeredSegmentIds = this.core.getStreamSegmentRuntimeIds(url);
    if (!registeredSegmentIds) return;

    const segmentToRemoveIds = new Set(registeredSegmentIds);
    const newSegments: Segment[] = [];
    fragments.forEach((fragment, index) => {
      const {
        url: responseUrl,
        byteRange: fragByteRange,
        sn,
        start: startTime,
        end: endTime,
      } = fragment;

      const [start, end] = fragByteRange;
      const byteRange = Utils.getByteRange(
        start,
        end !== undefined ? end - 1 : undefined,
      );
      const runtimeId = Utils.getSegmentRuntimeId(responseUrl, byteRange);
      segmentToRemoveIds.delete(runtimeId);

      if (registeredSegmentIds.has(runtimeId)) return;
      newSegments.push({
        runtimeId,
        url: responseUrl,
        externalId: live ? sn : index,
        byteRange,
        startTime,
        endTime,
      });
    });

    if (!newSegments.length && !segmentToRemoveIds.size) return;
    this.core.updateStream(url, newSegments, segmentToRemoveIds.values());
  }
}
