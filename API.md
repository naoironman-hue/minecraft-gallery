# Minecraft Gallery API

Base URL: `http://minecraft.100.123.113.64.sslip.io`

## Endpoints

### GET /api/status

Returns live server status including Bedrock ping and SSH-collected server data.

**Response:**
```json
{
  "checkedAt": "2026-06-05T18:09:34.852Z",
  "bedrock": {
    "online": true,
    "latencyMs": 214,
    "bedrock": {
      "version": "26.23",
      "onlinePlayers": 0,
      "maxPlayers": 20,
      "motd": "A Minecraft Server"
    }
  },
  "server": {
    "host": "ubuntu-4gb-fsn1-2",
    "uptime": "up 65 days, 6:36",
    "disk": {
      "total": "38G",
      "used": "35G",
      "free": "1.2G",
      "percent": "97%"
    },
    "craftySize": "17G",
    "service": {
      "name": "openclaw-gateway",
      "status": "active"
    },
    "backups": {
      "total": 5,
      "latest": {
        "name": "backup-2026-06-05.zip",
        "size": "1234567",
        "date": "2026-06-05",
        "time": "12:00:00"
      }
    }
  }
}
```

**Refresh Rate:** Data is collected fresh on each request
- Bedrock ping: ~200ms
- SSH collection: ~5 seconds

---

### GET /api/bedrock-status

Returns only Bedrock/Geyser UDP ping status.

**Response:**
```json
{
  "checkedAt": "2026-06-05T18:09:29.739Z",
  "host": "100.100.163.40",
  "port": 25566,
  "latencyMs": 214,
  "ok": true,
  "online": true,
  "bedrock": {
    "edition": "MCPE",
    "motd": "A Minecraft Server",
    "protocol": "975",
    "version": "26.23",
    "onlinePlayers": 0,
    "maxPlayers": 20,
    "gameMode": "Survival"
  }
}
```

---

### GET /api/cleanup-backups

**⚠️ DESTRUCTIVE OPERATION**

Cleans up old backups on the mineclaw server, keeping only the **latest 5 valid backups**.

**Response (no backups to clean):**
```json
{
  "checkedAt": "2026-06-05T18:15:52.055Z",
  "latencyMs": 1450,
  "kept": 0,
  "deleted": 0,
  "message": "No backups to clean up"
}
```

**Response (successful cleanup):**
```json
{
  "checkedAt": "2026-06-05T18:15:52.055Z",
  "latencyMs": 4200,
  "kept": 5,
  "deleted": 12,
  "failed": 0,
  "backupsKept": [
    "backup-2026-06-05-120000.zip",
    "backup-2026-06-04-120000.zip",
    "backup-2026-06-03-120000.zip",
    "backup-2026-06-02-120000.zip",
    "backup-2026-06-01-120000.zip"
  ],
  "backupsDeleted": [
    "backup-2026-05-31-120000.zip",
    "backup-2026-05-30-120000.zip",
    ...
  ],
  "errors": []
}
```

**Response (with errors):**
```json
{
  "checkedAt": "2026-06-05T18:15:52.055Z",
  "latencyMs": 3500,
  "kept": 5,
  "deleted": 10,
  "failed": 2,
  "errors": [
    {
      "name": "corrupt-backup.zip",
      "error": "Permission denied"
    }
  ]
}
```

**Logic:**
1. Lists all `.zip` files in `/var/opt/minecraft/crafty/crafty-4/backups/`
2. Filters out zero-byte files (incomplete/failed backups)
3. Sorts by date (newest first)
4. Keeps the first 5 valid backups
5. Deletes all remaining backups

**Usage:**

Simple GET request (can be scheduled via cron):
```bash
curl http://minecraft.100.123.113.64.sslip.io/api/cleanup-backups
```

Or with a cron job:
```cron
# Clean up backups every Sunday at 3 AM
0 3 * * 0 curl -s http://minecraft.100.123.113.64.sslip.io/api/cleanup-backups
```

---

### POST /api/cleanup-backups

Same as GET endpoint. POST method is provided for UI button compatibility.

**Response:** Same as GET /api/cleanup-backups

---

## Architecture

**Server-to-Server Communication:**
```
Client Browser → Gallery Backend (Coolify) → SSH → Mineclaw Server (100.100.163.40)
```

**Data Collection:**
- Bedrock ping: Direct UDP connection to `100.100.163.40:25566`
- Server stats: SSH connection with key-based auth to `dima@100.100.163.40`
- Backup cleanup: SSH `rm` commands on remote server

**Security:**
- SSH key stored as base64-encoded environment variable in Coolify
- Read-only operations except for backup cleanup
- No authentication required (Tailnet-only access)

---

## Frontend

The web UI at the base URL provides:
- Live auto-refreshing dashboard (every 45 seconds)
- Visual status indicators
- Backup cleanup button with confirmation dialog
- Real-time feedback on operations
