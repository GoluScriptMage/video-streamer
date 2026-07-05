import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { streamJITSegement } from "../src/utils/segmenter.js";

async function test() {
    const JIT_Key = crypto.randomBytes(16);
    const mediaPath = path.join(process.cwd(), "media", "sample.mp4");
    
    // Create a mock response stream to capture output
    const mockRes: any = {
        writeHead: () => {},
        end: () => {}
    };

    console.log("Transcoding segment 0...");
    const rawTSBuffer = await streamJITSegement({
        segementIndex: 0,
        segmentDuration: 2,
        inputPath: mediaPath,
        resolution: "720p"
    }, mockRes);

    console.log("Raw TS size:", rawTSBuffer.length);

    // Encrypt
    const iv = Buffer.alloc(16, 0);
    iv.writeUInt32BE(0, 12);
    const cipher = crypto.createCipheriv('aes-128-cbc', JIT_Key, iv);
    const part1 = cipher.update(rawTSBuffer);
    const part2 = cipher.final();
    const encrypted = Buffer.concat([part1, part2]);

    console.log("Encrypted size:", encrypted.length);

    // Decrypt
    const decipher = crypto.createDecipheriv('aes-128-cbc', JIT_Key, iv);
    const decPart1 = decipher.update(encrypted);
    const decPart2 = decipher.final();
    const decrypted = Buffer.concat([decPart1, decPart2]);

    console.log("Decrypted size:", decrypted.length);

    // Compare
    const match = rawTSBuffer.equals(decrypted);
    console.log("Buffer match:", match);

    if (match) {
        console.log("Verification SUCCESS: Decrypted TS matches raw TS!");
    } else {
        console.error("Verification FAILURE: Decrypted TS does NOT match raw TS!");
    }
}

test().catch(console.error);
