#!/usr/bin/env node
/* ============================================================================
   Cape Squad — Wi-Fi server

   Run it on any machine on your home network:

       node cape-squad-server.js

   It prints an address. Everyone opens that address in their browser, taps
   "Play over Wi-Fi", picks a hero and readies up. The host starts the page.

   No installing anything. Plain Node, no packages. The WebSocket bits are
   implemented here rather than pulled from npm so there is nothing to set up.

   The server owns the game. It runs the exact same code the browser runs, out
   of index.html, so the rules can never drift between the two. Browsers send
   button presses and draw what they are told.
   ========================================================================== */

'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');
const vm = require('vm');

const PORT = +(process.env.PORT || 8080);
const ROOT = __dirname;
const GAME = path.join(ROOT, 'index.html');
const TICK = 1 / 120;            // simulation step, same as the browser
const SNAP_HZ = 30;              // snapshots per second
const MAX_PLAYERS = 4;

/* ---------------------------------------------------------------- tiny DOM
   Enough of a browser for the game script to load and run headlessly. This is
   the same approach the test harness uses, so it is well travelled. */
function makeSandbox(html){
  let draws = 0;
  const noop = () => { draws++; };
  const ctx2d = () => new Proxy({
    createLinearGradient: () => ({ addColorStop: noop }),
    createPattern: () => ({}),
    measureText: t => ({ width: (t || '').length * 7 }),
    canvas: { width: 800, height: 400 }
  }, { get: (t, k) => (k in t ? t[k] : noop), set: () => true });

  const el = () => {
    const e = {
      style: {}, dataset: {}, innerHTML: '', textContent: '', value: '',
      classList: { _s: new Set(), add(c){this._s.add(c);}, remove(c){this._s.delete(c);},
                   toggle(c,v){ v ? this._s.add(c) : this._s.delete(c); },
                   contains(c){ return this._s.has(c); } },
      children: [], appendChild(c){ this.children.push(c); return c; },
      addEventListener(){}, removeEventListener(){},
      getContext: () => ctx2d(),
      querySelector: () => el(), querySelectorAll: () => [],
      getBoundingClientRect: () => ({left:0,top:0,width:800,height:400})
    };
    return e;
  };
  const store = {};
  const document = {
    getElementById: id => store[id] || (store[id] = el()),
    createElement: el,
    querySelectorAll: sel => {
      if(sel !== '.tk') return [];
      const out = []; const re = /data-p="(\d)" data-k="(\w+)"/g; let m;
      while((m = re.exec(html)) !== null){
        const b = el(); b.dataset.p = m[1]; b.dataset.k = m[2]; out.push(b);
      }
      return out;
    },
    addEventListener(){}, body: el()
  };
  const win = { innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1,
                addEventListener(){}, navigator: { maxTouchPoints: 0 } };

  const sandbox = {
    document, window: win, navigator: win.navigator,
    innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1,
    addEventListener(){}, setTimeout: () => 0,
    requestAnimationFrame: () => 1,
    performance: { now: () => Date.now() },
    Math, JSON, console, WebSocket: undefined, globalThis: null
  };
  sandbox.globalThis = sandbox;

  let src = html.match(/<script>([\s\S]*)<\/script>/)[1].replace(/^"use strict";/, '');
  src += `
    globalThis.__g = { game, update, startLevel, pick, commitHeroes, LEVELS, input,
                       HEROES, DIFFS, MODES, DEFAULT_KIT, PH, PW, PH_LOW, resize };`;
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox, { filename: 'cape-squad.js' });
  return sandbox.__g;
}

/* ---------------------------------------------------------------- websocket
   Just enough of RFC 6455 for small text frames. */
const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

function accept(req, socket){
  const key = req.headers['sec-websocket-key'];
  const hash = crypto.createHash('sha1').update(key + GUID).digest('base64');
  socket.write(
    'HTTP/1.1 101 Switching Protocols\r\n' +
    'Upgrade: websocket\r\nConnection: Upgrade\r\n' +
    'Sec-WebSocket-Accept: ' + hash + '\r\n\r\n');
  socket.setNoDelay(true);
}

function frame(text){
  const data = Buffer.from(text, 'utf8');
  const len = data.length;
  let head;
  if(len < 126){
    head = Buffer.alloc(2); head[0] = 0x81; head[1] = len;
  } else if(len < 65536){
    head = Buffer.alloc(4); head[0] = 0x81; head[1] = 126; head.writeUInt16BE(len, 2);
  } else {
    head = Buffer.alloc(10); head[0] = 0x81; head[1] = 127;
    head.writeUInt32BE(0, 2); head.writeUInt32BE(len, 6);
  }
  return Buffer.concat([head, data]);
}

function reader(socket, onText, onClose){
  let buf = Buffer.alloc(0);
  socket.on('data', chunk => {
    buf = Buffer.concat([buf, chunk]);
    for(;;){
      if(buf.length < 2) return;
      const op = buf[0] & 0x0f;
      const masked = (buf[1] & 0x80) !== 0;
      let len = buf[1] & 0x7f, off = 2;
      if(len === 126){ if(buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; }
      else if(len === 127){ if(buf.length < 10) return; len = Number(buf.readBigUInt64BE(2)); off = 10; }
      const need = off + (masked ? 4 : 0) + len;
      if(buf.length < need) return;
      let payload;
      if(masked){
        const mask = buf.slice(off, off + 4);
        payload = Buffer.alloc(len);
        for(let i = 0; i < len; i++) payload[i] = buf[off + 4 + i] ^ mask[i & 3];
      } else {
        payload = buf.slice(off, off + len);
      }
      buf = buf.slice(need);
      if(op === 0x8){ onClose(); return; }
      if(op === 0x9){ socket.write(Buffer.concat([Buffer.from([0x8a, payload.length]), payload])); continue; }
      if(op === 0x1) onText(payload.toString('utf8'));
    }
  });
  socket.on('error', onClose);
  socket.on('close', onClose);
}

/* ---------------------------------------------------------------- the room */
const html = fs.readFileSync(GAME, 'utf8');
const G = makeSandbox(html);
let clients = [];          // {sock, id, name, hero, kit, ready, slot, alive}
let nextId = 1;
let running = false;

function room(){
  return clients.filter(c => c.alive).map(c => ({ name: c.name, hero: c.hero, ready: c.ready }));
}
function broadcastLobby(){
  const list = clients.filter(c => c.alive);
  list.forEach((c, i) => {
    c.slot = i;
    send(c, { t: 'lobby', you: i, host: i === 0, room: room() });
  });
}
function send(c, o){
  if(!c.alive) return;
  try { c.sock.write(frame(JSON.stringify(o))); } catch(e){ c.alive = false; }
}
function broadcast(o){
  const s = frame(JSON.stringify(o));
  for(const c of clients) if(c.alive){ try { c.sock.write(s); } catch(e){ c.alive = false; } }
}

function beginGame(level, mode, diff){
  const list = clients.filter(c => c.alive).slice(0, MAX_PLAYERS);
  if(!list.length) return;
  G.game.diff = G.DIFFS.find(d => d.id === diff) || G.DIFFS[1];
  G.game.mode = mode || 'race';
  G.game.nPlayers = list.length;
  G.game.picks = list.map(c => c.hero);
  G.game.kits = list.map(c => c.kit || G.DEFAULT_KIT);
  G.commitHeroes();
  G.startLevel(level | 0);
  G.game.flip = 0; G.game.state = 'play';
  for(const s of G.input){ s.left = s.right = s.jump = s.power = s.dance = false; s.jumpP = s.powerP = false; }
  running = true;
  list.forEach((c, i) => send(c, {
    t: 'begin', you: i, level: level | 0, mode: G.game.mode, diff: G.game.diff.id,
    heroes: list.map(x => ({ name: x.name, hero: x.hero, kit: x.kit || G.DEFAULT_KIT }))
  }));
}

function snapshot(){
  const g = G.game, L = g.lvl;
  const P = g.players.map(p => [
    +p.x.toFixed(2), +p.y.toFixed(2), +p.vx.toFixed(1), +p.vy.toFixed(1),
    p.face, p.low ? 1 : 0, +p.roll.toFixed(2), p.slide ? 1 : 0, p.glide ? 1 : 0,
    +p.shell.toFixed(2), p.charm ? 1 : 0, p.aegis ? 1 : 0,
    +p.dancing.toFixed(2), +p.danceT.toFixed(2), +p.animT.toFixed(2),
    +p.squash.toFixed(3), +p.invul.toFixed(2), p.it ? 1 : 0,
    p.stars, p.done ? 1 : 0, p.grounded ? 1 : 0, +p.pushFx.toFixed(2)
  ]);
  let cap = -1;
  for(let i = 0; i < L.captions.length; i++) if(L.captions[i].fired) cap = i;
  return {
    t: 'snap', tm: +g.time.toFixed(2), wp: g.wipes, sg: g.starsGot,
    lv: g.lives, tg: +g.tagT.toFixed(2), P,
    M: L.movers.map(o => +o.prog.toFixed(4)),
    S: L.saws.map(o => +o.prog.toFixed(4)),
    SR: L.saws.map(o => +o.rot.toFixed(2)),
    K: L.stampers.map(o => +o.phase.toFixed(4)),
    G: L.gates.map(o => o.open ? 1 : 0),
    PL: L.plates.map(o => o.down ? 1 : 0),
    SW: L.switches.map(o => +o.timer.toFixed(2)),
    TU: L.turrets.map(o => +o.t.toFixed(2)),
    GL: g.gloves.map(o => [Math.round(o.x), Math.round(o.y), o.dir, +o.spin.toFixed(2)]),
    CR: L.crates.map(o => o.gone ? 1 : 0),
    CB: L.plats.map(o => o.t === 'crumble' ? [o.gone ? 1 : 0, Math.round(o.y)] : undefined),
    ST: L.stars.map(o => o.got ? 1 : 0),
    CP: L.checkpoints.map(o => o.hit ? 1 : 0),
    CN: cap
  };
}

/* fixed-step simulation, exactly as the browser runs it */
let last = Date.now(), acc = 0, snapAcc = 0;
setInterval(() => {
  const now = Date.now();
  let dt = (now - last) / 1000; last = now;
  if(dt > 0.25) dt = 0.25;
  if(running && G.game.state === 'play'){
    acc += dt;
    let guard = 0;
    while(acc >= TICK && guard++ < 40){
      G.update(TICK); acc -= TICK;
      if(G.game.state !== 'play') break;
    }
    if(G.game.state === 'flip'){ G.game.flip = 0; G.game.state = 'play'; }
    snapAcc += dt;
    if(snapAcc >= 1 / SNAP_HZ){ snapAcc = 0; broadcast(snapshot()); }
    if(G.game.state === 'end'){
      running = false;
      broadcast({ t: 'over', snap: snapshot() });
      setTimeout(() => { broadcastLobby(); }, 1500);
    }
  }
}, 4);

/* ---------------------------------------------------------------- http */
const TYPES = { '.html':'text/html; charset=utf-8', '.js':'text/javascript', '.css':'text/css',
                '.png':'image/png', '.json':'application/json', '.ico':'image/x-icon' };

const server = http.createServer((req, res) => {
  let file = req.url.split('?')[0];
  if(file === '/' || file === '') file = '/index.html';
  const full = path.join(ROOT, path.normalize(file).replace(/^(\.\.[/\\])+/, ''));
  if(!full.startsWith(ROOT) || !fs.existsSync(full) || fs.statSync(full).isDirectory()){
    res.writeHead(404); res.end('not found'); return;
  }
  if(full === GAME){
    // tell the page where the socket lives; this is the only difference from
    // the standalone file, so there is just the one copy of the game
    const injected = html.replace('<script>',
      '<script>window.CAPE_LAN = "ws://" + location.host + "/ws";</script>\n<script>');
    res.writeHead(200, { 'Content-Type': TYPES['.html'], 'Cache-Control': 'no-store' });
    res.end(injected); return;
  }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(full)] || 'application/octet-stream' });
  fs.createReadStream(full).pipe(res);
});

server.on('upgrade', (req, socket) => {
  if(!req.url.startsWith('/ws')){ socket.destroy(); return; }
  accept(req, socket);
  const c = { sock: socket, id: nextId++, name: 'PLAYER', hero: 'panda',
              kit: null, ready: false, slot: -1, alive: true };
  clients.push(c);
  const drop = () => {
    if(!c.alive) return;
    c.alive = false;
    clients = clients.filter(x => x.alive);
    broadcastLobby();
  };
  reader(socket, txt => {
    let m; try { m = JSON.parse(txt); } catch(e){ return; }
    if(m.t === 'join'){
      c.name = String(m.name || 'PLAYER').slice(0, 10).toUpperCase();
      broadcastLobby();
    } else if(m.t === 'pick'){
      if(G.HEROES[m.hero]) c.hero = m.hero;
      if(m.kit) c.kit = m.kit;
      c.ready = true;
      broadcastLobby();
    } else if(m.t === 'ready'){
      c.ready = !!m.v; broadcastLobby();
    } else if(m.t === 'start'){
      if(c.slot === 0) beginGame(m.level, m.mode, m.diff);
    } else if(m.t === 'in'){
      const st = G.input[c.slot];
      if(!st || !running) return;
      const j = !!m.j, p = !!m.p;
      if(j && !st.jump) st.jumpP = true;
      if(p && !st.power) st.powerP = true;
      st.left = !!m.l; st.right = !!m.r; st.jump = j; st.power = p; st.dance = !!m.d;
    }
  }, drop);
});

function addresses(){
  const out = [];
  for(const list of Object.values(os.networkInterfaces()))
    for(const a of list || [])
      if(a.family === 'IPv4' && !a.internal) out.push(a.address);
  return out.length ? out : ['127.0.0.1'];
}

server.listen(PORT, () => {
  console.log('\n  Cape Squad is running.\n');
  for(const a of addresses()) console.log('     http://' + a + ':' + PORT);
  console.log('\n  Open that on each device, on the same Wi-Fi.');
  console.log('  Tap "Play over Wi-Fi". First to join is the host.\n');
});

module.exports = { server, G };
