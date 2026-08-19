import type { LevelParsed, ManifestLoadedData } from "hls.js";
import { StreamProperties } from "p2p-media-loader-core";

export function getVideoStreamProperties(
  level: LevelParsed & { maxBitrate?: number },
): StreamProperties {
  const { bitrate, maxBitrate, videoCodec, width, height } = level;
  // maxBitrate tracks the peak BANDWIDTH tag, whereas bitrate tracks AVERAGE-BANDWIDTH.
  // We prioritize maxBitrate to universally match Shaka's variant.bandwidth parsing.
  const b = maxBitrate ?? bitrate;
  const isMissingMetadata = b === 0;

  return {
    bitrate: b,
    codecs: isMissingMetadata ? undefined : videoCodec,
    width: isMissingMetadata ? undefined : width,
    height: isMissingMetadata ? undefined : height,
    frameRate: isMissingMetadata ? undefined : level.attrs["FRAME-RATE"],
    videoRange: isMissingMetadata ? undefined : level.attrs["VIDEO-RANGE"],
  };
}

export function getAudioStreamProperties(
  track: ManifestLoadedData["audioTracks"][number],
): StreamProperties {
  const { audioCodec, lang, channels, name } = track;

  return {
    bitrate: 0, // Match Shaka behavior for audio stream without variant
    codecs: audioCodec,
    language: lang,
    channels,
    name,
  };
}
