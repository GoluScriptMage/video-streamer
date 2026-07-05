import type { IncomingMessage, ServerResponse } from "http";
import path from "node:path";
import fs from "node:fs";
import { cache } from "../core/cache.js";

export const handleTestRoute = (req: IncomingMessage, res: ServerResponse, splitUrl: string[]) => {
    const filePath = path.join(process.cwd(), 'media', 'sample.mp4');

    if (!fs.existsSync(filePath)) {
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("Error: media/sample.mp4 source video not found. Place a video in the media folder first.");
        return;
    }

    const payload = fs.readFileSync(filePath);
    cache.save('media', 'sample.mp4', payload);

    const getCacheAvg = () => {
        let cacheAverageTime: bigint = BigInt(0);
        for (let i = 0; i < 100; i++) {
            const strtTime = process.hrtime.bigint();
            cache.get('media', 'sample.mp4');
            const endTime = process.hrtime.bigint();
            cacheAverageTime += endTime - strtTime;
        }
        return cacheAverageTime / BigInt(100);
    }
    
    const getDiskAvg = () => {
        let diskAvgTime: bigint = BigInt(0);
        for (let i = 0; i < 100; i++) {
            const strtTime = process.hrtime.bigint();
            fs.readFileSync(filePath);
            const endTime = process.hrtime.bigint();
            diskAvgTime += endTime - strtTime;
        }
        return diskAvgTime / BigInt(100);
    }

    const diskTimeNs = getDiskAvg();
    const cacheTimeNs = getCacheAvg();

    // Convert nanoseconds to microseconds (1 µs = 1000 ns) for high precision human readability
    const diskTimeUs = Number(diskTimeNs) / 1000;
    const cacheTimeUs = Number(cacheTimeNs) / 1000;

    console.log(`[Benchmark] Disk Avg Time: ${diskTimeUs.toFixed(2)} µs | Cache Avg Time: ${cacheTimeUs.toFixed(2)} µs`);
    res.writeHead(200, {
        "Content-Type": "text/plain"
    });
    res.end(`[Benchmark Analysis]
Disk Average Read Latency : ${diskTimeUs.toFixed(2)} microseconds (µs)
Cache Average Read Latency: ${cacheTimeUs.toFixed(2)} microseconds (µs)
Cache Speed Multiplier    : ${(diskTimeUs / cacheTimeUs).toFixed(1)}x faster than Disk!`);
    return;
}