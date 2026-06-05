import { Client } from 'ssh2';

const SSH_HOST = process.env.SSH_HOST || '100.100.163.40';
const SSH_USER = process.env.SSH_USER || 'dima';
const SSH_KEY_RAW = process.env.SSH_PRIVATE_KEY;
const SSH_KEY = SSH_KEY_RAW 
  ? (SSH_KEY_RAW.includes('-----BEGIN') 
      ? SSH_KEY_RAW 
      : Buffer.from(SSH_KEY_RAW, 'base64').toString('utf8'))
  : null;

function execSSH(command) {
  return new Promise((resolve, reject) => {
    if (!SSH_KEY) {
      return reject(new Error('SSH_PRIVATE_KEY env var not set'));
    }

    const conn = new Client();
    let output = '';
    let errorOutput = '';

    conn.on('ready', () => {
      conn.exec(command, (err, stream) => {
        if (err) {
          conn.end();
          return reject(err);
        }

        stream.on('data', (data) => { output += data.toString(); });
        stream.stderr.on('data', (data) => { errorOutput += data.toString(); });
        stream.on('close', (code) => {
          conn.end();
          if (code !== 0) {
            return reject(new Error(`Command exited with code ${code}: ${errorOutput}`));
          }
          resolve(output.trim());
        });
      });
    });

    conn.on('error', reject);

    conn.connect({
      host: SSH_HOST,
      port: 22,
      username: SSH_USER,
      privateKey: SSH_KEY,
      readyTimeout: 10000,
    });
  });
}

function parseDiskUsage(dfOutput) {
  // Expected: /dev/sda1       38G   35G  1.2G  97% /
  const match = dfOutput.match(/(\d+)G\s+(\d+)G\s+([\d.]+)G\s+(\d+)%/);
  if (!match) return { total: 'unknown', used: 'unknown', free: 'unknown', percent: 'unknown' };
  return {
    total: `${match[1]}G`,
    used: `${match[2]}G`,
    free: `${match[3]}G`,
    percent: `${match[4]}%`,
  };
}

function parseDuSize(duOutput) {
  // Expected: 17G     /var/opt/minecraft/crafty/crafty-4
  const match = duOutput.match(/^([\d.]+[KMGT]?)/);
  return match ? match[1] : 'unknown';
}

function parseServiceStatus(output) {
  return output.trim() === 'active' ? 'active' : output.trim();
}

function parseUptime(output) {
  // Expected:  14:18:59 up 65 days,  2:45,  2 users,  load average: 0.00, 0.00, 0.00
  const match = output.match(/up\s+(.+?),\s+\d+\s+users?/);
  return match ? `up ${match[1]}` : output.trim();
}

function parseLatestLog(output) {
  const lines = output.split('\n').filter(Boolean);
  const events = [];

  for (const line of lines) {
    // Paper version - format: "Running Paper 1.21.11-69-main@94d0c97"
    if (line.includes('Loading Paper') || line.includes('Running Paper')) {
      const ver = line.match(/Paper\s+([\d.]+-[\w@-]+)/);
      if (ver) events.push({ type: 'version', value: `Paper ${ver[1]}` });
    }
    // Also check "This server is running Paper version"
    if (line.includes('This server is running Paper version')) {
      const ver = line.match(/version\s+([\d.]+-[\w@-]+)/);
      if (ver) events.push({ type: 'version', value: `Paper ${ver[1]}` });
    }
    // Geyser version - format: "[Geyser-Spigot] Loading server plugin Geyser-Spigot v2.10.0-SNAPSHOT"
    if (line.includes('Geyser-Spigot') && line.includes('Loading server plugin')) {
      const ver = line.match(/Geyser-Spigot\s+v([\d.]+-[\w]+(?:\s+\([^)]+\))?)/);
      if (ver) events.push({ type: 'geyser', value: ver[1] });
    }
    // Geyser startup complete
    if (line.includes('[Geyser-Spigot] Done')) {
      const dur = line.match(/Done\s+\(([\d.]+s)\)/);
      if (dur) events.push({ type: 'geyser', value: `Started in ${dur[1]}` });
    }
    // Player join - format: "[Server thread/INFO]: .dimablochman joined the game"
    if (line.includes('joined the game')) {
      const player = line.match(/\[Server thread\/INFO\]:\s+([\w.]+)\s+joined/);
      const time = line.match(/\[(\d{2}:\d{2}:\d{2})\]/);
      if (player && time) {
        events.push({ type: 'join', player: player[1], time: time[1] });
      }
    }
    // Player leave - format: "[Server thread/INFO]: .dimablochman left the game"
    if (line.includes('left the game') || line.includes('lost connection')) {
      const player = line.match(/\[Server thread\/INFO\]:\s+([\w.]+)\s+(?:left|lost)/);
      const time = line.match(/\[(\d{2}:\d{2}:\d{2})\]/);
      if (player && time) {
        events.push({ type: 'leave', player: player[1], time: time[1] });
      }
    }
    // Server ready - format: "[Server thread/INFO]: Done (88.268s)! For help, type "help""
    if (line.includes('Done (') && line.includes('For help')) {
      const dur = line.match(/Done\s+\(([\d.]+s)\)/);
      const time = line.match(/\[(\d{2}:\d{2}:\d{2})\]/);
      if (dur && time) {
        events.push({ type: 'ready', duration: dur[1], time: time[1] });
      }
    }
  }

  return events;
}

function parseBackups(lsOutput) {
  const lines = lsOutput.split('\n').filter(Boolean);
  const backups = [];

  for (const line of lines) {
    const parts = line.split(/\s+/);
    if (parts.length < 9) continue;
    const size = parts[4];
    const date = parts[5];
    const time = parts[6];
    const name = parts.slice(8).join(' ');

    if (name.endsWith('.zip')) {
      backups.push({ name, size, date, time, sizeBytes: parseInt(size, 10) });
    }
  }

  return backups
    .filter((b) => b.sizeBytes > 0)
    .sort((a, b) => b.date.localeCompare(a.date) || b.time.localeCompare(a.time))
    .slice(0, 5);
}

export async function cleanupOldBackups() {
  const startTime = Date.now();

  try {
    // Get all backup files
    const backupList = await execSSH('ls -la /var/opt/minecraft/crafty/crafty-4/backups 2>/dev/null || echo ""');
    
    if (!backupList) {
      return {
        checkedAt: new Date().toISOString(),
        latencyMs: Date.now() - startTime,
        error: 'Could not list backups',
      };
    }

    const allBackups = parseBackups(backupList);
    
    // Keep latest 5 valid backups
    const backupsToKeep = allBackups.slice(0, 5);
    const backupsToDelete = allBackups.slice(5);

    if (backupsToDelete.length === 0) {
      return {
        checkedAt: new Date().toISOString(),
        latencyMs: Date.now() - startTime,
        kept: backupsToKeep.length,
        deleted: 0,
        message: 'No backups to clean up',
      };
    }

    // Delete old backups
    const deleteResults = [];
    for (const backup of backupsToDelete) {
      try {
        const escapedName = backup.name.replace(/'/g, "'\\''");
        await execSSH(`rm -f '/var/opt/minecraft/crafty/crafty-4/backups/${escapedName}'`);
        deleteResults.push({ name: backup.name, success: true });
      } catch (err) {
        deleteResults.push({ name: backup.name, success: false, error: err.message });
      }
    }

    return {
      checkedAt: new Date().toISOString(),
      latencyMs: Date.now() - startTime,
      kept: backupsToKeep.length,
      deleted: deleteResults.filter(r => r.success).length,
      failed: deleteResults.filter(r => !r.success).length,
      backupsKept: backupsToKeep.map(b => b.name),
      backupsDeleted: deleteResults.filter(r => r.success).map(r => r.name),
      errors: deleteResults.filter(r => !r.success).map(r => ({ name: r.name, error: r.error })),
    };
  } catch (error) {
    return {
      checkedAt: new Date().toISOString(),
      latencyMs: Date.now() - startTime,
      error: error.message,
    };
  }
}

export async function collectServerStatus() {
  const startTime = Date.now();

  try {
    const [disk, craftySize, serviceStatus, uptime, latestLog, backupList] = await Promise.allSettled([
      execSSH('df -h /'),
      execSSH('du -sh /var/opt/minecraft/crafty/crafty-4 2>/dev/null || echo unknown'),
      execSSH('systemctl is-active openclaw-gateway 2>/dev/null || echo unknown'),
      execSSH('uptime'),
      execSSH('tail -n 100 /var/opt/minecraft/crafty/crafty-4/servers/*/logs/latest.log 2>/dev/null || echo ""'),
      execSSH('ls -la /var/opt/minecraft/crafty/crafty-4/backups 2>/dev/null || echo ""'),
    ]);

    const diskData = disk.status === 'fulfilled' ? parseDiskUsage(disk.value) : null;
    const craftySizeData = craftySize.status === 'fulfilled' ? parseDuSize(craftySize.value) : 'unknown';
    const serviceData = serviceStatus.status === 'fulfilled' ? parseServiceStatus(serviceStatus.value) : 'unknown';
    const uptimeData = uptime.status === 'fulfilled' ? parseUptime(uptime.value) : 'unknown';
    const logEvents = latestLog.status === 'fulfilled' ? parseLatestLog(latestLog.value) : [];
    const backups = backupList.status === 'fulfilled' ? parseBackups(backupList.value) : [];

    const paperVersion = logEvents.find((e) => e.type === 'version')?.value || 'unknown';
    const geyserVersion = logEvents.find((e) => e.type === 'geyser')?.value || 'unknown';
    const lastJoin = logEvents.filter((e) => e.type === 'join').pop();
    const lastLeave = logEvents.filter((e) => e.type === 'leave').pop();
    const serverReady = logEvents.find((e) => e.type === 'ready');

    return {
      checkedAt: new Date().toISOString(),
      latencyMs: Date.now() - startTime,
      host: 'ubuntu-4gb-fsn1-2',
      tailnet: SSH_HOST,
      uptime: uptimeData,
      service: {
        name: 'openclaw-gateway',
        status: serviceData,
      },
      disk: diskData,
      craftySize: craftySizeData,
      minecraft: {
        paper: paperVersion,
        geyser: geyserVersion,
      },
      activity: {
        lastJoin: lastJoin ? `${lastJoin.player} at ${lastJoin.time}` : 'none',
        lastLeave: lastLeave ? `${lastLeave.player} at ${lastLeave.time}` : 'none',
        serverReady: serverReady ? `Done in ${serverReady.duration} at ${serverReady.time}` : 'unknown',
      },
      backups: {
        total: backups.length,
        latest: backups[0] || null,
        recent: backups,
      },
    };
  } catch (error) {
    return {
      checkedAt: new Date().toISOString(),
      latencyMs: Date.now() - startTime,
      error: error.message,
      host: 'ubuntu-4gb-fsn1-2',
      tailnet: SSH_HOST,
    };
  }
}
