# 🎥 HLS Video Streamer: Project Context & Architecture

This project is a high-performance, seekable HLS (HTTP Live Streaming) Video Streaming server built from scratch in Node.js and TypeScript. It implements adaptive bitrate streaming, dynamic transcoding, L2 memory caching, simulated bandwidth throttling, and cache vs. disk read benchmarks.

---

## 🏗️ 1. System Architecture

```
                                +-------------------+
                                |   Client Browser  |
                                +---------+---------+
                                          |
                        Requests `/hls/master.m3u8` or `/test`
                                          |
                                          v
                                +---------+---------+
                                |    HTTP Server    |
                                |    (Port 3001)    |
                                +---------+---------+
                                          |
             +----------------------------+----------------------------+
             |                                                         |
    [HLS Request Endpoint]                                    [Benchmark Test Endpoint]
             |                                                         |
             v                                                         v
   [Check LRU RAM Cache]                                   [Measure Disk Read Time]
             |                                                         |
    Cache Hit? ── Yes ──> [Send Buffer Instantly]                      |
             │                                                         |
             No                                                        |
             │                                                         |
             ▼                                                         v
  [Read from Disk] ──> [Save in Cache] ──> [Send Buffer]    [Measure L2 Cache Read Time]
                                                                       |
                                                                       v
                                                           [Log to Console (Disk vs RAM)]
```

---

## 📅 2. Daily Development Timeline

### Day 1: Range Requests Seekable Engine
*   **Feature**: Implemented custom Range parsing in the `/video` endpoint to support standard HTML5 video seeking.
*   **Under the Hood**: Uses `HTTP 206 Partial Content` responses, parsing the incoming `Range: bytes=start-end` headers, calculating boundary slices, setting `Content-Range`, and piping file stream chunks directly to the response.

### Day 2: FFmpeg Transcoding Pipeline
*   **Feature**: Built a dynamic transcoder in `src/segmenter.ts` using Node's `child_process.spawn`.
*   **Under the Hood**: Spawns an external `ffmpeg` process using a complex filtergraph to split a single source MP4 into three video streams, scaling them to 480p, 720p, and 1080p.
*   **GOP Alignment**: Enforces strict keyframe spacing (`-g 120` and `-keyint_min 120` at 60fps) to ensure segment cuts occur exactly at 2-second boundaries across all resolutions, ensuring seamless quality shifts.

### Day 3: HLS Playlist & Segment Routing
*   **Feature**: Added route handlings under `/hls/` for serving the programmatically generated `master.m3u8`, resolution-specific `playlist.m3u8`, and video segment chunk `.ts` files.

### Day 4: Memory-Mapped Segment Caching (L2 Cache)
*   **Feature**: Designed a custom in-memory cache to bypass expensive Disk I/O operations for highly requested hot video segments.
*   **Under the Hood**: Implemented an O(1) LRU (Least Recently Used) cache strategy. It matches a Map for fast lookups with a Doubly-Linked List to track recency, automatically evicting cold segments once the limit is hit.

### Day 5: Adaptive Bitrate Streaming (ABR) Setup
*   **Feature**: Integrated 480p, 720p, and 1080p playlists into `master.m3u8`, declaring exact bandwidth boundaries (800 Kbps, 1.4 Mbps, and 2.8 Mbps).

### Day 6: Bandwidth Throttler Middleware
*   **Feature**: Simulated latency and restricted throughput on the local server to force client-side player ABR engines to shift qualities.
*   **Flapping Issue**: Analyzed that simple flat delays result in bandwidth measurements proportional to segment sizes. Corrected it conceptually to use size-proportional delays or progressive chunk streaming.

### Day 7: Performance Benchmarking
*   **Feature**: Implemented a `/test` route inside the HTTP server to evaluate the performance improvement of serving video segments from memory vs. traditional disk reads.

---

## ⚡ 3. Benchmark Endpoint Details

The `/test` endpoint acts as a benchmarking utility:
*   It loads a 720p TS video segment (`segment_000.ts`) from the file system.
*   It populates the LRU Cache with the segment payload buffer.
*   **Disk Read Iteration**: Runs 100 consecutive sync file system reads (`fs.readFileSync`), measuring execution time using high-resolution timers (`process.hrtime.bigint()`), and computes the average duration.
*   **Cache Read Iteration**: Runs 100 consecutive cache lookups (`cache.get()`), measuring and averaging the duration.
*   **Output**: Logs the comparative times in nanoseconds or microseconds directly to the console.

---

## 🎯 4. Key Takeaways & Learnings

*   **Bandwidth Estimation**: Video players determine throughput by measuring `Segment Size / Download Time`. Flat delays on local servers skew this logic because large segments return artificially high bandwidth estimates, causing "Bandwidth Flapping."
*   **Cache Performance**: RAM lookups bypass file descriptors and disk controller overhead, achieving latency reductions of up to 10x-50x compared to disk I/O, proving the efficacy of LRU memory caching for edge streamers.

---

## 🚀 5. Active Sprint Extension: Chunk-based Progressive Throttling

*   **Goal**: Replace the random/flat latency simulator with a sustained bandwidth throttler to consistently force quality shifts down to 480p under restricted network conditions.
*   **Approach**: Slice the TS segment payload buffer into uniform 32KB chunks, stream them progressively using `res.write()`, and insert a short delay (e.g. 50ms) between chunk dispatches.

---

## 🏔️ 6. The Resume-Ready Deep-Dive Roadmap (Level 3 & 4)

*   **Level 3: JIT & Encryption (Estimated 4-5 Days)**:
    *   **Dynamic JIT Transcoding**: Instead of pre-segmenting the entire MP4 up-front, the server will invoke FFmpeg on-the-fly to transcode and extract specific segment slices dynamically as they are requested.
    *   **AES-128 Segment Encryption**: Secure the video stream by encrypting segments on-the-fly. Implement a secure key endpoint (`/key`) that authorizes client requests before providing the decryption key.
*   **Level 4: WebRTC Peer-to-Peer & Redis Scale (Estimated 7-8 Days)**:
    *   **P2P Decentralized Delivery**: Coordinate browser clients watching the same stream to exchange video segment chunks peer-to-peer (WebRTC data channels), dramatically reducing server bandwidth load.
    *   **WebSockets Signaling Server**: Build a WebSocket broker to handle peer signaling and SDP handshakes.
