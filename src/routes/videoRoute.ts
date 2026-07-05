import type { IncomingMessage, ServerResponse } from "node:http";
import fs from "node:fs";

export const handleVideoStreaming = (req: IncomingMessage, res: ServerResponse, videoPath: string) => {
    // --- Get the File & File Size --
    const stat = fs.statSync(videoPath);
    const fileSize = stat.size;

    if (!req.headers.range) {
        res.writeHead(200, {
            "content-length": fileSize,
            "Content-Type": "video/mp4",
        })
        return fs.createReadStream(videoPath).pipe(res);
    }

    // Range Header
    const range = req.headers.range.replace("bytes=", "").split('-');
    // console.log('Range Header: ', range, range.length);

    // Range Starting Bytes to Ending & Chunk_Size
    const startPart = parseInt(range[0], 10); // Converting to Base10
    const CHUNK_SIZE = 1024 * 1024; // 1mb Size
    let endPart: number;

    // End Bytes processing & calculating
    if (range[1]) {
        endPart = parseInt(range[1], 10); // String to 0-9 Nums
    } else {
        endPart = Math.min(fileSize - 1, startPart + CHUNK_SIZE - 1); // -1 Bcz bytes idx starts from 0 so always smaller than curr Size
    }

    const chunkSize = endPart - startPart + 1; // +1 Bcz we substracted we not included 0th idx  
    // console.log("Range: ", startPart, "-", endPart, " | ChunkSize: ", chunkSize);

    // In response send Video Chunks that is asked
    const contentRange = `bytes ${startPart}-${endPart}/${fileSize}`;
    res.writeHead(206, {
        "Content-Range": contentRange,
        "Accept-Ranges": "bytes",
        "Content-length": chunkSize,
        "Content-Type": "video/mp4"
    });
    fs.createReadStream(videoPath, { start: startPart, end: endPart }).pipe(res);
    // fs.createReadStream(videoPath).pipe(res);
    return;
}