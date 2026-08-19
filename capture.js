/* AZOTA CAPTURE v2.1 — Paste vào Console trước khi mở bài thi */
void function(){
const DB=[];window._C=DB;let n=0;
const _f=window.fetch;
const _xo=XMLHttpRequest.prototype.open;
const _xs=XMLHttpRequest.prototype.send;
const _WS=window.WebSocket;

console.log('%c[CAPTURE] fetch:'+(_f.toString().includes('[native code]')?'native':'PATCHED')+' | XHR:'+(_xo.toString().includes('[native code]')?'native':'PATCHED'),'color:#0f0;font-weight:bold');

function logE(e){
  const isJ=e.resBody.trim()[0]==='{'||e.resBody.trim()[0]==='[';
  const sz=e.resSize>1000?(e.resSize/1024).toFixed(1)+'KB':e.resSize+'B';
  console.log('%c'+(isJ?'📦':'📄')+' #'+e.id+' '+e.type+' '+e.method+' ['+e.status+'] '+sz+' '+e.time+'ms','color:#8cf',e.url.substring(0,120));
}

window.fetch=async function(){
  const url=(typeof arguments[0]==='string')?arguments[0]:(arguments[0]&&arguments[0].url)||'';
  const method=(arguments[1]&&arguments[1].method)||(arguments[0]&&arguments[0].method)||'GET';
  let reqBody=null;try{reqBody=arguments[1]&&arguments[1].body}catch(e){}
  const id=++n,t0=Date.now();
  const res=await _f.apply(this,arguments);
  const clone=res.clone();
  clone.text().then(function(body){
    const entry={id:id,type:'FETCH',method:method,url:url,status:res.status,reqBody:reqBody?String(reqBody).substring(0,5000):null,resBody:body,resSize:body.length,time:Date.now()-t0,ts:new Date().toISOString()};
    DB.push(entry);logE(entry);
  }).catch(function(){});
  return res;
};

XMLHttpRequest.prototype.open=function(m,u){
  this._m=m;this._u=u;
  return _xo.apply(this,arguments);
};

XMLHttpRequest.prototype.send=function(body){
  const id=++n,t0=Date.now();this._rb=body;
  this.addEventListener('load',function(){
    try{
      const entry={id:id,type:'XHR',method:this._m||'?',url:this._u||this.responseURL||'',status:this.status,reqBody:this._rb?String(this._rb).substring(0,5000):null,resBody:this.responseText||'',resSize:(this.responseText||'').length,time:Date.now()-t0,ts:new Date().toISOString()};
      DB.push(entry);logE(entry);
    }catch(e){}
  });
  return _xs.apply(this,arguments);
};

try{
  window.WebSocket=function(){
    const ws=new _WS(arguments[0],arguments[1]);
    const wsUrl=arguments[0]||'';
    ws.addEventListener('message',function(e){
      if(typeof e.data==='string'&&e.data.length>5){
        const entry={id:++n,type:'WS',method:'MSG',url:wsUrl,status:0,reqBody:null,resBody:e.data,resSize:e.data.length,time:0,ts:new Date().toISOString()};
        DB.push(entry);logE(entry);
      }
    });
    return ws;
  };
  window.WebSocket.prototype=_WS.prototype;
  window.WebSocket.CONNECTING=0;window.WebSocket.OPEN=1;window.WebSocket.CLOSING=2;window.WebSocket.CLOSED=3;
}catch(e){console.log('[CAPTURE] WS hook skipped')}

window._LIST=function(){console.table(DB.map(function(e){return{id:e.id,type:e.type,method:e.method,status:e.status,size:e.resSize,url:e.url.substring(0,100)}}))};

window._DUMP=function(){
  var data=DB.map(function(e){var o={};for(var k in e)o[k]=e[k];o.resBody=e.resBody.substring(0,200000);return o});
  var json=JSON.stringify(data,null,2);
  console.log(json);
  try{copy(json);console.log('%c✅ Đã copy vào clipboard!','color:#0f0;font-size:14px')}catch(e){console.log('%c⚠️ Hãy bôi đen text trên → Ctrl+C','color:#ff0;font-size:14px')}
  console.log(data.length+' entries, '+(json.length/1024).toFixed(0)+'KB');
};

window._JSON=function(){
  var arr=DB.filter(function(e){var t=e.resBody.trim();return t[0]==='{'||t[0]==='['});
  var out=arr.map(function(e){var p=null;try{p=JSON.parse(e.resBody)}catch(x){}return{id:e.id,type:e.type,method:e.method,url:e.url,status:e.status,data:p||e.resBody.substring(0,50000),ts:e.ts}});
  var json=JSON.stringify(out,null,2);
  console.log(json);
  try{copy(json);console.log('%c✅ Copied!','color:#0f0;font-size:14px')}catch(e){}
  console.log(arr.length+' JSON entries');
};

window._GET=function(id){
  var e=DB.filter(function(x){return x.id===id})[0];
  if(!e){console.log('Not found #'+id);return}
  console.log('URL:',e.url);console.log('Method:',e.method,'| Status:',e.status,'| Size:',e.resSize);
  if(e.reqBody)console.log('Request Body:',e.reqBody);
  try{console.log('Response:',JSON.parse(e.resBody))}catch(x){console.log('Response:',e.resBody.substring(0,10000))}
};

console.log('%c🔴 CAPTURE ĐANG CHẠY — Mở bài thi đi!','color:#ff4;font-size:16px;font-weight:bold;background:#111;padding:4px 8px');
console.log('%cXong → gõ: _LIST()  _JSON()  _DUMP()  _GET(id)','color:#aaa;font-size:12px');
}();
