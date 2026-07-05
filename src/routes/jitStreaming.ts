import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import { cache } from "../core/cache.js";
import { streamJITSegement, generateEncryptedPlaylistJIT, getTotalSegments } from "../utils/segmenter.js";

export const handleJITStreaming = async (req: IncomingMessage, res: ServerResponse, url: string, jitKey: Buffer) => {

    const splitUrl = url.split("/");
    // If this is the player page
    if (splitUrl[2] === 'player' || req.url === '/jit-player') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=UTF-8' });
        res.end(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>JIT HLS Player</title>
<script src="https://cdn.jsdelivr.net/npm/hls.js@latest"></script></head>
<body style="background:#0e0e12;color:#e2e2e9;padding:40px 20px;font-family:sans-serif">
<div style="max-width:800px;margin:0 auto">
<h2 style="color:#a855f7;margin-top:0">🌐 JIT HLS Encrypted Stream</h2>
<video id="v" controls autoplay muted width="800" style="background:#000;border:1px solid #2e2e3e;border-radius:8px"></video>
<h4 style="color:#f59e0b;margin:15px 0;font-weight:600;font-size:14px;background:rgba(245,158,11,0.1);border:1px solid rgba(245,158,11,0.2);padding:12px 16px;border-radius:6px;line-height:1.4">⚠️ Performance Warning: Video can lag or get stuck. It is because of hosting CPU limits running live FFmpeg transcoding on Render Free Tier, not the codebase! (Runs instantly on local systems).</h4>
<h3 style="margin-top:20px;color:#94a3b8;font-size:14px">Telemetry / Event Logs:</h3>
<pre id="log" style="background:#181824;color:#10b981;font-family:monospace;font-size:12px;padding:15px;border-radius:6px;border:1px solid #2e2e3e;overflow-x:auto;max-height:250px"></pre>
</div>
<script>
const v=document.getElementById('v'),l=document.getElementById('log');
if(Hls.isSupported()){
  // Configure generous timeout parameters to handle slow cloud container transcoding speeds
  const h=new Hls({
    debug:false,
    fragLoadingTimeOut: 120000,      // 2 minutes timeout limit for segment transcoding on Render Free Tier
    fragLoadingMaxRetry: 6,           // Retry up to 6 times
    fragLoadingRetryDelay: 1500       // Wait 1.5s before retrying
  });
  h.loadSource('/jit/720p/playlist.m3u8');
  h.attachMedia(v);
  h.on(Hls.Events.MANIFEST_PARSED,()=>{
    l.textContent='[System] Manifest parsed successfully. Initiating playback...\\n';
    v.play().catch(e=>console.warn("Autoplay deferred:", e));
  });
  h.on(Hls.Events.ERROR,(_,d)=>{
    const time=new Date().toLocaleTimeString();
    const cleanErr={
      type:d.type,
      details:d.details,
      fatal:d.fatal,
      bufferLen:d.bufferInfo ? d.bufferInfo.len.toFixed(3) : 'N/A',
      buffered:d.bufferInfo && d.bufferInfo.buffered && d.bufferInfo.buffered.length ? 
        d.bufferInfo.buffered.map(b => \`[\${b.start.toFixed(2)}s-\${b.end.toFixed(2)}s]\`).join(', ') : 'none'
    };
    l.textContent+=\`[\${time}] ⚠️ \${cleanErr.type} (\${cleanErr.details}) | Fatal: \${cleanErr.fatal} | Buffer: \${cleanErr.bufferLen}s | Ranges: \${cleanErr.buffered}\\n\`;
    l.scrollTop=l.scrollHeight; // Auto-scroll to latest log
  });
}
else if(v.canPlayType('application/vnd.apple.mpegurl')){
  v.src='/jit/720p/playlist.m3u8';
}
</script></body></html>`);
        return;
    }

    const requestUrl = new URL(req.url!, `http://${req.headers.host}`);
    const pathname = requestUrl.pathname;

    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Range, Authorization',
        'Cache-Control': 'no-cache, no-store, must-revalidate'
    };

    const n = splitUrl.length - 1;
    const regex = /segment_(\d+)\.ts/;
    const fileName = splitUrl[n];
    const dirName = splitUrl[n - 1];
    const regexFileArr = regex.exec(fileName);
    const filePath = path.join(process.cwd(), 'hls', dirName, fileName);
    const mediaPath = path.join(process.cwd(), 'media', 'sample.mp4');

    if (req.method === 'OPTIONS') {
        res.writeHead(204, corsHeaders);
        res.end();
        return;
    }

    // SUB-ROUTE A: Playlist
    if (pathname.endsWith('.m3u8')) {
        const keyUrl = `/jit/${dirName}/key?v=${Date.now()}`;
        const totalSegments = getTotalSegments(mediaPath, 2);
        const playlistString = generateEncryptedPlaylistJIT(dirName, 2, keyUrl, totalSegments);
        res.writeHead(200, {
            ...corsHeaders,
            'Content-Type': 'application/x-mpegurl',
            'cache-control': 'no-cache, no-store, must-revalidate'
        });
        console.log('[JIT] Playlist served for:', dirName);
        res.end(playlistString);
        return;
    }

    // SUB-ROUTE B: Key
    if (pathname.endsWith('/key')) {
        res.writeHead(200, {
            ...corsHeaders,
            'Content-Type': 'application/octet-stream'
        });
        res.end(jitKey);
        return;
    }

    // SUB-ROUTE C: Segments
    if (pathname.endsWith('.ts')) {
        // L1: Cache check
        const cachePayload = cache.get(dirName, fileName);
        if (cachePayload) {
            console.log(`[JIT] Cache HIT: ${fileName}`);
            res.writeHead(200, { ...corsHeaders, 'Content-Type': 'video/MP2T' });
            res.end(cachePayload);
            return;
        }

        // L2: Disk check (already transcoded and saved)
        if (fs.existsSync(filePath)) {
            console.log(`[JIT] Disk HIT: ${fileName}`);
            const payload = fs.readFileSync(filePath);
            cache.save(dirName, fileName, payload);
            res.writeHead(200, { ...corsHeaders, 'Content-Type': 'video/MP2T' });
            res.end(payload);
            return;
        }

        // L3: JIT Transcode
        if (!regexFileArr) {
            res.writeHead(400, { 'Content-Type': 'text/plain' });
            res.end('Error: invalid segment filename');
            return;
        }

        const segmentIDX = parseInt(regexFileArr[1], 10);
        const duration = 2;

        res.on('close', () => {
            const processToKill = (res as any).ffmpegProcess;
            if (processToKill) {
                processToKill.kill('SIGKILL');
                console.log(`[JIT] FFmpeg killed for segment_${segmentIDX} on client disconnect`);
            }
        });

        try {
            console.log(`[JIT] Transcoding segment_${segmentIDX} at ${dirName}...`);
            const rawTSBuffer = await streamJITSegement({
                segementIndex: segmentIDX,
                segmentDuration: duration,
                inputPath: mediaPath,
                resolution: dirName
            }, res);

            // Derive IV from segment index - must match playlist declaration
            const iv = Buffer.alloc(16, 0);
            iv.writeUInt32BE(segmentIDX, 12);

            const cipher = crypto.createCipheriv('aes-128-cbc', jitKey, iv);
            const part1 = cipher.update(rawTSBuffer);
            const part2 = cipher.final();
            const payload = Buffer.concat([part1, part2]);

            // Write to disk for future cache-hits
            const dirPath = path.dirname(filePath);
            if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
            fs.writeFileSync(filePath, payload);

            cache.save(dirName, fileName, payload);

            if (!res.headersSent && !res.destroyed) {
                res.writeHead(200, { ...corsHeaders, 'Content-Type': 'video/MP2T' });
            }
            if (!res.destroyed) {
                res.end(payload);
            }
            console.log(`[JIT] Served segment_${segmentIDX} (${payload.length} bytes)`);
        } catch (err) {
            console.error('[JIT] Transcoding error:', err);
            if (!res.headersSent && !res.destroyed) {
                res.writeHead(500, { 'Content-Type': 'text/plain' });
                res.end('JIT transcoding failed');
            }
        }
        return;
    }
}

