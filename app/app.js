(function(){
'use strict';
var $=function(id){return document.getElementById(id);};

function bytes(n){
  if(typeof n!=='number'||!isFinite(n)||n<=0)return null;
  var mb=n/1048576;
  return mb>=1024?(mb/1024).toFixed(2)+' GB':Math.round(mb)+' MB';
}

function api(){
  try{ if(window.tizen&&window.tizen.systeminfo)return window.tizen.systeminfo; }catch(e){}
  return null;
}

function render(data){
  $('cpu').textContent=data.cpu===null?'不可用':Math.round(data.cpu*100);
  $('cpuPct').textContent=data.cpu===null?'':'%';
  $('memAvail').textContent=bytes(data.availableMemory)||'不可用';
  $('memTotal').textContent=bytes(data.totalMemory)?('/ '+bytes(data.totalMemory)):'';
  $('memStatus').textContent=data.memoryStatus||'未知';
  $('detail').textContent=JSON.stringify(data.storage.length?data:{...data,storage:'none'},null,2);
  if(data.errors.length){
    $('detail').textContent+= '\n\n不可用项：\n'+data.errors.join('\n');
  }
}

function collect(){
  var sys=api();
  if(!sys){
    $('detail').textContent='当前环境没有 tizen.systeminfo（非电视或未授权）。';
    return;
  }
  var out={cpu:null,memoryStatus:null,totalMemory:null,availableMemory:null,storage:[],errors:[]};

  try{ out.totalMemory=sys.getTotalMemory(); }catch(e){ out.errors.push('getTotalMemory: '+e.name); }
  try{ out.availableMemory=sys.getAvailableMemory(); }catch(e){ out.errors.push('getAvailableMemory: '+e.name); }

  try{
    sys.getPropertyValue('CPU',function(v){ out.cpu=typeof v.load==='number'?v.load:null; render(out); },
      function(e){ out.errors.push('CPU: '+e.name); render(out); });
  }catch(e){ out.errors.push('CPU: '+e.name); }

  try{
    sys.getPropertyValue('MEMORY',function(v){ out.memoryStatus=v.status||null; render(out); },
      function(e){ out.errors.push('MEMORY: '+e.name); render(out); });
  }catch(e){ out.errors.push('MEMORY: '+e.name); }

  try{
    sys.getPropertyValue('STORAGE',function(v){
      out.storage=(v&&v.units?Array.prototype.map.call(v.units,function(u){
        return {type:u.type,capacity:u.capacity,availableCapacity:u.availableCapacity,isRemovable:u.isRemovable};
      }):[]);
      render(out);
    },function(e){ out.errors.push('STORAGE: '+e.name); render(out); });
  }catch(e){ out.errors.push('STORAGE: '+e.name); }

  render(out);
}

$('refresh').onclick=collect;
document.addEventListener('keydown',function(e){
  if(e.keyCode===403||e.keyCode===13){ e.preventDefault(); collect(); }
});
collect();
setInterval(collect,15000);
})();
