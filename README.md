# 🎬 Custom Just-In-Time HLS Video Streamer

A high-performance Node.js & TypeScript media server that implements **on-the-fly (Just-In-Time) HLS transcoding**, progressive MP4 streaming with HTTP range requests, and dynamic **AES-128 encryption** for secure segment delivery.

---

## 🚀 Key Features

* **Just-In-Time (JIT) Transcoding:** Spawns lightweight FFmpeg subprocesses to extract specific 2-second `.ts` segments on-demand from a raw MP4 file, preventing wasteful pre-transcoding.
* **Dynamic AES-128 Encryption:** Automatically encrypts HLS segments JIT using a static key and derived IV vectors matched perfectly to the `#EXT-X-KEY` declarations in the HLS playlist.
* **LRU Memory Caching:** Implements a Least Recently Used (LRU) RAM caching layer to save hot segments and avoid redundant FFmpeg encoding overhead.
* **Progressive MP4 Streaming:** Supports standard byte-range headers (`Content-Range` / `206 Partial Content`) for native HTML5 seekable playback.
* **Throttled Static HLS Mode:** A simulation routing layer to test video playback under artificial network lag and packet throttling.

---

## 📂 Project Restructuring & Directory Map

```text
├── media/
│   └── sample.mp4            # Input raw MP4 video source
├── hls/                      # Temp directory for transcoded outputs (auto-cleaned)
├── src/
│   ├── index.ts              # Main entry, HTTP server routing, and startup cleanup
│   ├── core/
│   │   └── cache.ts          # LRU RAM segment cache controller
│   ├── routes/
│   │   ├── videoRoute.ts     # Progressive range-seek MP4 stream router
│   │   ├── jitStreaming.ts   # JIT Encrypted HLS segment & key router
│   │   ├── hlsStreaming.ts   # Throttled HLS static fragment router
│   │   └── testRoute.ts      # Benchmark tool for Cache vs Disk reads
│   └── utils/
│       └── segmenter.ts      # FFmpeg spawning and playlist generation helpers
├── package.json              # Script configurations and project metadata
└── tsconfig.json             # TypeScript compiler rules
```

---

## 🛠️ Installation & Execution

### 1. Requirements
Ensure you have **Node.js** and **FFmpeg** installed globally on your machine:
```bash
# Mac (via Homebrew)
brew install ffmpeg

# Verify installation
ffmpeg -version
ffprobe -version
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Run in Development Mode
Starts the TSX watcher which will automatically rebuild and restart the server on file modifications:
```bash
npm run dev
```
The server will boot on `http://localhost:3001`.

### 4. Build Production Bundle
Compiles the TypeScript source files to JavaScript inside the `dist` directory:
```bash
npm run build
```

---

## 📺 Streaming Endpoints

| Endpoint | Protocol / Output | Description |
|---|---|---|
| `http://localhost:3001/` | HTML5 Player | Streams the progressive MP4 directly using native controls |
| `http://localhost:3001/jit-player` | HLS (AES-128) | Plays the dynamically transcoded and encrypted HLS stream |
| `http://localhost:3001/video` | HTTP Progressive | Serves seekable partial byte ranges of `/media/sample.mp4` |
| `http://localhost:3001/jit/720p/playlist.m3u8` | HLS Manifest | Dynamically generated playlist mapping AES-128 decrypt keys |
| `http://localhost:3001/test` | Plain Text | Runs a benchmark comparison of Memory vs Disk load speeds |
