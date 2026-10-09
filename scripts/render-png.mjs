// Renders a local file (SVG or HTML) to a PNG at an exact pixel size, with a
// transparent background, through the DevTools protocol.
//   node scripts/render-png.mjs <file> <out.png> <width> <height>
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
const [, , file, out, w = '512', h = '512'] = process.argv;
// Any Chromium works; point CHROME_BIN at it if it is not on this path.
const CHROME = process.env.CHROME_BIN || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const PORT = 9400 + Math.floor(Math.random() * 300);
const chrome = spawn(CHROME, ['--headless','--no-sandbox','--disable-gpu','--hide-scrollbars',`--remote-debugging-port=${PORT}`,'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function targets(){ for(let i=0;i<60;i++){ try{ const j=await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); if(j.length) return j; }catch{} await sleep(150);} throw new Error('no chrome'); }
try {
  const page = (await targets()).find((t) => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id=0; const pending=new Map();
  ws.onmessage=(e)=>{const m=JSON.parse(e.data); if(m.id&&pending.has(m.id)){pending.get(m.id)(m);pending.delete(m.id);}};
  await new Promise((r)=>(ws.onopen=r));
  const send=(m,p={})=>new Promise((res)=>{const i=++id;pending.set(i,res);ws.send(JSON.stringify({id:i,method:m,params:p}));});
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride',{width:+w,height:+h,deviceScaleFactor:1,mobile:false});
  await send('Emulation.setDefaultBackgroundColorOverride',{color:{r:0,g:0,b:0,a:0}});
  // a file:// page, because a data: page is not allowed to load file:// images
  const html = `<!doctype html><html><body style="margin:0;background:transparent"><img src="file://${file}" style="display:block;width:${w}px;height:${h}px"></body></html>`;
  const pagePath = out + '.render.html';
  writeFileSync(pagePath, html);
  await send('Page.navigate',{url:'file://'+pagePath});
  await sleep(1200);
  const shot=await send('Page.captureScreenshot',{format:'png',clip:{x:0,y:0,width:+w,height:+h,scale:1}});
  try { (await import('node:fs')).unlinkSync(pagePath); } catch {}
  writeFileSync(out, Buffer.from(shot.result.data,'base64'));
  console.log('wrote', out);
  ws.close();
} finally { chrome.kill(); }
