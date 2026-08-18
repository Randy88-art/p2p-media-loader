# Migration Guide

## v3 → v4

v4 moves stream identity derivation from the player integrations into the core.
Integrations pass raw stream properties; the core computes the identity values
once per stream at registration and freezes them on the `Stream` object.

**Wire compatibility:** the default derivation is bit-identical to v3
(enforced by golden-vector tests), so default-config v4 peers keep sharing
swarms with v3 peers. No infohash changes unless you configure the new
`streamSwarmIdBuilder`.

### `Stream` type

`Stream.index` is replaced by `Stream.identityHash`, and streams now carry
their full computed identity:

```typescript
type Stream = {
  runtimeId: string;
  type: StreamType;
  properties: Readonly<StreamProperties>; // raw manifest metadata (NEW)
  swarmId: string; // resolved at registration (NEW)
  identityHash: string; // was `index`
  streamSwarmId: string; // pre-hash swarm string (NEW)
  infoHash: string; // announced to trackers (NEW)
};
```

### `Core.addStreamIfNoneExists`

Custom integrations no longer compute the stream identifier. Pass the raw
properties instead; identity fields are computed by the core:

```typescript
// v3
core.addStreamIfNoneExists({
  runtimeId: url,
  type: "main",
  index: generateStreamShortId({ bitrate, codecs, width, height }),
});

// v4
core.addStreamIfNoneExists({
  runtimeId: url,
  type: "main",
  properties: { bitrate, codecs, width, height },
});
```

Registration requires the swarm ID to be resolvable: either configure
`swarmId` or call `setManifestResponseUrl()` before adding streams.

### Renamed / removed exports

| v3                                            | v4                                                          |
| --------------------------------------------- | ----------------------------------------------------------- |
| `generateStreamShortId(props)`                 | `computeStreamIdentityHash(properties)`                     |
| `GenerateStreamShortIdProps`                   | `StreamProperties`                                          |
| `Stream.index`                                 | `Stream.identityHash`                                       |
| — (internal `getStreamSwarmId`)                | `computeStreamSwarmId({ swarmId, streamType, properties })` |
| — (internal `getStreamHash`)                   | `computeInfoHash(streamSwarmId)`                            |
| `SegmentLoadDetails.segmentUrl` _(deprecated)_ | removed — use `segment.url`                                 |
| `PartialShakaEngineConfig` (shaka package)     | `PartialShakaP2PEngineConfig`                               |
| `StreamWithSegments`, `SegmentWithStream`      | removed — internal types (see `Core.getStream` below)       |

The event payload types are now composed from shared bases: the segment
events (`SegmentStartDetails`, `SegmentLoadDetails`, `SegmentErrorDetails`,
`SegmentAbortDetails`) extend `SegmentEventDetails`, the peer events extend
`PeerDetails`, and the tracker events extend the new `TrackerEventDetails`.
Their fields are unchanged apart from the `segmentUrl` removal above and the
`trackerUrl` additions listed under "New APIs".

The identity helpers are exported from the main entry and from the Node-safe
`p2p-media-loader-core/server` subpath (Node.js 16+) for server-side
infohash computation. The package is published as ESM only: CommonJS projects
should load it with a dynamic `import()` (or `require()` on Node.js 20.17+).

### New APIs

- `StreamConfig.streamSwarmIdBuilder` — optional callback that builds a custom
  stream swarm ID per stream, making the announced infohash predictable on a server
  (see "Predicting swarm infohashes on a server" in the API documentation).
- `onStreamAdded` core event — fired once per registered stream with its
  computed identity, including `infoHash`. The payload is a snapshot detached
  from the core's internal stream state.
- `Core.getStreams()` — returns all currently registered streams with their
  computed identities, so the announced infohashes can be listed at any time,
  not just at registration.
- `Core.getStreamSegmentRuntimeIds(streamRuntimeId)` — returns a snapshot set
  of the segment runtime IDs registered for a stream, in registration order.
  Replaces reading `Core.getStream(...).segments`.
- `PeerDetails.trackerUrl` — every peer event payload (`onPeerConnect`,
  `onPeerClose`, `onPeerError`, `onPeerWarning`, `onPeerConnectError`) now
  reports the tracker URL the peer was discovered from.

### `Core.getStream` no longer exposes segments

`Core.getStream()` and `Core.getStreams()` now return detached snapshots of
the plain stream (`TStream`) — its identity fields plus any
integration-specific extensions. The internal segment registry
(`StreamWithSegments`, `SegmentWithStream`) is no longer part of the public
API, and no core output (event payload or getter) shares live internal
objects. Code that read `getStream(...).segments` should use
`Core.getStreamSegmentRuntimeIds(streamRuntimeId)` instead — it covers the
diffing workflow the segments map was used for (enumeration and membership
checks of segment runtime IDs).

### Tightened read-only types

- `ByteRange.start`/`ByteRange.end` are now `readonly`.
- `SegmentResponse.data` may reference the buffer the core keeps in segment
  storage for P2P upload: treat it as read-only and copy it (`data.slice(0)`)
  before transferring it to a worker.

### `SegmentStorage` interface

The parameter documented as `streamId` is renamed to `streamSwarmId` in all method
signatures, including `setSegmentChangeCallback`. The value passed is
`Stream.streamSwarmId` (format unchanged from the v3 `streamSwarmId`), so custom
storage implementations keep working — only parameter names and documentation
changed.

### Runtime configuration

`swarmId` and `streamSwarmIdBuilder` cannot be changed via `applyDynamicConfig`.
Stream identity is derived from them once at registration; dynamic updates
now strip these properties (previously a plain-JS caller could desynchronize
announced swarms by changing `swarmId` mid-session).
