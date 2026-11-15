#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execSync } = require("child_process");
const { Server } = require("@modelcontextprotocol/sdk/server/index.js");
const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");
const { ListToolsRequestSchema, CallToolRequestSchema } = require("@modelcontextprotocol/sdk/types.js");
const { MsEdgeTTS, OUTPUT_FORMAT } = require("msedge-tts");

const ROOT_DIR = path.resolve(__dirname);
const ROOT_FILE = path.join(ROOT_DIR, "src/Root.tsx");
const PUBLIC_DIR = path.join(ROOT_DIR, "public");
const FFMPEG_BIN = path.join(ROOT_DIR, "node_modules/@remotion/compositor-linux-x64-gnu/ffmpeg");

// Auto-load .env
const envPath = path.join(ROOT_DIR, ".env");
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, "utf8");
  for (const line of envContent.split("\n")) {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
    if (match) {
      const key = match[1];
      let val = match[2] || "";
      if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
      if (val.startsWith("'") && val.endsWith("'")) val = val.slice(1, -1);
      process.env[key] = val.trim();
    }
  }
}

const TOOLS = [
  {
    name: "get_root_code",
    description: "Membaca seluruh kode sumber src/Root.tsx yang berisi semua scene, animasi teks kinetic, maskot kartun, dan konfigurasi video Remotion.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "update_root_code",
    description: "Memperbarui atau mengganti kode di src/Root.tsx. Tool ini otomatis melakukan validasi TypeScript (tsc --noEmit) dan membatalkan perubahan jika terdapat syntax/type error.",
    inputSchema: {
      type: "object",
      properties: {
        code: {
          type: "string",
          description: "Kode lengkap baru untuk src/Root.tsx",
        },
      },
      required: ["code"],
    },
  },
  {
    name: "generate_voiceover",
    description: "Membuat voiceover suara manusia alami menggunakan ElevenLabs AI (Ultra Realistis) atau Microsoft Neural Voice berbahasa Indonesia dan otomatis menyimpannya ke public/voiceover.mp3.",
    inputSchema: {
      type: "object",
      properties: {
        provider: {
          type: "string",
          enum: ["elevenlabs", "microsoft"],
          description: "Provider TTS: 'elevenlabs' (kualitas terbaik dunia, butuh API key) atau 'microsoft' (gratis)",
        },
        apiKey: {
          type: "string",
          description: "ElevenLabs API Key (opsional jika sudah diatur di ELEVENLABS_API_KEY environment variable)",
        },
        voice: {
          type: "string",
          description: "ID Suara atau Nama Karakter. Contoh ElevenLabs: 'pNInz6obpgDQGcFmaJgB' (Adam), '21m00Tcm4TlvDq8ikWAM' (Rachel), 'ErXwobaYiN019PkySvjV' (Antoni). Contoh Microsoft: 'id-ID-ArdiNeural', 'id-ID-GadisNeural'.",
        },
        segments: {
          type: "array",
          description: "Daftar segmen naskah per scene beserta waktu mulai (detik), kecepatan bicara, dan durasi scene.",
          items: {
            type: "object",
            properties: {
              start: { type: "number", description: "Waktu mulai dalam detik untuk mengatur jeda/timing antar scene (contoh: 0.2, 5.5, 18.2)" },
              text: { type: "string", description: "Teks narasi bahasa Indonesia per scene" },
              speed: { type: "number", description: "Kecepatan bicara (0.8 - 1.25, contoh: 1.1 untuk hook cepat, 1.0 normal, 0.95 santai)" },
              rate: { type: "string", description: "Kecepatan bicara alternatif (contoh: '+10%', '+15%')" },
              dur: { type: "number", description: "Batas durasi scene dalam detik (otomatis disesuaikan agar tidak bocor ke scene berikutnya)" },
            },
            required: ["start", "text"],
          },
        },
      },
      required: ["segments"],
    },
  },
  {
    name: "get_project_status",
    description: "Mengecek status Remotion Studio, URL preview web, resolusi, FPS, dan durasi video saat ini.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "render_video",
    description: "Merender video Remotion menjadi file MP4 (H.264) siap pakai.",
    inputSchema: {
      type: "object",
      properties: {
        compositionId: {
          type: "string",
          description: "ID komposisi (default: 'KecanduanSosmed')",
        },
        outputPath: {
          type: "string",
          description: "Lokasi file MP4 output (default: 'out/video.mp4')",
        },
      },
    },
  },
];

async function executeTool(name, args = {}) {
  try {
    if (name === "get_root_code") {
      const code = fs.readFileSync(ROOT_FILE, "utf8");
      return {
        content: [{ type: "text", text: code }],
      };
    }

    if (name === "update_root_code") {
      const newCode = args.code;
      const backup = fs.readFileSync(ROOT_FILE, "utf8");

      fs.writeFileSync(ROOT_FILE, newCode, "utf8");

      try {
        execSync("npx tsc --noEmit", { cwd: ROOT_DIR, stdio: "pipe" });
        return {
          content: [
            {
              type: "text",
              text: "✅ src/Root.tsx berhasil diperbarui! Validasi TypeScript sukses dan Remotion Studio telah meng-update tampilan secara realtime.",
            },
          ],
        };
      } catch (tscErr) {
        fs.writeFileSync(ROOT_FILE, backup, "utf8");
        const errMsg = tscErr.stderr?.toString() || tscErr.stdout?.toString() || tscErr.message;
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `❌ Gagal memperbarui src/Root.tsx karena ada error TypeScript. File telah di-rollback ke versi sebelumnya.\n\nError:\n${errMsg}`,
            },
          ],
        };
      }
    }

    if (name === "generate_voiceover") {
      const { provider = "microsoft", apiKey, voice = "id-ID-ArdiNeural", voiceId, modelId = "eleven_multilingual_v2", segments } = args;
      const effectiveApiKey = apiKey || process.env.ELEVENLABS_API_KEY;
      const tempDir = "/tmp/mcp_neural_tts";
      if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

      const wavClips = [];

      if (provider === "elevenlabs" || voiceId) {
        if (!effectiveApiKey) {
          return {
            isError: true,
            content: [
              {
                type: "text",
                text: "❌ ElevenLabs API Key belum dimasukkan! Dapatkan API Key gratis di https://elevenlabs.io (10.000 karakter gratis/bulan). Anda bisa memasukkannya di modal Generate Voiceover atau set di .env (ELEVENLABS_API_KEY=your_key).",
              },
            ],
          };
        }

        const effectiveVoiceId = voiceId || voice || "pNInz6obpgDQGcFmaJgB"; // Default: Adam

        for (let i = 0; i < segments.length; i++) {
          const seg = segments[i];
          const rawOut = path.join(tempDir, `seg_${i}_raw.mp3`);
          const wavOut = path.join(tempDir, `seg_${i}.wav`);

          let speedVal = 1.0;
          if (typeof seg.speed === "number") {
            speedVal = Math.max(0.7, Math.min(1.25, seg.speed));
          } else if (typeof seg.rate === "string") {
            const m = seg.rate.match(/([+-]?\d+)/);
            if (m) speedVal = Math.max(0.7, Math.min(1.25, 1.0 + parseInt(m[1], 10) / 100));
          }

          const ttsResp = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${effectiveVoiceId}`, {
            method: "POST",
            headers: {
              "Accept": "audio/mpeg",
              "Content-Type": "application/json",
              "xi-api-key": effectiveApiKey,
            },
            body: JSON.stringify({
              text: seg.text,
              model_id: modelId,
              voice_settings: {
                stability: 0.5,
                similarity_boost: 0.8,
                speed: speedVal,
                style: 0.0,
                use_speaker_boost: true,
              },
            }),
          });

          if (!ttsResp.ok) {
            const errBody = await ttsResp.text();
            return {
              isError: true,
              content: [
                {
                  type: "text",
                  text: `❌ Gagal menghubungi ElevenLabs (${ttsResp.status}): ${errBody}`,
                },
              ],
            };
          }

          const arrayBuffer = await ttsResp.arrayBuffer();
          fs.writeFileSync(rawOut, Buffer.from(arrayBuffer));

          // Auto-fit duration if scene duration limit is provided
          let tempoFilter = "";
          if (seg.dur && seg.dur > 0) {
            try {
              const probeOut = execSync(`"${FFMPEG_BIN}" -i "${rawOut}" 2>&1 | grep "Duration"`, { encoding: "utf8" });
              const durMatch = probeOut.match(/Duration:\s*(\d+):(\d+):([0-9.]+)/);
              if (durMatch) {
                const durSec = parseInt(durMatch[1], 10) * 3600 + parseInt(durMatch[2], 10) * 60 + parseFloat(durMatch[3]);
                const maxAllowed = seg.dur - 0.25; // 0.25s breath room
                if (durSec > maxAllowed && maxAllowed > 0.5) {
                  const neededSpeed = Math.min(2.0, Math.max(0.5, durSec / maxAllowed));
                  tempoFilter = `-filter:a "atempo=${neededSpeed.toFixed(2)}"`;
                }
              }
            } catch (_) {}
          }

          execSync(`"${FFMPEG_BIN}" -y -i "${rawOut}" ${tempoFilter} -ar 44100 -ac 2 "${wavOut}"`, { stdio: "ignore" });
          wavClips.push({ path: wavOut, start: seg.start });
        }
      } else {
        const tts = new MsEdgeTTS();
        await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);

        for (let i = 0; i < segments.length; i++) {
          const seg = segments[i];
          const rawOut = path.join(tempDir, `seg_${i}_raw.mp3`);
          const wavOut = path.join(tempDir, `seg_${i}.wav`);

          const res = await tts.toFile(tempDir, seg.text, { rate: seg.rate || "+10%" });
          fs.renameSync(res.audioFilePath, rawOut);

          execSync(`"${FFMPEG_BIN}" -y -i "${rawOut}" -ar 44100 -ac 2 "${wavOut}"`, { stdio: "ignore" });
          wavClips.push({ path: wavOut, start: seg.start });
        }
        tts.close();
      }

      const pyScript = `
import wave, struct
sample_rate = 44100
clips = ${JSON.stringify(wavClips)}

max_end = 60.5
for c in clips:
    with wave.open(c['path'], 'rb') as w:
        end_time = c['start'] + (w.getnframes() / float(sample_rate))
        if end_time > max_end:
            max_end = end_time + 1.0

total_samples = int(sample_rate * max_end)
out_samples = [0.0] * total_samples

for c in clips:
    with wave.open(c['path'], 'rb') as w:
        nc = w.getnchannels()
        nf = w.getnframes()
        data = w.readframes(nf)
        raw = struct.unpack(f"<{nf * nc}h", data)
        start_idx = int(c['start'] * sample_rate)
        for i in range(nf):
            idx = start_idx + i
            if idx < total_samples:
                out_samples[idx] += raw[i * nc] / 32768.0

max_val = max(abs(x) for x in out_samples)
if max_val > 0:
    scale = 0.96 / max_val
    out_samples = [x * scale for x in out_samples]

with wave.open('/tmp/mcp_vo_full.wav', 'wb') as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(sample_rate)
    frames = bytearray()
    for s in out_samples:
        v = int(max(-32767, min(32767, s * 32767)))
        frames.extend(struct.pack('<hh', v, v))
    w.writeframes(frames)
`;
      fs.writeFileSync("/tmp/mcp_mix.py", pyScript);
      execSync("python3 /tmp/mcp_mix.py");

      const finalVoPath = path.join(PUBLIC_DIR, "voiceover.mp3");
      execSync(`"${FFMPEG_BIN}" -y -i /tmp/mcp_vo_full.wav -b:a 192k "${finalVoPath}"`);

      return {
        content: [
          {
            type: "text",
            text: `✅ Voiceover berhasil dibuat menggunakan suara ${voice} (${segments.length} segmen)! File tersimpan di public/voiceover.mp3 dan langsung aktif saat video diputar.`,
          },
        ],
      };
    }

    if (name === "get_project_status") {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                compositionId: "KecanduanSosmed",
                resolution: "1080x1920 (9:16 Vertical)",
                fps: 30,
                durationSeconds: 60,
                durationFrames: 1800,
                previewUrl: "https://motion.chost.my.id/KecanduanSosmed",
                hasBgm: fs.existsSync(path.join(PUBLIC_DIR, "bgm.mp3")),
                hasVoiceover: fs.existsSync(path.join(PUBLIC_DIR, "voiceover.mp3")),
              },
              null,
              2
            ),
          },
        ],
      };
    }

    if (name === "render_video") {
      const compId = args.compositionId || "KecanduanSosmed";
      const outPath = args.outputPath || "out/video.mp4";
      const fullOut = path.resolve(ROOT_DIR, outPath);
      const outDir = path.dirname(fullOut);
      if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

      execSync(`npx remotion render ${compId} ${outPath}`, {
        cwd: ROOT_DIR,
        stdio: "inherit",
      });

      const stats = fs.statSync(fullOut);
      const sizeMb = (stats.size / (1024 * 1024)).toFixed(2);

      return {
        content: [
          {
            type: "text",
            text: `🎉 Video berhasil dirender ke: ${outPath} (Ukuran: ${sizeMb} MB)! Siap dibagikan ke TikTok/Reels/Shorts.`,
          },
        ],
      };
    }

    return {
      isError: true,
      content: [{ type: "text", text: `Tool unknown: ${name}` }],
    };
  } catch (error) {
    return {
      isError: true,
      content: [{ type: "text", text: `Error executing ${name}: ${error.message}` }],
    };
  }
}

function createMcpServer() {
  const server = new Server(
    {
      name: "remotion-video-creator",
      version: "1.0.0",
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools: TOOLS };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    return executeTool(request.params.name, request.params.arguments);
  });

  return server;
}

const sseClients = new Map();

function setCorsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS, HEAD, DELETE");
  res.setHeader("Access-Control-Allow-Headers", "*");
  res.setHeader("Access-Control-Expose-Headers", "*");
}

function readBody(req) {
  return new Promise((resolve) => {
    let chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", () => resolve(""));
  });
}

const SERVER_INSTRUCTIONS =
  "Kamu adalah Sutradara & Developer AI Video Remotion yang mengontrol pembuatan video pendek motion graphics vertikal di https://motion.chost.my.id/KecanduanSosmed. Gunakan get_root_code untuk membaca seluruh kode animasi dan naskah di Root.tsx, update_root_code untuk mengubah kode dan scene secara live dengan auto-rollback TypeScript, generate_voiceover untuk mengisi suara alami manusia berbahasa Indonesia (Microsoft Neural Voice Ardi/Gadis), get_project_status untuk melihat status video, dan render_video untuk merender ke MP4 siap upload.";

async function processJsonRpcMessage(msg) {
  if (!msg || typeof msg !== "object") return null;
  const { id, method, params } = msg;

  if (id === undefined || id === null) {
    console.log(`[MCP Notification] ${method}`);
    return null;
  }

  if (method === "server/discover") {
    return {
      jsonrpc: "2.0",
      id,
      result: {
        supportedVersions: ["2024-11-05", "2025-03-26", "2025-11-25", "2026-07-28"],
        capabilities: {
          tools: { listChanged: false },
        },
        _meta: {
          "io.modelcontextprotocol/serverInfo": {
            name: "remotion-video-creator",
            version: "1.0.0",
          },
        },
        instructions: SERVER_INSTRUCTIONS,
      },
    };
  }

  if (method === "initialize") {
    return {
      jsonrpc: "2.0",
      id,
      result: {
        protocolVersion: params?.protocolVersion || "2025-11-25",
        capabilities: {
          tools: { listChanged: false },
        },
        serverInfo: {
          name: "remotion-video-creator",
          version: "1.0.0",
        },
        instructions: SERVER_INSTRUCTIONS,
      },
    };
  }

  if (method === "ping") {
    return { jsonrpc: "2.0", id, result: {} };
  }

  if (method === "tools/list") {
    return {
      jsonrpc: "2.0",
      id,
      result: {
        tools: TOOLS,
      },
    };
  }

  if (method === "tools/call") {
    const toolResult = await executeTool(params?.name, params?.arguments || {});
    return {
      jsonrpc: "2.0",
      id,
      result: toolResult,
    };
  }

  if (method === "resources/list") {
    return { jsonrpc: "2.0", id, result: { resources: [] } };
  }

  if (method === "prompts/list") {
    return { jsonrpc: "2.0", id, result: { prompts: [] } };
  }

  return {
    jsonrpc: "2.0",
    id,
    error: {
      code: -32601,
      message: `Method not found: ${method}`,
    },
  };
}

async function handleUnifiedMcpRequest(req, res) {
  setCorsHeaders(res);

  if (req.method === "OPTIONS") {
    res.writeHead(200);
    res.end();
    return;
  }

  if (req.method === "HEAD") {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    res.end();
    return;
  }

  const reqUrl = new URL(req.url, "http://localhost");
  const host = req.headers["x-forwarded-host"] || req.headers.host || "motion.chost.my.id";
  const proto = req.headers["x-forwarded-proto"] || "https";

  // Handle GET /sse (SSE Connection establishment)
  if (req.method === "GET") {
    const isSse = reqUrl.pathname === "/sse" || (req.headers.accept && req.headers.accept.includes("text/event-stream"));
    if (isSse) {
      const sessionId = crypto.randomUUID();
      console.log(`[MCP SSE] Client connected: ${sessionId}`);

      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "mcp-session-id": sessionId,
      });

      const endpointUrl = `${proto}://${host}/messages?sessionId=${sessionId}`;
      res.write(`event: endpoint\ndata: ${endpointUrl}\n\n`);

      sseClients.set(sessionId, res);

      const keepAliveTimer = setInterval(() => {
        if (!res.writableEnded) {
          res.write(": keepalive\n\n");
        }
      }, 15000);

      res.on("close", () => {
        clearInterval(keepAliveTimer);
        sseClients.delete(sessionId);
        console.log(`[MCP SSE] Client disconnected: ${sessionId}`);
      });
      return;
    }

    // Normal GET on /mcp or /messages
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        status: "ok",
        name: "remotion-video-creator",
        mcp: true,
        endpoint: `${proto}://${host}/sse`,
      })
    );
    return;
  }

  // Handle POST (JSON-RPC requests: server/discover, initialize, tools/list, tools/call)
  if (req.method === "POST") {
    const rawBody = await readBody(req);
    let parsed = null;
    try {
      parsed = JSON.parse(rawBody || "{}");
    } catch {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ jsonrpc: "2.0", error: { code: -32700, message: "Parse error" }, id: null }));
      return;
    }

    let responsePayload = null;
    if (Array.isArray(parsed)) {
      const results = await Promise.all(parsed.map(processJsonRpcMessage));
      responsePayload = results.filter(Boolean);
    } else {
      responsePayload = await processJsonRpcMessage(parsed);
    }

    // If query has sessionId or header has mcp-session-id, broadcast to that SSE stream too
    const sessionId = reqUrl.searchParams.get("sessionId") || req.headers["mcp-session-id"];
    if (responsePayload) {
      const sseTarget = (sessionId && sseClients.get(sessionId)) || sseClients.values().next().value;
      if (sseTarget && !sseTarget.writableEnded) {
        sseTarget.write(`event: message\ndata: ${JSON.stringify(responsePayload)}\n\n`);
      }
    }

    if (!responsePayload) {
      res.writeHead(202);
      res.end();
      return;
    }

    res.writeHead(200, {
      "Content-Type": "application/json; charset=utf-8",
      ...(sessionId ? { "mcp-session-id": sessionId } : {}),
    });
    res.end(JSON.stringify(responsePayload));
    return;
  }

  // Fallback
  res.writeHead(405, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Method not allowed" }));
}

module.exports = {
  TOOLS,
  executeTool,
  createMcpServer,
  setCorsHeaders,
  handleUnifiedMcpRequest,
  // backwards compatibility
  handleMcpSseRequest: handleUnifiedMcpRequest,
  handleMcpPostMessage: handleUnifiedMcpRequest,
  handleMcpStreamableRequest: handleUnifiedMcpRequest,
};

// If run directly from command line (stdio mode for Claude Desktop)
if (require.main === module) {
  const globalServer = createMcpServer();
  const transport = new StdioServerTransport();
  globalServer.connect(transport).then(() => {
    console.error("[Remotion MCP Server] Connected via stdio.");
  });
}
