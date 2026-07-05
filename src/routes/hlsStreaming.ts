import type { IncomingMessage, ServerResponse } from "http";
import path from "node:path";
import chalk from "chalk";
import fs from "node:fs";
import { cache } from "../core/cache.js";

export const handleHlsStreaming = async (req: IncomingMessage, res: ServerResponse, url: string,) => {

    const splitUrl = url.split("/");

    // Check for master Playlist and returns it early
    if (splitUrl[2] === "master.m3u8") {
        const playlistName = url.split("/")[2]
        const playlistPath = path.join(process.cwd(), 'hls', playlistName);
        if (!fs.existsSync(playlistPath)) {
            res.writeHead(404, {
                "Content-Type": "text/plain"
            })
            res.end("Error: master playlist not found");
            return;
        }

        res.writeHead(200, {
            "Content-Type": "application/x-mpegURL",
        })
        fs.createReadStream(playlistPath).pipe(res);
        return;
    }

    const folderName = splitUrl[2]; // Folder name e.g 480p, 1080p
    const fileName = splitUrl[3]; // filename e.g segement001.ts or .m3u8

    // BandWidth Throtller 
    // Step 1: Sleep fn
    const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

    // Step 2: throttling fn
    const startThrottling = async (delayTime: number) => {
        console.log(chalk.italic.red('Starting Network throttling...'));
        await sleep(delayTime);
        console.log(`Delay ends here after :`, delayTime);
    }


    const delayOrNot = Math.random() > 0.5 ? false : true;
    if (delayOrNot) {
        const delayTime = Math.floor(Math.random() * 3001) + 1000;
        await startThrottling(delayTime).catch(console.error);
    } else {
        await startThrottling(1500).catch(console.error);
    }
    console.log("I waited no", delayOrNot)

    /**
     * Checking from cache
     * If we get cache get it and just return
     */
    if (fileName.includes(".ts") && cache.get(folderName, fileName)) {
        res.writeHead(200, {
            "Content-Type": "video/MP2T"
        });
        res.end(cache.get(folderName, fileName));
        return;
    }

    const filePath = path.join(process.cwd(), 'hls', folderName, fileName);

    if (!fs.existsSync(filePath)) {
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("File Not Found");
        return;
    }

    // Get file buffer & Save in cache
    const filePayload = fs.readFileSync(filePath);
    if (fileName.includes('.ts')) {
        cache.save(folderName, fileName, filePayload);
    }

    let contentType: string;
    if (fileName.includes('.m3u8')) {
        contentType = 'application/x-mpegURL';
    } else { // For segment001.ts file types --
        contentType = 'video/MP2T';
    }

    res.writeHead(200, {
        "Content-Type": contentType,
    })
    res.end(filePayload); // It sends the Buffer Stream to res
    return;

}