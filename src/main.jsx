import React from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

const snapshot = {
  host: 'ubuntu-4gb-fsn1-2',
  tailnet: '100.100.163.40',
  os: 'Ubuntu 24.04.1 LTS',
  uptime: 'up 9 weeks, 2 days, 50 minutes',
  service: 'crafty.service active',
  disk: '35G / 38G used · 97% · 1.2G free',
  craftySize: '17G',
  minecraft: 'Paper 1.21.11-69',
  mode: 'Creative',
  lastReady: 'Done in 88.268s',
  lastPlayer: '.dimablochman joined via Geyser/Floodgate at 10:47',
};

const ports = [
  { label: 'Java', port: '25565/tcp', state: 'listening', color: '#76ff3b' },
  { label: 'Bedrock / Geyser', port: '25566/udp', state: 'listening', color: '#33d8ff' },
  { label: 'Crafty UI', port: '8443/tcp', state: 'listening', color: '#ffd447' },
];

const plugins = [
  'Geyser-Spigot 2.10.0-b1162',
  'ViaVersion 5.9.1',
  'floodgate 2.2.5',
  'ProtocolLib 5.4.0',
  'KittyBlock 1.0.0',
  'AutoOp 1.0',
];

const alerts = [
  { level: 'critical', title: 'Disk pressure', detail: 'Root disk is 97% full with only 1.2G free.' },
  { level: 'warning', title: 'Backups look empty', detail: 'Latest backup zip markers found were 0 bytes.' },
  { level: 'good', title: 'Server online', detail: 'Crafty, Java port, Bedrock/Geyser port, and Crafty UI are all reachable.' },
];

const timeline = [
  ['10:35:00', 'Paper server started on *:25565'],
  ['10:35:55', 'Geyser 2.10.0-b1162 loading'],
  ['10:36:07', 'Geyser started on UDP 25566'],
  ['10:36:08', 'Server ready: Done (88.268s)'],
  ['10:47:50', '.dimablochman joined via Bedrock/Floodgate'],
  ['10:48:28', '.dimablochman disconnected'],
];

function PortCard({ port }) {
  return (
    <div className="port-card" style={{ '--port': port.color }}>
      <span>{port.label}</span>
      <strong>{port.port}</strong>
      <em>{port.state}</em>
    </div>
  );
}

function Alert({ item }) {
  return (
    <li className={`alert ${item.level}`}>
      <span>{item.level}</span>
      <div><strong>{item.title}</strong><p>{item.detail}</p></div>
    </li>
  );
}

function App() {
  return (
    <main>
      <section className="hero">
        <div className="kicker">mineclaw / crafty / geyser</div>
        <h1>Minecraft Gallery</h1>
        <p>A visual status board for the remote Crafty server on the tailnet. V0 is a verified static snapshot; v1 can poll SSH or an API for live data.</p>
      </section>

      <section className="dashboard">
        <article className="server-card">
          <div className="orb" />
          <span className="label">server</span>
          <h2>{snapshot.host}</h2>
          <dl>
            <div><dt>Tailnet</dt><dd>{snapshot.tailnet}</dd></div>
            <div><dt>Service</dt><dd>{snapshot.service}</dd></div>
            <div><dt>Minecraft</dt><dd>{snapshot.minecraft}</dd></div>
            <div><dt>Mode</dt><dd>{snapshot.mode}</dd></div>
            <div><dt>Ready</dt><dd>{snapshot.lastReady}</dd></div>
          </dl>
        </article>

        <article className="disk-card">
          <span className="label">disk</span>
          <div className="meter"><i /></div>
          <h3>{snapshot.disk}</h3>
          <p>Crafty directory size: {snapshot.craftySize}. This is the next operational risk to clean up.</p>
        </article>

        <section className="ports">
          {ports.map((port) => <PortCard key={port.port} port={port} />)}
        </section>
      </section>

      <section className="split">
        <article className="panel">
          <span className="label">plugins</span>
          <h2>Bridge stack</h2>
          <div className="chips">{plugins.map((plugin) => <span key={plugin}>{plugin}</span>)}</div>
        </article>
        <article className="panel">
          <span className="label">alerts</span>
          <h2>What needs attention</h2>
          <ul className="alerts">{alerts.map((alert) => <Alert key={alert.title} item={alert} />)}</ul>
        </article>
      </section>

      <section className="timeline">
        <span className="label">latest log trace</span>
        <h2>Startup and player activity</h2>
        {timeline.map(([time, event]) => <div className="event" key={time}><time>{time}</time><p>{event}</p></div>)}
      </section>
    </main>
  );
}

createRoot(document.getElementById('root')).render(<App />);
