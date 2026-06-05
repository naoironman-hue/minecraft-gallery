# Minecraft Gallery

Minecraft server status gallery for the local vibe platform.

V0 was a verified static snapshot of the remote Crafty/Paper/Geyser server on the tailnet.
V1 adds a live backend endpoint that performs a Bedrock/Geyser UDP ping every time the UI refreshes.

## Live API

```text
GET /api/bedrock-status
GET /api/status
```

Environment variables:

```bash
BEDROCK_HOST=100.100.163.40
BEDROCK_PORT=25566
PORT=80
```

## Local dev

```bash
npm install
npm run build
PORT=4188 node server.js
```

## Deploy target

`http://minecraft.100.123.113.64.sslip.io`
