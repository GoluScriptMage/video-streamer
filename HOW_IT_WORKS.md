# 🛠️ HLS Video Streamer: How it Works

This document explains the end-to-end operational flow, module roles, and architectural mechanisms of this custom HLS streaming server.

---

## 📂 1. Project Component Breakdown

*   **`src/index.ts` (The HTTP Server & Router)**:
    *   Binds to port `3001` to listen for client connections.
    *   Exposes endpoints for range-based MP4 streaming (`/video`), static file serving, and the adaptive HLS path (`/hls/*`).
    *   Includes the `/test` benchmarking endpoint to measure system latency.
*   **`src/segmenter.ts` (The Transcoding Pipeline)**:
    *   Uses Node's `child_process.spawn` to initiate `ffmpeg`.
    *   Inputs a single high-quality MP4 file, processes it, and generates three directories: `480p`, `720p`, and `1080p`.
    *   Each directory contains segmented 2-second `.ts` chunks and their local `playlist.m3u8` reference guide.
*   **`src/core/cache.ts` (The L2 Cache Store)**:
    *   Implements an O(1) LRU caching engine to bypass disk reads.
    *   Uses a JavaScript Map structure to maintain fast key lookups alongside insertion-order preservation for GC sweeps.

---

## 🔄 2. End-to-End Streaming Flow (Step-by-Step)

```
[Browser Client]                                              [HLS Server]
       │                                                           │
       ├─────── 1. Requests master playlist ──────────────────────>│
       │        (GET /hls/master.m3u8)                             │
       │                                                           │
       │<────── 2. Returns master.m3u8 ────────────────────────────┤
       │        (Contains quality profiles & sub-playlists)        │
       │                                                           │
       ├─────── 3. Selects resolution based on speed ─────────────>│
       │        (GET /hls/720p/playlist.m3u8)                      │
       │                                                           │
       │<────── 4. Returns 720p playlist index ────────────────────┤
       │        (Lists segment chunks: segment_000.ts, etc.)       │
       │                                                           │
       ├─────── 5. Requests segment chunk 0 ──────────────────────>│
       │        (GET /hls/720p/segment_000.ts)                     │
       │                                                           │
       │                                  [Check LRU Cache]        │
       │                                  * Hit? Serve instantly!  │
       │                                  * Miss? Read disk & save.│
       │                                                           │
       │<────── 6. Receives segment chunk 0 ───────────────────────┤
       │                                                           │
       ├─────── 7. Continuous buffer loops ────────────────────────>│
       │        (Requests subsequent segment chunks)               │
```

---

## ⚡ 3. The Core Mechanisms

### A. Range Requests Seek Support (HTTP 206)
*   **Purpose**: Progressive streaming of static `.mp4` video files.
*   **Action**: When the user seeks to a specific point, the browser requests the target range (e.g., `bytes=5000000-`). The server processes the start and end offsets, reads only that portion from disk using a stream slice, and replies with `HTTP 206 Partial Content`. This saves server RAM and browser network bandwidth.

### B. HLS ABR (Adaptive Bitrate Streaming)
*   **Purpose**: Adaptive streaming of segment bundles over fluctuating networks.
*   **Action**: The video is physically pre-sliced into multiple 2-second segment clips (`.ts`). The client video engine evaluates local download speeds for each segment. If the connection slows down, it swaps requests to a lower resolution folder (e.g., swapping `1080p/segment_010.ts` for `480p/segment_011.ts`) instantly without pausing playback.

### C. GOP (Group of Pictures) Alignment
*   **Purpose**: Synchronized video segment transition.
*   **Action**: FFmpeg transcodes all resolutions with strict keyframe boundaries (`-g 120` keyframe intervals). This ensures that every segment across 480p, 720p, and 1080p matches the exact start/end video frame timestamps, preventing seeking freezes or timeline drops when shifting qualities.

### D. LRU Caching & Eviction (L2 Cache)
*   **Purpose**: Fast memory lookups bypassing slow Disk I/O.
*   **Action**: Highly requested TS segments are saved to memory in a key-value Map. When the cache size reaches the defined limit (e.g., 10 segments), the Garbage Collector (`cacheGC`) uses `keys().next().value` to retrieve the oldest key inserted in the map, deletes it, and stores the new segment, ensuring constant time complexity O(1).
c