import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

function LiveServerPanel() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const res = await fetch('/api/status', { cache: 'no-store' });
        const json = await res.json();
        if (alive) { setData(json); setError(null); }
      } catch (err) {
        if (alive) setError(err.message);
      }
    }
    load();
    const timer = setInterval(load, 45000); // refresh every 45s
    return () => { alive = false; clearInterval(timer); };
  }, []);

  const server = data?.server;
  const bedrock = data?.bedrock;
  const disk = server?.disk;

  return { data, error, server, bedrock, disk };
}

const plugins = [
  'Geyser-Spigot 2.10.0-b1162',
  'ViaVersion 5.9.1',
  'floodgate 2.2.5',
  'ProtocolLib 5.4.0',
  'KittyBlock 1.0.0',
  'AutoOp 1.0',
];

function CleanupButton() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const handleCleanup = async () => {
    if (!confirm('Delete old backups? This will keep only the latest 5 valid backups.')) {
      return;
    }

    setLoading(true);
    setResult(null);

    try {
      const res = await fetch('/api/cleanup-backups', { method: 'POST' });
      const data = await res.json();
      setResult(data);
      setTimeout(() => setResult(null), 10000); // Clear after 10s
    } catch (err) {
      setResult({ error: err.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ marginTop: '1em' }}>
      <button
        onClick={handleCleanup}
        disabled={loading}
        style={{
          padding: '0.5em 1em',
          fontSize: '0.9em',
          cursor: loading ? 'not-allowed' : 'pointer',
          backgroundColor: loading ? '#ccc' : '#ff6b6b',
          color: '#fff',
          border: 'none',
          borderRadius: '4px',
        }}
      >
        {loading ? 'Cleaning up...' : 'Clean Up Old Backups'}
      </button>
      {result && (
        <div style={{ marginTop: '0.5em', fontSize: '0.85em' }}>
          {result.error ? (
            <p style={{ color: '#ff6b6b' }}>Error: {result.error}</p>
          ) : (
            <p style={{ color: '#51cf66' }}>
              ✓ Kept {result.kept}, deleted {result.deleted}
              {result.failed > 0 && `, failed ${result.failed}`}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function App() {
  const { data, error, server, bedrock, disk } = LiveServerPanel();

  if (error) {
    return (
      <main>
        <section className="hero">
          <div className="kicker">error</div>
          <h1>Failed to load status</h1>
          <p>{error}</p>
        </section>
      </main>
    );
  }

  if (!data) {
    return (
      <main>
        <section className="hero">
          <div className="kicker">loading</div>
          <h1>Fetching live status...</h1>
        </section>
      </main>
    );
  }

  const diskSummary = disk
    ? `${disk.used} / ${disk.total} used · ${disk.percent} · ${disk.free} free`
    : 'loading...';

  const bedrockOnline = bedrock?.online || false;
  const bedrockVersion = bedrock?.bedrock?.version || 'unknown';
  const bedrockPlayers = bedrock?.bedrock
    ? `${bedrock.bedrock.onlinePlayers}/${bedrock.bedrock.maxPlayers}`
    : 'unknown';

  return (
    <main>
      <section className="hero">
        <div className="kicker">mineclaw / crafty / geyser</div>
        <h1>Minecraft Gallery</h1>
        <p>
          Live status board for the remote Crafty server. Updates every 45 seconds via server-to-server SSH + UDP ping.
        </p>
        {data.checkedAt && (
          <p style={{ opacity: 0.6, fontSize: '0.9em' }}>
            Last checked: {new Date(data.checkedAt).toLocaleTimeString()}
          </p>
        )}
      </section>

      <section className="dashboard">
        <article className="server-card">
          <div className="orb" />
          <span className="label">server</span>
          <h2>{server?.host || 'ubuntu-4gb-fsn1-2'}</h2>
          <dl>
            <div>
              <dt>Tailnet</dt>
              <dd>{server?.tailnet || '100.100.163.40'}</dd>
            </div>
            <div>
              <dt>Uptime</dt>
              <dd>{server?.uptime || 'unknown'}</dd>
            </div>
            <div>
              <dt>Service</dt>
              <dd>{server?.service?.status || 'unknown'}</dd>
            </div>
            <div>
              <dt>Paper</dt>
              <dd>{server?.minecraft?.paper || 'unknown'}</dd>
            </div>
            <div>
              <dt>Geyser</dt>
              <dd>{server?.minecraft?.geyser || 'unknown'}</dd>
            </div>
            <div>
              <dt>Crafty Size</dt>
              <dd>{server?.craftySize || 'unknown'}</dd>
            </div>
          </dl>
        </article>

        <article className="disk-card">
          <span className="label">disk</span>
          <div className="meter">
            <i style={{ width: disk?.percent || '0%' }} />
          </div>
          <h3>{diskSummary}</h3>
          <p>
            Crafty directory size: {server?.craftySize || 'unknown'}. This is the next operational risk to clean up.
          </p>
        </article>

        <section className="ports">
          <div className="port-card" style={{ '--port': '#76ff3b' }}>
            <span>Java</span>
            <strong>25565/tcp</strong>
            <em>listening</em>
          </div>
          <div className="port-card" style={{ '--port': '#33d8ff' }}>
            <span>Bedrock / Geyser</span>
            <strong>25566/udp</strong>
            <em>listening</em>
          </div>
          <div className="port-card" style={{ '--port': '#ffd447' }}>
            <span>Crafty UI</span>
            <strong>8443/tcp</strong>
            <em>listening</em>
          </div>
        </section>
      </section>

      <section className="split">
        <article className="panel live-panel">
          <span className="label">live bedrock ping</span>
          <h2>{bedrockOnline ? 'Geyser is live' : 'Geyser offline'}</h2>
          {bedrock && (
            <dl className="live-dl">
              <div>
                <dt>Online</dt>
                <dd>{bedrockOnline ? 'yes' : 'no'}</dd>
              </div>
              <div>
                <dt>Latency</dt>
                <dd>{bedrock.latencyMs}ms</dd>
              </div>
              <div>
                <dt>Version</dt>
                <dd>{bedrockVersion}</dd>
              </div>
              <div>
                <dt>Players</dt>
                <dd>{bedrockPlayers}</dd>
              </div>
              <div>
                <dt>MOTD</dt>
                <dd>{bedrock.bedrock?.motd || bedrock.error || 'unknown'}</dd>
              </div>
            </dl>
          )}
        </article>

        <article className="panel">
          <span className="label">recent activity</span>
          <h2>Player & Server Events</h2>
          {server?.activity && (
            <dl className="live-dl">
              <div>
                <dt>Last Join</dt>
                <dd>{server.activity.lastJoin}</dd>
              </div>
              <div>
                <dt>Last Leave</dt>
                <dd>{server.activity.lastLeave}</dd>
              </div>
              <div>
                <dt>Server Ready</dt>
                <dd>{server.activity.serverReady}</dd>
              </div>
            </dl>
          )}
        </article>

        <article className="panel">
          <span className="label">backups</span>
          <h2>Latest Valid Backups</h2>
          {server?.backups && (
            <>
              <p>
                Total backups: {server.backups.total}
              </p>
              {server.backups.latest && (
                <dl className="live-dl">
                  <div>
                    <dt>Latest</dt>
                    <dd>{server.backups.latest.name}</dd>
                  </div>
                  <div>
                    <dt>Size</dt>
                    <dd>{server.backups.latest.size} bytes</dd>
                  </div>
                  <div>
                    <dt>Date</dt>
                    <dd>
                      {server.backups.latest.date} {server.backups.latest.time}
                    </dd>
                  </div>
                </dl>
              )}
              <CleanupButton />
            </>
          )}
        </article>
      </section>

      <section className="split">
        <article className="panel">
          <span className="label">plugins</span>
          <h2>Bridge stack</h2>
          <div className="chips">
            {plugins.map((plugin) => (
              <span key={plugin}>{plugin}</span>
            ))}
          </div>
        </article>
      </section>
    </main>
  );
}

createRoot(document.getElementById('root')).render(<App />);
