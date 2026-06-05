import dgram from 'node:dgram';
import crypto from 'node:crypto';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectServerStatus } from './ssh-collector.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 80;
const BEDROCK_HOST = process.env.BEDROCK_HOST || '100.100.163.40';
const BEDROCK_PORT = Number(process.env.BEDROCK_PORT || 25566);

const MAGIC = Buffer.from('00ffff00fefefefefdfdfdfd12345678', 'hex');

function parseBedrockPong(buf) {
  // Unconnected pong: 0x1c + ping time(8) + server guid(8) + magic(16) + string length(2) + UTF-8 semicolon fields
  if (!buf || buf.length < 35 || buf[0] !== 0x1c) return null;
  const lenOffset = 1 + 8 + 8 + 16;
  const len = buf.readUInt16BE(lenOffset);
  const start = lenOffset + 2;
  const motd = buf.subarray(start, start + len).toString('utf8');
  const parts = motd.split(';');
  return {
    raw: motd,
    edition: parts[0] || null,
    motd: parts[1] || null,
    protocol: parts[2] || null,
    version: parts[3] || null,
    onlinePlayers: Number(parts[4] || 0),
    maxPlayers: Number(parts[5] || 0),
    serverGuid: parts[6] || null,
    levelName: parts[7] || null,
    gameMode: parts[8] || null,
    gameModeNumeric: parts[9] || null,
    portIpv4: parts[10] || null,
    portIpv6: parts[11] || null,
  };
}

function pingBedrock(host, port, timeoutMs = 2500) {
  return new Promise((resolve) => {
    const socket = dgram.createSocket('udp4');
    const started = Date.now();
    const pingTime = BigInt(Date.now());
    const clientGuid = crypto.randomBytes(8);
    const packet = Buffer.alloc(1 + 8 + MAGIC.length + 8);
    packet[0] = 0x01;
    packet.writeBigInt64BE(pingTime, 1);
    MAGIC.copy(packet, 9);
    clientGuid.copy(packet, 9 + MAGIC.length);

    const done = (result) => {
      try { socket.close(); } catch {}
      resolve({ checkedAt: new Date().toISOString(), host, port, latencyMs: Date.now() - started, ...result });
    };

    const timer = setTimeout(() => done({ ok: false, online: false, error: `timeout after ${timeoutMs}ms` }), timeoutMs);
    socket.once('message', (msg) => {
      clearTimeout(timer);
      const parsed = parseBedrockPong(msg);
      if (!parsed) return done({ ok: false, online: false, error: 'unexpected pong packet', packetHex: msg.toString('hex').slice(0, 120) });
      done({ ok: true, online: true, bedrock: parsed });
    });
    socket.once('error', (error) => {
      clearTimeout(timer);
      done({ ok: false, online: false, error: error.message });
    });
    socket.send(packet, port, host);
  });
}

app.get('/api/bedrock-status', async (_req, res) => {
  res.json(await pingBedrock(BEDROCK_HOST, BEDROCK_PORT));
});

app.get('/api/status', async (_req, res) => {
  const [bedrock, server] = await Promise.allSettled([
    pingBedrock(BEDROCK_HOST, BEDROCK_PORT),
    collectServerStatus(),
  ]);

  const bedrockData = bedrock.status === 'fulfilled' ? bedrock.value : { ok: false, error: bedrock.reason?.message };
  const serverData = server.status === 'fulfilled' ? server.value : { error: server.reason?.message };

  res.json({
    checkedAt: new Date().toISOString(),
    bedrock: bedrockData,
    server: serverData,
  });
});

app.use(express.static(path.join(__dirname, 'dist')));
app.get(/.*/, (_req, res) => res.sendFile(path.join(__dirname, 'dist', 'index.html')));

app.listen(PORT, '0.0.0.0', () => {
  console.log(`minecraft-gallery listening on ${PORT}; bedrock ${BEDROCK_HOST}:${BEDROCK_PORT}`);
});
