const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../admin/order-alerts.js'),'utf8');
function setup(permission='default',supported=true){
  const elements=new Map(),notes=[],tones=[],timers=new Map(),storage=new Map(); let requests=0,opened=0;
  const document={title:'Admin',hidden:false,currentScript:{src:'https://admin.example.test/order-alerts.js?v=1'},addEventListener(){},getElementById(id){if(!elements.has(id))elements.set(id,{hidden:true,textContent:'',addEventListener(){},setAttribute(){}});return elements.get(id);}};
  const Notification=function(){throw Error('Should use mobile-compatible service worker');}; Notification.permission=permission; Notification.requestPermission=async()=>{requests++;Notification.permission='granted';};
  const registration={active:{},showNotification:async(title,opts)=>notes.push({title,...opts})};
  const ctx={document,navigator:{serviceWorker:{addEventListener(){},register:async()=>registration}},URL,Set,Promise,location:{origin:'https://admin.example.test',pathname:'/'},isSecureContext:true,localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},setInterval:(fn,ms)=>{timers.set(1,{fn,ms});return 1;},clearInterval:id=>timers.delete(id),setTimeout,clearTimeout};
  if(supported)ctx.Notification=Notification;
  ctx.AudioContext=class{state='running';currentTime=0;destination={};createOscillator(){return{frequency:{},connect(){},disconnect(){},start(){tones.push(1);},stop(){}};}createGain(){return{gain:{setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){},disconnect(){}};}};
  ctx.window=ctx;vm.runInNewContext(source,ctx);
  const alerts=new ctx.FudgioOrderAlerts({refresh:async()=>{},money:n=>'Rs '+n,toast(){},openOrders(){opened++;}});
  return{alerts,elements,notes,tones,timers,ctx,requests:()=>requests,opened:()=>opened};
}
const order=id=>({id,total:1250,customer:{name:'Private name',phone:'03001112222',address:'Private address'}});
const flush=()=>new Promise(r=>setImmediate(r));
test('old orders do not alert; new orders alert once and can be acknowledged',()=>{
  const s=setup();s.alerts.start();assert.equal(s.alerts.observe([order('OLD')]).length,0);
  assert.equal(s.alerts.observe([order('NEW'),order('OLD')]).length,1);assert.equal(s.elements.get('newOrderAlert').hidden,false);assert.equal(s.ctx.document.title,'(1 new) Admin');
  assert.equal(s.alerts.observe([order('NEW'),order('OLD')]).length,0);assert.equal(s.requests(),0);assert.equal(s.notes.length,0);assert.equal(s.tones.length,0);
  s.alerts.openOrders();assert.equal(s.opened(),1);assert.equal(s.elements.get('newOrderAlert').hidden,true);
});
test('permission is opt-in; notifications chime and do not expose customer details',async()=>{
  const s=setup();s.alerts.start();s.alerts.observe([]);await s.alerts.toggle();assert.equal(s.requests(),1);
  s.alerts.observe([order('NEW')]);await flush();assert.equal(s.notes.length,1);assert.equal(s.tones.length,3);assert.match(s.notes[0].body,/NEW/);assert.doesNotMatch(JSON.stringify(s.notes),/Private name|03001112222|Private address/);
  await s.alerts.toggle();s.alerts.observe([order('ANOTHER')]);await flush();assert.equal(s.notes.length,1);
});
test('blocked or unsupported notifications retain the free banner and do not ask again',async()=>{
  for(const [permission,supported]of[['denied',true],['default',false]]){const s=setup(permission,supported);s.alerts.start();s.alerts.observe([]);await s.alerts.toggle();s.alerts.observe([order('NEW')]);await flush();assert.equal(s.requests(),0);assert.equal(s.notes.length,0);assert.equal(s.elements.get('newOrderAlert').hidden,false);}
});
test('polling never overlaps, recovers from errors, and stops on logout',async()=>{
  const s=setup();s.alerts.start();s.alerts.start();assert.equal(s.timers.size,1);assert.equal(s.timers.get(1).ms,20000);
  let finish,calls=0;s.alerts.options.refresh=()=>{calls++;return new Promise(r=>finish=r);};const first=s.alerts.check();await s.alerts.check();assert.equal(calls,1);finish();await first;
  s.alerts.options.refresh=async()=>{throw Error('offline');};await s.alerts.check();assert.match(s.elements.get('orderAlertStatus').textContent,/Retrying/);
  s.alerts.options.refresh=async()=>{};await s.alerts.check();assert.doesNotMatch(s.elements.get('orderAlertStatus').textContent,/connection error/);
  s.alerts.stop();assert.equal(s.timers.size,0);assert.equal(s.alerts.observe([order('LOGGED OUT')]).length,0);
});
test('notification clicks focus admin and reject external destinations',async()=>{
  const handlers={};let focused=0,message,opened=0;
  const self={location:{href:'https://admin.example.test/order-alerts-sw.js',origin:'https://admin.example.test'},addEventListener:(n,f)=>handlers[n]=f,clients:{matchAll:async()=>[{url:'https://admin.example.test/',focus:async()=>focused++,postMessage:m=>message=m}],openWindow:async()=>opened++}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../admin/order-alerts-sw.js'),'utf8'),{self,URL});let work;
  const click=url=>handlers.notificationclick({notification:{close(){},data:{url}},waitUntil:p=>work=p});
  click('https://admin.example.test/#orders');await work;assert.equal(focused,1);assert.equal(message.type,'FUDGIO_OPEN_ORDERS');
  click('https://other.example.test/');await work;assert.equal(opened,0);assert.equal(focused,1);
});
