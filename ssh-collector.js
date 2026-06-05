import { Client } from 'ssh2';

const SSH_HOST = process.env.SSH_HOST || '100.100.163.40';
const SSH_USER = process.env.SSH_USER || 'dima';
const SSH_KEY = process.env.SSH_PRIVATE_KEY;

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

  for (const line of lines.slice(-20)) {
    // Paper version
    if (line.includes('Starting minecraft server version')) {
      const ver = line.match(/version\s+([\d.]+(-[\w]+)?)/);
      if (ver) events.push({ type: 'version', value: ver[1] });
    }
    // Geyser version
    if (line.includes('Geyser') && line.includes('Loading Geyser')) {
      const ver = line.match(/Geyser version\s+([\d.]+-b\d+)/i);
      if (ver) events.push({ type: 'geyser', value: ver[1] });
    }
    // Player join
    if (line.includes('joined the game') || line.includes('logged in')) {
      const player = line.match(/\[Server thread\/INFO\]:\s*(\.\w+)/);
      const time = line.match(/\[(\d{2}:\d{2}:\d{2})\]/);
      if (player && time) {
        events.push({ type: 'join', player: player[1], time: time[1] });
      }
    }
    // Player leave
    if (line.includes('left the game') || line.includes('lost connection')) {
      const player = line.match(/\[Server thread\/INFO\]:\s*(\.\w+)/);
      const time = line.match(/\[(\d{2}:\d{2}:\d{2})\]/);
      if (player && time) {
        events.push({ type: 'leave', player: player[1], time: time[1] });
      }
    }
    // Server ready
    if (line.includes('Done (') && line.includes('s)!')) {
      const dur = line.match(/Done \(([\d.]+s)\)!/);
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
