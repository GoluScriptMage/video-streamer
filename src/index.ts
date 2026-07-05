import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { handleVideoStreaming } from "./routes/videoRoute.js";
import { handleHlsStreaming } from "./routes/hlsStreaming.js";
import { handleTestRoute } from "./routes/testRoute.js";
import { handleJITStreaming } from "./routes/jitStreaming.js";

const PORT = 3001;
const videoPath = path.join(process.cwd(), "media", "sample.mp4");

/**
 * Cache
 */
// Use a static 16-byte key in development to prevent key mismatches across server restarts
const JIT_Key = Buffer.from("supersecretkey12");
// Clear stale disk cache of transcoded fragments on startup to avoid key mismatches
try {
  const hlsDir = path.join(process.cwd(), "hls");
  if (fs.existsSync(hlsDir)) {
    fs.rmSync(hlsDir, { recursive: true, force: true });
    console.log("[Server] Cleared stale hls/ cache directory successfully.");
  }
} catch (err) {
  console.error("[Server] Failed to clean hls cache directory:", err);
}

const server = http.createServer(async (req, res) => {
  const url = req.url || "/";
  const splitUrl = url.split("/");

  // Route 1: Home page serving HTML5 Video Player
  if (url === "/") {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(`
      <!DOCTYPE html>                                             
      <html lang="en">                                            
      <head>                                                      
        <meta charset="UTF-8">                                    
        <title>Dynamic Media Server Portal</title>                       
        <style>                                                   
          body { 
            background: #0b0b0f; 
            color: #e2e2e9; 
            font-family: 'Outfit', 'Inter', sans-serif; 
            padding: 40px 20px; 
            margin: 0;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 90vh;
          }                                        
          .container { 
            max-width: 900px; 
            width: 100%;
            background: radial-gradient(circle at top left, #181824, #0e0e16); 
            padding: 40px; 
            border-radius: 16px; 
            border: 1px solid #2a2a3e; 
            box-shadow: 0 12px 40px rgba(0,0,0,0.6);
            text-align: center;
          }                                                    
          h1 {
            margin-top: 0;
            background: linear-gradient(135deg, #a855f7, #6366f1);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            font-size: 32px;
            font-weight: 800;
            letter-spacing: -0.5px;
          }
          p.subtitle {
            color: #94a3b8;
            margin-bottom: 40px;
            font-size: 16px;
          }
          .grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
            gap: 20px;
            margin-top: 20px;
          }
          .card {
            background: rgba(30, 30, 46, 0.6);
            border: 1px solid #2e2e42;
            border-radius: 12px;
            padding: 24px;
            text-align: left;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            display: flex;
            flex-direction: column;
            justify-content: space-between;
          }
          .card:hover {
            transform: translateY(-5px);
            border-color: #a855f7;
            box-shadow: 0 8px 24px rgba(168, 85, 247, 0.15);
          }
          .card h3 {
            margin: 0 0 10px 0;
            color: #f1f5f9;
            font-size: 18px;
          }
          .card p {
            color: #94a3b8;
            font-size: 14px;
            line-height: 1.5;
            margin: 0 0 20px 0;
            flex-grow: 1;
          }
          .btn {
            display: inline-block;
            text-decoration: none;
            background: linear-gradient(135deg, #a855f7, #7c3aed);
            color: #ffffff;
            padding: 10px 20px;
            border-radius: 8px;
            font-size: 14px;
            font-weight: 600;
            text-align: center;
            transition: opacity 0.2s;
          }
          .btn:hover {
            opacity: 0.9;
          }
          .btn-secondary {
            background: #2e2e42;
            border: 1px solid #3e3e56;
          }
          .btn-secondary:hover {
            background: #3e3e56;
          }
        </style>
        <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;800&display=swap" rel="stylesheet">
      </head>
      <body>
        <div class="container">
          <h1>🎬 JIT HLS & Progressive Video Server</h1>
          <p class="subtitle">A high-performance media engine built in raw Node.js & TypeScript</p>
          
          <div class="grid">
            <div class="card">
              <h3>🌐 Encrypted JIT HLS Player</h3>
              <p>Play dynamic, seekable HLS segments transcoded and encrypted on-the-fly via AES-128-CBC.</p>
              <a href="/jit-player" class="btn">Launch Player</a>
            </div>
            
            <div class="card">
              <h3>🎥 Progressive Range Stream</h3>
              <p>Stream raw MP4 video natively with support for HTTP partial content range queries (206).</p>
              <a href="/video" class="btn btn-secondary">Open Raw Video</a>
            </div>
            
            <div class="card">
              <h3>⚡ RAM vs Disk Benchmark</h3>
              <p>Run a micro-benchmark comparing segment buffer read times from LRU memory cache vs local disk.</p>
              <a href="/test" class="btn btn-secondary">Run Benchmark</a>
            </div>
          </div>
        </div>
      </body>
      </html>
    `);
    return;
  }

  // Route 2: Video Stream path (Starter stub)
  if (url === "/video") {
    return handleVideoStreaming(req, res, videoPath);
  }

  // Route for hls video 
  if (splitUrl[1] === "hls") {
    return await handleHlsStreaming(req, res, url);
  }

  // Route for getting test info 
  if (splitUrl[1] === "test") {
    return handleTestRoute(req, res, splitUrl);
  }

  // Route for JIT video playing 
  if (splitUrl[1] === 'jit' || url.startsWith('/jit-player')) {
    return await handleJITStreaming(req, res, url, JIT_Key);
  }

  // Route for Client 
  if (url.startsWith("/client.js")) {
    let clientPath = path.join(process.cwd(), 'src', 'services', 'client.js');

    if (!fs.existsSync(clientPath)) {
      clientPath = path.join(process.cwd(), 'dist', 'services', 'client.js');
    }

    if (fs.existsSync(clientPath)) {
      res.writeHead(200, {
        "Content-Type": "application/javascript"
      });
      fs.createReadStream(clientPath).pipe(res);
    } else {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("client.js not Found");
    }
    return;
  }

  // Fallback for other routes (like favicon.ico)
  res.writeHead(404, { "Content-Type": "text/plain" });
  res.end("Not Found\n");
});
server.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
});
