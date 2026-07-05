import chalk from "chalk";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { Writable } from "node:stream";
import { execSync } from "node:child_process";

// Batch Transcoder
export function segmentVideo(inputPath: string, outputDir: string): Promise<void> {
    // 1. Ensure output base directory and subdirectories exist
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    const subDirs = ["480p", "720p", "1080p"];
    for (const dir of subDirs) {
        const subDirPath = path.join(outputDir, dir);
        if (!fs.existsSync(subDirPath)) {
            fs.mkdirSync(subDirPath, { recursive: true });
        }
    }

    console.log("Directories created/verified");

    return new Promise<void>((resolve, reject) => {
        // 2. Arguments Array for multi-resolution transcoding
        const args = [
            "-y",
            "-nostdin",
            "-i", inputPath,
            "-filter_complex", "[0:v]split=3[v1][v2][v3];[v1]scale=w=854:h=480[v1out];[v2]scale=w=1280:h=720[v2out];[v3]scale=w=1920:h=1080[v3out]",

            // OUTPUT 1: 480p
            "-map", "[v1out]",
            "-map", "0:a?",
            "-c:v", "libx264",
            "-preset", "ultrafast", // Speed up processing
            "-g", "120", // keyframe interval (2 sec * 60fps)
            "-keyint_min", "120", // minimum interval
            "-sc_threshold", "0", // disable scene cut detection
            "-c:a", "aac",
            "-f", "hls",
            "-hls_time", "2",
            "-hls_playlist_type", "vod",
            "-hls_segment_filename", path.join(outputDir, "480p", "segment_%03d.ts"),
            path.join(outputDir, "480p", "playlist.m3u8"),

            // OUTPUT 2: 720p
            "-map", "[v2out]",
            "-map", "0:a?",
            "-c:v", "libx264",
            "-preset", "ultrafast",
            "-g", "120", // keyframe interval (2 sec * 60fps)
            "-keyint_min", "120", // minimum interval
            "-sc_threshold", "0", // disable scene cut detection
            "-c:a", "aac",
            "-f", "hls",
            "-hls_time", "2",
            "-hls_playlist_type", "vod",
            "-hls_segment_filename", path.join(outputDir, "720p", "segment_%03d.ts"),
            path.join(outputDir, "720p", "playlist.m3u8"),

            // OUTPUT 3: 1080p
            "-map", "[v3out]",
            "-map", "0:a?",
            "-c:v", "libx264",
            "-preset", "ultrafast",
            "-g", "120", // keyframe interval (2 sec * 60fps)
            "-keyint_min", "120", // minimum interval
            "-sc_threshold", "0", // disable scene cut detection
            "-c:a", "aac",
            "-f", "hls",
            "-hls_time", "2",
            "-hls_playlist_type", "vod",
            "-hls_segment_filename", path.join(outputDir, "1080p", "segment_%03d.ts"),
            path.join(outputDir, "1080p", "playlist.m3u8")
        ];

        // 3. Spawn FFmpeg
        const ffmpeg = spawn("ffmpeg", args);

        ffmpeg.on("error", (err) => {
            reject(err);
        });

        ffmpeg.on("close", (code) => {
            if (code === 0) {
                // 4. Generate Master Playlist programmatically on success
                const masterPlaylistContent = `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-STREAM-INF:BANDWIDTH=800000,RESOLUTION=854x480
480p/playlist.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=1400000,RESOLUTION=1280x720
720p/playlist.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=2800000,RESOLUTION=1920x1080
1080p/playlist.m3u8
`;
                try {
                    fs.writeFileSync(path.join(outputDir, "master.m3u8"), masterPlaylistContent);
                    console.log("Master playlist created successfully");
                    resolve();
                } catch (writeErr) {
                    reject(writeErr);
                }
            } else {
                reject(new Error(`FFmpeg exited with status code: ${code}`));
            }
        });

        ffmpeg.stderr.on("data", (data: Buffer) => {
            console.log(`[FFmpeg Log]: ${data.toString().trim()}`);
        });
    });
}

interface JITStreamOption {
    inputPath: string;
    resolution: string;
    segementIndex: number;
    segmentDuration: number;
}


const resolutions: Record<string, string> = {
    "480p": "w=854:h=480",
    "720p": "w=1280:h=720",
    "1080p": "w=1920:h=1080"
};

// Just in time transcoding
export function streamJITSegement(options: JITStreamOption, outputStream: Writable & { writeHead?: Function }): Promise<Buffer> {
    return new Promise<Buffer>((resolve, reject) => {
        console.log(chalk.italic.red("Starting the JIT Process..."));

        const { inputPath, resolution, segementIndex, segmentDuration } = options;

        // Start Time 
        const startTime = segementIndex * segmentDuration;

        // Map resolutions to dimensions (using w=...:h=... syntax for ffmpeg filter safety)


        const scaleFilter = `scale=${resolutions[resolution] || "w=1280:h=720"}`;

        const args = [
            "-nostdin",
            "-ss", startTime.toString(),
            "-i", inputPath,
            "-t", segmentDuration.toString(),
            "-vf", scaleFilter,
            "-c:v", "libx264",
            "-preset", "ultrafast",
            "-tune", "zerolatency",
            "-c:a", "aac",
            "-f", "mpegts",
            "-muxdelay", "0",
            "-output_ts_offset", startTime.toString(),
            "pipe:1"
        ];

        const ffmpeg = spawn("ffmpeg", args);
        (outputStream as any).ffmpegProcess = ffmpeg;

        let headersSent = false;
        const chunks: Buffer[] = []; // To save chunks of bytes 

        // 1. Send the data dynamically and aggregate the stdout buffer
        ffmpeg.stdout.on("data", (chunk: Buffer) => {

            chunks.push(chunk);
        });

        // 2. Resolve on process close
        ffmpeg.on("close", (code) => {
            delete (outputStream as any).ffmpegProcess;
            if (code === 0) {
                const finalBuffer = Buffer.concat(chunks);
                resolve(finalBuffer);
            } else {
                reject(new Error(`FFmpeg exited with status code: ${code}`));
            }
        });

        // 3. Fallback error handling if ffmpeg fails immediately 
        ffmpeg.on("error", (err) => {
            if (outputStream.writeHead && !headersSent) {
                outputStream.writeHead(500, { "Content-Type": "text/plain" });
                outputStream.end("JIT Transcoding failed");
            }
            reject(err);
        });

        ffmpeg.stderr.on("data", (data: Buffer) => {
            console.log(`[FFmpeg JIT Log]: ${data.toString().trim()}`);
        });
    });
}

export function generateEncryptedPlaylistJIT(resolution: string, segmentDuration: number, keyUrl: string, totalSegments: number): string {
    let playlist = [
        '#EXTM3U',
        '#EXT-X-VERSION:3',
        `#EXT-X-TARGETDURATION:${segmentDuration}`,
        '#EXT-X-MEDIA-SEQUENCE:0',
    ];

    for (let i = 0; i < totalSegments; i++) {
        const ivHex = i.toString(16).padStart(32, '0');
        playlist.push(`#EXT-X-KEY:METHOD=AES-128,URI="${keyUrl}",IV=0x${ivHex}`);
        playlist.push(`#EXTINF:${segmentDuration}.0,`);
        playlist.push(`/jit/${resolution}/segment_${i.toString().padStart(3, '0')}.ts`);
    }

    playlist.push('#EXT-X-ENDLIST');
    return playlist.join('\n');
}

export function getTotalSegments(sourceVideoPath: string, segmentDuration = 2) {
    try {
        // 1. Run ffprobe to get ONLY the total duration of the video in seconds
        const command = `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${sourceVideoPath}"`;

        // Execute the command and read the output stream in RAM
        const output = execSync(command).toString().trim();
        const videoDurationInSeconds = parseFloat(output);

        if (isNaN(videoDurationInSeconds)) {
            throw new Error("Could not parse video duration.");
        }

        // 2. Divide total time by segment length and round UP (Math.ceil)
        // Example: A 21-second video / 4-second chunks = 5.25 -> Requires 6 segments total
        const totalSegments = Math.ceil(videoDurationInSeconds / segmentDuration);

        return totalSegments;

    } catch (error) {
        console.error("Error reading video metadata:", (error as any).message);
        return 0; // Return 0 if the video file cannot be probed
    }
}
