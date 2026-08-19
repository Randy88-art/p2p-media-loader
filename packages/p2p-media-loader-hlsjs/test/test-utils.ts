import type { LevelParsed, ManifestLoadedData } from "hls.js";

export type ParsedLevel = LevelParsed & { maxBitrate?: number };

// The single cast sites for the hls.js fixture shapes: constructing complete
// hls.js objects is impractical in tests, so fixtures provide only the fields
// the code under test reads.
export const makeLevel = (overrides: Partial<ParsedLevel>): ParsedLevel =>
  ({ attrs: {}, ...overrides }) as ParsedLevel;

export const makeAudioTrack = (
  overrides: Partial<ManifestLoadedData["audioTracks"][number]>,
) => overrides as ManifestLoadedData["audioTracks"][number];
