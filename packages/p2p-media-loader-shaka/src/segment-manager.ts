import type shaka from "shaka-player/dist/shaka-player.compiled.d.ts";
import * as Utils from "./stream-utils.js";
import { HookedStream, StreamInfo, Stream } from "./types.js";
import {
  Core,
  Segment,
  StreamProperties,
  StreamType,
} from "p2p-media-loader-core";

// The minimum time interval (in seconds) between segments to assign unique IDs.
// If two segments in the same playlist start within a time frame shorter than this interval,
// they risk being assigned the same ID.
// Such overlapping IDs can lead to potential conflicts or issues in segment processing.
const SEGMENT_ID_RESOLUTION_IN_SECONDS = 0.5;

export class SegmentManager {
  private readonly core: Core<Stream>;
  private streamInfo: Readonly<StreamInfo>;

  constructor(streamInfo: Readonly<StreamInfo>, core: Core<Stream>) {
    this.core = core;
    this.streamInfo = streamInfo;
  }

  setStream(
    shakaStream: HookedStream,
    type: StreamType,
    properties: StreamProperties,
  ) {
    this.core.addStreamIfNoneExists({
      runtimeId: shakaStream.id.toString(),
      type,
      properties,
      shakaStream,
    });
    if (shakaStream.segmentIndex) this.updateStreamSegments(shakaStream);
  }

  updateStreamSegments(
    shakaStream: HookedStream,
    segmentReferences?: shaka.media.SegmentReference[],
  ) {
    const stream = this.core.getStream(shakaStream.id.toString());
    if (!stream) return;

    const registeredSegmentIds = this.core.getStreamSegmentRuntimeIds(
      stream.runtimeId,
    );
    if (!registeredSegmentIds) return;

    const { segmentIndex } = stream.shakaStream;
    if (!segmentReferences && segmentIndex) {
      try {
        segmentReferences = [...segmentIndex].filter((ref) => !!ref);
      } catch {
        return;
      }
    }
    if (!segmentReferences) return;

    if (this.streamInfo.protocol === "hls") {
      this.processHlsSegmentReferences(
        stream,
        registeredSegmentIds,
        segmentReferences,
      );
    } else {
      this.processDashSegmentReferences(
        stream,
        registeredSegmentIds,
        segmentReferences,
      );
    }
  }

  private processDashSegmentReferences(
    managerStream: Stream,
    registeredSegmentIds: ReadonlySet<string>,
    segmentReferences: shaka.media.SegmentReference[],
  ) {
    const staleSegmentsIds = new Set(registeredSegmentIds);
    const newSegments: Segment[] = [];
    for (const reference of segmentReferences) {
      const externalId = Math.trunc(
        reference.getStartTime() / SEGMENT_ID_RESOLUTION_IN_SECONDS,
      );

      const runtimeId = Utils.getSegmentRuntimeIdFromReference(reference);
      if (!registeredSegmentIds.has(runtimeId)) {
        const segment = Utils.createSegment({
          segmentReference: reference,
          externalId,
          runtimeId,
        });
        newSegments.push(segment);
      }
      staleSegmentsIds.delete(runtimeId);
    }

    if (!newSegments.length && !staleSegmentsIds.size) return;
    this.core.updateStream(
      managerStream.runtimeId,
      newSegments,
      staleSegmentsIds.values(),
    );
  }

  private processHlsSegmentReferences(
    managerStream: Stream,
    registeredSegmentIds: ReadonlySet<string>,
    segmentReferences: shaka.media.SegmentReference[],
  ) {
    const lastMediaSequence = Utils.getStreamLastMediaSequence(managerStream);

    const newSegments: Segment[] = [];
    if (registeredSegmentIds.size === 0) {
      const firstReferenceMediaSequence =
        lastMediaSequence === undefined
          ? 0
          : lastMediaSequence - segmentReferences.length + 1;

      for (const [index, reference] of segmentReferences.entries()) {
        const segment = Utils.createSegment({
          segmentReference: reference,
          externalId: firstReferenceMediaSequence + index,
        });
        newSegments.push(segment);
      }
      this.core.updateStream(managerStream.runtimeId, newSegments);
      return;
    }

    if (lastMediaSequence === undefined) return;
    let mediaSequence = lastMediaSequence;

    for (const reference of itemsBackwards(segmentReferences)) {
      const runtimeId = Utils.getSegmentRuntimeIdFromReference(reference);
      if (registeredSegmentIds.has(runtimeId)) break;
      const segment = Utils.createSegment({
        runtimeId,
        segmentReference: reference,
        externalId: mediaSequence,
      });
      newSegments.push(segment);
      mediaSequence--;
    }
    newSegments.reverse();

    const staleSegmentIds: string[] = [];
    const countToDelete = newSegments.length;
    // Segments register in manifest order and live updates only append at the
    // tail, so iteration order is chronological and the first N registered IDs
    // are the oldest segments — the ones that slid out of the live window.
    // Playback position never affects registration: the hooked segmentIndex
    // always reports the full window, and seeking within it is deduplicated
    // upstream. (If a refresh shares no segments with the registry — e.g.
    // after a very long stall — this deletes only as many old segments as
    // arrived, matching the pre-v4 behavior.)
    for (const runtimeId of registeredSegmentIds) {
      if (staleSegmentIds.length >= countToDelete) break;
      staleSegmentIds.push(runtimeId);
    }

    if (!newSegments.length && !staleSegmentIds.length) return;
    this.core.updateStream(
      managerStream.runtimeId,
      newSegments,
      staleSegmentIds,
    );
  }
}

function* itemsBackwards<T>(items: T[]) {
  for (let i = items.length - 1; i >= 0; i--) yield items[i];
}
