import type shaka from "shaka-player/dist/shaka-player.compiled.d.ts";
import { StreamProperties } from "p2p-media-loader-core";

const AUDIO_CODECS = ["mp4a", "ac-3", "ec-3", "ec+3", "opus", "vorb", "flac"];

export function getVideoStreamProperties(
  variant: shaka.extern.Variant,
  video: shaka.extern.Stream,
): StreamProperties {
  const isMissingMetadata = variant.bandwidth === 0;
  // In muxed streams, Shaka natively includes audio codecs in the video codec array.
  // We strip standard audio prefixes here to strictly match HLS.js's cleanly separated
  // videoCodec parsing, ensuring peers on identical video tracks share P2P segments
  // regardless of differently selected audio track descriptors.
  const videoCodecs = video.codecs
    ? video.codecs
        .split(",")
        .map((c) => c.trim().toLowerCase())
        .filter((c) => !AUDIO_CODECS.some((p) => c.startsWith(p)))
        .join(",")
    : undefined;

  const { frameRate, hdr: videoRange } = video;

  return {
    bitrate: variant.bandwidth,
    codecs: isMissingMetadata ? undefined : videoCodecs,
    width: isMissingMetadata ? undefined : video.width,
    height: isMissingMetadata ? undefined : video.height,
    frameRate: isMissingMetadata ? undefined : frameRate,
    videoRange: isMissingMetadata ? undefined : videoRange,
  };
}

export function getAudioStreamProperties(
  variant: shaka.extern.Variant,
  audio: shaka.extern.Stream,
  isMain: boolean,
): StreamProperties {
  const name = audio.label ?? audio.originalId ?? undefined;

  return {
    bitrate: isMain ? variant.bandwidth : 0,
    codecs: isMain ? undefined : audio.codecs,
    language: isMain ? undefined : audio.language,
    channels: isMain ? undefined : audio.channelsCount,
    name: isMain ? undefined : name,
  };
}
