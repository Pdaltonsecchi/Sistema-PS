(function(){
'use strict';

/* ============================================================
   Utilidades
   ============================================================ */
var $=function(s){return document.querySelector(s);};
var UR=window.UIRules; // reglas puras compartidas con los tests (public/ui-rules.js)
var pad=function(n){return String(n).padStart(2,'0');};
var isoOf=function(d){return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());};
var todayIso=function(){return isoOf(new Date());};
var parse=function(s){var a=s.split('-').map(Number);return new Date(a[0],a[1]-1,a[2]);};
var shiftDays=function(n,base){var d=base?parse(base):new Date();d.setDate(d.getDate()+n);return isoOf(d);};
var shiftMonths=function(n,base){var d=base?parse(base):new Date();d.setMonth(d.getMonth()+n);return isoOf(d);};
var diffDays=function(s){var t=new Date();t.setHours(0,0,0,0);return Math.round((parse(s)-t)/86400000);};
var monthEnd=function(iso){var d=parse(iso.slice(0,8)+'01');d.setMonth(d.getMonth()+1);d.setDate(0);return isoOf(d);};
// Fechas siempre dd/mm/aaaa.
var fmtDate=function(s){if(!s)return '—';var a=String(s).slice(0,10).split('-');return a[2]+'/'+a[1]+'/'+a[0];};
// Dinero: "$ 19.500" (sin decimales si son ,00) o "$ 19.500,50".
var money=function(n){n=Math.round((Number(n)||0)*100)/100;var cents=Math.abs(n%1)>0.0001;return (n<0?'− ':'')+'$ '+Math.abs(n).toLocaleString('es-AR',{minimumFractionDigits:cents?2:0,maximumFractionDigits:2});};
var esc=function(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});};
// Texto sin tildes ni mayúsculas, para comparar y buscar ("Gómez" == "gomez").
var norm=function(s){return String(s==null?'':s).normalize('NFD').replace(/\p{Diacritic}/gu,'').toLowerCase();};
// Orden alfabético en español: ignora tildes y mayúsculas, y la Ñ va después de la N.
var collator=new Intl.Collator('es',{sensitivity:'base',numeric:true});
var byName=function(f){return function(a,b){return collator.compare(f(a),f(b));};};
var toMin=function(t){return Number(t.slice(0,2))*60+Number(t.slice(3,5));};
var hhmm=function(m){return pad(Math.floor(m/60))+':'+pad(m%60);};
var fmtBytes=function(n){n=Number(n)||0;if(n>=1073741824)return (n/1073741824).toFixed(1).replace('.',',')+' GB';if(n>=1048576)return (n/1048576).toFixed(n>=10485760?0:1).replace('.',',')+' MB';return Math.max(1,Math.round(n/1024))+' KB';};
var plural=function(n,a,b){return n+' '+(n===1?a:b);};
var fmtTs=function(v){var d=new Date(v);if(isNaN(d.getTime()))return '';return d.toLocaleString('es-AR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:false});};
var fmtTime=function(v){var d=new Date(v);if(isNaN(d.getTime()))return '';return d.toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit',hour12:false});};
// Cantidad con su unidad: "3" / "1,25 kg".
var fmtQty=function(n,unit){var t=String(Math.round(Number(n)*1000)/1000).replace('.',',');return unit==='kg'?t+' kg':t;};
var pct=function(n){return n==null?'—':String(Math.round(n*10)/10).replace('.',',')+' %';};
var r2=function(x){return Math.round(x*100)/100;};
var r3=function(x){return Math.round(x*1000)/1000;};
var mondayOf=function(iso){var d=parse(iso);var wd=d.getDay();wd=wd===0?7:wd;return shiftDays(-(wd-1),iso);};
var uid=function(){try{return crypto.randomUUID();}catch(e){return Date.now().toString(36)+Math.random().toString(36).slice(2);}};
// Variación con flecha y color: en gastos, subir es malo.
var delta=function(p,upIsGood){if(p==null)return '<span class="mut">sin datos para comparar</span>';var good=upIsGood===false?p<=0:p>=0;return '<span class="'+(good?'in':'out')+'">'+(p>=0?'▲ ':'▼ ')+pct(Math.abs(p))+'</span>';};
// Mismo criterio que el servidor: un UPC-A (12 dígitos) es el EAN-13 con 0 adelante.
var normCode=function(c){var t=String(c||'').replace(/\s+/g,'');if(/^\d{12}$/.test(t))return '0'+t;if(/^0\d{13}$/.test(t))return t.slice(1);return t;};
var gtinValid=function(c){if(!/^\d+$/.test(c)||[8,12,13,14].indexOf(c.length)<0)return true;var d=c.split('').map(Number),k=d.pop(),s=0;d.reverse().forEach(function(x,i){s+=x*(i%2===0?3:1);});return (10-s%10)%10===k;};
var store={get:function(k){try{return localStorage.getItem(k);}catch(e){return null;}},set:function(k,v){try{localStorage.setItem(k,v);}catch(e){}},del:function(k){try{localStorage.removeItem(k);}catch(e){}}};

var PHONE_PAT='[0-9 +\\(\\)\\-]{6,50}';
var PROD_CATS=['Alimento balanceado','Snacks y premios','Accesorios','Juguetes','Higiene y cuidado','Salud (venta libre)','Camas y transporte','Acuario','Aves y roedores','Otros'];
var SPECIES_OPTS=[['','Todas / no aplica'],['Perro','Perro'],['Gato','Gato'],['Perro y gato','Perro y gato'],['Otras mascotas','Otras mascotas']];
var UNIT_OPTS=[['u','Por unidad'],['kg','Suelto, por kilo']];
var SERV_CATS=['Baño','Peluquería','Otros'];
var PET_SPECIES=['Perro','Gato','Otro'];
var PET_SIZES=[['Chico','Perro chico'],['Mediano','Perro mediano'],['Grande','Perro grande']];
var sizeLabel=function(v){var m=PET_SIZES.find(function(x){return x[0]===v;});return m?m[1]:(v==='Gigante'?'Perro grande':v||'');};
var CASH_IN_CATS=['Ventas','Aporte de capital','Otros ingresos'];
var CASH_OUT_CATS=['Compra de mercadería','Alquiler y servicios','Sueldos','Impuestos','Insumos de peluquería','Retiro de caja','Otros'];
var ADJUST_REASONS=['Rotura','Vencimiento','Error de carga','Uso interno (peluquería)','Faltante','Otro'];
var ALL_PAY=['Efectivo','Transferencia','Tarjeta de débito','Tarjeta de crédito'];
var APPT_STATUS=[['reservado','Reservado'],['confirmado','Confirmado'],['listo','Listo para retirar'],['entregado','Entregado'],['no_vino','No vino'],['cancelado','Cancelado']];
var APPT_LABEL={en_curso:'En curso'};APPT_STATUS.forEach(function(x){APPT_LABEL[x[0]]=x[1];});
// Al agendar solo se elige entre Reservado y Confirmado; los demás estados salen de los botones del turno.
var APPT_FORM_STATUS=[['reservado','Reservado'],['confirmado','Confirmado']];
var APPT_VIEWS=[['day','Día'],['week','Semana'],['month','Mes']];
var WEEKDAYS_LONG=['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
var EXPIRY_DAYS=30; // aviso de vencimiento: productos que vencen en los próximos 30 días
var PAGE=100; // filas por página en las listas largas

/* ============================================================
   Estado
   ============================================================ */
var S={shop:'Mi Pet Shop',settings:{},user:null,products:[],services:[],suppliers:[],clients:[],summary:null};
var newCart=function(){return {items:[],discType:'amount',discValue:'',method:'Efectivo',mixed:false,payments:{},clientId:'',petId:'',apptId:null,key:uid()};};
/* Borrador de la venta en curso: se guarda en el navegador en cada cambio y se recupera al volver (recarga, corte de conexión).
   Se borra al cobrar o al vaciar la venta. Lleva el id del usuario para que otro usuario no vea la venta ajena. */
var DRAFT_KEY='petshop_cart_draft',DRAFT_MAX_MS=12*3600*1000;
function saveDraft(){
  var c=ui.cart;
  if(!S.user)return;
  if(!c.items.length&&!c.clientId){store.del(DRAFT_KEY);return;}
  store.set('petshop_cart_draft',JSON.stringify({u:S.user.id,t:Date.now(),cart:{items:c.items.map(function(it){return {type:it.type,id:it.id,qty:it.qty,price:it.price,reason:it.reason||''};}),
    discType:c.discType,discValue:c.discValue,method:c.method,mixed:c.mixed,payments:c.payments,clientId:c.clientId,petId:c.petId,apptId:c.apptId,key:c.key}}));
}
function clearDraft(){store.del(DRAFT_KEY);}
// Cambia a una venta nueva (y borra el borrador).
function resetCart(){ui.cart=newCart();clearDraft();}
/** Devuelve el borrador al carrito, validado contra el catálogo actual (precios de lista y stock de ahora). Devuelve true si recuperó algo. */
function restoreDraft(){
  var d;
  try{d=JSON.parse(store.get(DRAFT_KEY)||'null');}catch(e){d=null;}
  if(!d||!d.cart||d.u!==S.user.id||Date.now()-d.t>DRAFT_MAX_MS||!Array.isArray(d.cart.items)){if(d)clearDraft();return false;}
  var c=newCart(),admin=isAdmin();
  d.cart.items.forEach(function(x){
    var src=x.type==='product'?prodById(x.id):x.type==='service'?servById(x.id):null;
    if(!src||!(Number(x.qty)>0))return;
    var qty=x.type==='product'?Math.min(Number(x.qty),src.stock):Number(x.qty),price=admin&&Number(x.price)>=0?Number(x.price):src.price;
    if(!(qty>0))return;
    c.items.push({type:x.type,id:src.id,name:src.name,brand:src.brand||'',unit:x.type==='product'?src.unit:'u',qty:qty,price:price,listPrice:src.price,reason:String(x.reason||'')});
  });
  var k=d.cart;
  if(!c.items.length&&!k.clientId){clearDraft();return false;}
  c.discType=k.discType==='percent'?'percent':'amount';c.discValue=k.discValue==null?'':String(k.discValue);
  c.method=PAY().indexOf(k.method)>=0?k.method:PAY()[0];c.mixed=!!k.mixed;c.payments=k.payments&&typeof k.payments==='object'?k.payments:{};
  c.clientId=clientById(k.clientId)?String(k.clientId):'';c.petId=c.clientId&&k.petId?String(k.petId):'';c.apptId=k.apptId||null;c.key=k.key||c.key;
  ui.cart=c;ui.draftNote=true;
  return true;
}
var period0=function(){var p=store.get('petshop_period');return ['today','yesterday','7d','month','prevMonth'].indexOf(p)>=0?p:'today';};
var ui={view:'',cart:newCart(),posq:'',scanStrip:false,
  stq:'',cat:'all',stf:'all',stab:'products',stLimit:PAGE,
  sales:null,sfrom:'',sto:'',sq:'',saLimit:PAGE,
  sum:{period:period0(),from:'',to:'',tab:'general',sub:'panorama',data:null,monthly:null,compare:null,hours:null,products:null,pgroup:'product',clients:null,staff:null,proj:null,topBy:'units',monthsOpen:false},
  cq:'',cfopen:false,cashp:'month',cashf:'all',cashm:'all',cash:null,closings:null,cfrom:'',cto:'',caLimit:PAGE,
  backups:null,usage:null,users:null,utab:'users',audit:null,afrom:'',ato:'',auser:'',aaction:'',
  suppliers:null,supq:'',reportLog:null,
  csel:null,cdetail:null,cliq:'',clLimit:PAGE,
  cal:{view:'week',anchor:todayIso()},appts:null,staffNames:[]};
var main=$('#main'),dlg=$('#dlg');
var isAdmin=function(){return !!S.user&&S.user.role==='admin';};
var PAY=function(){return (S.settings.methods&&S.settings.methods.length?S.settings.methods:ALL_PAY);};
var prodById=function(id){return id?S.products.find(function(x){return String(x.id)===String(id);})||null:null;};
var servById=function(id){return id?S.services.find(function(x){return String(x.id)===String(id);})||null:null;};
var clientById=function(id){return id?S.clients.find(function(x){return String(x.id)===String(id);})||null:null;};
var supplierById=function(id){return id?(S.suppliers||[]).find(function(x){return String(x.id)===String(id);})||null:null;};
var lowStock=function(x){return x.stock<=x.min;};
var expiring=function(x){return !!x.expires&&diffDays(x.expires)<=EXPIRY_DAYS;};
var expired=function(x){return !!x.expires&&diffDays(x.expires)<0;};
var prodByBarcode=function(code){var c=normCode(code);return c?S.products.find(function(x){return (x.barcodes||[]).indexOf(c)>=0||x.barcode===c;}):undefined;};
var prodLabel=function(x){return x.name+(x.brand?' – '+x.brand:'');};

/* ============================================================
   Avisos (toasts): se ven al menos 5 segundos y se pueden cerrar
   ============================================================ */
function toast(msg,warn){
  var t=$('#toast');
  t.setAttribute('role',warn?'alert':'status');
  t.innerHTML='<span>'+esc(msg)+'</span><button type="button" aria-label="Cerrar aviso">✕</button>';
  t.classList.toggle('warn',!!warn);t.classList.add('on');
  t.querySelector('button').onclick=function(){t.classList.remove('on');};
  clearTimeout(toast._t);toast._t=setTimeout(function(){t.classList.remove('on');},warn?8000:5000);
}

/* ============================================================
   Conexión con el servidor y manejo centralizado de errores
   Nunca se muestran códigos crudos: cada caso tiene un mensaje claro.
   ============================================================ */
var FRIENDLY={
  0:'Sin conexión con el servidor. Revisá tu internet y reintentá.',
  401:'Se venció tu sesión. Volvé a ingresar.',
  403:'No tenés permiso para hacer esto.',
  404:'No encontramos lo que buscabas. Recargá la página.',
  408:'El servidor tardó demasiado en responder. Reintentá en unos segundos.',
  413:'Lo que querés guardar es demasiado grande.',
  429:'Hiciste demasiados intentos seguidos. Esperá unos minutos y reintentá.',
  500:'Algo salió mal en el servidor. Reintentá en unos segundos.',
  502:'El servidor no está respondiendo bien. Reintentá en unos segundos.',
  503:'El sistema se está despertando o no está disponible. Esperá un minuto y reintentá.'
};
async function api(path,opts){
  opts=opts||{};
  var init={method:opts.method||'GET',credentials:'same-origin',headers:{'Accept':'application/json'}};
  if(opts.body!==undefined){init.method=opts.method||'POST';init.headers['Content-Type']='application/json';init.body=JSON.stringify(opts.body);}
  var ctl=window.AbortController?new AbortController():null,timer=null;
  if(ctl){init.signal=ctl.signal;timer=setTimeout(function(){ctl.abort();},opts.timeout||60000);}
  var res;
  try{res=await fetch('/api'+path,init);}
  catch(e){var ce=new Error(e&&e.name==='AbortError'?FRIENDLY[408]:FRIENDLY[0]);ce.status=e&&e.name==='AbortError'?408:0;throw ce;}
  finally{clearTimeout(timer);}
  if(opts.raw&&res.ok)return res;
  var data=null,isJson=String(res.headers.get('content-type')||'').indexOf('application/json')>=0;
  if(isJson){try{data=await res.json();}catch(e){}}
  if(!res.ok){
    var msg;
    if(data&&data.error)msg=data.error;
    else if(!isJson&&(res.status===403||res.status===400||res.status===406))msg='No pudimos guardar: el texto tiene caracteres que no se aceptan. Probá sacando comillas o signos raros.';
    else msg=FRIENDLY[res.status]||FRIENDLY[500];
    var err=new Error(msg);
    err.status=res.status;err.code=data&&data.code;err.details=data&&data.details;
    if(res.status===401&&path!=='/login'&&S.user){S.user=null;showLogin(FRIENDLY[401]);}
    throw err;
  }
  if(!isJson){var bad=new Error('No pudimos leer la respuesta del servidor. Recargá la página.');bad.status=500;throw bad;}
  return data;
}
// Avisos del servidor que se pueden confirmar ("¿Guardar igual?"): código → dato que se reenvía.
var CONFIRMS={loss:['confirmLoss','Guardar igual'],duplicate:['confirmDuplicate','Guardar igual'],past:['confirmPast','Guardar igual'],hours:['confirmHours','Reservar igual'],
  overlap_soft:['confirmOverlap','Agendar igual'],expired:['confirmExpired','Vender igual'],future_date:['confirmFuture','Sí, es correcta'],barcode_taken:['reassign','Pasar el código']};
/** Como api(), pero si el servidor pide confirmación muestra la pregunta y reintenta con la confirmación. */
async function apiConfirm(path,opts){
  for(var i=0;i<6;i++){
    try{return await api(path,opts);}
    catch(e){
      var c=e.code&&CONFIRMS[e.code];
      // Si ya se confirmó y el servidor vuelve a rechazar, no se pregunta de nuevo (evita un bucle).
      if(!c||!(e.status===409)||(opts.body&&opts.body[c[0]]===true))throw e;
      var ch=await choiceDialog('Antes de seguir','<p>'+esc(e.message)+'</p>',[{label:'Volver',value:null,cls:'ghost'},{label:c[1],value:'ok',cls:'primary'}]);
      if(ch!=='ok'){var stop=new Error('');stop.cancelled=true;throw stop;}
      opts=Object.assign({},opts,{body:Object.assign({},opts.body)});opts.body[c[0]]=true;
    }
  }
}

function setState(s){document.body.dataset.state=s;}
function showLogin(msg){
  if(dlg.open)dlg.close();
  stopScanners();
  setState('login');
  $('#lerror').textContent=msg||'';
}
function applyBootstrap(d){
  S.shop=d.shop||'Mi Pet Shop';S.settings=d.settings||{};S.user=d.user;
  S.products=(d.products||[]).sort(byName(function(x){return x.name;}));
  S.services=(d.services||[]).sort(byName(function(x){return x.name;}));
  S.suppliers=(d.suppliers||[]).sort(byName(function(x){return x.name;}));
  S.clients=(d.clients||[]).sort(byName(function(x){return (x.lastName||'')+' '+x.firstName;}));
  S.clients.forEach(function(c){c.pets.sort(byName(function(p){return p.name;}));});
  S.summary=d.summary||null;
  document.title=S.shop;
  $('#shopname').textContent=S.shop;
  if(PAY().indexOf(ui.cart.method)<0)ui.cart.method=PAY()[0];
}
async function start(){
  var d=await api('/bootstrap');
  applyBootstrap(d);
  ui.view=isAdmin()?'resumen':'vender';
  restoreDraft();
  setState('app');
  render();
  try{await loadView();}catch(e){toast(e.message,true);}
  render();
}
async function boot(){
  try{await start();}
  catch(e){
    if(e.status===401){showLogin();return;}
    setState('loading');
    $('#boot-msg').textContent='No se pudo conectar con el sistema';
    $('#boot-sub').textContent=e.message;
    $('#boot-retry').hidden=false;
  }
}

/* ============================================================
   Ventanas (formularios y avisos) accesibles:
   el foco entra al abrir, Esc cierra y el foco vuelve al botón que la abrió.
   ============================================================ */
var lastOpener=null;
document.addEventListener('focusin',function(e){if(!dlg.contains(e.target)&&!e.target.closest('dialog'))lastOpener=e.target;});
dlg.addEventListener('close',function(){var o=lastOpener;if(o&&document.contains(o)&&o.focus)setTimeout(function(){o.focus();},0);});
dlg.addEventListener('click',function(e){if(e.target===dlg)dlg.close();});
function showDlg(){if(!dlg.open)dlg.showModal();var f=dlg.querySelector('[autofocus],input:not([type=hidden]):not([disabled]),select,textarea,button.primary');if(f)setTimeout(function(){f.focus();},0);}

function fld(label,name,o){
  o=o||{};
  var value=o.value==null?'':o.value,ctl,id='f_'+name,hint=o.hint?'<small class="hint">'+o.hint+'</small>':'';
  var describe=' aria-describedby="'+id+'_err"';
  if(o.opts){
    ctl='<select id="'+id+'" name="'+name+'"'+(o.req?' required':'')+describe+'>'+o.opts.map(function(x){
      var v=Array.isArray(x)?x[0]:x,t=Array.isArray(x)?x[1]:x;
      return '<option value="'+esc(v)+'"'+(String(v)===String(value)?' selected':'')+'>'+esc(t)+'</option>';
    }).join('')+'</select>';
  }else if(o.type==='textarea'){
    ctl='<textarea id="'+id+'" name="'+name+'" rows="3" maxlength="'+(o.maxlength||1000)+'" placeholder="'+esc(o.ph||'')+'"'+describe+'>'+esc(value)+'</textarea>';
  }else if(o.type==='checkbox'){
    return '<label class="fld check'+(o.full?' full':'')+'"><input type="checkbox" id="'+id+'" name="'+name+'"'+(value?' checked':'')+'><span>'+label+'</span></label>';
  }else{
    ctl='<input id="'+id+'" name="'+name+'" type="'+(o.type||'text')+'" value="'+esc(value)+'"'+(o.req?' required':'')+' placeholder="'+esc(o.ph||'')+'"'+
      (o.step?' step="'+o.step+'"':'')+(o.minlength?' minlength="'+o.minlength+'"':'')+(o.maxlength?' maxlength="'+o.maxlength+'"':(o.type&&o.type!=='text'?'':' maxlength="200"'))+
      (o.pattern?' pattern="'+o.pattern+'" data-title="'+esc(o.title||'')+'"':'')+(o.min!=null?' min="'+o.min+'"':'')+(o.max!=null?' max="'+o.max+'"':'')+(o.list?' list="'+o.list+'"':'')+
      (o.inputmode?' inputmode="'+o.inputmode+'"':'')+(o.auto?' autocomplete="'+o.auto+'"':' autocomplete="off"')+describe+'>';
  }
  return '<label class="fld'+(o.full?' full':'')+'" for="'+id+'"><span>'+label+(o.req?' <b class="req" aria-hidden="true">*</b>':'')+'</span>'+ctl+hint+'<small class="ferr" id="'+id+'_err" role="alert"></small></label>';
}
// Mensaje en lenguaje claro para un campo inválido (en vez del globo nativo del navegador).
function fieldMessage(el){
  var v=el.validity;
  if(v.valueMissing)return el.type==='checkbox'?'Tildá esta casilla para seguir.':'Completá este campo.';
  if(v.typeMismatch)return el.type==='email'?'El email no parece válido (ej.: nombre@gmail.com).':'Revisá el formato.';
  if(v.patternMismatch)return el.dataset.title||'Revisá el formato.';
  if(v.rangeUnderflow)return 'El mínimo es '+String(el.min).replace('.',',')+'.';
  if(v.rangeOverflow)return 'El máximo es '+String(el.max).replace('.',',')+'.';
  if(v.stepMismatch)return el.step==='1'?'Va un número entero.':'Revisá los decimales.';
  if(v.tooShort)return 'Tiene que tener al menos '+el.minLength+' caracteres.';
  if(v.badInput)return 'Escribí un número.';
  return 'Revisá este campo.';
}
function clearFieldErrors(f){f.querySelectorAll('.ferr').forEach(function(x){x.textContent='';});f.querySelectorAll('[aria-invalid]').forEach(function(x){x.removeAttribute('aria-invalid');});}
function showFieldError(f,el,msg){
  var e=f.querySelector('#'+el.id+'_err');if(e)e.textContent=''+msg;
  el.setAttribute('aria-invalid','true');
}
/** Valida el formulario y deja los mensajes debajo de cada campo; lleva el foco al primer error. */
function validateForm(f){
  clearFieldErrors(f);
  var first=null;
  f.querySelectorAll('input,select,textarea').forEach(function(el){
    if(el.closest('[hidden]')||el.disabled||!el.willValidate)return;
    if(!el.checkValidity()){showFieldError(f,el,fieldMessage(el));if(!first)first=el;}
  });
  if(first){first.focus();first.scrollIntoView({block:'center'});}
  return !first;
}
/** Si el mensaje del servidor nombra un campo («Nombre»), el error también se muestra debajo de ese campo. */
function attachServerError(f,msg){
  var m=/«([^»]+)»/.exec(msg||'');if(!m)return;
  var label=norm(m[1]);
  f.querySelectorAll('label.fld').forEach(function(l){
    var sp=l.querySelector('span');if(!sp)return;
    if(norm(sp.textContent).replace(/\s*\*$/,'').indexOf(label)===0){var el=l.querySelector('input,select,textarea');if(el){showFieldError(f,el,msg);el.focus();}}
  });
}
function openForm(o){
  dlg.innerHTML='<form class="dform" novalidate><h2>'+o.title+'</h2>'+o.body+'<p class="err" role="alert"></p>'+
    '<div class="actions"><button type="button" class="btn ghost" data-close>Cancelar</button>'+
    '<button type="submit" class="btn '+(o.danger?'danger':'primary')+'">'+(o.submit||'Guardar')+'</button></div></form>';
  var f=dlg.querySelector('form');
  f.addEventListener('submit',async function(e){
    e.preventDefault();
    if(f.dataset.busy)return; // nunca se envía dos veces
    if(!validateForm(f)){f.querySelector('.err').textContent='Revisá los campos marcados.';return;}
    var btn=f.querySelector('[type="submit"]'),errEl=f.querySelector('.err'),data={},label=btn.innerHTML;
    new FormData(f).forEach(function(v,k){data[k]=v;});
    errEl.textContent='';f.dataset.busy='1';btn.disabled=true;btn.classList.add('busy');btn.textContent='Guardando…';
    try{var r=await o.onSubmit(data,f);if(r!==false&&dlg.open&&dlg.contains(f))dlg.close();}
    catch(err){if(!err.cancelled){errEl.textContent=err.message||'Algo salió mal. Reintentá.';attachServerError(f,err.message);}}
    delete f.dataset.busy;btn.disabled=false;btn.classList.remove('busy');btn.innerHTML=label;
  });
  f.addEventListener('input',function(e){var el=e.target;if(el.getAttribute&&el.getAttribute('aria-invalid')&&el.checkValidity()){el.removeAttribute('aria-invalid');var x=f.querySelector('#'+el.id+'_err');if(x)x.textContent='';}});
  dlg.querySelector('[data-close]').addEventListener('click',function(){dlg.close();});
  showDlg();
  return f;
}
// Confirmación destructiva homogénea: título, qué se pierde y botón rojo.
function confirmForm(title,text,submit,fn,danger){
  openForm({title:title,body:'<p>'+text+'</p>',submit:submit,danger:danger!==false,onSubmit:fn});
}
// Diálogo de decisión que devuelve una promesa con el "value" del botón elegido (o null si se cierra).
function choiceDialog(title,html,buttons){
  return new Promise(function(resolve){
    var d=document.createElement('dialog'),val=null,opener=document.activeElement;
    d.innerHTML='<form class="dform"><h2>'+title+'</h2>'+html+'<div class="actions">'+buttons.map(function(b,i){
      return '<button type="button" class="btn '+(b.cls||'ghost')+'" data-i="'+i+'">'+b.label+'</button>';
    }).join('')+'</div></form>';
    document.body.appendChild(d);
    d.addEventListener('click',function(e){var b=e.target.closest('[data-i]');if(b){val=buttons[Number(b.dataset.i)].value;d.close();}});
    d.addEventListener('close',function(){d.remove();if(opener&&document.contains(opener)&&opener.focus)opener.focus();resolve(val);});
    d.showModal();
    var p=d.querySelector('.btn.primary,.btn.danger');if(p)p.focus();
  });
}
// Ventana de solo lectura con botones propios (detalle de venta, de turno, de proveedor).
function infoDialog(title,html,buttons){
  dlg.innerHTML='<form class="dform"><h2>'+title+'</h2>'+html+'<div class="actions">'+(buttons||[]).map(function(b,i){
    return '<button type="button" class="btn '+(b.cls||'')+'" data-b="'+i+'">'+b.label+'</button>';
  }).join('')+'<button type="button" class="btn ghost" data-close>Cerrar</button></div></form>';
  dlg.querySelector('[data-close]').addEventListener('click',function(){dlg.close();});
  (buttons||[]).forEach(function(b,i){dlg.querySelector('[data-b="'+i+'"]').addEventListener('click',function(ev){
    var bt=ev.currentTarget;if(bt.dataset.busy)return;bt.dataset.busy='1';
    Promise.resolve().then(b.fn).catch(function(err){if(!err.cancelled)toast(err.message,true);}).then(function(){delete bt.dataset.busy;});
  });});
  showDlg();
}
function segHTML(action,items,active,label){
  return '<div class="seg" role="group"'+(label?' aria-label="'+esc(label)+'"':'')+'>'+items.map(function(i){
    return '<button class="segb" data-action="'+action+'" data-v="'+i[0]+'" aria-pressed="'+(String(i[0])===String(active))+'">'+i[1]+'</button>';
  }).join('')+'</div>';
}
var loadingView=function(title){return '<section class="farm"><div class="head"><h1>'+title+'</h1></div><div class="skeleton" aria-busy="true" aria-label="Cargando"><i></i><i></i><i></i></div></section>';};
var emptyState=function(text,action,label){return '<div class="emptybox"><p>'+text+'</p>'+(action?'<button class="btn primary" data-action="'+action+'">'+label+'</button>':'')+'</div>';};
// "Mostrar más" para listas largas.
var moreBtn=function(shown,total,key){return total>shown?'<div class="more"><button class="btn" data-action="more" data-v="'+key+'">Mostrar más ('+(total-shown)+' restantes)</button></div>':'';};

/* ============================================================
   Carga de datos de cada pantalla
   ============================================================ */
function sumRange(){
  var t=todayIso(),p=ui.sum.period;
  if(p==='yesterday'){var y=shiftDays(-1);return [y,y];}
  if(p==='7d')return [shiftDays(-6),t];
  if(p==='month')return [t.slice(0,8)+'01',t];
  if(p==='prevMonth'){var f=shiftMonths(-1,t.slice(0,8)+'01');return [f,monthEnd(f)];}
  if(p==='range'&&ui.sum.from&&ui.sum.to)return [ui.sum.from,ui.sum.to];
  return [t,t];
}
var sumQ=function(){var r=sumRange();return 'from='+r[0]+'&to='+r[1];};
// Solo se muestra la última carga pedida: si cambiás el período mientras otra consulta sigue en curso,
// la respuesta vieja se descarta (antes podía llegar tarde y dejar la Comparación con el período anterior).
var sumSeq=UR.latest();
/* Al cambiar el período, los números del período anterior se borran (se ve "Cargando") en vez de quedar a la vista. */
function clearSumData(){ui.sum.data=null;ui.sum.hours=null;ui.sum.compare=null;ui.sum.products=null;ui.sum.clients=null;ui.sum.staff=null;}
async function loadSummary(){
  var q=sumQ(),tab=ui.sum.tab,admin=isAdmin(),t=sumSeq.next(),r;
  if(tab==='general'){
    var calls=[api('/summary?'+q),api('/summary/hours?'+q)];
    if(admin)calls.push(api('/summary/monthly?months=12'),api('/summary/compare?'+q));
    r=await Promise.all(calls);
    if(!sumSeq.isCurrent(t))return;
    ui.sum.data=r[0];ui.sum.hours=r[1];ui.sum.monthly=admin?r[2].months:null;ui.sum.compare=admin?r[3]:null;
  }else if(tab==='productos'&&admin){r=await api('/summary/products?'+q+'&group='+ui.sum.pgroup);if(sumSeq.isCurrent(t))ui.sum.products=r;}
  else if(tab==='clientes'){r=await api('/summary/clients?'+q);if(sumSeq.isCurrent(t))ui.sum.clients=r;}
  else if(tab==='personal'&&admin){r=await api('/summary/staff?'+q);if(sumSeq.isCurrent(t))ui.sum.staff=r;}
  else if(tab==='proyeccion'&&admin){r=await api('/summary/projection');if(sumSeq.isCurrent(t))ui.sum.proj=r;}
}
async function loadView(){
  var v=ui.view;
  if(v==='resumen'){await loadSummary();}
  else if(v==='ventas'){await loadSales();}
  else if(v==='clientes'&&ui.csel){
    try{ui.cdetail=await api('/clients/'+ui.csel);}
    catch(e){if(e.status===404){ui.csel=null;ui.cdetail=null;}else throw e;}
  }
  else if(v==='agenda'){await loadAppointments();}
  else if(v==='caja'&&isAdmin()){await loadCash();}
  else if(v==='proveedores'){ui.suppliers=(await api('/suppliers')).items.sort(byName(function(x){return x.name;}));}
  else if(v==='copias'&&isAdmin()){var b=await api('/backups');ui.backups=b.items;ui.usage=b.usage;}
  else if(v==='usuarios'&&isAdmin()){
    if(ui.utab==='actividad')await loadAudit();
    else ui.users=(await api('/users')).items;
  }
}
async function loadSales(){
  var p=[];
  if(isAdmin()&&ui.sfrom&&ui.sto)p.push('from='+ui.sfrom,'to='+ui.sto);
  if(ui.sq)p.push('q='+encodeURIComponent(ui.sq));
  ui.sales=await api('/sales'+(p.length?'?'+p.join('&'):''));
}
async function loadAudit(){
  var p=[];
  if(ui.afrom)p.push('from='+ui.afrom);if(ui.ato)p.push('to='+ui.ato);if(ui.auser)p.push('user='+ui.auser);if(ui.aaction)p.push('action='+encodeURIComponent(ui.aaction));
  var r=await Promise.all([api('/audit'+(p.length?'?'+p.join('&'):'')),ui.users?Promise.resolve({items:ui.users}):api('/users')]);
  ui.audit=r[0];ui.users=r[1].items;
}
function calRange(){
  var a=ui.cal.anchor;
  if(ui.cal.view==='day')return [a,a];
  if(ui.cal.view==='week')return [mondayOf(a),shiftDays(6,mondayOf(a))];
  var first=a.slice(0,8)+'01',last=monthEnd(a);
  var wd=parse(last).getDay();wd=wd===0?7:wd;
  return [mondayOf(first),shiftDays(7-wd,last)];
}
async function loadAppointments(){
  var r=calRange();
  var x=await Promise.all([api('/appointments?from='+r[0]+'&to='+r[1]),api('/appointments/staff')]);
  ui.appts=x[0].items;ui.staffNames=x[1].items;
}
async function reloadCal(){
  try{await loadAppointments();}catch(e){toast(e.message,true);}
  render();
}
function calShift(dir){
  if(ui.cal.view==='month'){ui.cal.anchor=shiftMonths(dir,ui.cal.anchor);return;}
  ui.cal.anchor=shiftDays(dir*(ui.cal.view==='day'?1:7),ui.cal.anchor);
}
function calTitle(){
  if(ui.cal.view==='month'){var t=parse(ui.cal.anchor).toLocaleDateString('es-AR',{month:'long',year:'numeric'});return t.charAt(0).toUpperCase()+t.slice(1);}
  if(ui.cal.view==='day'){var s=parse(ui.cal.anchor).toLocaleDateString('es-AR',{weekday:'long',day:'numeric',month:'long'});return s.charAt(0).toUpperCase()+s.slice(1);}
  var r=calRange();return fmtDate(r[0])+' – '+fmtDate(r[1]);
}
function cashQuery(){
  var q=['period='+ui.cashp];
  if(ui.cashp==='range'){q.push('from='+ui.cfrom);q.push('to='+ui.cto);}
  if(ui.cashf!=='all')q.push('type='+ui.cashf);
  if(ui.cashm!=='all')q.push('group='+encodeURIComponent(ui.cashm));
  if(ui.cq)q.push('q='+encodeURIComponent(ui.cq));
  return q.join('&');
}
async function downloadFile(path,name){
  var res=await api(path,{raw:true});
  var blob=await res.blob();
  var a=document.createElement('a');
  a.href=URL.createObjectURL(blob);a.download=name;
  document.body.appendChild(a);a.click();
  setTimeout(function(){URL.revokeObjectURL(a.href);a.remove();},1500);
}
var rangeHTML=function(idFrom,idTo,from,to){
  return '<span class="rng"><label>Desde <input type="date" id="'+idFrom+'" value="'+esc(from)+'" max="'+todayIso()+'"></label> <label>Hasta <input type="date" id="'+idTo+'" value="'+esc(to)+'"></label></span>';
};
async function loadCash(){
  var r=await Promise.all([api('/cash?'+cashQuery()),api('/cash/summary'),api('/cash/closings')]);
  ui.cash=r[0];S.summary=r[1];ui.closings=r[2];
}
/* Después de guardar algo: vuelve a pedir los datos y redibuja. */
async function reload(){
  try{applyBootstrap(await api('/bootstrap'));await loadView();}catch(e){toast(e.message,true);}
  render();
}
async function go(view){
  if(view==='reportes')view='resumen'; // la antigua pantalla Reportes ahora vive dentro de Resumen
  stopScanners();
  ui.view=view;
  document.body.classList.remove('navopen');
  render();
  window.scrollTo(0,0);
  try{await loadView();}catch(e){toast(e.message,true);}
  render();
  var h=main.querySelector('h1');if(h){h.setAttribute('tabindex','-1');}
}
async function refreshView(){
  render();
  try{await loadView();}catch(e){toast(e.message,true);}
  render();
}

/* ============================================================
   Navegación, avisos y usuario
   ============================================================ */
function navItems(){
  var a=[['resumen','Resumen','Principal'],['vender','Vender','Principal'],['ventas','Ventas','Principal'],['agenda','Agenda','Principal'],
    ['stock','Stock','Catálogo'],['servicios','Servicios','Catálogo'],['clientes','Clientes','Contactos'],['proveedores','Proveedores','Contactos']];
  if(isAdmin())a.push(['caja','Caja','Administración'],['copias','Copias de seguridad','Administración'],['usuarios','Usuarios y actividad','Administración']);
  return a;
}
function renderNav(){
  var last='';
  $('#nav').innerHTML=navItems().map(function(i){
    var head=i[2]!==last?'<div class="navgrp">'+i[2]+'</div>':'';last=i[2];
    return head+'<button class="navb" data-action="nav" data-v="'+i[0]+'" aria-current="'+(ui.view===i[0]?'page':'false')+'">'+i[1]+'</button>';
  }).join('');
}
function renderUserBox(){
  var u=S.user;
  $('#userbox').innerHTML='<div class="who"><b>'+esc(u.name)+'</b><small>'+(u.role==='admin'?'Dueño / administrador':'Empleado')+'</small></div>'+
    '<button data-action="change-pass">Cambiar contraseña</button><button data-action="logout">Cerrar sesión</button>';
}
function lastExportDays(){var t=Number(store.get('petshop_last_export'));if(!t)return null;return Math.floor((Date.now()-t)/86400000);}
function renderAlerts(){
  var low=S.products.filter(lowStock).length,exp=S.products.filter(expiring).length;
  var h='';
  if(low)h+='<button class="al" data-action="goto-stock" data-v="low"><span class="dot stock"></span><span>'+plural(low,'producto con poco stock','productos con poco stock')+'</span></button>';
  if(exp)h+='<button class="al" data-action="goto-stock" data-v="exp"><span class="dot porvencer"></span><span>'+plural(exp,'producto vencido o por vencer','productos vencidos o por vencer')+'</span></button>';
  if(isAdmin()){
    var d=lastExportDays();
    if(d===null||d>7)h+='<button class="al" data-action="nav" data-v="copias"><span class="dot copia"></span><span>'+(d===null?'Todavía no descargaste una copia de seguridad':'Hace '+plural(d,'día','días')+' que no descargás una copia de seguridad')+'</span></button>';
  }
  if(!h)h='<div class="al"><span class="dot ok"></span><span>Todo en orden</span></div>';
  $('#alerts').innerHTML='<h2 class="side-h">Para revisar</h2>'+h;
}

/* ============================================================
   Resumen: una sola pantalla con todos los números
   ============================================================ */
var PERIODS=[['today','Hoy'],['yesterday','Ayer'],['7d','7 días'],['month','Este mes'],['prevMonth','Mes anterior'],['range','Rango']];
function card(label,value,sub,cls){
  return '<div class="card'+(cls?' '+cls:'')+'"><small>'+label+'</small><b>'+value+'</b>'+(sub?'<span>'+sub+'</span>':'')+'</div>';
}
var srTable=function(caption,head,rows){return '<table class="sr-only"><caption>'+esc(caption)+'</caption><thead><tr>'+head.map(function(h){return '<th>'+esc(h)+'</th>';}).join('')+'</tr></thead><tbody>'+rows.map(function(r){return '<tr>'+r.map(function(c){return '<td>'+esc(c)+'</td>';}).join('')+'</tr>';}).join('')+'</tbody></table>';};
var keyLabel=function(k,gran){if(gran==='month'){var t=parse(k+'-01').toLocaleDateString('es-AR',{month:'short',year:'2-digit'});return t.replace('.','');}return k.slice(8,10)+'/'+k.slice(5,7);};
// Gráfico de barras accesible (con tabla alternativa para lectores de pantalla y tooltip con valores).
// Ancho fijo como el de líneas: con muchas columnas, las etiquetas del eje X se espacian (R.labelStep) para no pisarse.
var LABEL_MIN={month:46,day:40}; // espacio mínimo por etiqueta («sept 26», «08/10»), en unidades del gráfico
function barChart(points,gran,showProfit){
  var n=points.length,max=Math.max.apply(null,points.map(function(p){return p.total;}).concat([1]));
  var W=620,H=200,L=8,Rm=8,T=12,B=26,pw=W-L-Rm,ph=H-T-B,bw=pw/Math.max(1,n),step=UR.labelStep(n,pw,LABEL_MIN[gran]||LABEL_MIN.day);
  var y=function(v){return T+(1-v/max)*ph;};
  var grid=[0,.5,1].map(function(g){var yy=y(max*g);return '<line x1="'+L+'" x2="'+(W-Rm)+'" y1="'+yy.toFixed(1)+'" y2="'+yy.toFixed(1)+'" class="grid"></line>'+(g?'<text x="'+L+'" y="'+(yy-3).toFixed(1)+'">'+money(max*g)+'</text>':'');}).join('');
  var bars=points.map(function(p,i){
    var w=Math.max(3,Math.min(40,bw*0.62)),x=L+i*bw+(bw-w)/2,h=p.total/max*ph,hp=showProfit?Math.max(0,p.profit)/max*ph:0;
    return '<g><title>'+keyLabel(p.key,gran)+': vendido '+money(p.total)+(showProfit?' · ganancia '+money(p.profit):'')+' · '+plural(p.count,'venta','ventas')+'</title>'+
      '<rect x="'+x.toFixed(1)+'" y="'+(T+ph-h).toFixed(1)+'" width="'+w.toFixed(1)+'" height="'+Math.max(h,p.total>0?2:0).toFixed(1)+'" rx="3" class="b-total"></rect>'+
      (showProfit?'<rect x="'+x.toFixed(1)+'" y="'+(T+ph-hp).toFixed(1)+'" width="'+w.toFixed(1)+'" height="'+hp.toFixed(1)+'" rx="3" class="b-profit"></rect>':'')+
      (i%step===0?'<text x="'+(x+w/2).toFixed(1)+'" y="'+(H-8)+'" text-anchor="middle">'+keyLabel(p.key,gran)+'</text>':'')+'</g>';
  }).join('');
  return '<div class="chartwrap"><svg class="chart barchart" viewBox="0 0 '+W+' '+H+'" role="img" aria-label="Evolución de ventas">'+grid+
    '<line x1="'+L+'" x2="'+(W-Rm)+'" y1="'+(T+ph)+'" y2="'+(T+ph)+'" class="axis"></line>'+bars+'</svg></div>'+
    srTable('Ventas por '+(gran==='month'?'mes':'día'),['Período','Vendido'].concat(showProfit?['Ganancia']:[]).concat(['Ventas']),points.map(function(p){return [keyLabel(p.key,gran),money(p.total)].concat(showProfit?[money(p.profit)]:[]).concat([String(p.count)]);}));
}
function lineChart(lines,labels){
  var all=[].concat.apply([],lines.map(function(l){return l.data;}));
  var max=Math.max.apply(null,all.concat([1])),n=Math.max.apply(null,lines.map(function(l){return l.data.length;}).concat([2]));
  var W=560,H=170,x=function(i){return Math.round(i/(n-1)*(W-20))+10;},y=function(v){return Math.round(H-24-v/max*(H-40));};
  return '<div class="chartwrap"><svg class="chart" viewBox="0 0 '+W+' '+H+'" role="img" aria-label="Comparación de ventas por día">'+lines.map(function(l){
    return '<polyline fill="none" class="'+l.cls+'" points="'+l.data.map(function(v,i){return x(i)+','+y(v);}).join(' ')+'"><title>'+esc(l.label)+'</title></polyline>';
  }).join('')+'</svg></div><div class="legend">'+lines.map(function(l){return '<span><i class="'+l.cls+'"></i>'+esc(l.label)+'</span>';}).join('')+'</div>';
}
function sumHeader(){
  var r=sumRange(),admin=isAdmin();
  var tabs=[['general','General']].concat(admin?[['productos','Productos']]:[]).concat([['clientes','Clientes']]).concat(admin?[['personal','Personal'],['proyeccion','Proyección']]:[]);
  return '<div class="head"><h1>Resumen</h1><div class="hbtns">'+(admin?'<button class="btn" data-action="nav" data-v="caja">Cerrar caja</button>':'')+'<button class="btn primary" data-action="nav" data-v="vender">Nueva venta</button></div></div>'+
    '<div class="toolbar periodbar">'+segHTML('sum-period',PERIODS,ui.sum.period,'Período')+(ui.sum.period==='range'?rangeHTML('sumfrom','sumto',ui.sum.from,ui.sum.to):'')+
    '<span class="mut">'+(r[0]===r[1]?fmtDate(r[0]):fmtDate(r[0])+' al '+fmtDate(r[1]))+'</span></div>'+
    '<div class="tabs" role="tablist">'+tabs.map(function(t){return '<button class="tab" role="tab" data-action="sum-tab" data-v="'+t[0]+'" aria-selected="'+(ui.sum.tab===t[0])+'">'+t[1]+'</button>';}).join('')+'</div>';
}
function viewResumen(){
  var body;
  if(ui.sum.tab==='productos')body=sumProductos();
  else if(ui.sum.tab==='clientes')body=sumClientes();
  else if(ui.sum.tab==='personal')body=sumPersonal();
  else if(ui.sum.tab==='proyeccion')body=sumProyeccion();
  else body=sumGeneral();
  return '<section class="farm">'+sumHeader()+body+'</section>';
}
var periodName=function(){var p=ui.sum.period;return p==='today'?'ayer':p==='yesterday'?'el día anterior':p==='month'||p==='prevMonth'?'el período anterior':'el período anterior';};
/* ---- Gráficos del tablero ---- */
var CHART_COLORS=6;
// Anillo (donut) con leyenda. items: [{label,value}]; el centro muestra el total.
function donut(items,fmt,centerLabel){
  var tot=items.reduce(function(n,x){return n+x.value;},0);
  if(!(tot>0))return '<p class="empty">Sin datos en este período.</p>';
  var pos=0,segs=items.map(function(x,i){
    var p=x.value/tot*100,c='<circle class="dn dn'+(i%CHART_COLORS)+'" cx="21" cy="21" r="15.9155" fill="none" stroke-width="5.5" stroke-dasharray="'+p.toFixed(3)+' '+(100-p).toFixed(3)+'" stroke-dashoffset="'+(25-pos).toFixed(3)+'"><title>'+esc(x.label)+': '+fmt(x.value)+' ('+pct(p)+')</title></circle>';
    pos+=p;return c;
  }).join('');
  return '<div class="donutbox"><svg class="donut" viewBox="0 0 42 42" role="img" aria-label="'+esc(centerLabel)+'"><circle cx="21" cy="21" r="15.9155" fill="none" class="dn-bg" stroke-width="5.5"></circle>'+segs+
    '<text x="21" y="20.2" text-anchor="middle" class="dn-n">'+esc(fmt(tot))+'</text><text x="21" y="25" text-anchor="middle" class="dn-l">'+esc(centerLabel)+'</text></svg>'+
    '<ul class="dnlist">'+items.map(function(x,i){return '<li><i class="sw sw'+(i%CHART_COLORS)+'"></i><span>'+esc(x.label)+'</span><b>'+pct(x.value/tot*100)+'</b></li>';}).join('')+'</ul></div>';
}
// Línea con área sombreada (evolución de lo vendido y, para el dueño, de la ganancia).
function areaChart(points,gran,showProfit){
  var W=620,H=200,L=8,R=8,T=12,B=26,n=points.length,max=Math.max.apply(null,points.map(function(p){return p.total;}).concat([1]));
  var x=function(i){return n<2?W/2:L+i/(n-1)*(W-L-R);},y=function(v){return T+(1-v/max)*(H-T-B);};
  var line=function(f){return points.map(function(p,i){return x(i).toFixed(1)+','+y(Math.max(0,f(p))).toFixed(1);}).join(' ');};
  var step=UR.labelStep(n,W-L-R,LABEL_MIN[gran]||LABEL_MIN.day),grid=[0,.5,1].map(function(g){var yy=y(max*g);return '<line x1="'+L+'" x2="'+(W-R)+'" y1="'+yy.toFixed(1)+'" y2="'+yy.toFixed(1)+'" class="grid"></line>'+(g?'<text x="'+L+'" y="'+(yy-3).toFixed(1)+'">'+money(max*g)+'</text>':'');}).join('');
  var labels=points.map(function(p,i){return i%step===0?'<text x="'+x(i).toFixed(1)+'" y="'+(H-8)+'" text-anchor="middle">'+keyLabel(p.key,gran)+'</text>':'';}).join('');
  var dots=points.map(function(p,i){return '<circle cx="'+x(i).toFixed(1)+'" cy="'+y(p.total).toFixed(1)+'" r="'+(n>40?1.5:3)+'" class="pt"><title>'+keyLabel(p.key,gran)+': vendido '+money(p.total)+(showProfit?' · ganancia '+money(p.profit):'')+' · '+plural(p.count,'venta','ventas')+'</title></circle>';}).join('');
  return '<div class="chartwrap"><svg class="chart areachart" viewBox="0 0 '+W+' '+H+'" role="img" aria-label="Evolución de ventas">'+grid+
    '<polygon class="area" points="'+x(0).toFixed(1)+','+y(0).toFixed(1)+' '+line(function(p){return p.total;})+' '+x(n-1).toFixed(1)+','+y(0).toFixed(1)+'"></polygon>'+
    '<polyline class="l-cur" fill="none" points="'+line(function(p){return p.total;})+'"></polyline>'+
    (showProfit?'<polyline class="l-profit" fill="none" points="'+line(function(p){return p.profit;})+'"></polyline>':'')+dots+labels+'</svg></div>'+
    '<div class="legend"><span><i class="l-cur"></i>Vendido</span>'+(showProfit?'<span><i class="l-profit"></i>Ganancia</span>':'')+'</div>'+
    srTable('Ventas por '+(gran==='month'?'mes':'día'),['Período','Vendido'].concat(showProfit?['Ganancia']:[]).concat(['Ventas']),points.map(function(p){return [keyLabel(p.key,gran),money(p.total)].concat(showProfit?[money(p.profit)]:[]).concat([String(p.count)]);}));
}
// Barras horizontales ordenadas (ranking).
function rankBars(rows,fmt){
  if(!rows.length)return '<p class="empty">Sin datos en este período.</p>';
  var max=Math.max.apply(null,rows.map(function(r){return r.value;}).concat([1]));
  return '<ul class="rank">'+rows.map(function(r,i){return '<li><span class="rk">'+(i+1)+'</span><span class="rn" title="'+esc(r.label)+'">'+esc(r.label)+'</span><span class="bars"><span class="bar" style="width:'+Math.max(2,r.value/max*100)+'%"></span></span><b>'+fmt(r.value)+'</b></li>';}).join('')+'</ul>';
}
function kpiCards(D){
  var admin=isAdmin(),K=D.kpis,C=D.change,vs=' vs. '+periodName();
  return '<div class="cards kpis">'+card('Vendido',money(K.total),delta(C.total)+vs)+
    (admin?card('Ganancia',money(K.profit),(K.margin==null?'':'Margen '+pct(K.margin)+' · ')+delta(C.profit)):'')+
    card('Ticket promedio',money(K.avg),delta(C.avg))+
    card('N° de ventas',String(K.count),delta(C.count))+
    (admin?card('Efectivo en caja',money(D.drawer),'Hoy',D.drawer<0?'neg':''):'')+
    (admin?card('Gastos y compras',money(K.expenses),delta(C.expenses,false)):'')+
    (D.days>=7?card('Clientes nuevos',String(K.newClients),delta(C.newClients)):'')+'</div>';
}
var noSales=function(){return '<p class="empty">Todavía no hay ventas en este período.</p>';};
function sumSubs(){
  var a=[['panorama','Panorama'],['evolucion','Evolución'],['masvendidos','Más vendidos'],['pagos','Medios de pago']];
  if(isAdmin())a.push(['comparacion','Comparación']);
  a.push(['horarios','Horarios']);
  return a;
}
function sumGeneral(){
  var D=ui.sum.data;
  if(!D)return '<div class="skeleton" aria-busy="true" aria-label="Cargando"><i></i><i></i><i></i></div>';
  var subs=sumSubs(),sub=subs.some(function(x){return x[0]===ui.sum.sub;})?ui.sum.sub:'panorama';
  var nav='<div class="subnav" role="group" aria-label="Pantallas del resumen">'+subs.map(function(x){return '<button class="subtab" data-action="sum-sub" data-v="'+x[0]+'" aria-pressed="'+(x[0]===sub)+'">'+x[1]+'</button>';}).join('')+'</div>';
  var body=sub==='evolucion'?sumEvolucion(D):sub==='masvendidos'?sumMasVendidos(D):sub==='pagos'?sumPagos(D):sub==='comparacion'&&isAdmin()?comparePanel():sub==='horarios'?hoursPanel():sumPanorama(D);
  return nav+body;
}
// Panorama: el tablero con lo más importante en una sola mirada.
function sumPanorama(D){
  var admin=isAdmin(),hasSales=D.series.some(function(p){return p.total>0;});
  var payItems=D.payments.map(function(p){return {label:p.method,value:p.total};});
  var catItems=D.categories.slice(0,6).map(function(c){return {label:c.category,value:c.share};});
  var topList=(admin?D.topByProfit:D.topByUnits).slice(0,5);
  var top=rankBars(topList.map(function(x){return {label:x.name,value:admin?x.profit:x.qty};}),admin?money:function(v){return String(r3(v)).replace('.',',');});
  var low=S.products.filter(lowStock).length,exp=S.products.filter(expiring).length;
  var health='<ul class="stats">'+
    '<li><span>Productos con poco stock</span><b class="'+(low?'neg':'')+'">'+low+'</b></li>'+
    '<li><span>Vencidos o por vencer</span><b class="'+(exp?'neg':'')+'">'+exp+'</b></li>'+
    '<li><span>Turnos de hoy</span><b>'+D.alerts.apptsToday+'</b></li>'+
    '<li><span>Turnos pendientes</span><b>'+D.alerts.apptsPending+'</b></li>'+
    (admin?'<li><span>Efectivo en caja</span><b class="'+(D.drawer<0?'neg':'')+'">'+money(D.drawer)+'</b></li>':'')+'</ul>';
  return kpiCards(D)+'<div class="dash">'+
    '<section class="panel span8"><h2 class="h3">Evolución de ventas</h2>'+(hasSales?areaChart(D.series,D.granularity,admin):noSales())+'</section>'+
    '<section class="panel span4"><h2 class="h3">Medios de pago</h2>'+donut(payItems,money,'cobrado')+'</section>'+
    '<section class="panel span4"><h2 class="h3">Ventas por categoría</h2>'+donut(catItems,function(v){return pct(v);},'categorías')+'</section>'+
    '<section class="panel span4"><h2 class="h3">'+(admin?'Productos que más ganancia dejan':'Productos más vendidos')+'</h2>'+top+'</section>'+
    '<section class="panel span4"><h2 class="h3">Estado del negocio</h2>'+health+'</section>'+
    '<div class="span12">'+alertsPanel(D)+'</div></div>';
}
function sumEvolucion(D){
  var admin=isAdmin(),hasSales=D.series.some(function(p){return p.total>0;});
  return '<section class="panel"><h2 class="h3">Ventas por '+(D.granularity==='month'?'mes':'día')+'</h2>'+(hasSales?barChart(D.series,D.granularity,admin)+'<div class="legend"><span><i class="b-total"></i>Vendido</span>'+(admin?'<span><i class="b-profit"></i>Ganancia</span>':'')+'</div>':noSales())+'</section>'+(admin?monthlyPanel():'');
}
function sumMasVendidos(D){
  var admin=isAdmin(),topList=ui.sum.topBy==='profit'&&admin?D.topByProfit:D.topByUnits;
  var top=topList.length?'<div class="tbl-wrap"><table class="tbl slim"><thead><tr><th>Producto</th><th class="num">Unidades</th><th class="num">Cobrado</th>'+(admin?'<th class="num">Ganancia</th>':'')+'</tr></thead><tbody>'+topList.map(function(x){
    return '<tr><td>'+esc(x.name)+'</td><td class="num">'+fmtQty(x.qty,x.unit)+'</td><td class="num">'+money(x.total)+'</td>'+(admin?'<td class="num">'+money(x.profit)+'</td>':'')+'</tr>';
  }).join('')+'</tbody></table></div>':'<p class="empty">Sin ventas de productos en este período.</p>';
  var cats=D.categories.length?'<ul class="barlist">'+D.categories.map(function(c){return '<li><span>'+esc(c.category)+'</span><span class="bars"><span class="bar" style="width:'+Math.max(2,c.share)+'%"></span></span><b>'+pct(c.share)+'</b></li>';}).join('')+'</ul>':'<p class="empty">Sin ventas en este período.</p>';
  return '<div class="grid2"><section class="panel"><div class="sec-head"><h2 class="h3">Lo más vendido</h2>'+(admin?segHTML('sum-topby',[['units','Por unidades'],['profit','Por ganancia']],ui.sum.topBy,'Ordenar'):'')+'</div>'+top+'</section>'+
    '<section class="panel"><h2 class="h3">Ventas por categoría</h2>'+cats+'</section></div>';
}
function sumPagos(D){
  var tot=D.payments.reduce(function(n,p){return n+p.total;},0);
  if(!tot)return '<section class="panel"><h2 class="h3">Medios de pago</h2><p class="empty">Sin cobros en este período.</p></section>';
  var rows=D.payments.map(function(p,i){return '<tr><td><i class="sw sw'+(i%CHART_COLORS)+'"></i> '+esc(p.method)+'</td><td class="num">'+money(p.total)+'</td><td class="num">'+pct(p.total/tot*100)+'</td></tr>';}).join('');
  return '<div class="grid2"><section class="panel"><h2 class="h3">Cómo te pagan</h2>'+donut(D.payments.map(function(p){return {label:p.method,value:p.total};}),money,'cobrado')+'</section>'+
    '<section class="panel"><h2 class="h3">Detalle</h2><div class="tbl-wrap"><table class="tbl slim"><thead><tr><th>Medio</th><th class="num">Cobrado</th><th class="num">%</th></tr></thead><tbody>'+rows+'</tbody><tfoot><tr><td><b>Total</b></td><td class="num"><b>'+money(tot)+'</b></td><td></td></tr></tfoot></table></div></section></div>';
}
function monthlyPanel(){
  var M=ui.sum.monthly;if(!M)return '';
  var any=M.some(function(m){return m.sales||m.expenses||m.purchases;});
  var rows=M.slice().reverse().map(function(m){
    return '<tr><td>'+keyLabel(m.ym,'month')+'</td><td class="num">'+m.count+'</td><td class="num">'+money(m.sales)+'</td><td class="num">'+money(m.cost)+'</td><td class="num"><b>'+money(m.profit)+'</b></td><td class="num">'+money(m.expenses)+'</td><td class="num '+(m.result>=0?'in':'out')+'">'+money(m.result)+'</td><td class="num">'+money(m.purchases)+'</td></tr>';
  }).join('');
  return '<details class="panel" id="monthsbox"'+(ui.sum.monthsOpen?' open':'')+'><summary><h2 class="h3">Mes a mes (últimos 12 meses)</h2></summary>'+
    (any?barChart(M.map(function(m){return {key:m.ym,total:m.sales,profit:m.profit,count:m.count};}),'month',true)+
    '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Mes</th><th class="num">Ventas</th><th class="num">Vendido</th><th class="num">Costo</th><th class="num">Ganancia bruta</th><th class="num">Gastos</th><th class="num">Resultado</th><th class="num">Compras de mercadería</th></tr></thead><tbody>'+rows+'</tbody></table></div>'+
    '<p class="note2">Ganancia bruta = lo vendido menos lo que te costó. Gastos = egresos que no son compras de mercadería ni retiros. Resultado = ganancia bruta − gastos.</p>'+
    '<button class="btn" data-action="sum-export" data-v="monthly">Exportar CSV</button>':'<p class="empty">Todavía no hay movimientos para mostrar mes a mes.</p>')+'</details>';
}
function comparePanel(){
  var C=ui.sum.compare;if(!C)return '';
  var cell=function(r,ref){if(!ref)return '<td colspan="3" class="mut">Sin datos del año anterior</td>';var money_=r.key==='count'||r.key==='newClients'?String:money;
    return '<td class="num">'+money_(ref.value)+'</td><td class="num">'+(ref.diff>=0?'+':'')+money_(ref.diff)+'</td><td class="num">'+delta(ref.pct,r.upIsGood)+'</td>';};
  var rows=C.rows.map(function(r){var f=r.key==='count'||r.key==='newClients'?String:money;return '<tr><td><b>'+esc(r.label)+'</b></td><td class="num"><b>'+f(r.current)+'</b></td>'+cell(r,r.prevMonth)+cell(r,r.prevYear)+'</tr>';}).join('');
  var lines=C.lines?lineChart([{label:'Este período',data:C.lines.current,cls:'l-cur'},{label:'Mes anterior',data:C.lines.prevMonth,cls:'l-pm'}].concat(C.lines.prevYear?[{label:'Año pasado',data:C.lines.prevYear,cls:'l-py'}]:[]),null):'';
  return '<section class="panel"><h2 class="h3">Comparación</h2><p class="note2">Contra el mismo período del mes anterior ('+fmtDate(C.ref.prevMonth[0])+' al '+fmtDate(C.ref.prevMonth[1])+') y del año pasado ('+fmtDate(C.ref.prevYear[0])+' al '+fmtDate(C.ref.prevYear[1])+').</p>'+
    '<div class="tbl-wrap"><table class="tbl"><thead><tr><th></th><th class="num">Actual</th><th class="num">Mes anterior</th><th class="num">Diferencia</th><th class="num">%</th><th class="num">Año pasado</th><th class="num">Diferencia</th><th class="num">%</th></tr></thead><tbody>'+rows+'</tbody></table></div>'+lines+'</section>';
}
function hoursPanel(){
  var Hh=ui.sum.hours;if(!Hh)return '';
  if(!Hh.cells.length)return '<section class="panel"><h2 class="h3">Horarios y días pico</h2><p class="empty">Todavía no hay ventas en este período.</p></section>';
  var hours=Hh.cells.map(function(c){return c.hour;}),h0=Math.min.apply(null,hours.concat([9])),h1=Math.max.apply(null,hours.concat([19]));
  var max=Math.max.apply(null,Hh.cells.map(function(c){return c.total;})),by={};
  Hh.cells.forEach(function(c){by[c.dow+'-'+c.hour]=c;});
  var order=[1,2,3,4,5,6,0],head='<tr><th></th>';
  for(var h=h0;h<=h1;h++)head+='<th scope="col">'+h+'</th>';
  var rows=order.map(function(d){
    var r='<tr><th scope="row">'+WEEKDAYS_LONG[d].slice(0,3)+'</th>';
    for(var h=h0;h<=h1;h++){var c=by[d+'-'+h],a=c?Math.max(0.12,c.total/max):0;r+='<td class="hcell'+(c?'':' zero')+'" style="--a:'+a.toFixed(2)+'" title="'+WEEKDAYS_LONG[d]+' '+h+' hs: '+(c?plural(c.n,'venta','ventas')+', '+money(c.total):'sin ventas')+'">'+(c?c.n:'')+'</td>';}
    return r+'</tr>';
  }).join('');
  var dmax=Math.max.apply(null,Hh.byDay.map(function(x){return x.total;}).concat([1]));
  var days=order.map(function(d){var x=Hh.byDay[d];return '<li><span>'+WEEKDAYS_LONG[d]+'</span><span class="bars"><span class="bar" style="width:'+Math.max(1,x.total/dmax*100)+'%"></span></span><b>'+money(x.total)+'</b></li>';}).join('');
  return '<section class="panel"><h2 class="h3">Horarios y días pico</h2>'+(Hh.phrase?'<p class="phrase">'+esc(Hh.phrase)+'</p>':'')+
    '<div class="tbl-wrap heatwrap"><table class="heat"><caption class="sr-only">Cantidad de ventas por día y hora</caption><thead>'+head+'</tr></thead><tbody>'+rows+'</tbody></table></div>'+
    '<p class="note2">Cuanto más oscuro, más ventas. Las celdas vacías son las franjas más flojas.</p><ul class="barlist">'+days+'</ul></section>';
}
function alertsPanel(D){
  var low=S.products.filter(lowStock),exp=S.products.filter(expiring).sort(function(a,b){return a.expires.localeCompare(b.expires);});
  var items=[];
  if(low.length)items.push('<li class="alert-w"><b>'+plural(low.length,'producto con poco stock','productos con poco stock')+'</b><small>'+esc(low.slice(0,3).map(function(x){return x.name;}).join(', '))+(low.length>3?'…':'')+'</small><button class="btn" data-action="goto-restock">Armar pedido</button></li>');
  if(exp.length){var n=exp.filter(expired).length;items.push('<li class="'+(n?'alert-b':'alert-w')+'"><b>'+(n?plural(n,'producto vencido','productos vencidos')+(exp.length>n?' y '+(exp.length-n)+' por vencer':''):plural(exp.length,'producto por vencer','productos por vencer'))+'</b><small>'+esc(exp.slice(0,3).map(function(x){return x.name+' ('+fmtDate(x.expires)+')';}).join(', '))+'</small><button class="btn" data-action="goto-stock" data-v="exp">Ver</button></li>');}
  if(D.alerts.apptsToday)items.push('<li><b>'+plural(D.alerts.apptsToday,'turno hoy','turnos hoy')+'</b><small>'+plural(D.alerts.apptsPending,'pendiente','pendientes')+'</small><button class="btn" data-action="goto-agenda-today">Ir a la agenda</button></li>');
  if(isAdmin()&&D.alerts.cashNotClosed)items.push('<li class="alert-w"><b>Caja sin cerrar</b><small>Hubo movimientos hoy y todavía no contaste la caja.</small><button class="btn" data-action="nav" data-v="caja">Cerrar caja</button></li>');
  if(isAdmin()){var d=lastExportDays();if(d===null||d>7)items.push('<li class="alert-w"><b>Copia de seguridad</b><small>'+(d===null?'Todavía no descargaste una copia.':'Hace '+plural(d,'día','días')+' que no descargás una copia.')+'</small><button class="btn" data-action="nav" data-v="copias">Descargar</button></li>');}
  return '<section class="panel alerts-panel"><h2 class="h3">Avisos</h2>'+(items.length?'<ul class="alist">'+items.join('')+'</ul>':'<p class="empty">Todo en orden.</p>')+'</section>';
}
var thSort=function(key,label,num){var s=ui.sum.psort||{k:'profit',d:-1};return '<th class="'+(num?'num':'')+'" aria-sort="'+(s.k===key?(s.d>0?'ascending':'descending'):'none')+'"><button class="thbtn" data-action="sum-psort" data-v="'+key+'">'+label+(s.k===key?(s.d>0?' ▲':' ▼'):'')+'</button></th>';};
function sumProductos(){
  var P=ui.sum.products;
  if(!P)return '<div class="skeleton" aria-busy="true"><i></i><i></i></div>';
  var s=ui.sum.psort||{k:'profit',d:-1};
  var L=P.items.slice().sort(function(a,b){var x=a[s.k],y=b[s.k];if(typeof x==='string')return collator.compare(x,y)*s.d;return ((x==null?-1e15:x)-(y==null?-1e15:y))*s.d;});
  var rows=L.map(function(x){
    return '<tr class="'+(x.low||x.profit<0?'lowrow':'')+'"><td><b>'+esc(x.name)+'</b>'+(P.top10.indexOf(x.name)>=0?' <span class="chip ok">Top 10</span>':'')+'</td><td class="num">'+fmtQty(x.qty,x.unit)+'</td><td class="num">'+money(x.total)+'</td><td class="num">'+money(x.cost)+'</td><td class="num"><b>'+money(x.profit)+'</b></td><td class="num'+(x.low||x.profit<0?' negtxt':'')+'">'+pct(x.margin)+'</td><td class="num">'+pct(x.share)+'</td></tr>';
  }).join('');
  return '<section class="panel"><div class="toolbar"><h2 class="h3" style="margin:0">Rentabilidad</h2>'+segHTML('sum-pgroup',[['product','Por producto'],['brand','Por marca'],['category','Por categoría']],P.group,'Agrupar')+
    '<span class="grow"></span><button class="btn" data-action="sum-export" data-v="products">Exportar CSV</button></div>'+
    '<p class="note2">En rojo: margen negativo o menor a '+pct(P.lowMargin)+'. “Top 10” = los que más ganancia dejan, que no siempre son los más vendidos.</p>'+
    (rows?'<div class="tbl-wrap"><table class="tbl"><thead><tr>'+thSort('name',P.group==='product'?'Producto':P.group==='brand'?'Marca':'Categoría')+thSort('qty','Unidades',1)+thSort('total','Ingresos',1)+thSort('cost','Costo',1)+thSort('profit','Ganancia',1)+thSort('margin','Margen',1)+thSort('share','% de la ganancia',1)+'</tr></thead><tbody>'+rows+'</tbody></table></div>':'<p class="empty">Todavía no hay ventas de productos en este período.</p>')+'</section>';
}
var waLink=function(phone){var d=String(phone||'').replace(/\D/g,'');if(!d)return '';if(d.length===10)d='549'+d;else if(d.indexOf('54')!==0)d='54'+d;return 'https://wa.me/'+d;};
function sumClientes(){
  var C=ui.sum.clients;
  if(!C)return '<div class="skeleton" aria-busy="true"><i></i><i></i></div>';
  var freq=C.frequent.length?'<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Cliente</th><th class="num">Compras</th><th class="num">Total</th><th class="num">Ticket promedio</th><th>Última compra</th><th></th></tr></thead><tbody>'+C.frequent.map(function(x){
    return '<tr><td><button class="link namebtn" data-action="open-client" data-id="'+x.id+'">'+esc(x.name)+'</button></td><td class="num">'+x.count+'</td><td class="num">'+money(x.total)+'</td><td class="num">'+money(x.avg)+'</td><td>'+fmtDate(x.last)+'</td><td class="act">'+(x.phone?'<button class="link" data-action="wa" data-id="'+x.id+'" data-v="freq">WhatsApp</button>':'')+'</td></tr>';
  }).join('')+'</tbody></table></div>':'<p class="empty">Nadie compró con cliente asignado en este período. Para medirlo, elegí el cliente al vender.</p>';
  var lost=C.lost.length?'<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Cliente</th><th class="num">Compras (último año)</th><th class="num">Cada cuánto venía</th><th>Última compra</th><th class="num">Días sin venir</th><th></th></tr></thead><tbody>'+C.lost.map(function(x){
    return '<tr><td><button class="link namebtn" data-action="open-client" data-id="'+x.id+'">'+esc(x.name)+'</button></td><td class="num">'+x.purchases+'</td><td class="num">'+(x.usualGap==null?'—':'~'+plural(x.usualGap,'día','días'))+'</td><td>'+fmtDate(x.last)+'</td><td class="num negtxt">'+x.daysSince+'</td><td class="act">'+(x.phone?'<button class="link" data-action="wa" data-id="'+x.id+'" data-v="lost">WhatsApp</button>':'<span class="mut">Sin teléfono</span>')+'</td></tr>';
  }).join('')+'</tbody></table></div>':'<p class="empty">No hay clientes perdidos: nadie que compraba seguido dejó de venir hace más de '+C.lostDays+' días.</p>';
  var nv=C.newVsReturning,tot=nv.new+nv.returning;
  return '<div class="cards">'+card('Clientes nuevos',String(nv.new),'Primera compra en el período')+card('Clientes que volvieron',String(nv.returning),tot?pct(nv.returning/tot*100)+' del total':'')+'</div>'+
    '<section class="panel"><div class="toolbar"><h2 class="h3" style="margin:0">Clientes frecuentes</h2><span class="grow"></span>'+(isAdmin()?'<button class="btn" data-action="sum-export" data-v="clients">Exportar CSV</button>':'')+'</div>'+freq+'</section>'+
    '<section class="panel"><h2 class="h3">Clientes perdidos</h2><p class="note2">Compraban con regularidad y hace más de '+C.lostDays+' días (o el doble de lo habitual) que no vuelven.</p>'+lost+'</section>';
}
function sumPersonal(){
  var P=ui.sum.staff;
  if(!P)return '<div class="skeleton" aria-busy="true"><i></i><i></i></div>';
  if(!P.items.length)return '<section class="panel"><p class="empty">No hay turnos en este período. Asigná personal en cada turno para ver el rendimiento de cada persona.</p></section>';
  var named=P.items.some(function(x){return x.staff!=='Sin asignar';});
  return '<section class="panel"><h2 class="h3">Rendimiento del personal</h2>'+(named?'':'<p class="note2">Todavía no hay personal asignado en los turnos: se muestra el total del local.</p>')+
    '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Personal</th><th class="num">Turnos</th><th class="num">Realizados</th><th class="num">Ingresos por servicios</th><th class="num">Duración real / estimada</th><th class="num">No vino</th><th class="num">Cancelados</th><th>Servicio más pedido</th></tr></thead><tbody>'+P.items.map(function(x){
      var dur=x.realMinutes!=null?x.realMinutes+' / '+(x.estMinutes||'—')+' min':(x.estMinutes?'— / '+x.estMinutes+' min':'—');
      return '<tr><td><b>'+esc(x.staff)+'</b></td><td class="num">'+x.total+'</td><td class="num">'+x.done+'</td><td class="num">'+money(x.revenue)+'</td><td class="num">'+dur+'</td><td class="num'+(x.noShowPct>15?' negtxt':'')+'">'+pct(x.noShowPct)+'</td><td class="num">'+pct(x.cancelPct)+'</td><td>'+esc(x.topService||'—')+'</td></tr>';
    }).join('')+'</tbody></table></div><p class="note2">La duración real se mide desde que el turno se confirma hasta que queda «Listo para retirar».</p></section>';
}
function sumProyeccion(){
  var P=ui.sum.proj;
  if(!P)return '<div class="skeleton" aria-busy="true"><i></i><i></i></div>';
  var p=P.projection,b=P.breakEven,mes=parse(P.month+'-01').toLocaleDateString('es-AR',{month:'long'});
  var be=b.need==null?'<p class="empty">'+(b.margin==null?'Todavía no hay ventas con costo cargado para calcular el margen.':'Con el margen actual ('+pct(b.margin)+') no se puede calcular el punto de equilibrio.')+'</p>':
    '<p>Gastos fijos del mes: <b>'+money(b.fixedCosts)+'</b> <small>('+esc((b.fixedCategories||[]).join(', ')||'ninguna categoría marcada')+')</small> · Margen bruto promedio: <b>'+pct(b.margin)+'</b></p>'+
    '<p class="big">Necesitás vender '+money(b.need)+' para no perder</p>'+
    '<div class="meter'+(b.progress>=100?'':' warnm')+'" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="'+Math.round(b.progress)+'"><i style="width:'+Math.max(1,b.progress)+'%"></i></div>'+
    '<p>Vendiste <b>'+money(P.sales)+'</b> de <b>'+money(b.need)+'</b> necesarios ('+pct(b.progress)+'). '+(b.progress>=100?'¡Ya cubriste los gastos fijos del mes! ':b.reachDate?'Al ritmo actual lo alcanzás el '+fmtDate(b.reachDate)+'.':'Al ritmo actual no se alcanza este mes.')+'</p>';
  return '<section class="panel"><h2 class="h3">Proyección de '+mes+'</h2><p class="note2">Es una estimación: combina el ritmo de este mes (día '+P.day+' de '+P.daysInMonth+') con el promedio de '+(P.avgMonths?'los últimos '+plural(P.avgMonths,'mes','meses'):'— todavía no hay meses anteriores —')+'.</p>'+
    '<div class="tbl-wrap"><table class="tbl"><thead><tr><th></th><th class="num">Prudente</th><th class="num">Esperado</th><th class="num">Optimista</th></tr></thead><tbody>'+
    '<tr><td>Ventas a fin de mes</td><td class="num">'+money(p.sales.prudent)+'</td><td class="num"><b>'+money(p.sales.expected)+'</b></td><td class="num">'+money(p.sales.optimistic)+'</td></tr>'+
    '<tr><td>Egresos a fin de mes</td><td class="num">'+money(p.expenses.prudent)+'</td><td class="num"><b>'+money(p.expenses.expected)+'</b></td><td class="num">'+money(p.expenses.optimistic)+'</td></tr>'+
    '<tr><td><b>Saldo de caja del mes</b></td><td class="num '+(P.result.prudent>=0?'in':'out')+'">'+money(P.result.prudent)+'</td><td class="num '+(P.result.expected>=0?'in':'out')+'"><b>'+money(P.result.expected)+'</b></td><td class="num '+(P.result.optimistic>=0?'in':'out')+'">'+money(P.result.optimistic)+'</td></tr>'+
    '</tbody></table></div><p class="note2">Hasta hoy: vendiste '+money(P.sales)+' y gastaste '+money(P.expenses)+'.</p></section>'+
    '<section class="panel"><h2 class="h3">Punto de equilibrio</h2>'+be+'</section>';
}

/* ============================================================
   Vender (punto de venta)
   El precio que se muestra es el de lista; el servidor recalcula todo. Solo el dueño puede cambiar un
   precio y tiene que escribir el motivo.
   ============================================================ */
function cartTotals(){
  var sub=0,cost=0,known=true;
  ui.cart.items.forEach(function(it){
    sub+=r2(it.price*it.qty);
    if(it.type==='product'){var p=prodById(it.id);if(p&&p.cost!=null)cost+=p.cost*it.qty;else known=false;}
  });
  sub=r2(sub);
  var v=Number(ui.cart.discValue)||0;
  var disc=ui.cart.discType==='percent'?r2(sub*Math.min(v,100)/100):r2(Math.min(v,sub));
  return {sub:sub,disc:disc,total:r2(sub-disc),cost:r2(cost),costKnown:known};
}
var stockLeft=function(it){var p=it.type==='product'?prodById(it.id):null;return p?p.stock:Infinity;};
/** Agrega al carrito respetando el stock. Devuelve true si se agregó. */
function addToCart(type,id,qty){
  var src=type==='product'?prodById(id):servById(id);
  if(!src)return false;
  if(type==='product'){
    if(src.stock<=0){toast('No queda stock de '+src.name+'.',true);return false;}
    if(expired(src)&&!isAdmin()){toast(src.name+' está vencido y no se puede vender. Avisale al dueño.',true);return false;}
  }
  var ex=ui.cart.items.find(function(it){return it.type===type&&String(it.id)===String(id);});
  var add=qty||1,next=(ex?ex.qty:0)+add;
  if(type==='product'&&src.unit==='kg')next=r3(next);
  if(type==='product'&&next>src.stock){toast('Solo quedan '+fmtQty(src.stock,src.unit)+' de '+src.name+'.',true);next=src.stock;}
  if(ex){ex.qty=next;ex.flash=Date.now();}
  else ui.cart.items.push({type:type,id:src.id,name:src.name,brand:src.brand||'',unit:type==='product'?src.unit:'u',qty:next,price:src.price,listPrice:src.price,reason:'',flash:Date.now()});
  toast('Agregado: '+src.name);
  return true;
}
function posMatches(text){
  var q=norm(text).trim();
  return {
    prods:S.products.filter(function(x){return !q||norm(x.name+' '+x.brand+' '+x.category+' '+(x.barcodes||[]).join(' ')).indexOf(q)>=0;}),
    servs:S.services.filter(function(x){return !q||norm(x.name+' '+x.category).indexOf(q)>=0;}),
  };
}
/** Lo que se puede agregar con esa búsqueda, en el orden de la lista (servicios y luego productos con stock). */
function searchItems(text){
  var m=posMatches(text);
  return m.servs.slice(0,12).map(function(x){return {type:'service',id:x.id};}).concat(m.prods.slice(0,40).filter(function(x){return x.stock>0;}).map(function(x){return {type:'product',id:x.id};}));
}
function posResults(){
  var m=posMatches(ui.posq),prods=m.prods,servs=m.servs;
  var h=servs.slice(0,12).map(function(s){
    return '<li><button class="pitem" data-action="cart-add" data-type="service" data-id="'+s.id+'"><span class="avatar" aria-hidden="true">'+ini(s.name)+'</span><span class="pi-main"><b>'+esc(s.name)+'</b><small>Servicio · '+esc(s.category)+'</small></span><b>'+money(s.price)+'</b></button></li>';
  }).join('')+prods.slice(0,40).map(function(x){
    var st=x.stock<=0?'<span class="chip bad">Sin stock</span>':expired(x)?'<span class="chip bad">Vencido</span>':'<small>'+fmtQty(x.stock,x.unit)+' en stock</small>';
    return '<li><button class="pitem" data-action="cart-add" data-type="product" data-id="'+x.id+'"'+(x.stock<=0?' disabled':'')+'><span class="avatar" aria-hidden="true">'+ini(x.name)+'</span>'+
      '<span class="pi-main"><b class="clamp2" title="'+esc(prodLabel(x))+'">'+esc(x.name)+'</b><small>'+esc([x.brand,x.category].filter(Boolean).join(' · '))+'</small></span><span class="pi-end"><b>'+money(x.price)+(x.unit==='kg'?'/kg':'')+'</b>'+st+'</span></button></li>';
  }).join('');
  if(!h)h='<li class="empty">'+(S.products.length||S.services.length?'No hay nada con esa búsqueda.':'Todavía no hay productos ni servicios cargados.')+'</li>';
  return h;
}
function totalsHTML(t,lossTotal){
  return '<div class="ctotals"><div><span>Subtotal</span><span>'+money(t.sub)+'</span></div>'+(t.disc?'<div><span>Descuento</span><span>− '+money(t.disc)+'</span></div>':'')+
    '<div class="grand"><span>Total</span><span>'+money(t.total)+'</span></div>'+(lossTotal?'<div class="negtxt">Ojo: venta con pérdida ('+money(t.total-t.cost)+')</div>':'')+'</div>';
}
/** Recalcula Subtotal, Total y el botón Cobrar sin redibujar el carrito (así el campo de descuento no pierde el foco al tipear). */
function refreshCartTotals(){
  var box=$('#cartbox');if(!box)return;
  var c=ui.cart,t=cartTotals(),tot=box.querySelector('.ctotals'),pay=box.querySelector('[data-action="cart-pay"]');
  var lossTotal=isAdmin()&&t.costKnown&&t.cost>0&&t.total<t.cost;
  if(tot)tot.outerHTML=totalsHTML(t,lossTotal);
  if(pay)pay.innerHTML='Cobrar '+money(t.total)+' <kbd>F4</kbd>';
  var note=box.querySelector('.mixnote');
  if(c.mixed&&note){
    var sum=r2(PAY().reduce(function(n,m){return n+(Number(c.payments[m])||0);},0)),diff=r2(t.total-sum);
    note.className='mixnote '+(diff===0?'in':'out');
    note.textContent=diff===0?'Los pagos suman el total ✓':diff>0?'Faltan '+money(diff):'Sobran '+money(-diff);
  }
}
function cartHTML(){
  var c=ui.cart,admin=isAdmin(),t=cartTotals(),pays=PAY();
  var lines=c.items.map(function(it,i){
    var step=it.unit==='kg'?'0.001':'1',left=stockLeft(it),changed=Math.abs(it.price-it.listPrice)>0.004;
    var p=it.type==='product'?prodById(it.id):null,loss=admin&&p&&p.cost>0&&it.price<p.cost;
    return '<li class="cline2'+(it.flash&&Date.now()-it.flash<1500?' flash':'')+'">'+
      '<div class="l-top"><b class="clamp2" title="'+esc(it.name+(it.brand?' – '+it.brand:''))+'">'+esc(it.name)+'</b>'+
        '<button type="button" class="xbtn" data-action="cart-del" data-i="'+i+'" aria-label="Quitar '+esc(it.name)+'">✕</button></div>'+
      '<div class="l-row"><div class="qtybox"><button type="button" class="qbtn" data-action="cart-dec" data-i="'+i+'" aria-label="Uno menos">−</button>'+
        '<input type="number" class="cqty" data-i="'+i+'" min="'+step+'" step="'+step+'"'+(left!==Infinity?' max="'+left+'"':'')+' value="'+it.qty+'" aria-label="Cantidad de '+esc(it.name)+'" inputmode="decimal">'+
        '<button type="button" class="qbtn" data-action="cart-inc" data-i="'+i+'" aria-label="Uno más">+</button></div>'+
        (admin?'<label class="pricebox"><span class="sr-only">Precio de '+esc(it.name)+'</span><input type="number" class="cprice'+(changed?' changed':'')+'" data-i="'+i+'" min="0" step="0.01" value="'+it.price+'" title="Precio de lista: '+money(it.listPrice)+'"></label>':'<span class="num lprice">'+money(it.price)+(it.unit==='kg'?'/kg':'')+'</span>')+
        '<b class="l-sub">'+money(r2(it.price*it.qty))+'</b></div>'+
      '<div class="l-meta">'+(left!==Infinity?'<small>'+(left-it.qty<=0?'Es lo último que queda':'Quedan '+fmtQty(r3(left-it.qty),it.unit)+' después de esta venta')+'</small>':'<small>Servicio</small>')+
        (loss?' <span class="chip bad">Ojo: venta con pérdida</span>':'')+'</div>'+
      (admin&&changed?'<label class="reasonbox"><span>Motivo del cambio de precio (lista: '+money(it.listPrice)+')</span><input class="creason" data-i="'+i+'" maxlength="200" value="'+esc(it.reason)+'" placeholder="Ej.: cliente frecuente" required></label>':'')+
    '</li>';
  }).join('');
  var cl=clientById(c.clientId);
  var clientOpts='<option value="">Sin cliente (venta de mostrador)</option>'+S.clients.map(function(x){return '<option value="'+x.id+'"'+(String(x.id)===String(c.clientId)?' selected':'')+'>'+esc(x.name)+(x.phone?' · '+esc(x.phone):'')+'</option>';}).join('');
  var petOpts=cl&&cl.pets.length?'<select id="cart-pet" aria-label="Mascota"><option value="">Mascota (opcional)</option>'+cl.pets.map(function(p){return '<option value="'+p.id+'"'+(String(p.id)===String(c.petId)?' selected':'')+'>'+esc(p.name)+'</option>';}).join('')+'</select>':'';
  var payHTML;
  if(c.mixed){
    var sum=r2(pays.reduce(function(n,m){return n+(Number(c.payments[m])||0);},0)),diff=r2(t.total-sum);
    payHTML='<div class="mixed">'+pays.map(function(m){return '<label><span>'+m+'</span><input type="number" class="cpay" data-m="'+esc(m)+'" min="0" step="0.01" value="'+esc(c.payments[m]||'')+'" placeholder="0" inputmode="decimal"></label>';}).join('')+
      '<p class="mixnote '+(diff===0?'in':'out')+'">'+(diff===0?'Los pagos suman el total ✓':diff>0?'Faltan '+money(diff):'Sobran '+money(-diff))+'</p></div>';
  }else payHTML='<div class="paybtns" role="group" aria-label="Forma de pago">'+pays.map(function(m){return '<button type="button" class="paybtn" data-action="cart-method" data-v="'+esc(m)+'" aria-pressed="'+(c.method===m)+'">'+esc(m)+'</button>';}).join('')+'</div>';
  var lossTotal=admin&&t.costKnown&&t.cost>0&&t.total<t.cost;
  return '<div class="cart panel" aria-label="Venta en curso"><div class="sec-head"><h2 class="h3">Venta'+(c.apptId?' <span class="chip info">Cobro de turno</span>':'')+'</h2><small>'+plural(c.items.length,'artículo','artículos')+'</small></div>'+
    (lines?'<ul class="clines">'+lines+'</ul>':'<p class="empty">Buscá un producto o escaneá su código para agregarlo.</p>')+
    '<div class="cartgrid"><label class="disc"><span>Descuento</span><select id="cart-dtype" aria-label="Tipo de descuento"><option value="amount"'+(c.discType==='amount'?' selected':'')+'>$</option><option value="percent"'+(c.discType==='percent'?' selected':'')+'>%</option></select>'+
      '<input type="number" id="cart-dval" min="0" step="0.01" value="'+esc(c.discValue)+'" placeholder="0" aria-label="Valor del descuento" inputmode="decimal"></label>'+
      '<label class="cli"><span>Cliente</span><select id="cart-client">'+clientOpts+'</select></label>'+(petOpts?'<label class="cli"><span>Mascota</span>'+petOpts+'</label>':'')+'</div>'+
    '<div class="sec-head"><span class="flabel">Forma de pago</span><label class="fld check"><input type="checkbox" id="cart-mixed"'+(c.mixed?' checked':'')+'><span>Pago mixto</span></label></div>'+payHTML+
    totalsHTML(t,lossTotal)+
    '<div class="actions cartacts"><button class="btn ghost" data-action="cart-clear"'+(c.items.length||c.clientId?'':' disabled')+'>Vaciar</button><button class="btn primary big-btn" data-action="cart-pay"'+(c.items.length?'':' disabled')+'>Cobrar '+money(t.total)+' <kbd>F4</kbd></button></div></div>';
}
function viewVender(){
  return '<section class="farm"><div class="head"><h1>Vender</h1><div class="hbtns"><button class="btn" data-action="scan-toggle" aria-pressed="'+ui.scanStrip+'">'+(ui.scanStrip?'Cerrar escáner':'Escanear con la cámara')+'</button></div></div>'+
    '<p class="shortcuts"><kbd>F2</kbd> buscar · <kbd>Enter</kbd> agrega el primer resultado · <kbd>F4</kbd> cobrar · <kbd>Esc</kbd> vaciar la venta</p>'+
    '<div class="pos"><div class="pos-search">'+(ui.scanStrip?'<div id="scanstrip" class="scanstrip"></div>':'')+
    '<input id="posq" type="search" placeholder="'+(window.innerWidth<600?'Buscar o escanear un producto':'Buscar producto o servicio (o escaneá el código)')+'" value="'+esc(ui.posq)+'" aria-label="Buscar producto o servicio" autocomplete="off">'+
    '<ul class="plist" id="posres">'+posResults()+'</ul></div><div id="cartbox">'+cartHTML()+'</div></div></section>';
}
function renderCart(){var b=$('#cartbox');if(b)b.innerHTML=cartHTML();saveDraft();}
function focusSearch(){var q=$('#posq');if(q&&!('ontouchstart' in window))q.focus();}
async function payCart(){
  var c=ui.cart,t=cartTotals(),admin=isAdmin();
  if(!c.items.length||paying)return;
  var noReason=c.items.find(function(it){return Math.abs(it.price-it.listPrice)>0.004&&(it.reason||'').trim().length<3;});
  if(noReason){toast('Escribí el motivo del cambio de precio de «'+noReason.name+'».',true);var el=main.querySelector('.creason');if(el)el.focus();return;}
  var body={idemKey:c.key,items:c.items.map(function(it){var o={type:it.type,id:it.id,qty:it.qty};if(admin&&Math.abs(it.price-it.listPrice)>0.004){o.price=it.price;o.reason=it.reason;}return o;}),
    discount:Number(c.discValue)>0?{type:c.discType,value:c.discValue}:null,clientId:c.clientId?Number(c.clientId):null,petId:c.petId?Number(c.petId):null,appointmentId:c.apptId};
  if(c.mixed){
    body.payments=PAY().map(function(m){return {method:m,amount:Number(c.payments[m])||0};}).filter(function(p){return p.amount>0;});
    var sum=r2(body.payments.reduce(function(n,p){return n+p.amount;},0));
    if(sum!==t.total){toast('Los pagos suman '+money(sum)+' y el total es '+money(t.total)+'. Revisá los montos.',true);return;}
  }else body.method=c.method;
  var r;
  setPaying(true);
  try{r=await apiConfirm('/sales',{body:body});}
  catch(e){setPaying(false);if(e.cancelled)return;throw e;}
  // Con la respuesta alcanza para actualizar el stock y la caja en pantalla: no se vuelve a pedir todo (/api/bootstrap).
  applySale(r);
  resetCart();ui.posq='';paying=false;
  if(ui.view==='vender')render();
  saleDoneDialog(r.id,r.number,r.total,r.lossLines);
}
/* Cobrar: el botón se deshabilita al instante y dice "Procesando…" hasta que responde el servidor.
   También bloquea F4 mientras tanto (además, el servidor no registra dos veces la misma venta: idemKey). */
var paying=false;
function setPaying(on){
  paying=on;
  var b=main.querySelector('[data-action="cart-pay"]');if(!b)return;
  b.disabled=on;b.classList.toggle('busy',on);b.setAttribute('aria-busy',String(on));
  if(on)b.textContent='Procesando…';else refreshCartTotals();
}
function applySale(r){
  (r.stock||[]).forEach(function(x){var p=prodById(x.id);if(p)p.stock=r3(p.stock-x.qty);});
  var sm=S.summary;
  if(sm&&r.payments&&r.date===todayIso()){
    r.payments.forEach(function(p){
      sm.month.in=r2(sm.month.in+p.amount);sm.month.byMethod[p.method]=r2((sm.month.byMethod[p.method]||0)+p.amount);
      if(p.method==='Efectivo'){sm.month.efe=r2(sm.month.efe+p.amount);sm.drawer=r2(sm.drawer+p.amount);if(sm.todayCash)sm.todayCash.in=r2(sm.todayCash.in+p.amount);}
      else if(p.method==='Transferencia')sm.month.tra=r2(sm.month.tra+p.amount);else sm.month.tar=r2(sm.month.tar+p.amount);
    });
  }
  if(ui.cart.apptId)ui.appts=null; // el turno quedó entregado: la agenda se vuelve a pedir al entrar
  ui.sales=null;
}
function saleDoneDialog(id,number,total,loss){
  infoDialog('Venta N° '+number+' registrada','<p class="big">'+money(total)+'</p><p>Se descontó el stock y se registró el ingreso en la caja.</p>'+(loss&&loss.length?'<p class="warnbox">Ojo: se vendió con pérdida '+esc(loss.join(', '))+'.</p>':''),[
    {label:'Ver ticket',fn:function(){return printSale(id);}},
    {label:'Nueva venta',cls:'primary',fn:function(){dlg.close();if(ui.view!=='vender')go('vender');else setTimeout(focusSearch,50);}},
  ]);
}
// Ticket no fiscal de 58 u 80 mm (comprobante interno), listo para impresora térmica o PDF.
function ticketHTML(s){
  var st=S.settings;
  return '<div class="ticket w'+(st.ticketWidth||80)+'"><h1>'+esc(S.shop)+'</h1>'+(st.address?'<p class="c">'+esc(st.address)+'</p>':'')+(st.phone?'<p class="c">Tel. '+esc(st.phone)+'</p>':'')+
    '<p>Comprobante N° '+s.number+'<br>'+fmtDate(s.date)+' '+fmtTime(s.createdAt)+(s.seller?' · '+esc(s.seller):'')+'</p>'+
    (s.client?'<p>Cliente: '+esc(s.client)+(s.pet?' ('+esc(s.pet)+')':'')+'</p>':'')+
    '<table>'+s.items.map(function(it){return '<tr><td>'+fmtQty(it.qty,it.unit)+' × '+esc(it.name)+'<br><small>'+money(it.price)+(it.unit==='kg'?'/kg':' c/u')+'</small></td><td class="r">'+money(r2(it.qty*it.price))+'</td></tr>';}).join('')+'</table>'+
    (s.discount?'<p class="r">Subtotal '+money(s.subtotal)+'<br>Descuento − '+money(s.discount)+'</p>':'')+
    '<p class="r tot">TOTAL '+money(s.total)+'</p><p>'+s.payments.map(function(p){return esc(p.method)+': '+money(p.amount);}).join('<br>')+'</p>'+
    (s.voided?'<p><b>VENTA ANULADA</b></p>':'')+'<p class="foot">'+esc(st.ticketText||'')+'<br>Comprobante no válido como factura.</p></div>';
}
// Vista previa del ticket dentro de la app: el diálogo de impresión del navegador solo aparece al tocar «Imprimir».
async function printSale(id){
  var s=await api('/sales/'+id),html=ticketHTML(s);
  infoDialog('Ticket N° '+s.number,'<div class="ticketprev" aria-label="Vista previa del ticket">'+html+'</div>',[
    {label:'Imprimir',cls:'primary',fn:function(){$('#print').innerHTML=html;setTimeout(function(){window.print();},50);}},
  ]);
}

/* ============================================================
   Ventas (historial)
   ============================================================ */
function salesRange(v){
  var t=todayIso();
  if(v==='today')return ['',''];
  if(v==='yesterday'){var y=shiftDays(-1);return [y,y];}
  if(v==='week')return [shiftDays(-6),t];
  return [t.slice(0,8)+'01',t];
}
function viewVentas(){
  var V=ui.sales,admin=isAdmin();
  if(!V)return loadingView('Ventas');
  var shown=V.items.slice(0,ui.saLimit);
  var rows=shown.map(function(s){
    return '<tr class="'+(s.voided?'voided':'')+'"><td><b>'+s.number+'</b></td><td>'+fmtDate(s.date)+'<br><small>'+fmtTime(s.createdAt)+'</small></td><td><span class="clamp2">'+esc(s.summary)+'</span>'+(s.client?'<small>'+esc(s.client)+(s.pet?' · '+esc(s.pet):'')+'</small>':'')+'</td>'+
      '<td>'+esc(s.method)+'<br><small>'+esc(s.seller)+'</small></td><td class="num">'+(s.voided?'<span class="chip bad">Anulada</span><br>':'')+'<b>'+money(s.total)+'</b>'+(s.discount?'<br><small>desc. '+money(s.discount)+'</small>':'')+'</td>'+
      (admin?'<td class="num">'+(s.voided?'—':money(s.profit))+'</td>':'')+
      '<td class="act"><button class="link" data-action="sale-view" data-id="'+s.id+'">Ver</button><button class="link" data-action="sale-print" data-id="'+s.id+'">Ticket</button>'+(admin&&!s.voided?'<span class="sep"></span><button class="link bad" data-action="sale-void" data-id="'+s.id+'">Anular</button>':'')+'</td></tr>';
  }).join('');
  var T=V.totals;
  return '<section class="farm"><div class="head"><h1>Ventas</h1>'+(admin?'<button class="btn" data-action="sales-export">Exportar CSV</button>':'')+'</div>'+
    (admin?'<div class="toolbar">'+segHTML('sales-period',[['today','Hoy'],['yesterday','Ayer'],['week','Últimos 7 días'],['month','Este mes']],ui.sfrom?'':'today','Período')+rangeHTML('sfrom','sto',ui.sfrom,ui.sto)+'</div>':'<p class="note2">Ventas de hoy.</p>')+
    '<input id="salesq" type="search" placeholder="Buscar por N° de venta, artículo o cliente" value="'+esc(ui.sq)+'" aria-label="Buscar venta" class="searchbar">'+
    '<div class="cards">'+card('Ventas',String(T.count),V.from===V.to?fmtDate(V.from):fmtDate(V.from)+' al '+fmtDate(V.to))+card('Total cobrado',money(T.total),T.count?'Ticket promedio '+money(T.total/T.count):'')+(admin?card('Ganancia',money(T.profit),T.total?'Margen '+pct(T.profit/T.total*100):''):'')+'</div>'+
    (rows?'<div class="tbl-wrap"><table class="tbl"><thead><tr><th>N°</th><th>Fecha</th><th>Artículos</th><th>Pago</th><th class="num">Total</th>'+(admin?'<th class="num">Ganancia</th>':'')+'<th><span class="sr-only">Acciones</span></th></tr></thead><tbody>'+rows+'</tbody></table></div>'+moreBtn(shown.length,V.items.length,'saLimit')
      :emptyState(ui.sq?'No hay ventas con esa búsqueda.':'No hay ventas en este período.','nav','Ir a vender').replace('data-action="nav"','data-action="nav" data-v="vender"'))+'</section>';
}
async function saleDetail(id){
  var s=await api('/sales/'+id),admin=isAdmin();
  var rows=s.items.map(function(it){
    return '<tr><td>'+esc(it.name)+(it.priceReason?'<br><small>Precio cambiado (lista '+money(it.listPrice)+'): '+esc(it.priceReason)+'</small>':'')+'</td><td class="num">'+fmtQty(it.qty,it.unit)+'</td><td class="num">'+money(it.price)+'</td><td class="num">'+money(it.amount)+'</td>'+(admin?'<td class="num">'+money(r2(it.amount-it.qty*it.cost))+'</td>':'')+'</tr>';
  }).join('');
  var btns=[{label:'Ticket',fn:function(){return printSale(id);}}];
  if(admin&&!s.voided)btns.push({label:'Anular venta',cls:'danger-o',fn:function(){voidSale(id,s.number);}});
  infoDialog('Venta N° '+s.number,
    '<p>'+fmtDate(s.date)+' '+fmtTime(s.createdAt)+(s.seller?' · vendió '+esc(s.seller):'')+'</p>'+(s.client?'<p>Cliente: '+esc(s.client)+(s.pet?' ('+esc(s.pet)+')':'')+'</p>':'')+
    (s.voided?'<p class="warnbox">Venta anulada: '+esc(s.voidReason||'sin motivo')+'</p>':'')+
    '<div class="tbl-wrap"><table class="tbl slim"><thead><tr><th>Artículo</th><th class="num">Cant.</th><th class="num">Precio</th><th class="num">Cobrado</th>'+(admin?'<th class="num">Ganancia</th>':'')+'</tr></thead><tbody>'+rows+'</tbody></table></div>'+
    '<div class="ctotals">'+(s.discount?'<div><span>Descuento</span><span>− '+money(s.discount)+'</span></div>':'')+'<div class="grand"><span>Total</span><span>'+money(s.total)+'</span></div>'+
    s.payments.map(function(p){return '<div><span>'+esc(p.method)+'</span><span>'+money(p.amount)+'</span></div>';}).join('')+(admin&&!s.voided?'<div><span>Ganancia</span><span>'+money(s.profit)+'</span></div>':'')+'</div>',btns);
}
function voidSale(id,number){
  openForm({title:'Anular venta N° '+(number||id),danger:true,submit:'Anular venta',
    body:'<p>Se devuelve el stock de los productos y se quitan los ingresos de la caja. La venta queda en el historial, marcada como anulada y con su número.</p><div class="fields">'+
      fld('Motivo de la anulación','reason',{full:true,req:true,minlength:3,ph:'Ej.: el cliente devolvió el producto'})+'</div>',
    onSubmit:async function(d){await api('/sales/'+id+'/void',{body:{reason:d.reason}});await reload();toast('Venta anulada. Volvió el stock y se quitó de la caja.');}});
}

/* ============================================================
   Stock
   ============================================================ */
function filteredProducts(){
  var sq=norm(ui.stq).trim();
  return S.products.filter(function(x){
    if(ui.cat!=='all'&&x.category!==ui.cat)return false;
    if(ui.stf==='low'&&!lowStock(x))return false;
    if(ui.stf==='exp'&&!expiring(x))return false;
    return !sq||norm(x.name+' '+x.brand+' '+x.category+' '+(x.barcodes||[]).join(' ')).indexOf(sq)>=0;
  });
}
function stockTable(){
  var admin=isAdmin(),L=filteredProducts(),shown=L.slice(0,ui.stLimit),totCost=0,totSale=0;
  L.forEach(function(x){if(admin){totCost+=Math.max(x.stock,0)*(x.cost||0);totSale+=Math.max(x.stock,0)*x.price;}});
  var rows=shown.map(function(x){
    var chip=x.stock<=0?'<span class="chip bad">Sin stock</span>':lowStock(x)?'<span class="chip warn">Poco stock</span>':'';
    if(x.expires){var d=diffDays(x.expires);if(d<0)chip+=' <span class="chip bad">Vencido el '+fmtDate(x.expires)+'</span>';else if(d<=EXPIRY_DAYS)chip+=' <span class="chip warn">Vence el '+fmtDate(x.expires)+'</span>';}
    if(x.isGift)chip+=' <span class="chip info">Regalo</span>';
    var stockCell='<span class="stk"><span>'+fmtQty(x.stock,x.unit)+'</span><button data-action="stock-add" data-id="'+x.id+'" aria-label="Llegó mercadería de '+esc(x.name)+'" title="Llegó mercadería">+</button></span>';
    var bag=x.packKg&&x.looseId?'<button class="link" data-action="open-bag" data-id="'+x.id+'">Abrir bolsa</button>':'';
    var acts='<button class="link" data-action="sell" data-id="'+x.id+'">Vender</button>'+bag+(admin?'<details class="rowmenu"><summary aria-label="Más acciones de '+esc(x.name)+'" title="Más acciones">⋮</summary><div class="menu">'+
      '<button class="link" data-action="stock-adjust" data-id="'+x.id+'">Ajustar stock</button><button class="link" data-action="stock-history" data-id="'+x.id+'">Historial</button><button class="link" data-action="edit-product" data-id="'+x.id+'">Editar</button><span class="sep"></span><button class="link bad" data-action="del-product" data-id="'+x.id+'">Eliminar</button></div></details>':'');
    var per=x.unit==='kg'?'/kg':'';
    var costCells='';
    if(admin){
      var margin=x.cost>0&&x.price>0?(x.price-x.cost)/x.price*100:null,loss=x.cost>0&&x.price<x.cost;
      costCells='<td class="num col2">'+(x.cost>0?money(x.cost)+per:'—')+'</td><td class="num col2'+(loss?' negtxt':'')+'">'+(margin==null?'—':(loss?'':'')+pct(margin))+'</td><td class="num col2">'+(x.cost>0?money(Math.max(x.stock,0)*x.cost):'—')+'</td>';
    }
    return '<tr class="'+(expired(x)?'expiredrow':'')+'"><td><b class="clamp2" title="'+esc(prodLabel(x))+'">'+esc(x.name)+'</b><small>'+esc([x.brand,x.category,x.species].filter(Boolean).join(' · '))+'</small>'+((x.barcodes||[]).length?'<small class="bc">▮ '+esc(x.barcodes.join(' · '))+'</small>':'')+'</td><td>'+stockCell+'</td><td class="num">'+fmtQty(x.min,x.unit)+'</td><td>'+chip+'</td><td class="num">'+money(x.price)+per+'</td>'+costCells+'<td class="act">'+acts+'</td></tr>';
  }).join('');
  var cols=admin?9:6;
  if(!rows)return S.products.length?'<p class="empty">No hay productos con ese filtro.</p>':emptyState('Todavía no cargaste productos.'+(admin?'':' Pedile al dueño que los cargue.'),admin?'new-product':'',admin?'Nuevo producto':'');
  var foot=admin?'<tfoot><tr><td colspan="'+cols+'"><b>Mercadería en stock:</b> '+money(totCost)+' a costo · '+money(totSale)+' a precio de venta · ganancia potencial '+money(totSale-totCost)+'</td></tr></tfoot>':'';
  return '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Producto</th><th>Stock</th><th class="num">Mínimo</th><th>Estado</th><th class="num">Precio</th>'+(admin?'<th class="num col2">Costo</th><th class="num col2">Margen</th><th class="num col2">Valor en stock</th>':'')+'<th><span class="sr-only">Acciones</span></th></tr></thead><tbody>'+rows+'</tbody>'+foot+'</table></div>'+moreBtn(shown.length,L.length,'stLimit');
}
// Pedido sugerido: lo que está en el mínimo o por debajo, agrupado por proveedor, para llegar a mínimo × 2.
function restockGroups(){
  var g={};
  S.products.filter(lowStock).forEach(function(x){
    var k=x.supplierId||0;
    (g[k]=g[k]||[]).push({p:x,qty:Math.ceil(Math.max(x.min*2-x.stock,1))});
  });
  return Object.keys(g).map(function(k){return {supplier:k==='0'?null:supplierById(k),items:g[k].sort(byName(function(it){return it.p.name;}))};})
    .sort(function(a,b){return collator.compare(a.supplier?a.supplier.name:'~',b.supplier?b.supplier.name:'~');});
}
function orderText(g){
  return 'Hola'+(g.supplier?' '+g.supplier.name:'')+', te hago el siguiente pedido para '+S.shop+':\n'+g.items.map(function(it){return '- '+fmtQty(it.qty,it.p.unit)+' × '+it.p.name+(it.p.brand?' ('+it.p.brand+')':'');}).join('\n')+'\nGracias.';
}
function restockHTML(){
  var G=restockGroups(),admin=isAdmin();
  if(!G.length)return '<p class="empty">No hay productos en el mínimo o por debajo. Cuando haya, acá vas a ver qué pedir y a quién.</p>';
  return '<p class="note2">Cantidad sugerida: lo necesario para llegar al doble del stock mínimo (mínimo × 2 − stock actual).</p>'+G.map(function(g,i){
    var wa=g.supplier&&g.supplier.phone?waLink(g.supplier.phone):'';
    return '<div class="grp panel"><div class="toolbar"><h2 class="h3" style="margin:0">'+(g.supplier?esc(g.supplier.name):'Sin proveedor asignado')+'</h2>'+(g.supplier&&g.supplier.phone?'<small>'+esc(g.supplier.phone)+'</small>':'')+
      '<span class="grow"></span><button class="btn" data-action="copy-order" data-i="'+i+'">Copiar pedido</button>'+(wa?'<a class="btn primary" target="_blank" rel="noopener" href="'+esc(wa+'?text='+encodeURIComponent(orderText(g)))+'">Enviar por WhatsApp</a>':'')+'</div>'+
      '<div class="tbl-wrap"><table class="tbl slim"><thead><tr><th>Producto</th><th class="num">Stock</th><th class="num">Mínimo</th><th class="num">Pedir</th>'+(admin?'<th class="num">Costo estimado</th>':'')+'<th><span class="sr-only">Acciones</span></th></tr></thead><tbody>'+g.items.map(function(it){
        return '<tr><td><b>'+esc(it.p.name)+'</b>'+(it.p.brand?' <small>'+esc(it.p.brand)+'</small>':'')+'</td><td class="num">'+fmtQty(it.p.stock,it.p.unit)+'</td><td class="num">'+fmtQty(it.p.min,it.p.unit)+'</td><td class="num"><b>'+fmtQty(it.qty,it.p.unit)+'</b></td>'+
          (admin?'<td class="num">'+(it.p.cost>0?money(it.p.cost*it.qty):'—')+'</td>':'')+'<td class="act"><button class="link" data-action="stock-add" data-id="'+it.p.id+'">Llegó</button></td></tr>';
      }).join('')+'</tbody></table></div></div>';
  }).join('');
}
function viewStock(){
  var admin=isAdmin(),low=S.products.filter(lowStock).length,exp=S.products.filter(expiring).length;
  var tabs='<div class="tabs" role="tablist"><button class="tab" role="tab" data-action="stab" data-v="products" aria-selected="'+(ui.stab==='products')+'">Productos</button><button class="tab" role="tab" data-action="stab" data-v="restock" aria-selected="'+(ui.stab==='restock')+'">Para pedir'+(low?' ('+low+')':'')+'</button></div>';
  var body=ui.stab==='restock'?restockHTML():
    '<div class="toolbar">'+segHTML('stf',[['all','Todos'],['low','Poco stock ('+low+')'],['exp','Vencidos y por vencer ('+exp+')']],ui.stf,'Filtro')+
      '<label class="inl"><span class="sr-only">Categoría</span><select id="stcat"><option value="all">Todas las categorías</option>'+PROD_CATS.map(function(c){return '<option'+(ui.cat===c?' selected':'')+'>'+c+'</option>';}).join('')+'</select></label></div>'+
    '<input id="stq" type="search" placeholder="Buscar por nombre, marca o código" value="'+esc(ui.stq)+'" aria-label="Buscar producto" class="searchbar">'+
    '<div id="stocktable">'+stockTable()+'</div>';
  return '<section class="farm"><div class="head"><h1>Stock</h1><div class="hbtns"><button class="btn" data-action="scan-sell">Vender con escáner</button><button class="btn" data-action="scan-stock">Ingresar con escáner</button>'+
    (admin?'<button class="btn" data-action="bulk-price">% Actualizar precios</button><button class="btn primary" data-action="new-product">Nuevo producto</button>':'')+'</div></div>'+tabs+body+'</section>';
}

/* ============================================================
   Escáner de códigos de barras (cámara o lector USB/Bluetooth)
   Usa el detector nativo del navegador cuando existe y, si no, ZXing (guardado en /vendor, se carga solo al
   abrir el escáner). EAN-13, EAN-8, UPC-A, UPC-E, Code 128, Code 39 y QR. Siempre hay alternativa manual.
   ============================================================ */
var zxingLoading=null;
function loadZXing(){
  if(window.ZXing)return Promise.resolve();
  if(!zxingLoading)zxingLoading=new Promise(function(ok,fail){
    var sc=document.createElement('script');sc.src='/vendor/zxing-library.min.js';
    sc.onload=ok;sc.onerror=function(){zxingLoading=null;fail(new Error('No se pudo cargar el lector de códigos. Revisá tu conexión.'));};
    document.head.appendChild(sc);
  });
  return zxingLoading;
}
var NATIVE_FORMATS=['ean_13','ean_8','upc_a','upc_e','code_128','code_39','qr_code'];
async function makeDecoder(){
  if(window.BarcodeDetector){
    try{
      var f=await BarcodeDetector.getSupportedFormats(),want=NATIVE_FORMATS.filter(function(x){return f.indexOf(x)>=0;});
      if(want.length){var det=new BarcodeDetector({formats:want});return function(src){return det.detect(src).then(function(r){return r&&r[0]?r[0].rawValue:null;}).catch(function(){return null;});};}
    }catch(e){}
  }
  await loadZXing();
  var Z=window.ZXing,hints=new Map(),reader=new Z.MultiFormatReader(),cv=document.createElement('canvas'),cx=cv.getContext('2d',{willReadFrequently:true});
  hints.set(Z.DecodeHintType.POSSIBLE_FORMATS,[Z.BarcodeFormat.EAN_13,Z.BarcodeFormat.EAN_8,Z.BarcodeFormat.UPC_A,Z.BarcodeFormat.UPC_E,Z.BarcodeFormat.CODE_128,Z.BarcodeFormat.CODE_39,Z.BarcodeFormat.QR_CODE]);
  hints.set(Z.DecodeHintType.TRY_HARDER,true);reader.setHints(hints);
  return function(src){
    var w=src.videoWidth||src.width,h=src.videoHeight||src.height;if(!w||!h)return Promise.resolve(null);
    var k=Math.min(1,1000/w);cv.width=Math.round(w*k);cv.height=Math.round(h*k);cx.drawImage(src,0,0,cv.width,cv.height);
    try{return Promise.resolve(reader.decode(new Z.BinaryBitmap(new Z.HybridBinarizer(new Z.HTMLCanvasElementLuminanceSource(cv)))).getText());}catch(e){return Promise.resolve(null);}
  };
}
var audioCtx=null;
function beep(){
  if(store.get('petshop_beep')==='off')return;
  try{audioCtx=audioCtx||new (window.AudioContext||window.webkitAudioContext)();var o=audioCtx.createOscillator(),g=audioCtx.createGain();o.frequency.value=1200;g.gain.value=0.08;o.connect(g);g.connect(audioCtx.destination);o.start();o.stop(audioCtx.currentTime+0.09);}catch(e){}
}
var scanners=[];
function stopScanners(){scanners.slice().forEach(function(s){s.stop();});}
document.addEventListener('visibilitychange',function(){if(document.visibilityState==='hidden'&&scanners.length){stopScanners();if(ui.scanStrip){ui.scanStrip=false;if(ui.view==='vender')render();}}});
/**
 * Arma un escáner dentro de `box`. o.onCode(code) recibe cada código leído (validado y sin repetir durante 1,5 s).
 * o.continuous: sigue leyendo después de cada código. Devuelve { stop }.
 */
function createScanner(box,o){
  box.innerHTML='<div class="scanbox"><video playsinline muted autoplay></video><div class="scanline" aria-hidden="true"></div></div>'+
    '<div class="scanctl"><button type="button" class="btn" data-s="torch" hidden aria-pressed="false">Linterna</button><button type="button" class="btn" data-s="switch" hidden>Cambiar cámara</button>'+
    '<label class="btn">Leer de una foto<input type="file" accept="image/*" capture="environment" hidden></label>'+
    '<button type="button" class="btn" data-s="beep" aria-pressed="'+(store.get('petshop_beep')!=='off')+'">'+(store.get('petshop_beep')==='off'?'Sin sonido':'Con sonido')+'</button></div>'+
    '<p class="scanmsg" role="status">Abriendo la cámara…</p>'+
    '<div class="scanmanual"><label class="fld"><span>¿No lo lee? Escribí el código</span><input type="text" inputmode="numeric" autocomplete="off" class="scanman" placeholder="Ej.: 7791234567890"></label><button type="button" class="btn primary" data-s="use">Usar</button></div>';
  var video=box.querySelector('video'),msg=box.querySelector('.scanmsg'),stream=null,track=null,timer=null,done=false,decode=null,devices=[],devIdx=0,last={code:'',at:0},torchOn=false;
  var self={box:box,stop:stop};
  scanners.push(self);
  function stopStream(){clearTimeout(timer);if(stream)stream.getTracks().forEach(function(t){t.stop();});stream=null;track=null;}
  function stop(){if(done)return;done=true;stopStream();var i=scanners.indexOf(self);if(i>=0)scanners.splice(i,1);}
  function emit(raw){
    var code=String(raw||'').trim();if(!code)return;
    var now=Date.now();if(code===last.code&&now-last.at<1500)return; // evita leer dos veces el mismo
    last={code:code,at:now};
    if(!gtinValid(code)){msg.textContent='No se leyó bien el código (el dígito de control no coincide). Probá de nuevo.';return;}
    beep();try{if(navigator.vibrate)navigator.vibrate(60);}catch(e){}
    msg.textContent='Leído: '+code;
    if(!o.continuous)stop();
    o.onCode(code);
  }
  box.querySelector('[data-s="use"]').addEventListener('click',function(){var i=box.querySelector('.scanman');if(i.value.trim()){emit(i.value);i.value='';}else msg.textContent='Escribí el código y tocá «Usar».';});
  box.querySelector('.scanman').addEventListener('keydown',function(e){if(e.key==='Enter'){e.preventDefault();e.stopPropagation();box.querySelector('[data-s="use"]').click();}});
  box.querySelector('[data-s="beep"]').addEventListener('click',function(e){var off=store.get('petshop_beep')!=='off';store.set('petshop_beep',off?'off':'on');e.currentTarget.textContent=off?'Sin sonido':'Con sonido';e.currentTarget.setAttribute('aria-pressed',String(!off));});
  box.querySelector('input[type=file]').addEventListener('change',async function(e){
    var f=e.target.files&&e.target.files[0];e.target.value='';if(!f)return;
    msg.textContent='Leyendo la foto…';
    try{
      decode=decode||await makeDecoder();
      var img=new Image();img.src=URL.createObjectURL(f);await img.decode();
      var code=await decode(img);URL.revokeObjectURL(img.src);
      if(code)emit(code);else msg.textContent='No encontramos un código en la foto. Probá con otra más cerca y con buena luz, o escribilo.';
    }catch(err){msg.textContent='No se pudo leer la foto. Escribí el código a mano.';}
  });
  var torchBtn=box.querySelector('[data-s="torch"]'),swBtn=box.querySelector('[data-s="switch"]');
  torchBtn.addEventListener('click',function(){if(!track)return;torchOn=!torchOn;track.applyConstraints({advanced:[{torch:torchOn}]}).catch(function(){});torchBtn.setAttribute('aria-pressed',String(torchOn));});
  swBtn.addEventListener('click',function(){if(devices.length<2)return;devIdx=(devIdx+1)%devices.length;stopStream();open(devices[devIdx].deviceId);});
  function open(deviceId){
    if(!(navigator.mediaDevices&&navigator.mediaDevices.getUserMedia)){msg.textContent='Este navegador no permite usar la cámara (hace falta abrir el sistema con https). Podés escribir el código o leerlo de una foto.';return;}
    var video_=deviceId?{deviceId:{exact:deviceId}}:{facingMode:{ideal:'environment'},width:{ideal:1280},height:{ideal:720}};
    navigator.mediaDevices.getUserMedia({video:video_,audio:false}).then(function(st){
      if(done){st.getTracks().forEach(function(t){t.stop();});return;}
      stream=st;track=st.getVideoTracks()[0];video.srcObject=st;
      var cap=track.getCapabilities?track.getCapabilities():{};
      if(cap.focusMode&&cap.focusMode.indexOf('continuous')>=0)track.applyConstraints({advanced:[{focusMode:'continuous'}]}).catch(function(){});
      torchBtn.hidden=!cap.torch;
      navigator.mediaDevices.enumerateDevices().then(function(d){devices=d.filter(function(x){return x.kind==='videoinput';});swBtn.hidden=devices.length<2;}).catch(function(){});
      return video.play().catch(function(){});
    }).then(async function(){
      if(done||!stream)return;
      msg.textContent='Apuntá la cámara al código y mantenelo quieto.';
      try{decode=decode||await makeDecoder();}catch(err){msg.textContent=err.message+' Podés escribir el código.';return;}
      var tick=function(){
        if(done||!stream)return;
        if(!video.videoWidth){timer=setTimeout(tick,150);return;}
        decode(video).then(function(code){if(done||!stream)return;if(code)emit(code);timer=setTimeout(tick,o.continuous?250:150);});
      };
      tick();
    }).catch(function(err){
      var n=err&&err.name;
      msg.textContent=n==='NotAllowedError'||n==='SecurityError'?'No tenemos permiso para usar la cámara. Activá el permiso de cámara en el navegador (tocá el candado de la barra de direcciones) o escribí el código.':
        n==='NotFoundError'||n==='OverconstrainedError'?'No encontramos ninguna cámara en este dispositivo. Podés escribir el código o leerlo de una foto.':
        n==='NotReadableError'?'La cámara está siendo usada por otra aplicación. Cerrala y probá de nuevo, o escribí el código.':
        'No se pudo abrir la cámara. Podés escribir el código o leerlo de una foto.';
    });
  }
  open(null);
  return self;
}
/** Escáner en una ventana: devuelve una promesa con un código (o null si se cancela). */
function openScanner(title){
  return new Promise(function(resolve){
    var d=document.createElement('dialog'),got=null;d.className='scan';
    d.innerHTML='<form class="dform"><h2>'+esc(title||'Escanear código de barras')+'</h2><div class="scanhost"></div><div class="actions"><button type="button" class="btn ghost" data-x="cancel">Cancelar</button></div></form>';
    document.body.appendChild(d);
    var sc=createScanner(d.querySelector('.scanhost'),{continuous:false,onCode:function(c){got=c;d.close();}});
    d.querySelector('[data-x="cancel"]').addEventListener('click',function(){d.close();});
    d.addEventListener('close',function(){sc.stop();d.remove();resolve(got);});
    d.showModal();
  });
}
// Escáner fijo arriba del carrito en "Vender" (modo continuo). Sobrevive a los redibujos de la pantalla.
var stripScanner=null;
function mountStrip(){
  var holder=$('#scanstrip');
  if(!ui.scanStrip||!holder){if(stripScanner&&!holder){stripScanner.stop();stripScanner=null;}return;}
  if(stripScanner&&scanners.indexOf(stripScanner)>=0){
    holder.replaceWith(stripScanner.box);
    var v=stripScanner.box.querySelector('video');if(v)v.play().catch(function(){}); // al mover el video en la página, se pausa
    return;
  }
  holder.innerHTML='';
  stripScanner=createScanner(holder,{continuous:true,onCode:function(c){handleScanSell(c);}});
}
/** Qué hacer con un código leído para vender. */
async function handleScanSell(code){
  var x=prodByBarcode(code);
  if(!x&&ui.view==='vender'){
    // Lo que llega como ráfaga de teclas puede ser un nombre escrito rápido: si coincide con productos, se agrega el primero.
    var hit=searchItems(code)[0];
    if(UR.posEnterAction(code,{results:hit?1:0})==='first'){if(addToCart(hit.type,hit.id))renderCart();return;}
  }
  if(!x){await unknownCode(code);return;}
  if(ui.view!=='vender'){sellForm(x);return;}
  if(x.unit==='kg'){var q=await askQty(x);if(!q)return;if(addToCart('product',x.id,q))renderCart();return;}
  if(addToCart('product',x.id,1))renderCart();
}
function askQty(x){
  return new Promise(function(resolve){
    var d=document.createElement('dialog'),val=null;
    d.innerHTML='<form class="dform"><h2>¿Cuántos kilos de '+esc(x.name)+'?</h2><label class="fld"><span>Kilos (quedan '+fmtQty(x.stock,'kg')+')</span><input type="number" min="0.001" max="'+x.stock+'" step="0.001" inputmode="decimal" required autofocus></label>'+
      '<div class="actions"><button type="button" class="btn ghost" data-x="no">Cancelar</button><button class="btn primary">Agregar</button></div></form>';
    document.body.appendChild(d);
    var inp=d.querySelector('input');
    d.querySelector('form').addEventListener('submit',function(e){e.preventDefault();var v=r3(Number(inp.value));if(v>0){val=v;d.close();}});
    d.querySelector('[data-x="no"]').addEventListener('click',function(){d.close();});
    d.addEventListener('close',function(){d.remove();resolve(val);});
    d.showModal();inp.focus();
  });
}
/** Código desconocido: el dueño puede cargarlo como producto nuevo o asociarlo a uno existente. */
async function unknownCode(code,then){
  if(!isAdmin()){toast('No encontramos el código '+code+'. Pedile al dueño que lo cargue.',true);return;}
  var ch=await choiceDialog('Código nuevo','<p>No encontramos el código <b>'+esc(code)+'</b>. ¿Querés cargarlo?</p>',
    [{label:'Cancelar',value:null,cls:'ghost'},{label:'Asociar a un producto existente',value:'assoc',cls:''},{label:'Cargar producto nuevo',value:'new',cls:'primary'}]);
  if(ch==='new')productForm(null,{barcode:code},then);
  else if(ch==='assoc')associateForm(code,then);
}
function associateForm(code,then){
  var opts=S.products.map(function(p){return [p.id,prodLabel(p)+((p.barcodes||[]).length?' (ya tiene '+p.barcodes.length+' código'+(p.barcodes.length>1?'s':'')+')':'')];});
  if(!opts.length){toast('Todavía no hay productos: cargá uno nuevo.',true);return;}
  openForm({title:'Asociar el código '+esc(code),
    body:'<p>Un producto puede tener varios códigos (por ejemplo, distintas presentaciones de fábrica).</p><div class="fields">'+fld('Producto','pid',{opts:opts,full:true,req:true})+'</div>',
    submit:'Asociar código',
    onSubmit:async function(d){
      await apiConfirm('/products/'+d.pid+'/barcodes',{body:{code:code}});
      await reload();toast('Código asociado a '+(prodById(d.pid)||{}).name);
      if(then)then(prodById(d.pid));
    }});
}
/**
 * Ingreso de mercadería escaneando (modo continuo): se escanea, se elige la cantidad y se suma; vuelve a la cámara.
 * Lista de lo ingresado con "Deshacer" por línea. Al terminar, un resumen.
 */
function ingestScanner(){
  var admin=isAdmin(),session=[],cur=null;
  var d=document.createElement('dialog');d.className='scan wide';
  d.innerHTML='<form class="dform" novalidate><h2>Ingresar mercadería con el escáner</h2><div class="ingest"><div class="scanhost"></div><div class="icard" aria-live="polite"><p class="empty">Escaneá un producto para sumarlo al stock.</p></div></div>'+
    '<h3 class="h3">Ingresado en esta sesión</h3><ul class="ilist"><li class="empty">Todavía nada.</li></ul><div class="actions"><button type="button" class="btn primary" data-x="end">Terminar</button></div></form>';
  document.body.appendChild(d);
  var card_=d.querySelector('.icard'),list=d.querySelector('.ilist');
  function renderList(){
    list.innerHTML=session.length?session.map(function(s,i){return '<li class="'+(s.undone?'voided':'')+'"><span>'+fmtQty(s.qty,s.unit)+' × <b>'+esc(s.name)+'</b></span>'+(s.undone?'<small>Deshecho</small>':'<button type="button" class="link bad" data-u="'+i+'">Deshacer</button>')+'</li>';}).join(''):'<li class="empty">Todavía nada.</li>';
  }
  list.addEventListener('click',async function(e){
    var b=e.target.closest('[data-u]');if(!b)return;var s=session[Number(b.dataset.u)];
    b.disabled=true;
    try{await api('/stock-movements/'+s.movementId+'/undo',{body:{}});s.undone=true;renderList();toast('Ingreso deshecho: '+s.name);}
    catch(err){b.disabled=false;toast(err.message,true);}
  });
  function showCard(p){
    cur=p;var step=qtyStep(p.unit);
    card_.innerHTML='<p class="big">'+esc(p.name)+'</p><p>'+esc([p.brand,p.category].filter(Boolean).join(' · '))+' · Stock actual: <b>'+fmtQty(p.stock,p.unit)+'</b></p>'+
      '<div class="fields">'+
        '<label class="fld full" for="iq"><span>Cantidad que entra'+(p.unit==='kg'?' (kg)':'')+'</span><span class="qtybox big"><button type="button" class="qbtn" data-q="-">−</button><input id="iq" type="number" min="'+step+'" step="'+step+'" value="1" inputmode="decimal"><button type="button" class="qbtn" data-q="+">+</button></span></label>'+
        (admin?fld('Costo por '+(p.unit==='kg'?'kilo':'unidad'),'icost',{type:'number',min:0,step:'0.01',value:p.cost||''})+fld('Proveedor','isup',{opts:supplierOpts(),value:p.supplierId})+
          fld('Vencimiento (opcional)','iexp',{type:'date'})+fld('Forma de pago','imethod',{opts:PAY(),value:'Transferencia'})+fld('Registrar la compra como egreso en caja','icash',{type:'checkbox',full:true}):
          fld('Vencimiento (opcional)','iexp',{type:'date'}))+
      '</div><p class="err" role="alert"></p><div class="actions"><button type="button" class="btn ghost" data-x="skip">Otro producto</button><button type="button" class="btn primary" data-x="add">Sumar al stock</button></div>';
    var q=card_.querySelector('#iq');q.focus();q.select();
    card_.querySelectorAll('[data-q]').forEach(function(b){b.addEventListener('click',function(){var v=Number(q.value)||0,s=Number(step);v=b.dataset.q==='+'?v+(p.unit==='kg'?1:s):v-(p.unit==='kg'?1:s);q.value=Math.max(Number(step),r3(v));});});
    q.addEventListener('keydown',function(e){if(e.key==='Enter'){e.preventDefault();card_.querySelector('[data-x="add"]').click();}});
    card_.querySelector('[data-x="skip"]').addEventListener('click',function(){cur=null;card_.innerHTML='<p class="empty">Escaneá un producto para sumarlo al stock.</p>';});
    card_.querySelector('[data-x="add"]').addEventListener('click',async function(e){
      var btn=e.currentTarget,err=card_.querySelector('.err');if(btn.disabled)return;
      var qty=Number(q.value);if(!(qty>0)){err.textContent='Escribí una cantidad mayor a cero.';return;}
      var body={qty:qty,viaScanner:true,expires:(card_.querySelector('[name="iexp"]')||{}).value||''};
      if(admin){var c=card_.querySelector('[name="icost"]').value;body.unitPrice=c;body.supplierId=card_.querySelector('[name="isup"]').value||null;body.cash=card_.querySelector('[name="icash"]').checked;body.method=card_.querySelector('[name="imethod"]').value;
        if(body.cash&&!(Number(c)>0)){err.textContent='Para registrar el egreso en caja escribí el costo.';return;}}
      btn.disabled=true;btn.classList.add('busy');
      try{
        var r=await api('/products/'+p.id+'/purchase',{body:body});
        session.unshift({movementId:r.movementId,name:p.name,qty:qty,unit:p.unit});renderList();
        p.stock=r.stock;
        toast('Sumado: '+fmtQty(qty,p.unit)+' × '+p.name+(r.costChanged?'. Nuevo costo '+money(r.costChanged.after)+' (margen '+pct(r.costChanged.margin)+')':''),!!(r.costChanged&&r.costChanged.margin!=null&&r.costChanged.margin<0));
        cur=null;card_.innerHTML='<p class="empty">Listo. Escaneá el próximo producto.</p>';
      }catch(ex){err.textContent=ex.message;btn.disabled=false;btn.classList.remove('busy');}
    });
  }
  var sc=createScanner(d.querySelector('.scanhost'),{continuous:true,onCode:function(code){
    var p=prodByBarcode(code);
    if(p){showCard(p);return;}
    unknownCode(code,function(np){if(np)showCard(np);});
  }});
  d.ingest={showCard:showCard};
  d.querySelector('[data-x="end"]').addEventListener('click',function(){d.close();});
  d.addEventListener('close',function(){
    sc.stop();d.remove();
    var ok=session.filter(function(s){return !s.undone;});
    if(ok.length)toast('Ingreso terminado: '+plural(ok.length,'producto sumado','productos sumados')+' al stock.');
    reload();
  });
  d.showModal();
}
// Lector USB/Bluetooth tipo teclado: una ráfaga de teclas rápidas terminada en Enter (fuera de un campo de texto)
// se trata como un escaneo. En el buscador de Vender, Enter ya agrega el producto (ver eventos).
var wedge={buf:'',last:0};
document.addEventListener('keydown',function(e){
  var t=e.target,tag=t&&t.tagName;
  var inField=tag==='INPUT'||tag==='TEXTAREA'||tag==='SELECT';
  if(inField)return;
  var now=Date.now();
  if(e.key==='Enter'){
    var code=wedge.buf;wedge.buf='';
    if(code.length>=4&&now-wedge.last<80){
      e.preventDefault();
      var ing=document.querySelector('dialog.scan.wide');
      if(ing&&ing.ingest){var p=prodByBarcode(code);if(p)ing.ingest.showCard(p);else unknownCode(code,function(np){if(np)ing.ingest.showCard(np);});}
      else if(ui.view==='vender'||ui.view==='stock')handleScanSell(code);
    }
    return;
  }
  if(e.key.length!==1||e.ctrlKey||e.metaKey||e.altKey){return;}
  if(now-wedge.last>80)wedge.buf='';
  wedge.buf+=e.key;wedge.last=now;
});

/* ============================================================
   Servicios (baño y peluquería)
   ============================================================ */
function viewServicios(){
  var admin=isAdmin();
  var g=SERV_CATS.map(function(cat){
    var L=S.services.filter(function(s){return s.category===cat;});
    if(!L.length)return '';
    return '<div class="grp"><h2 class="h3">'+cat+'</h2><div class="tbl-wrap"><table class="tbl slim"><thead><tr><th>Servicio</th><th class="num">Precio</th><th><span class="sr-only">Acciones</span></th></tr></thead><tbody>'+L.map(function(s){
      return '<tr><td><b>'+esc(s.name)+'</b><small>Duración aproximada: '+s.duration+' min</small></td><td class="num">'+money(s.price)+'</td><td class="act">'+
        '<button class="link" data-action="sell-service" data-id="'+s.id+'">Cobrar</button>'+(admin?'<button class="link" data-action="edit-service" data-id="'+s.id+'">Editar</button><span class="sep"></span><button class="link bad" data-action="del-service" data-id="'+s.id+'">Eliminar</button>':'')+'</td></tr>';
    }).join('')+'</tbody></table></div></div>';
  }).join('');
  return '<section class="farm"><div class="head"><h1>Servicios</h1>'+(admin?'<button class="btn primary" data-action="new-service">Nuevo servicio</button>':'')+'</div>'+
    '<p class="note2">Precios de baño y peluquería. Se cobran desde «Vender» o desde el turno en la Agenda. Tip: cargá un servicio por tamaño (ej.: «Baño perro chico», «Baño perro grande»).</p>'+
    (g||emptyState('Todavía no cargaste servicios.'+(admin?'':' Pedile al dueño que los cargue.'),admin?'new-service':'',admin?'Nuevo servicio':''))+'</section>';
}

/* ============================================================
   Agenda de peluquería y baño
   ============================================================ */
var WEEKDAYS=['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'];
var apptLabel=function(a){return a.time+' · '+esc(a.pet)+' ('+esc(a.clientLast)+')';};
function dayAppts(iso){return (ui.appts||[]).filter(function(a){return a.date===iso;}).sort(function(a,b){return a.time.localeCompare(b.time);});}
var active=function(a){return a.status!=='cancelado'&&a.status!=='no_vino';};
function apptBtn(a){return '<button class="appt st-'+a.status+'" data-action="appt-view" data-id="'+a.id+'">'+apptLabel(a)+'<small>'+esc(a.service||'Sin servicio')+(a.staff?' · '+esc(a.staff):'')+'</small></button>';}
function calDayColumn(iso){
  var d=parse(iso),isToday=iso===todayIso();
  return '<div class="cal-day'+(isToday?' today':'')+'"><div class="cal-day-head"><button class="link daylink" data-action="cal-day" data-v="'+iso+'"><span>'+WEEKDAYS[(d.getDay()+6)%7]+'</span> <b>'+d.getDate()+'</b></button>'+
    '<button class="cal-add" data-action="cal-add-day" data-v="'+iso+'" aria-label="Agregar turno el '+fmtDate(iso)+'">+</button></div>'+dayAppts(iso).map(apptBtn).join('')+'</div>';
}
function calMonthGrid(){
  var r=calRange(),cur=ui.cal.anchor.slice(0,7),cells='',d=r[0];
  while(d<=r[1]){
    var list=dayAppts(d),out=d.slice(0,7)!==cur,isToday=d===todayIso();
    cells+='<div class="cal-mday'+(out?' out':'')+(isToday?' today':'')+(list.length||isToday?' has':'')+'"><div class="mhead"><button class="link daylink" data-action="cal-day" data-v="'+d+'">'+WEEKDAYS[(parse(d).getDay()+6)%7]+' '+Number(d.slice(8,10))+'</button>'+
      '<button class="cal-add" data-action="cal-add-day" data-v="'+d+'" aria-label="Agregar turno el '+fmtDate(d)+'">+</button></div>'+
      list.slice(0,3).map(function(a){return '<button class="cal-chip st-'+a.status+'" data-action="appt-view" data-id="'+a.id+'">'+apptLabel(a)+'</button>';}).join('')+
      (list.length>3?'<button class="cal-more" data-action="cal-day" data-v="'+d+'">+'+(list.length-3)+' más</button>':'')+'</div>';
    d=shiftDays(1,d);
  }
  return '<div class="calscroll"><div class="cal-month">'+cells+'</div></div>';
}
/**
 * Vista Día como grilla horaria: franjas de 30 minutos, cada turno es un bloque del alto de su duración; los que se
 * pisan van en columnas paralelas y marcados en rojo.
 */
function calDayGrid(){
  var iso=ui.cal.anchor,list=dayAppts(iso),h=(S.settings.hours||{})[parse(iso).getDay()];
  var open=h?toMin(h[0]):9*60,close=h?toMin(h[1]):19*60;
  list.forEach(function(a){open=Math.min(open,Math.floor(toMin(a.time)/30)*30);close=Math.max(close,Math.ceil((toMin(a.time)+a.duration)/30)*30);});
  var SLOT=30,PX=44,rows='';
  for(var m=open;m<close;m+=SLOT)rows+='<div class="slot'+(m%60===0?' hour':'')+'" style="height:'+PX+'px"><span>'+hhmm(m)+'</span><button class="slotadd" data-action="cal-add-slot" data-v="'+hhmm(m)+'" aria-label="Nuevo turno a las '+hhmm(m)+'"></button></div>';
  // Columnas: cada turno va en la primera columna donde no se pisa con otro (los cancelados no ocupan lugar).
  var act=list.filter(active),cols=[];
  act.forEach(function(a){
    var s=toMin(a.time),e=s+a.duration,ci=cols.findIndex(function(c){return c.every(function(b){var bs=toMin(b.time);return e<=bs||s>=bs+b.duration;});});
    if(ci<0){cols.push([a]);ci=cols.length-1;}else cols[ci].push(a);a._col=ci;
  });
  var n=Math.max(1,cols.length);
  var blocks=act.map(function(a){
    var s=toMin(a.time),clash=act.some(function(b){return b!==a&&s<toMin(b.time)+b.duration&&toMin(b.time)<s+a.duration;});
    return '<button class="appt grid st-'+a.status+(clash?' clash':'')+'" data-action="appt-view" data-id="'+a.id+'" style="top:'+((s-open)/SLOT*PX)+'px;height:'+Math.max(PX*0.8,a.duration/SLOT*PX-3)+'px;left:calc('+(a._col/n*100)+'% + 2px);width:calc('+(100/n)+'% - 4px)">'+
      (clash?'<b class="clashtag">Se pisa</b>':'')+apptLabel(a)+'<small>'+esc(a.service||'Sin servicio')+' · hasta '+a.endTime+(a.staff?' · '+esc(a.staff):'')+' · '+esc(APPT_LABEL[a.status])+'</small></button>';
  }).join('');
  var gone=list.filter(function(a){return !active(a);});
  return (h?'':'<p class="warnbox">Según el horario comercial, este día el local está cerrado.</p>')+
    '<div class="daygrid"><div class="slots">'+rows+'</div><div class="blocks" style="height:'+((close-open)/SLOT*PX)+'px">'+blocks+'</div></div>'+
    (gone.length?'<h2 class="h3">Cancelados y «No vino»</h2><div class="daylist">'+gone.map(apptBtn).join('')+'</div>':'')+
    (list.length?'':'<p class="empty">No hay turnos este día. Tocá una franja para agendar.</p>');
}
function viewAgenda(){
  if(!ui.appts)return loadingView('Agenda');
  var body;
  if(ui.cal.view==='month')body=calMonthGrid();
  else if(ui.cal.view==='day')body=calDayGrid();
  else{var r=calRange(),cells='',d=r[0];while(d<=r[1]){cells+=calDayColumn(d);d=shiftDays(1,d);}body='<div class="calscroll"><div class="cal-week fit">'+cells+'</div></div>';}
  return '<section class="farm"><div class="head"><h1>Agenda de turnos</h1><button class="btn primary" data-action="new-appt">Nuevo turno</button></div>'+
    '<div class="cal-head"><div class="cal-nav"><button data-action="cal-prev" aria-label="Anterior">‹</button><button class="btn" data-action="cal-today">'+({day:'Hoy',week:'Semana',month:'Mes'}[ui.cal.view]||'Hoy')+'</button><button data-action="cal-next" aria-label="Siguiente">›</button></div>'+
    '<div class="cal-title" aria-live="polite">'+calTitle()+'</div>'+segHTML('cal-view',APPT_VIEWS,ui.cal.view,'Vista')+'</div>'+
    '<div class="cal-legend">'+APPT_STATUS.map(function(s){return '<span><i class="st-'+s[0]+'"></i>'+s[1]+'</span>';}).join('')+'</div>'+body+'</section>';
}

/* ============================================================
   Clientes y mascotas
   ============================================================ */
var ini=function(n){return esc(String(n||'?').trim().charAt(0).toUpperCase()||'?');};
var petEmo=function(p){return ini(p.name);};
function ageText(b){
  if(!b)return '';
  var a=b.split('-').map(Number),now=new Date(),months=(now.getFullYear()-a[0])*12+(now.getMonth()+1-a[1]);
  if(now.getDate()<a[2])months--;if(months<0)months=0;
  return months<12?plural(months,'mes','meses'):plural(Math.floor(months/12),'año','años');
}
function filteredClients(){
  var q=norm(ui.cliq).trim(),qd=ui.cliq.replace(/\D/g,'');
  return S.clients.filter(function(c){
    if(!q)return true;
    return norm(c.name+' '+c.email+' '+c.phone+' '+c.address+' '+c.pets.map(function(p){return p.name;}).join(' ')).indexOf(q)>=0||(qd.length>=3&&c.phone.replace(/\D/g,'').indexOf(qd)>=0);
  });
}
function clientListHTML(){
  var L=filteredClients();
  if(!L.length)return '<li class="empty">'+(S.clients.length?'No hay clientes con esa búsqueda.':'Todavía no hay clientes. Empezá con «Nuevo cliente».')+'</li>';
  var shown=L.slice(0,ui.clLimit);
  return shown.map(function(c){
    return '<li><button class="pitem" data-action="select-client" data-id="'+c.id+'" aria-current="'+(c.id===ui.csel)+'"><span class="avatar" aria-hidden="true">'+ini(c.name)+'</span>'+
      '<span class="pi-main"><b>'+esc(c.name)+'</b><small>'+(c.pets.length?c.pets.map(function(p){return esc(p.name);}).join(', '):'Sin mascotas')+(c.phone?' · '+esc(c.phone):'')+'</small></span></button></li>';
  }).join('')+(L.length>shown.length?'<li>'+moreBtn(shown.length,L.length,'clLimit')+'</li>':'');
}
function clientDetailHTML(c){
  var tel=String(c.phone||'').replace(/[^\d+]/g,'');
  var contact=[c.phone?'Tel. <a href="tel:'+esc(tel)+'">'+esc(c.phone)+'</a>':'<span class="mut">Sin teléfono</span>',c.email?'<a href="mailto:'+esc(c.email)+'">'+esc(c.email)+'</a>':'<span class="mut">Sin email</span>'];
  var pets=c.pets.length?'<div class="petlist">'+c.pets.map(function(p){
    var info=[p.species,p.breed,sizeLabel(p.size),ageText(p.birth)].filter(Boolean).map(esc).join(' · ');
    return '<div class="petrow"><span class="avatar" aria-hidden="true">'+petEmo(p)+'</span><span class="pi-main"><b>'+esc(p.name)+'</b><small>'+info+'</small>'+(p.notes?'<small class="pnote">Notas: '+esc(p.notes)+'</small>':'')+'</span>'+
      '<span class="racts"><button class="link" data-action="pet-appt" data-id="'+p.id+'">Turno</button><button class="link" data-action="edit-pet" data-id="'+p.id+'">Editar</button>'+(isAdmin()?'<span class="sep"></span><button class="link bad" data-action="del-pet" data-id="'+p.id+'">Quitar</button>':'')+'</span></div>';
  }).join('')+'</div>':'<p class="empty">Todavía no tiene mascotas cargadas.</p>';
  var sales=c.sales.length?'<div class="tbl-wrap"><table class="tbl slim"><thead><tr><th>Fecha</th><th>Artículos</th><th>Pago</th><th class="num">Total</th><th><span class="sr-only">Acciones</span></th></tr></thead><tbody>'+c.sales.map(function(s){
    return '<tr class="'+(s.voided?'voided':'')+'"><td>'+fmtDate(s.date)+'</td><td>'+esc(s.summary)+(s.pet?' <small>('+esc(s.pet)+')</small>':'')+'</td><td>'+esc(s.method)+'</td><td class="num">'+(s.voided?'<span class="chip bad">Anulada</span> ':'')+money(s.total)+'</td><td class="act"><button class="link" data-action="sale-view" data-id="'+s.id+'">Ver</button></td></tr>';
  }).join('')+'</tbody></table></div>':'<p class="empty">Todavía no tiene compras registradas a su nombre.</p>';
  var appts=c.appointments.length?'<ul class="plainlist">'+c.appointments.slice(0,15).map(function(a){return '<li>'+fmtDate(a.date)+' '+a.time+' · <b>'+esc(a.pet)+'</b> · '+esc(a.service||'Sin servicio')+(a.staff?' · '+esc(a.staff):'')+' <small>('+esc(APPT_LABEL[a.status])+')</small></li>';}).join('')+'</ul>':'<p class="empty">Sin turnos.</p>';
  return '<button class="btn back" data-action="back-client">← Volver a la lista</button>'+
    '<header class="phead"><div class="avatar big" aria-hidden="true">'+ini(c.name)+'</div><div class="info"><h2>'+esc(c.name)+'</h2><p class="meta">'+contact.join(' · ')+'</p>'+
    (c.address?'<p class="meta">'+esc(c.address)+'</p>':'')+(c.notes?'<p class="meta">Notas: '+esc(c.notes)+'</p>':'')+'</div>'+
    '<div class="pactions"><button class="btn primary" data-action="client-sell">Venderle</button><button class="btn" data-action="add-pet">Agregar mascota</button><button class="btn" data-action="edit-client">Editar datos</button>'+
    (c.phone?'<button class="btn" data-action="wa-client">WhatsApp</button>':'')+(isAdmin()?'<span class="sep"></span><button class="btn danger-o" data-action="del-client">Eliminar</button>':'')+'</div></header>'+
    '<div class="cards">'+card('Compró en total',money(c.totalSpent),plural(c.sales.filter(function(s){return !s.voided;}).length,'compra','compras'))+card('Última compra',c.lastPurchase?fmtDate(c.lastPurchase):'—',c.lastPurchase?'hace '+plural(-diffDays(c.lastPurchase),'día','días'):'')+'</div>'+
    '<section class="sec"><div class="sec-head"><h3>Mascotas ('+c.pets.length+')</h3></div>'+pets+'</section>'+
    '<section class="sec"><div class="sec-head"><h3>Turnos</h3></div>'+appts+'</section>'+
    '<section class="sec"><div class="sec-head"><h3>Compras</h3></div>'+sales+'</section>';
}
function viewClientes(){
  var c=ui.csel&&ui.cdetail&&ui.cdetail.id===ui.csel?ui.cdetail:null;
  var right=ui.csel?(c?clientDetailHTML(c):'<button class="btn back" data-action="back-client">← Volver a la lista</button><div class="skeleton" aria-busy="true"><i></i><i></i></div>'):'<p class="empty">Elegí un cliente para ver sus mascotas, sus compras y sus turnos.</p>';
  return '<section class="pac '+(ui.csel?'show-detail':'')+'"><div class="pac-list">'+
    '<div class="head"><h1>Clientes</h1><button class="btn primary" data-action="new-client">Nuevo cliente</button></div>'+
    '<input id="cliq" type="search" placeholder="Buscar por nombre, teléfono, email o mascota" value="'+esc(ui.cliq)+'" aria-label="Buscar cliente">'+
    '<ul class="plist" id="clist">'+clientListHTML()+'</ul></div><div class="pac-detail">'+right+'</div></section>';
}

/* ============================================================
   Proveedores
   ============================================================ */
function supplierRows(){
  var admin=isAdmin(),q=norm(ui.supq).trim(),qd=ui.supq.replace(/\D/g,'');
  var L=(ui.suppliers||[]).filter(function(s){return !q||norm(s.name+' '+s.phone+' '+s.email+' '+s.description).indexOf(q)>=0||(qd.length>=3&&s.phone.replace(/\D/g,'').indexOf(qd)>=0);});
  var rows=L.map(function(s){
    var name=admin?'<button class="link namebtn" data-action="supplier-view" data-id="'+s.id+'">'+esc(s.name)+'</button>':'<b>'+esc(s.name)+'</b>';
    return '<tr><td>'+name+(s.description?'<small>'+esc(s.description)+'</small>':'')+'</td><td>'+(s.phone?'<a href="tel:'+esc(s.phone.replace(/[^\d+]/g,''))+'">'+esc(s.phone)+'</a>':'')+'</td><td>'+esc(s.email)+'</td><td class="num">'+s.productCount+'</td>'+
      (admin?'<td class="act"><button class="link" data-action="edit-supplier" data-id="'+s.id+'">Editar</button><span class="sep"></span><button class="link bad" data-action="del-supplier" data-id="'+s.id+'">Eliminar</button></td>':'')+'</tr>';
  }).join('');
  var empty=(ui.suppliers||[]).length?'No hay proveedores con esa búsqueda.':admin?'Todavía no cargaste proveedores. Empezá con «Agregar proveedor».':'Todavía no hay proveedores cargados.';
  return rows||'<tr><td colspan="'+(admin?5:4)+'" class="empty">'+empty+'</td></tr>';
}
function viewProveedores(){
  if(!ui.suppliers)return loadingView('Proveedores');
  var admin=isAdmin();
  return '<section class="farm"><div class="head"><h1>Proveedores</h1>'+(admin?'<button class="btn primary" data-action="new-supplier">Agregar proveedor</button>':'')+'</div>'+
    '<input id="supq" type="search" placeholder="Buscar por nombre, teléfono, email o descripción" value="'+esc(ui.supq)+'" aria-label="Buscar proveedor" class="searchbar">'+
    '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Proveedor</th><th>Teléfono</th><th>Email</th><th class="num">Productos</th>'+(admin?'<th><span class="sr-only">Acciones</span></th>':'')+'</tr></thead><tbody id="srows">'+supplierRows()+'</tbody></table></div></section>';
}

/* ============================================================
   Caja (solo el dueño)
   ============================================================ */
function closingPanel(){
  var K=ui.closings;if(!K)return '';
  var today=K.items.find(function(x){return x.date===K.today;});
  var hist=K.items.slice(0,10).map(function(x){
    var d=x.difference;
    return '<tr><td>'+fmtDate(x.date)+'</td><td class="num">'+money(x.expected)+'</td><td class="num">'+money(x.counted)+'</td><td class="num '+(d===0?'':d>0?'in':'out')+'">'+(d>0?'+':'')+money(d)+'</td><td>'+esc(x.note)+'<small>'+esc(x.who)+'</small></td></tr>';
  }).join('');
  return '<section class="panel closing" id="cierre"><h2 class="h3">Cierre de caja de hoy</h2>'+
    '<p>Según el sistema debería haber <b>'+money(K.expected)+'</b> en efectivo.'+(today?' Ya cerraste hoy: contaste '+money(today.counted)+' ('+(today.difference===0?'sin diferencia':'diferencia '+money(today.difference))+'). Podés volver a cerrarla.':'')+'</p>'+
    '<div class="crow"><label>Efectivo contado <input type="number" id="close-counted" min="0" step="0.01" inputmode="decimal"></label><label class="grow">Nota <input id="close-note" maxlength="300" placeholder="Opcional"></label><button class="btn primary" data-action="cash-close">'+(today?'Volver a cerrar':'Cerrar caja')+'</button></div>'+
    (hist?'<details><summary>Cierres anteriores</summary><div class="tbl-wrap"><table class="tbl slim"><thead><tr><th>Día</th><th class="num">Debería haber</th><th class="num">Contado</th><th class="num">Diferencia</th><th>Nota</th></tr></thead><tbody>'+hist+'</tbody></table></div></details>':'')+'</section>';
}
function viewCaja(){
  if(!ui.cash||!S.summary)return loadingView('Caja');
  var sm=S.summary,m=sm.month,bal=m.in-m.out,mes=new Date().toLocaleDateString('es-AR',{month:'long'});
  var nf=(ui.cashp!=='month'?1:0)+(ui.cashf!=='all'?1:0)+(ui.cashm!=='all'?1:0)+(ui.cq?1:0);
  var items=ui.cash.items,shown=items.slice(0,ui.caLimit);
  var rows=shown.map(function(c){
    var act=c.saleId?'<button class="link" data-action="sale-view" data-id="'+c.saleId+'">Ver venta</button>':'<button class="link bad" data-action="del-cash" data-id="'+c.id+'">Eliminar</button>';
    return '<tr><td>'+fmtDate(c.date)+'</td><td><b>'+esc(c.concept)+'</b></td><td>'+esc(c.category)+'</td><td>'+esc(c.method)+'</td><td class="num '+(c.type==='in'?'in':'out')+'">'+(c.type==='in'?'+ ':'− ')+money(c.amount)+'</td><td class="act">'+act+'</td></tr>';
  }).join('');
  var pm=ALL_PAY.map(function(x){return '<div class="bk"><span>'+x+'</span><b>'+money(m.byMethod[x]||0)+'</b></div>';}).join('');
  return '<section class="farm"><div class="head"><h1>Caja</h1></div>'+
    '<div class="summary"><div><small>Ingresos de '+mes+'</small><b>'+money(m.in)+'</b><small>Efectivo '+money(m.efe)+' · Transferencias '+money(m.tra)+' · Tarjetas '+money(m.tar)+'</small></div>'+
    '<div><small>Egresos de '+mes+'</small><b>'+money(m.out)+'</b></div><div><small>Balance</small><b class="'+(bal>=0?'pos':'neg')+'">'+money(bal)+'</b></div></div>'+
    '<div class="cashbox"><div class="panel"><h2 class="h3">Efectivo que debería haber en caja</h2><div class="big'+(sm.drawer<0?' neg':'')+'">'+money(sm.drawer)+'</div>'+
      '<p>Hoy entró '+money(sm.todayCash.in)+' y salió '+money(sm.todayCash.out)+' en efectivo. Si sacás plata de la caja, registrala como gasto en efectivo (categoría «Retiro de caja»).</p></div>'+
    '<div class="panel"><h2 class="h3">Ingresos de '+mes+' por forma de pago</h2><div class="bk-list">'+pm+'</div></div></div>'+closingPanel()+
    '<div class="cashactions"><button class="btn" data-action="cash-export">Exportar CSV</button><span class="grow"></span><button class="btn" data-action="cash-out">Registrar gasto</button><button class="btn primary" data-action="cash-in">Registrar ingreso</button></div>'+
    '<details class="filterpanel" id="cfilters"'+(ui.cfopen?' open':'')+'><summary>Filtros'+(nf?' <span class="badge">'+nf+'</span>':'')+'</summary><div class="fbody">'+
      '<div class="frow"><span class="flabel">Período</span>'+segHTML('cashp',[['today','Hoy'],['month','Este mes'],['prev','Mes anterior'],['all','Todo']],ui.cashp)+rangeHTML('cfrom','cto',ui.cfrom,ui.cto)+'</div>'+
      '<div class="frow"><span class="flabel">Tipo</span>'+segHTML('cashf',[['all','Ingresos y egresos'],['in','Ingresos'],['out','Egresos']],ui.cashf)+'</div>'+
      '<div class="frow"><span class="flabel">Forma de pago</span>'+segHTML('cashm',[['all','Todas'],['Efectivo','Efectivo'],['Transferencia','Transferencias'],['Tarjeta','Tarjetas']],ui.cashm)+'</div>'+
      '<div class="frow"><span class="flabel">Buscar</span><input id="cq" type="search" placeholder="Concepto o categoría" value="'+esc(ui.cq)+'" aria-label="Buscar movimiento"></div>'+
      (nf?'<div class="frow"><button class="link" data-action="cash-clear-filters">Quitar todos los filtros</button></div>':'')+'</div></details>'+
    (rows?'<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Fecha</th><th>Concepto</th><th>Categoría</th><th>Forma de pago</th><th class="num">Monto</th><th><span class="sr-only">Acciones</span></th></tr></thead><tbody>'+rows+'</tbody></table></div>'+moreBtn(shown.length,items.length,'caLimit'):'<p class="empty">No hay movimientos en este período.</p>')+
    (ui.cash.limited?'<p class="note2">Se muestran los últimos 1000 movimientos. Elegí un período más corto para ver el resto.</p>':'')+'</section>';
}

/* ============================================================
   Copias de seguridad, usuarios, actividad y configuración
   ============================================================ */
function usagePanel(){
  var u=ui.usage;if(!u)return '';
  var p=Math.min(100,Math.round(u.bytes/u.limit*100));
  return '<section class="sec"><h2 class="h3">Espacio de la base de datos</h2><p><b>'+fmtBytes(u.bytes)+' de '+fmtBytes(u.limit)+'</b> <small>(plan gratuito; las copias guardadas ocupan '+fmtBytes(u.backupBytes)+')</small></p>'+
    '<div class="meter'+(p>=80?' hot':'')+'" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="'+p+'" aria-label="Espacio usado"><i style="width:'+Math.max(p,1)+'%"></i></div>'+
    (p>=80?'<p class="warnbox">Queda poco espacio. Descargá una copia y borrá copias guardadas viejas, o pasá a un plan pago de la base de datos.</p>':'')+'</section>';
}
function viewBackups(){
  if(!ui.backups)return loadingView('Copias de seguridad');
  var d=lastExportDays(),lastAuto=ui.backups.filter(function(b){return b.auto;})[0];
  var rows=ui.backups.length?ui.backups.map(function(b){
    var c=b.counts||{};
    return '<div class="bk"><div><b>'+esc(b.label)+'</b><br><small>'+fmtTs(b.createdAt)+' · '+plural(c.products||0,'producto','productos')+' · '+plural(c.sales||0,'venta','ventas')+' · '+plural(c.clients||0,'cliente','clientes')+'</small></div>'+
      '<div class="racts"><button class="link" data-action="restore" data-id="'+b.id+'">Restaurar</button><span class="sep"></span><button class="link bad" data-action="del-backup" data-id="'+b.id+'">Eliminar</button></div></div>';
  }).join(''):'<p class="empty">Todavía no hay copias guardadas.</p>';
  return '<section class="farm"><div class="head"><h1>Copias de seguridad</h1></div>'+
    '<p class="warnbox">La base de datos gratuita no incluye copias propias. Por eso el sistema guarda una copia por día dentro de la misma base (te sirve si borrás algo por error), pero <b>si se perdiera la base, esas copias también se pierden</b>. Descargá un archivo a tu computadora o a un pendrive, <b>por lo menos una vez por semana</b>: el sistema te lo recuerda en el Resumen.'+
    (d===null?' Todavía no descargaste ninguno desde esta computadora.':' La última descarga desde esta computadora fue hace '+plural(d,'día','días')+'.')+'</p>'+
    '<div class="cashbox" style="margin-top:1rem"><div class="panel"><h2 class="h3">Copia automática diaria</h2><p>'+(lastAuto?'Última: '+fmtTs(lastAuto.createdAt)+'.':'Todavía no se hizo ninguna.')+' Se hace sola una vez por día y se conservan las últimas 7.</p></div>'+
    '<div class="panel"><h2 class="h3">Archivo y copias manuales</h2><div class="filerow"><button class="btn primary" data-action="backup-download" data-v="gz">Descargar copia comprimida</button><button class="btn" data-action="backup-download" data-v="json">Descargar en JSON</button><button class="btn" data-action="backup-now">Crear copia ahora</button><button class="btn" data-action="pick-file">Cargar desde archivo</button><input id="bfile" type="file" accept=".json,.gz,application/json,application/gzip" hidden></div>'+
    '<p>La copia comprimida (.json.gz) pesa mucho menos. Para comprobar que tus copias sirven, seguí la «prueba de restauración» del README una vez por mes.</p></div></div>'+
    usagePanel()+'<section class="sec"><h2 class="h3">Copias guardadas en el sistema</h2><div class="bk-list">'+rows+'</div></section></section>';
}
function viewUsers(){
  var tabs='<div class="tabs" role="tablist"><button class="tab" role="tab" data-action="utab" data-v="users" aria-selected="'+(ui.utab==='users')+'">Usuarios</button><button class="tab" role="tab" data-action="utab" data-v="actividad" aria-selected="'+(ui.utab==='actividad')+'">Actividad</button></div>';
  if(ui.utab==='actividad')return '<section class="farm"><div class="head"><h1>Usuarios y actividad</h1></div>'+tabs+auditHTML()+'</section>';
  if(!ui.users)return loadingView('Usuarios y actividad');
  var rows=ui.users.map(function(u){
    return '<tr><td><b>'+esc(u.name)+'</b><small>'+esc(u.email)+'</small></td><td>'+(u.role==='admin'?'Dueño / administrador':'Empleado')+'</td><td>'+(u.active?'<span class="chip ok">Activo</span>':'<span class="chip none">Desactivado</span>')+'</td><td class="act"><button class="link" data-action="edit-user" data-id="'+u.id+'">Editar</button></td></tr>';
  }).join('');
  return '<section class="farm"><div class="head"><h1>Usuarios y actividad</h1><button class="btn primary" data-action="new-user">Nuevo usuario</button></div>'+tabs+
    '<p class="note2">El dueño ve todo. El empleado vende (al precio de lista), ingresa mercadería, abre bolsas y maneja la agenda y los clientes, pero no ve costos, ganancias, caja, copias ni usuarios, y no puede cambiar precios ni anular ventas. El sistema lo controla en el servidor, no solo en la pantalla.</p>'+
    '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Usuario</th><th>Rol</th><th>Estado</th><th><span class="sr-only">Acciones</span></th></tr></thead><tbody>'+rows+'</tbody></table></div></section>';
}
function auditHTML(){
  var A=ui.audit;
  if(!A)return '<div class="skeleton" aria-busy="true"><i></i><i></i></div>';
  var users=(ui.users||[]).map(function(u){return '<option value="'+u.id+'"'+(String(ui.auser)===String(u.id)?' selected':'')+'>'+esc(u.name)+'</option>';}).join('');
  var acts=A.actions.map(function(a){return '<option'+(ui.aaction===a?' selected':'')+'>'+esc(a)+'</option>';}).join('');
  var show=function(o){if(!o)return '';return Object.keys(o).map(function(k){var v=o[k];return esc(k)+': '+esc(typeof v==='object'?JSON.stringify(v):v);}).join(' · ');};
  var rows=A.items.map(function(x){
    return '<tr><td>'+fmtTs(x.at)+'</td><td>'+esc(x.user||'—')+'</td><td><b>'+esc(x.action)+'</b><small>'+esc(x.entity)+(x.entityId?' #'+x.entityId:'')+'</small></td><td class="auditd">'+(x.before?'<small>Antes: '+show(x.before)+'</small>':'')+(x.after?'<small>Después: '+show(x.after)+'</small>':'')+'</td><td>'+esc(x.reason)+'</td></tr>';
  }).join('');
  return '<p class="note2">Registro de solo lectura de las acciones sensibles: cambios de precio, anulaciones, stock, caja, cierres, usuarios y configuración.</p>'+
    '<div class="toolbar">'+rangeHTML('afrom','ato',ui.afrom,ui.ato)+'<label class="inl">Usuario <select id="auser"><option value="">Todos</option>'+users+'</select></label><label class="inl">Acción <select id="aaction"><option value="">Todas</option>'+acts+'</select></label></div>'+
    (rows?'<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Fecha y hora</th><th>Usuario</th><th>Acción</th><th>Detalle</th><th>Motivo</th></tr></thead><tbody>'+rows+'</tbody></table></div>':'<p class="empty">No hay actividad con esos filtros.</p>');
}
function render(){
  if(!S.user)return;
  var adminOnly={caja:1,copias:1,usuarios:1};
  if(adminOnly[ui.view]&&!isAdmin())ui.view='vender';
  if(ui.view!=='vender'&&stripScanner){stripScanner.stop();stripScanner=null;}
  if(ui.view==='vender'&&stripScanner&&stripScanner.box.parentNode)stripScanner.box.parentNode.removeChild(stripScanner.box);
  renderNav();renderAlerts();renderUserBox();
  var v=ui.view;
  main.innerHTML=v==='resumen'?viewResumen():v==='vender'?viewVender():v==='ventas'?viewVentas():v==='stock'?viewStock():v==='servicios'?viewServicios():
    v==='agenda'?viewAgenda():v==='clientes'?viewClientes():v==='proveedores'?viewProveedores():v==='caja'?viewCaja():v==='copias'?viewBackups():viewUsers();
  labelTables();
  if(v==='vender'){mountStrip();saveDraft();if(ui.draftNote){ui.draftNote=false;toast('Recuperamos tu venta en curso.');}}
}
// En pantallas angostas las tablas se muestran como tarjetas: cada celda lleva el nombre de su columna.
function labelTables(){
  main.querySelectorAll('table.tbl').forEach(function(t){
    var heads=Array.prototype.map.call(t.querySelectorAll('thead th'),function(th){return th.textContent.replace(/[▲▼]/g,'').trim();});
    if(!heads.length)return;
    t.querySelectorAll('tbody tr').forEach(function(tr){Array.prototype.forEach.call(tr.children,function(td,i){if(heads[i]&&!td.hasAttribute('colspan'))td.setAttribute('data-label',heads[i]);});});
  });
}

/* ============================================================
   Formularios
   ============================================================ */
var supplierOpts=function(){return [['','Sin proveedor']].concat((S.suppliers||[]).map(function(x){return [x.id,x.name];}));};
var qtyStep=function(unit){return unit==='kg'?'0.001':'1';};
// Si un egreso en efectivo deja la caja en negativo, se avisa antes de guardar.
async function confirmNegativeCash(amount,method){
  if(method!=='Efectivo'||!S.summary||!(amount>0))return true;
  var after=r2(S.summary.drawer-amount);
  if(after>=0)return true;
  var ch=await choiceDialog('La caja queda en negativo','<p>Con este egreso la caja queda en <b>'+money(after)+'</b>. ¿Lo pagaste con otro fondo?</p>',
    [{label:'Cambiar forma de pago',value:'change',cls:'ghost'},{label:'Continuar igual',value:'go',cls:'primary'}]);
  return ch==='go';
}
function addPreview(f,fn){
  var box=document.createElement('p');box.className='preview';box.setAttribute('aria-live','polite');
  f.querySelector('.fields').insertAdjacentElement('afterend',box);
  var sync=function(){var r=fn();box.innerHTML=r&&r.html!=null?r.html:(r||'');box.classList.toggle('negtxt',!!(r&&r.bad));};
  f.addEventListener('input',sync);f.addEventListener('change',sync);sync();
}

function productForm(x,preset,then){
  var admin=isAdmin(),isNew=!x;
  x=x||Object.assign({category:'Alimento balanceado',unit:'u',min:2,price:'',cost:'',barcodes:[]},preset||{});
  var codes=(x.barcodes&&x.barcodes.length?x.barcodes:x.barcode?[x.barcode]:[]);
  var looseOpts=[['','No se abre para vender suelto']].concat(S.products.filter(function(p){return p.unit==='kg'&&(!x.id||p.id!==x.id);}).map(function(p){return [p.id,prodLabel(p)];}));
  var pf=openForm({title:isNew?'Nuevo producto':'Editar '+esc(x.name),
    body:'<div class="fields">'+fld('Nombre','name',{value:x.name,req:true,full:true,ph:'Ej.: Alimento perro adulto 15 kg'})+
      fld('Marca','brand',{value:x.brand,ph:'Ej.: Royal Canin',maxlength:100})+fld('Categoría','category',{opts:PROD_CATS,value:x.category})+
      fld('Para','species',{opts:SPECIES_OPTS,value:x.species})+fld('Se vende','unit',{opts:UNIT_OPTS,value:x.unit})+
      fld('Precio de venta','price',{type:'number',min:0,step:'0.01',value:x.price,req:true,inputmode:'decimal'})+
      (admin?fld('Costo (lo que te cuesta)','cost',{type:'number',min:0,step:'0.01',value:x.cost||'',inputmode:'decimal'}):'')+
      fld('Código de barras principal','barcode',{value:codes[0]||'',full:true,ph:'Escribilo, escanealo o pasalo con el lector',pattern:'[0-9A-Za-z._\\-\\s]{4,64}',title:'Entre 4 y 64 caracteres: letras, números, punto y guion',inputmode:'numeric'})+
      fld('Stock mínimo (para avisar)','min',{type:'number',min:0,step:qtyStep(x.unit),value:x.min,req:true})+
      fld('Vencimiento (opcional)','expires',{type:'date',value:x.expires})+
      fld('Proveedor habitual','supplierId',{opts:supplierOpts(),value:x.supplierId,full:true})+
      (isNew?fld('Stock inicial','stock',{type:'number',min:0,step:qtyStep(x.unit),value:0,req:true})+(admin?fld('Forma de pago','method',{opts:PAY(),value:'Transferencia'})+
        fld('Registrar la compra del stock inicial como egreso en caja','cash',{type:'checkbox',value:false,full:true}):''):'')+
      '<fieldset class="full bagset"><legend>Bolsa que se abre para vender suelto (opcional)</legend><div class="fields">'+
        fld('Kilos que trae la bolsa','packKg',{type:'number',min:0.001,step:'0.001',value:x.packKg||'',ph:'Ej.: 15'})+fld('Producto suelto (por kilo)','looseId',{opts:looseOpts,value:x.looseId})+'</div></fieldset>'+
    '</div>'+(isNew?'':'<p>Para cambiar la cantidad usá el botón + (llegó mercadería) o «Ajustar stock».</p>'),
    submit:isNew?'Agregar producto':'Guardar cambios',
    onSubmit:async function(d){
      if(!(Number(d.price)>0)&&!x.isGift)throw new Error('El precio de venta no puede ser $ 0.');
      var body={name:d.name,brand:d.brand,category:d.category,species:d.species,unit:d.unit,price:d.price,min:d.min,barcode:normCode(d.barcode),
        barcodes:codes.slice(1),expires:d.expires,supplierId:d.supplierId||null,isGift:!!x.isGift,
        packKg:d.unit==='u'?d.packKg:'',looseId:d.unit==='u'&&d.looseId?Number(d.looseId):null};
      if(admin)body.cost=d.cost;
      if(d.expires&&diffDays(d.expires)<0){
        var ch=await choiceDialog('Producto vencido','<p>El vencimiento que cargaste ('+fmtDate(d.expires)+') ya pasó: <b>este producto ya está vencido</b>. ¿Lo guardás igual?</p>',[{label:'Corregir la fecha',value:null,cls:'ghost'},{label:'Guardar igual',value:'ok',cls:'primary'}]);
        if(ch!=='ok')return false;
      }
      var r;
      if(isNew){
        body.stock=d.stock;body.method=d.method;body.cash=!!d.cash;
        if(d.cash&&!(await confirmNegativeCash(Number(d.stock)*Number(d.cost),d.method)))return false;
        r=await apiConfirm('/products',{body:body});await reload();toast('Producto agregado');
        if(then)then(prodById(r.id));
      }else{await apiConfirm('/products/'+x.id,{method:'PUT',body:body});await reload();toast('Producto guardado');}
    }});
  var unitSel=pf.querySelector('[name="unit"]'),bagset=pf.querySelector('.bagset');
  var syncUnit=function(){var st=qtyStep(unitSel.value);pf.querySelectorAll('[name="min"],[name="stock"]').forEach(function(i){i.step=st;});bagset.hidden=unitSel.value!=='u';};
  unitSel.addEventListener('change',syncUnit);syncUnit();
  // Margen en vivo y aviso de pérdida (solo el dueño ve el costo).
  addPreview(pf,function(){
    var p=Number(pf.querySelector('[name="price"]').value),co=pf.querySelector('[name="cost"]'),c=co?Number(co.value):0,gift=!!x.isGift,per=unitSel.value==='kg'?'kilo':'unidad';
    if(!(p>0))return gift?'Regalo/promoción: se puede vender a $ 0.':{html:'El precio de venta no puede ser $ 0 (salvo regalo/promoción).',bad:true};
    if(c>0&&p<c)return {html:'Con este precio perdés '+money(c-p)+' por '+per+' (margen '+pct((p-c)/p*100)+').',bad:true};
    if(c>0)return 'Ganás '+money(p-c)+' por '+per+' · margen '+pct((p-c)/p*100)+'.';
    return admin?'Cargá el costo para ver tu margen.':'';
  });
  var ex=pf.querySelector('[name="expires"]'),exHint=document.createElement('small');exHint.className='negtxt';ex.insertAdjacentElement('afterend',exHint);
  var syncEx=function(){exHint.textContent=ex.value&&diffDays(ex.value)<0?'Este producto ya está vencido.':'';};ex.addEventListener('change',syncEx);syncEx();
  // El lector USB termina con Enter: en el campo del código no tiene que enviar el formulario.
  var bcIn=pf.querySelector('[name="barcode"]');
  bcIn.addEventListener('keydown',function(e){if(e.key==='Enter'){e.preventDefault();bcIn.value=normCode(bcIn.value);}});
  var row=document.createElement('div');row.className='withbtn';
  bcIn.parentNode.insertBefore(row,bcIn);row.appendChild(bcIn);
  var sb=document.createElement('button');sb.type='button';sb.className='btn';sb.textContent='Escanear';row.appendChild(sb);
  sb.addEventListener('click',async function(){
    var code=await openScanner('Escanear el código del producto');
    if(!code)return;
    code=normCode(code);
    var other=prodByBarcode(code);
    if(other&&(isNew||other.id!==x.id)){pf.querySelector('.err').textContent='Ese código ya pertenece al producto «'+other.name+'».';return;}
    pf.querySelector('.err').textContent='';
    if(!bcIn.value)bcIn.value=code;else{codes.push(code);toast('Código agregado al producto.');}
  });
}
// Llegó mercadería. El empleado solo suma la cantidad (y el vencimiento); el costo y la caja son del dueño.
function buyForm(x){
  var admin=isAdmin();
  var f=openForm({title:'Llegó mercadería: '+esc(x.name),
    body:'<div class="fields">'+fld('Cantidad que llegó'+(x.unit==='kg'?' (kg)':''),'qty',{type:'number',min:qtyStep(x.unit),step:qtyStep(x.unit),value:1,req:true,inputmode:'decimal'})+
      (admin?fld('Precio de compra por '+(x.unit==='kg'?'kilo':'unidad'),'unitPrice',{type:'number',min:0.01,step:'0.01',value:x.cost||'',inputmode:'decimal'})+
        fld('Forma de pago','method',{opts:PAY(),value:'Transferencia'})+fld('Fecha','date',{type:'date',value:todayIso(),max:todayIso(),req:true})+
        fld('Proveedor','supplierId',{opts:supplierOpts(),value:x.supplierId}):'')+
      fld('Vencimiento de este lote (opcional)','expires',{type:'date'})+
      (admin?fld('Registrar como egreso en caja','cash',{type:'checkbox',value:true,full:true}):'')+'</div><p>Stock actual: '+fmtQty(x.stock,x.unit)+'.'+(admin?' El precio de compra pasa a ser el costo del producto.':'')+'</p>',
    submit:'Agregar al stock',
    onSubmit:async function(d){
      var body={qty:d.qty,expires:d.expires};
      if(admin){
        if(d.cash&&!(Number(d.unitPrice)>0))throw new Error('Escribí el precio de compra para registrar el egreso en caja (o destildá «Registrar como egreso en caja»).');
        var cost=r2(Number(d.qty)*Number(d.unitPrice||0));
        if(d.cash&&!(await confirmNegativeCash(cost,d.method)))return false;
        Object.assign(body,{unitPrice:d.unitPrice||'',method:d.method,date:d.date,cash:!!d.cash,supplierId:d.supplierId||null});
      }
      var r=await api('/products/'+x.id+'/purchase',{body:body});
      await reload();
      toast('Se agregaron '+fmtQty(Number(d.qty),x.unit)+' al stock'+(r.cost>0&&d.cash?' · egreso de '+money(r.cost):'')+(r.costChanged?' · nuevo costo '+money(r.costChanged.after)+' (margen '+pct(r.costChanged.margin)+')':''));
    }});
  if(admin)addPreview(f,function(){var n=Number(f.querySelector('[name="qty"]').value),p=Number(f.querySelector('[name="unitPrice"]').value);return n>0&&p>0?'Total de la compra: '+money(r2(n*p)):'';});
}
function movementsDialog(x){
  infoDialog('Historial de '+esc(x.name),'<div class="skeleton" aria-busy="true"><i></i><i></i></div>');
  api('/products/'+x.id+'/movements').then(function(r){
    if(!dlg.open)return;
    var rows=r.items.map(function(m){
      return '<tr class="'+(m.voided?'voided':'')+'"><td>'+fmtDate(m.date)+'</td><td>'+esc(m.reason)+(m.saleNumber?' <small>(venta N° '+m.saleNumber+')</small>':'')+(m.note?'<small>'+esc(m.note)+'</small>':'')+(m.who?'<small>'+esc(m.who)+'</small>':'')+'</td><td class="num '+(m.qty<0?'out':'in')+'">'+(m.qty>0?'+':'')+fmtQty(m.qty,x.unit)+'</td>'+
        '<td class="num">'+(m.unitPrice>0?money(m.unitPrice):'—')+'</td><td class="num">'+(m.unitPrice>0?money(m.unitPrice*Math.abs(m.qty)):'—')+'</td></tr>';
    }).join('');
    var p=dlg.querySelector('.skeleton');
    if(p)p.outerHTML='<div class="tbl-wrap"><table class="tbl slim"><thead><tr><th>Fecha</th><th>Motivo</th><th class="num">Cantidad</th><th class="num">Precio</th><th class="num">Total</th></tr></thead><tbody>'+
      (rows||'<tr><td colspan="5" class="empty">Todavía no hay movimientos.</td></tr>')+'</tbody></table></div>';
    labelDialogTables();
  }).catch(function(e){if(dlg.open)toast(e.message,true);});
}
function labelDialogTables(){var m=main;main=dlg;try{labelTables();}finally{main=m;}}
function adjustForm(x){
  openForm({title:'Ajustar stock de '+esc(x.name),
    body:'<div class="fields">'+fld('Cantidad a sumar o restar','delta',{type:'number',step:qtyStep(x.unit),req:true,ph:'Ej.: -2 para restar 2',full:true})+
      fld('Motivo','reason',{opts:ADJUST_REASONS,full:true})+fld('Nota (opcional)','note',{full:true,ph:'Ej.: se rompió la bolsa'})+'</div>'+
      '<p>Stock actual: '+fmtQty(x.stock,x.unit)+'. Sirve para corregir el stock (roturas, vencidos, lo que se usa en la peluquería). No modifica la caja y queda en el registro de actividad.</p>',
    submit:'Ajustar stock',
    onSubmit:async function(d){await api('/products/'+x.id+'/adjust',{body:{delta:d.delta,reason:d.reason,note:d.note}});await reload();toast('Stock ajustado');}});
}
// Venta rápida de un producto (botón "Vender" del stock): cantidad y forma de pago, y listo.
function sellForm(x){
  if(!x)return;
  if(x.stock<=0){toast('No queda stock de '+x.name+'.',true);return;}
  if(expired(x)&&!isAdmin()){toast(x.name+' está vencido y no se puede vender. Avisale al dueño.',true);return;}
  var key=uid();
  var f=openForm({title:'Vender '+esc(x.name),
    body:'<div class="fields">'+fld('Cantidad'+(x.unit==='kg'?' (kg)':''),'qty',{type:'number',min:qtyStep(x.unit),max:x.stock,step:qtyStep(x.unit),value:1,req:true,inputmode:'decimal'})+
      fld('Forma de pago','method',{opts:PAY(),value:PAY()[0]})+'</div><p>Precio: '+money(x.price)+(x.unit==='kg'?' por kilo':' c/u')+'. Quedan '+fmtQty(x.stock,x.unit)+'.</p>'+
      '<p><button type="button" class="link" data-x="tocart">Agregar al carrito para vender varias cosas juntas →</button></p>',
    submit:'Registrar venta',
    onSubmit:async function(d){
      var r=await apiConfirm('/sales',{body:{idemKey:key,method:d.method,items:[{type:'product',id:x.id,qty:d.qty}]}});
      await reload();saleDoneDialog(r.id,r.number,r.total,r.lossLines);return false;
    }});
  addPreview(f,function(){var n=Number(f.querySelector('[name="qty"]').value);return n>0?'Total: '+money(r2(n*x.price)):'';});
  f.querySelector('[data-x="tocart"]').addEventListener('click',function(){var q=Number(f.querySelector('[name="qty"]').value)||1;addToCart('product',x.id,q);dlg.close();go('vender');});
}
function openBagForm(x){
  var loose=prodById(x.looseId);
  if(!loose){toast('El producto suelto de esta bolsa ya no existe. Revisalo en «Editar».',true);return;}
  var f=openForm({title:'Abrir bolsa de '+esc(x.name),
    body:'<div class="fields">'+fld('Cantidad de bolsas a abrir','bags',{type:'number',min:1,max:x.stock,step:'1',value:1,req:true,full:true})+'</div>'+
      '<p>Cada bolsa trae '+fmtQty(x.packKg,'kg')+'. Se restan del stock de «'+esc(x.name)+'» (quedan '+fmtQty(x.stock,x.unit)+') y se suman a «'+esc(loose.name)+'» (hay '+fmtQty(loose.stock,'kg')+').</p>',
    submit:'Abrir bolsa',
    onSubmit:async function(d){var r=await api('/products/'+x.id+'/open-bag',{body:{bags:d.bags}});await reload();toast('Se sumaron '+fmtQty(r.kg,'kg')+' a '+r.loose);}});
  addPreview(f,function(){var b=Number(f.querySelector('[name="bags"]').value);return b>0?'Pasan '+fmtQty(r3(b*x.packKg),'kg')+' al suelto':'';});
}
function bulkPriceForm(){
  var brands=[];S.products.forEach(function(p){if(p.brand&&brands.indexOf(p.brand)<0)brands.push(p.brand);});brands.sort(collator.compare);
  var f=openForm({title:'Actualizar precios',
    body:'<div class="fields">'+fld('Aplicar a','scope',{opts:[['all','Todos los productos'],['category','Una categoría'],['brand','Una marca'],['supplier','Un proveedor']],full:true})+
      fld('Categoría','vcat',{opts:PROD_CATS})+fld('Marca','vbrand',{opts:brands.length?brands:[['','No hay marcas cargadas']]})+fld('Proveedor','vsup',{opts:(S.suppliers||[]).map(function(s){return [s.id,s.name];})})+
      fld('Porcentaje','percent',{type:'number',step:'0.1',min:-90,max:1000,req:true,ph:'Ej.: 10 para subir 10 %, -5 para bajar'})+
      fld('Redondear a','round',{opts:[['0','Sin redondeo'],['10','$ 10'],['50','$ 50'],['100','$ 100']],value:'10'})+'</div>',
    submit:'Actualizar precios',
    onSubmit:async function(d){
      var v=d.scope==='category'?d.vcat:d.scope==='brand'?d.vbrand:d.scope==='supplier'?d.vsup:'';
      if(d.scope!=='all'&&!v)throw new Error('Elegí a qué productos aplicarlo.');
      var r=await api('/products/bulk-price',{body:{scope:d.scope,value:v,percent:d.percent,round:Number(d.round)}});
      await reload();toast('Precios actualizados: '+plural(r.updated,'producto','productos'));
    }});
  var sc=f.querySelector('[name="scope"]'),labs={vcat:'category',vbrand:'brand',vsup:'supplier'};
  var match=function(){var s=sc.value;return S.products.filter(function(p){if(p.isGift)return false;if(s==='category')return p.category===f.querySelector('[name="vcat"]').value;if(s==='brand')return norm(p.brand)===norm(f.querySelector('[name="vbrand"]').value);if(s==='supplier')return String(p.supplierId)===f.querySelector('[name="vsup"]').value;return true;});};
  addPreview(f,function(){
    Object.keys(labs).forEach(function(k){f.querySelector('[name="'+k+'"]').closest('label').hidden=sc.value!==labs[k];});
    var L=match(),p=Number(f.querySelector('[name="percent"]').value),rd=Number(f.querySelector('[name="round"]').value);
    if(!p)return plural(L.length,'producto','productos')+' afectados.';
    var ex=L[0],nv=ex?(rd?Math.max(Math.round(ex.price*(1+p/100)/rd)*rd,0):r2(ex.price*(1+p/100))):0;
    return plural(L.length,'producto','productos')+' afectados.'+(ex?' Ejemplo: '+ex.name+' pasa de '+money(ex.price)+' a '+money(nv)+'.':'');
  });
}
function serviceForm(s){
  var isNew=!s;s=s||{category:'Baño',price:'',duration:60};
  openForm({title:isNew?'Nuevo servicio':'Editar servicio',
    body:'<div class="fields">'+fld('Servicio','name',{value:s.name,req:true,full:true,ph:'Ej.: Baño y corte perro mediano'})+fld('Categoría','category',{opts:SERV_CATS,value:s.category})+
      fld('Precio','price',{type:'number',min:0,step:'0.01',value:s.price,req:true,inputmode:'decimal'})+fld('Duración aproximada (minutos)','duration',{type:'number',min:5,max:600,step:'5',value:s.duration,req:true})+'</div>',
    submit:isNew?'Agregar servicio':'Guardar cambios',
    onSubmit:async function(d){
      var body={name:d.name,category:d.category,price:d.price,duration:d.duration};
      if(isNew&&S.services.some(function(x){return norm(x.name).trim()===norm(d.name).trim();})){
        var ch=await choiceDialog('Posible duplicado','<p>Ya existe un servicio llamado «'+esc(d.name)+'». ¿Lo creás igual?</p>',[{label:'Volver',value:null,cls:'ghost'},{label:'Crear igual',value:'ok',cls:'primary'}]);
        if(ch!=='ok')return false;
      }
      if(isNew)await api('/services',{body:body});else await api('/services/'+s.id,{method:'PUT',body:body});
      await reload();toast(isNew?'Servicio agregado':'Servicio guardado');
    }});
}
function petFields(p){
  p=p||{species:'Perro'};
  return fld('Nombre de la mascota','pname',{value:p.name,maxlength:100})+fld('Especie','pspecies',{opts:PET_SPECIES,value:p.species})+fld('Tamaño','psize',{opts:PET_SIZES,value:p.size==='Gigante'?'Grande':(p.size||'Mediano')})+
    fld('Raza','pbreed',{value:p.breed,ph:'Ej.: Caniche',maxlength:100})+fld('Fecha de nacimiento (aprox.)','pbirth',{type:'date',value:p.birth,max:todayIso()})+
    fld('Notas','pnotes',{type:'textarea',value:p.notes,full:true,ph:'Ej.: corte a tijera, se pone nervioso con el secador, alergia a un shampoo'});
}
var petBody=function(d){return {name:d.pname,species:d.pspecies,size:d.psize,breed:d.pbreed,birth:d.pbirth,notes:d.pnotes};};
function clientForm(c){
  var isNew=!c;c=c||{};
  openForm({title:isNew?'Nuevo cliente':'Editar datos de '+esc(c.name),
    body:'<div class="fields">'+fld('Nombre','firstName',{value:c.firstName,req:true,maxlength:100})+fld('Apellido','lastName',{value:c.lastName,maxlength:100})+
      fld('Teléfono','phone',{type:'tel',value:c.phone,pattern:PHONE_PAT,title:'Solo números, espacios, + , - y paréntesis (mínimo 6 dígitos)',inputmode:'tel'})+fld('Email','email',{type:'email',value:c.email,maxlength:150})+
      fld('Dirección','address',{value:c.address,full:true,maxlength:200})+fld('Notas','notes',{type:'textarea',value:c.notes,full:true,ph:'Ej.: compra alimento cada mes'})+'</div>'+
      (isNew?'<fieldset class="petset"><legend>Primera mascota (opcional)</legend><div class="fields">'+petFields()+'</div></fieldset>':''),
    submit:isNew?'Agregar cliente':'Guardar cambios',
    onSubmit:async function(d){
      var body={firstName:d.firstName,lastName:d.lastName,phone:d.phone,email:d.email,address:d.address,notes:d.notes};
      if(isNew){
        var full=norm((d.firstName+' '+d.lastName).trim());
        if(S.clients.some(function(x){return norm(x.name)===full;})){
          var ch=await choiceDialog('Posible duplicado','<p>Ya existe un cliente llamado «'+esc((d.firstName+' '+d.lastName).trim())+'». ¿Lo creás igual?</p>',[{label:'Volver',value:null,cls:'ghost'},{label:'Crear igual',value:'ok',cls:'primary'}]);
          if(ch!=='ok')return false;
        }
        if(d.pname)body.pet=petBody(d);
        var r=await api('/clients',{body:body});
        if(ui.view==='clientes'){ui.csel=r.id;ui.cdetail=null;}
      }else await api('/clients/'+c.id,{method:'PUT',body:body});
      await reload();toast(isNew?'Cliente agregado':'Cliente guardado');
    }});
}
function petForm(p,clientId){
  var isNew=!p;
  var cOpts=S.clients.map(function(x){return [x.id,x.name];});
  openForm({title:isNew?'Nueva mascota':'Editar a '+esc(p.name),
    body:'<div class="fields">'+(isNew?'':fld('Cliente (dueño)','clientId',{opts:cOpts,value:p.clientId,full:true}))+petFields(p)+'</div>',
    submit:isNew?'Agregar mascota':'Guardar cambios',
    onSubmit:async function(d){
      if(!d.pname)throw new Error('Completá «Nombre de la mascota».');
      var body=petBody(d);
      if(isNew)await api('/clients/'+clientId+'/pets',{body:body});
      else{body.clientId=Number(d.clientId);await api('/pets/'+p.id,{method:'PUT',body:body});}
      await reload();toast(isNew?'Mascota agregada':'Mascota guardada');
    }});
}
// Mensaje de WhatsApp prearmado y editable.
function waDialog(name,phone,text){
  var link=waLink(phone);
  if(!link){toast('Este cliente no tiene un teléfono válido.',true);return;}
  infoDialog('Escribirle a '+esc(name),'<label class="fld"><span>Mensaje (lo podés cambiar)</span><textarea id="watext" rows="5" maxlength="1000">'+esc(text)+'</textarea></label>',[
    {label:'Abrir WhatsApp',cls:'primary',fn:function(){window.open(link+'?text='+encodeURIComponent($('#watext').value),'_blank','noopener');}},
  ]);
}

/* ---------- Turnos ---------- */
function appointmentForm(a,presetDate,presetPet,presetTime){
  var isNew=!a;
  var pets=[];S.clients.forEach(function(c){c.pets.forEach(function(p){pets.push([p.id,p.name+' ('+c.name+')']);});});
  if(!pets.length){toast('Primero cargá un cliente con su mascota en «Clientes».',true);return;}
  pets.sort(function(x,y){return collator.compare(x[1],y[1]);});
  a=a||{date:presetDate||todayIso(),time:presetTime||'10:00',duration:60,status:'reservado',petId:presetPet||'',staff:''};
  var svOpts=[['','Sin servicio definido']].concat(S.services.map(function(s){return [s.id,s.name+' · '+money(s.price)];}));
  var f=openForm({title:isNew?'Nuevo turno':'Editar turno',
    body:'<div class="fields">'+fld('Mascota','petId',{opts:pets,value:a.petId,full:true,req:true})+fld('Servicio','serviceId',{opts:svOpts,value:a.serviceId,full:true})+
      fld('Fecha','date',{type:'date',value:a.date,req:true})+fld('Hora','time',{type:'time',value:a.time,req:true,step:'300'})+
      fld('Duración (minutos)','duration',{type:'number',min:5,max:600,step:'5',value:a.duration,req:true})+fld('Estado','status',{opts:APPT_FORM_STATUS.concat(APPT_FORM_STATUS.some(function(x){return x[0]===a.status;})?[]:[[a.status,APPT_LABEL[a.status]||a.status]]),value:a.status})+
      fld('Asignar personal (opcional)','staff',{value:a.staff,list:'stafflist',maxlength:60,ph:'Ej.: Ana'})+
      fld('Notas (opcional)','notes',{type:'textarea',value:a.notes,full:true,ph:'Ej.: lo trae a las 10 y lo retira a las 13'})+'</div>'+
      '<datalist id="stafflist">'+(ui.staffNames||[]).map(function(n){return '<option value="'+esc(n)+'">';}).join('')+'</datalist>',
    submit:isNew?'Agendar turno':'Guardar cambios',
    onSubmit:async function(d){
      var body={petId:Number(d.petId),serviceId:d.serviceId?Number(d.serviceId):null,date:d.date,time:d.time,duration:Number(d.duration),status:d.status,notes:d.notes,staff:d.staff};
      if(isNew)await apiConfirm('/appointments',{body:body});else await apiConfirm('/appointments/'+a.id,{method:'PUT',body:body});
      if(ui.view==='agenda')await reloadCal();else await reload();
      toast(isNew?'Turno agendado':'Turno guardado');
    }});
  f.querySelector('[name="serviceId"]').addEventListener('change',function(e){var s=servById(e.target.value);if(s)f.querySelector('[name="duration"]').value=s.duration;});
}
async function setApptStatus(a,status){
  // El estado que se muestra es el que devolvió el servidor, no el que se pidió.
  var r=await api('/appointments/'+a.id+'/status',{body:{status:status}});
  status=(r&&r.status)||status;
  dlg.close();await reloadCal();
  // Al terminar un turno sin cobrar, se ofrece cobrarlo.
  if((status==='listo'||status==='entregado')&&!a.saleId){
    var ch=await choiceDialog(esc(a.pet)+': '+esc(APPT_LABEL[status]),'<p>¿Querés cobrar el servicio ahora?</p>',[{label:'Más tarde',value:null,cls:'ghost'},{label:'Cobrar'+(a.servicePrice!=null?' '+money(a.servicePrice):''),value:'ok',cls:'primary'}]);
    if(ch==='ok')chargeAppt(a);
  }else toast('Turno: '+APPT_LABEL[status]);
}
// Cobrar un turno: arma la venta con el servicio, el cliente y la mascota, y lleva a "Vender".
function chargeAppt(a){
  resetCart();
  if(a.serviceId&&servById(a.serviceId))addToCart('service',a.serviceId,1);
  ui.cart.clientId=String(a.clientId);ui.cart.petId=String(a.petId);ui.cart.apptId=a.id;
  if(dlg.open)dlg.close();go('vender');
}
function appointmentDetails(a){
  var tel=String(a.phone||'').replace(/[^\d+]/g,'');
  var open=a.status==='reservado'||a.status==='confirmado'||a.status==='en_curso';
  var btns=[];
  if(a.status==='reservado')btns.push({label:'Confirmar turno',cls:'primary',fn:function(){return setApptStatus(a,'confirmado');}});
  if(open)btns.push({label:'Listo para retirar',fn:function(){return setApptStatus(a,'listo');}});
  if(!a.saleId&&a.status!=='cancelado'&&a.status!=='no_vino')btns.push({label:'Cobrar'+(a.servicePrice!=null?' '+money(a.servicePrice):''),cls:a.status==='reservado'?'':'primary',fn:function(){chargeAppt(a);}});
  if(open)btns.push({label:'No vino',fn:function(){return setApptStatus(a,'no_vino');}});
  if(open)btns.push({label:'Cancelar turno',fn:function(){return setApptStatus(a,'cancelado');}});
  if(a.phone)btns.push({label:'WhatsApp',fn:function(){waDialog(a.client,a.phone,'Hola '+a.client.split(' ')[0]+', te escribimos de '+S.shop+' por el turno de '+a.pet+' del '+fmtDate(a.date)+' a las '+a.time+' hs.');}});
  btns.push({label:'Editar',fn:function(){dlg.close();appointmentForm(a);}});
  btns.push({label:'Eliminar',cls:'danger-o',fn:function(){
    confirmForm('Eliminar turno','Se elimina el turno de '+esc(a.pet)+' del '+fmtDate(a.date)+' a las '+a.time+'. No se puede deshacer.','Eliminar',async function(){await api('/appointments/'+a.id,{method:'DELETE'});await reloadCal();toast('Turno eliminado');});
  }});
  infoDialog(esc(a.pet)+' · '+a.time+' hs',
    '<div class="apptinfo"><div class="apptrow"><span>Servicio</span><b>'+esc(a.service||'Sin servicio definido')+(a.servicePrice!=null?' · '+money(a.servicePrice):'')+'</b></div>'+
    '<div class="apptrow"><span>Fecha y hora</span><b>'+fmtDate(a.date)+' de '+a.time+' a '+a.endTime+'</b></div>'+
    '<div class="apptrow"><span>Estado</span><span><span class="chip st-'+a.status+'">'+esc(APPT_LABEL[a.status])+'</span>'+(a.saleId?' <span class="chip ok">Cobrado</span>':'')+'</span></div>'+
    (a.staff?'<div class="apptrow"><span>Personal</span><b>'+esc(a.staff)+'</b></div>':'')+
    '<div class="apptrow"><span>Mascota</span><b>'+esc([a.species,a.breed,sizeLabel(a.size)].filter(Boolean).join(' · '))+'</b></div>'+
    '<div class="apptrow"><span>Dueño</span><b>'+esc(a.client)+(a.phone?' · <a href="tel:'+esc(tel)+'">'+esc(a.phone)+'</a>':'')+'</b></div>'+
    (a.notes?'<div class="apptrow"><span>Notas del turno</span><b>'+esc(a.notes)+'</b></div>':'')+'</div>'+
    (a.petNotes?'<p class="warnbox"><b>Notas de la mascota:</b> '+esc(a.petNotes)+'</p>':''),btns);
}

/* ---------- Caja, proveedores, usuarios ---------- */
function cashForm(type){
  openForm({title:type==='in'?'Registrar ingreso':'Registrar gasto',
    body:'<div class="fields">'+fld('Fecha','date',{type:'date',value:todayIso(),req:true})+fld('Monto','amount',{type:'number',min:0.01,step:'0.01',req:true,inputmode:'decimal'})+
    fld('Concepto','concept',{req:true,full:true,ph:type==='in'?'Ej.: Aporte del dueño':'Ej.: Pago de luz'})+
    fld('Categoría','category',{opts:type==='in'?CASH_IN_CATS:CASH_OUT_CATS,value:type==='in'?'Otros ingresos':'Alquiler y servicios'})+fld('Forma de pago','method',{opts:ALL_PAY,value:'Efectivo'})+
    (type==='out'?fld('Proveedor (opcional)','supplierId',{opts:supplierOpts(),full:true}):'')+'</div>'+(type==='in'?'<p>Las ventas entran solas a la caja: esto es para otros ingresos.</p>':''),
    submit:'Registrar',
    onSubmit:async function(d){
      if(type==='out'&&d.date<=todayIso()&&!(await confirmNegativeCash(Number(d.amount),d.method)))return false;
      await apiConfirm('/cash',{body:{date:d.date,type:type,concept:d.concept,category:d.category,method:d.method,amount:d.amount,supplierId:d.supplierId||null}});await reload();toast('Movimiento registrado');
    }});
}
function supplierForm(s){
  var isNew=!s;s=s||{};
  openForm({title:isNew?'Nuevo proveedor':'Editar proveedor',
    body:'<div class="fields">'+fld('Nombre','name',{value:s.name,req:true,full:true})+fld('Teléfono','phone',{type:'tel',value:s.phone,pattern:PHONE_PAT,title:'Solo números, espacios, + , - y paréntesis (mínimo 6 dígitos)',inputmode:'tel'})+fld('Email','email',{type:'email',value:s.email,maxlength:150})+
    fld('Qué se le compra (opcional)','description',{type:'textarea',value:s.description,full:true,ph:'Ej.: alimento balanceado, piedras sanitarias'})+'</div>',
    submit:isNew?'Agregar proveedor':'Guardar cambios',
    onSubmit:async function(d){
      var body={name:d.name,phone:d.phone,email:d.email,description:d.description};
      if(isNew&&S.suppliers.some(function(x){return norm(x.name).trim()===norm(d.name).trim();})){
        var ch=await choiceDialog('Posible duplicado','<p>Ya existe un proveedor llamado «'+esc(d.name)+'». ¿Lo creás igual?</p>',[{label:'Volver',value:null,cls:'ghost'},{label:'Crear igual',value:'ok',cls:'primary'}]);
        if(ch!=='ok')return false;
      }
      if(isNew)await api('/suppliers',{body:body});else await api('/suppliers/'+s.id,{method:'PUT',body:body});
      await reload();toast(isNew?'Proveedor agregado':'Proveedor guardado');
    }});
}
function supplierDetail(id){
  infoDialog('Proveedor','<div class="skeleton" aria-busy="true"><i></i><i></i></div>');
  api('/suppliers/'+id+'/detail').then(function(r){
    if(!dlg.open)return;
    var sp=r.supplier;
    var prods=r.products.length?'<ul class="plainlist">'+r.products.map(function(p){return '<li><b>'+esc(p.name)+'</b> <small>'+esc(p.category)+' · stock '+fmtQty(p.stock,p.unit)+(p.stock<=p.min?' · <span class="negtxt">pedir</span>':'')+'</small></li>';}).join('')+'</ul>':'<p class="empty">Todavía no hay productos con este proveedor.</p>';
    var buys=r.purchases.length?'<div class="tbl-wrap"><table class="tbl slim"><thead><tr><th>Fecha</th><th>Concepto</th><th class="num">Total</th></tr></thead><tbody>'+r.purchases.map(function(x){
      return '<tr><td>'+fmtDate(x.date)+'</td><td>'+esc(x.concept)+'</td><td class="num">'+money(x.total)+'</td></tr>';}).join('')+'</tbody></table></div>':'<p class="empty">Todavía no hay pagos registrados a este proveedor.</p>';
    infoDialog(esc(sp.name),'<p>'+[sp.phone,sp.email].filter(Boolean).map(esc).join(' · ')+'</p>'+(sp.description?'<p><small>'+esc(sp.description)+'</small></p>':'')+
      '<h3>Productos</h3>'+prods+'<h3>Pagos y compras</h3>'+buys+'<div class="ctotals"><div class="grand"><span>Total pagado</span><span>'+money(r.totalSpent)+'</span></div></div>');
    labelDialogTables();
  }).catch(function(e){if(dlg.open){dlg.close();toast(e.message,true);}});
}
function userForm(u){
  var isNew=!u;u=u||{role:'staff',active:true};
  openForm({title:isNew?'Nuevo usuario':'Editar usuario',
    body:'<div class="fields">'+fld('Nombre','name',{value:u.name,req:true,full:true,maxlength:100})+
    (isNew?fld('Email (es el usuario para ingresar)','email',{type:'email',req:true,full:true,auto:'off',maxlength:150}):'<p class="full">'+esc(u.email)+'</p>')+
    fld('Rol','role',{opts:[['staff','Empleado'],['admin','Dueño / administrador']],value:u.role})+
    fld(isNew?'Contraseña (mínimo 8 caracteres)':'Nueva contraseña (dejala vacía para no cambiarla)','password',{type:'password',req:isNew,minlength:8,auto:'new-password'})+
    (isNew?'':fld('Usuario activo','active',{type:'checkbox',value:u.active,full:true}))+'</div>',
    submit:isNew?'Crear usuario':'Guardar cambios',
    onSubmit:async function(d){
      if(isNew){await api('/users',{body:{name:d.name,email:d.email,role:d.role,password:d.password}});ui.users=null;await reload();toast('Usuario creado');}
      else{await api('/users/'+u.id,{method:'PATCH',body:{name:d.name,role:d.role,active:!!d.active,password:d.password}});ui.users=null;await reload();toast('Usuario guardado');}
    }});
}
function passwordForm(){
  openForm({title:'Cambiar contraseña',
    body:'<div class="fields">'+fld('Contraseña actual','current',{type:'password',req:true,full:true,auto:'current-password'})+
    fld('Contraseña nueva (mínimo 8 caracteres)','password',{type:'password',req:true,full:true,minlength:8,auto:'new-password'})+
    fld('Repetí la contraseña nueva','repeat',{type:'password',req:true,full:true,auto:'new-password'})+'</div>',
    submit:'Cambiar contraseña',
    onSubmit:async function(d,f){
      if(d.password!==d.repeat){showFieldError(f,f.querySelector('[name="repeat"]'),'Las contraseñas nuevas no coinciden.');throw new Error('Las contraseñas nuevas no coinciden.');}
      await api('/me/password',{body:{current:d.current,password:d.password}});
      toast('Contraseña cambiada');
    }});
}
/* ---------- Copias ---------- */
async function downloadExport(gz){
  await downloadFile('/backup/export'+(gz?'?gz=1':''),'copia-petshop-'+todayIso()+(gz?'.json.gz':'.json'));
  store.set('petshop_last_export',String(Date.now()));
  render();
  toast('Copia descargada. Guardala en un lugar seguro (pendrive o mail).');
}
var COUNT_LABELS=[['products','producto','productos'],['sales','venta','ventas'],['clients','cliente','clientes'],['cash_movements','movimiento de caja','movimientos de caja']];
var countsText=function(c){return COUNT_LABELS.map(function(l){return plural(c[l[0]]||0,l[1],l[2]);}).join(', ');};
var countsTotal=function(c){return Object.keys(c).reduce(function(n,k){return n+(Number(c[k])||0);},0);};
function restoreConfirm(label,copyCounts,curCounts,doRestore){
  var empty=countsTotal(copyCounts)===0;
  openForm({title:'Restaurar copia',danger:true,submit:'Restaurar',
    body:'<p>Vas a <b>reemplazar</b> los datos actuales ('+esc(countsText(curCounts))+') por esta copia ('+esc(countsText(copyCounts))+'). Lo que cargaste después de esa copia se pierde.</p>'+
      '<p><small>Copia: '+esc(label)+'. Antes se guarda automáticamente una copia de los datos de ahora. Los usuarios no cambian.</small></p>'+
      (empty?'<p class="warnbox"><b>Esta copia está vacía: restaurarla borra todo</b></p>':'')+
      '<label class="fld check"><input type="checkbox" name="understand" required><span>Entiendo que se reemplazan los datos actuales</span></label>',
    onSubmit:function(){return doRestore(empty);}});
}
async function readBackupFile(f){
  if(/\.gz$/i.test(f.name)){
    if(!window.DecompressionStream)throw new Error('Este navegador no puede abrir copias comprimidas. Usá la copia en JSON o Chrome actualizado.');
    var txt=await new Response(f.stream().pipeThrough(new DecompressionStream('gzip'))).text();
    return JSON.parse(txt);
  }
  return JSON.parse(await f.text());
}
async function restoreFileForm(data,label){
  toast('Revisando la copia…');
  var cur=(await api('/backups/current')).counts;
  var cc={};Object.keys(data).forEach(function(k){if(Array.isArray(data[k]))cc[k]=data[k].length;});
  restoreConfirm(label,cc,cur,async function(empty){
    await api('/restore',{body:{data:data,confirmEmpty:empty},timeout:180000});ui.csel=null;ui.cdetail=null;resetCart();await reload();toast('Copia restaurada');
  });
}

/* ============================================================
   Acciones (botones de la pantalla)
   ============================================================ */
var byId=function(list,id){return (list||[]).find(function(x){return String(x.id)===String(id);});};
var actions={
  nav:function(id,b){return go(b.dataset.v);},
  more:function(id,b){ui[b.dataset.v]+=PAGE;render();},
  'menu-toggle':function(){document.body.classList.toggle('navopen');},
  // Resumen
  'sum-period':function(id,b){ui.sum.period=b.dataset.v;if(b.dataset.v!=='range')store.set('petshop_period',b.dataset.v);if(b.dataset.v==='range'&&!(ui.sum.from&&ui.sum.to)){render();return;}clearSumData();return refreshView();},
  'sum-tab':function(id,b){ui.sum.tab=b.dataset.v;return refreshView();},
  'sum-sub':function(id,b){ui.sum.sub=b.dataset.v;render();},
  'sum-topby':function(id,b){ui.sum.topBy=b.dataset.v;render();},
  'sum-pgroup':function(id,b){ui.sum.pgroup=b.dataset.v;ui.sum.products=null;return refreshView();},
  'sum-psort':function(id,b){var s=ui.sum.psort||{k:'profit',d:-1};ui.sum.psort={k:b.dataset.v,d:s.k===b.dataset.v?-s.d:(b.dataset.v==='name'?1:-1)};render();},
  'sum-export':function(id,b){
    var r=sumRange(),k=b.dataset.v;
    if(k==='monthly')return downloadFile('/summary/monthly/export?months=12','mes-a-mes-'+todayIso()+'.csv');
    if(k==='products')return downloadFile('/summary/products/export?'+sumQ()+'&group='+ui.sum.pgroup,'rentabilidad-'+r[0]+'_a_'+r[1]+'.csv');
    return downloadFile('/summary/clients/export?'+sumQ(),'clientes-'+r[0]+'_a_'+r[1]+'.csv');
  },
  wa:function(id,b){
    var C=ui.sum.clients,x=byId(b.dataset.v==='lost'?C.lost:C.frequent,id);if(!x)return;
    var first=String(x.name).split(' ')[0];
    waDialog(x.name,x.phone,b.dataset.v==='lost'?'Hola '+first+', ¿cómo estás? Te escribimos de '+S.shop+'. Hace un tiempo que no te vemos: si necesitás alimento o algo para tu mascota, avisanos y te lo separamos.':'Hola '+first+', te escribimos de '+S.shop+'. ¡Gracias por elegirnos!');
  },
  'wa-client':function(){var c=ui.cdetail;if(c)waDialog(c.name,c.phone,'Hola '+c.firstName+', te escribimos de '+S.shop+'.');},
  'goto-restock':function(){ui.stab='restock';return go('stock');},
  'goto-agenda-today':function(){ui.cal={view:'day',anchor:todayIso()};return go('agenda');},
  // Vender
  'cart-add':function(id,b){if(addToCart(b.dataset.type,id))renderCart();focusSearch();},
  'cart-del':function(id,b){ui.cart.items.splice(Number(b.dataset.i),1);renderCart();},
  'cart-inc':function(id,b){var it=ui.cart.items[Number(b.dataset.i)];if(!it)return;var step=it.unit==='kg'?0.1:1,left=stockLeft(it),n=r3(it.qty+step);if(n>left){toast('Solo quedan '+fmtQty(left,it.unit)+' de '+it.name+'.',true);n=left;}it.qty=n;renderCart();},
  'cart-dec':function(id,b){var i=Number(b.dataset.i),it=ui.cart.items[i];if(!it)return;var step=it.unit==='kg'?0.1:1,n=r3(it.qty-step);if(n<=0){ui.cart.items.splice(i,1);}else it.qty=n;renderCart();},
  'cart-clear':async function(){
    if(ui.cart.items.length){var ch=await choiceDialog('Vaciar la venta','<p>Se quitan todos los artículos de la venta en curso.</p>',[{label:'Volver',value:null,cls:'ghost'},{label:'Vaciar',value:'ok',cls:'danger'}]);if(ch!=='ok')return;}
    resetCart();renderCart();focusSearch();
  },
  'cart-method':function(id,b){ui.cart.method=b.dataset.v;renderCart();},
  'cart-pay':function(){return payCart();},
  'scan-toggle':function(){ui.scanStrip=!ui.scanStrip;if(!ui.scanStrip&&stripScanner){stripScanner.stop();stripScanner=null;}render();},
  'sell-service':function(id){addToCart('service',id);return go('vender');},
  'client-sell':function(){var c=ui.cdetail;if(!c)return;ui.cart.clientId=String(c.id);ui.cart.petId=c.pets.length===1?String(c.pets[0].id):'';return go('vender');},
  // Ventas
  'sale-view':function(id){return saleDetail(id);},
  'sale-print':function(id){return printSale(id);},
  'sale-void':function(id){var s=byId(ui.sales&&ui.sales.items,id);voidSale(id,s&&s.number);},
  'sales-period':function(id,b){var r=salesRange(b.dataset.v);ui.sfrom=r[0];ui.sto=r[1];ui.saLimit=PAGE;return refreshView();},
  'sales-export':function(){var from=ui.sfrom||todayIso(),to=ui.sto||todayIso();return downloadFile('/summary/sales-export?from='+from+'&to='+to,'ventas-'+from+'_a_'+to+'.csv');},
  // Stock
  'goto-stock':function(id,b){ui.stab='products';ui.stf=b.dataset.v||'all';ui.cat='all';ui.stq='';return go('stock');},
  stab:function(id,b){ui.stab=b.dataset.v;render();},
  stf:function(id,b){ui.stf=b.dataset.v;ui.stLimit=PAGE;render();},
  'new-product':function(){productForm();},
  'scan-sell':async function(){var c=await openScanner('Vender: escaneá el producto');if(c)await handleScanSell(c);},
  'scan-stock':function(){ingestScanner();},
  'edit-product':function(id){productForm(prodById(id));},
  'del-product':function(id){
    var x=prodById(id);if(!x)return;
    confirmForm('Eliminar '+esc(x.name),'El producto se quita del catálogo (con su stock de '+fmtQty(x.stock,x.unit)+' y sus códigos de barras). Las ventas ya registradas no cambian. Queda en el registro de actividad.','Eliminar',async function(){
      await api('/products/'+id,{method:'DELETE'});await reload();toast('Producto eliminado');
    });
  },
  'stock-add':function(id){buyForm(prodById(id));},
  'stock-adjust':function(id){adjustForm(prodById(id));},
  'stock-history':function(id){movementsDialog(prodById(id));},
  sell:function(id){sellForm(prodById(id));},
  'open-bag':function(id){openBagForm(prodById(id));},
  'bulk-price':function(){bulkPriceForm();},
  'copy-order':async function(id,b){
    var g=restockGroups()[Number(b.dataset.i)];if(!g)return;
    var txt=orderText(g);
    try{await navigator.clipboard.writeText(txt);toast('Pedido copiado: pegalo en WhatsApp o en un mail.');}
    catch(e){infoDialog('Pedido','<label class="fld"><span>Copiá este texto</span><textarea rows="10" readonly>'+esc(txt)+'</textarea></label>');}
  },
  // Servicios
  'new-service':function(){serviceForm();},
  'edit-service':function(id){serviceForm(servById(id));},
  'del-service':function(id){
    var s=servById(id);if(!s)return;
    confirmForm('Eliminar '+esc(s.name),'Se quita de la lista de precios. Las ventas y turnos ya registrados no cambian.','Eliminar',async function(){
      await api('/services/'+id,{method:'DELETE'});await reload();toast('Servicio eliminado');
    });
  },
  // Clientes
  'select-client':function(id){ui.csel=Number(id);ui.cdetail=null;window.scrollTo(0,0);return refreshView();},
  'open-client':function(id){ui.csel=Number(id);ui.cdetail=null;ui.cliq='';return go('clientes');},
  'back-client':function(){ui.csel=null;ui.cdetail=null;render();},
  'new-client':function(){clientForm();},
  'edit-client':function(){if(ui.cdetail)clientForm(ui.cdetail);},
  'add-pet':function(){if(ui.cdetail)petForm(null,ui.cdetail.id);},
  'edit-pet':function(id){var p=byId(ui.cdetail&&ui.cdetail.pets,id);if(p)petForm(p);},
  'del-pet':function(id){
    var p=byId(ui.cdetail&&ui.cdetail.pets,id);if(!p)return;
    confirmForm('Quitar a '+esc(p.name),'Se quita la mascota y todos sus turnos. Las compras del cliente no cambian. No se puede deshacer.','Quitar',async function(){
      await api('/pets/'+id,{method:'DELETE'});await reload();toast('Mascota quitada');
    });
  },
  'pet-appt':function(id){appointmentForm(null,todayIso(),Number(id));},
  'del-client':function(){
    var c=ui.cdetail;if(!c)return;
    confirmForm('Eliminar a '+esc(c.name),'Se elimina el cliente'+(c.pets.length?', sus '+plural(c.pets.length,'mascota','mascotas')+' y sus turnos':'')+'. Sus compras quedan registradas (sin cliente). No se puede deshacer.','Eliminar cliente',async function(){
      await api('/clients/'+c.id,{method:'DELETE'});ui.csel=null;ui.cdetail=null;await reload();toast('Cliente eliminado');
    });
  },
  // Agenda
  'new-appt':function(){appointmentForm(null,ui.cal.anchor);},
  'cal-add-day':function(id,b){appointmentForm(null,b.dataset.v);},
  'cal-add-slot':function(id,b){appointmentForm(null,ui.cal.anchor,null,b.dataset.v);},
  'appt-view':function(id){var a=byId(ui.appts,id);if(a)appointmentDetails(a);},
  'cal-prev':function(){calShift(-1);return reloadCal();},
  'cal-next':function(){calShift(1);return reloadCal();},
  'cal-today':function(){ui.cal.anchor=todayIso();return reloadCal();},
  'cal-view':function(id,b){ui.cal.view=b.dataset.v;return reloadCal();},
  'cal-day':function(id,b){ui.cal.anchor=b.dataset.v;ui.cal.view='day';return reloadCal();},
  // Caja
  cashp:function(id,b){ui.cashp=b.dataset.v;ui.cfrom='';ui.cto='';ui.caLimit=PAGE;return refreshView();},
  cashf:function(id,b){ui.cashf=b.dataset.v;ui.caLimit=PAGE;return refreshView();},
  cashm:function(id,b){ui.cashm=b.dataset.v;ui.caLimit=PAGE;return refreshView();},
  'cash-clear-filters':function(){ui.cashp='month';ui.cfrom='';ui.cto='';ui.cashf='all';ui.cashm='all';ui.cq='';return refreshView();},
  'cash-export':function(){
    if(ui.cashp==='range'&&!(ui.cfrom&&ui.cto))throw new Error('Completá las dos fechas del rango.');
    return downloadFile('/cash/export?'+cashQuery(),'movimientos-'+todayIso()+'.csv');
  },
  'cash-in':function(){cashForm('in');},
  'cash-out':function(){cashForm('out');},
  'del-cash':function(id){
    var c=byId(ui.cash&&ui.cash.items,id),d=c?c.stockDelta:0;
    confirmForm('Eliminar movimiento','Se borra este movimiento de la caja.'+(d<0?' Como era una compra de mercadería, también se resta del stock lo que se había sumado.':'')+' No se puede deshacer y queda en el registro de actividad.','Eliminar',async function(){
      await api('/cash/'+id,{method:'DELETE'});await reload();toast('Movimiento eliminado');
    });
  },
  'cash-close':async function(){
    var v=$('#close-counted').value,note=$('#close-note').value;
    if(v===''){toast('Escribí cuánto efectivo contaste.',true);$('#close-counted').focus();return;}
    var r=await api('/cash/closings',{body:{counted:v,note:note}});
    await refreshView();
    toast(r.difference===0?'Caja cerrada: sin diferencias.':'Caja cerrada con una diferencia de '+money(r.difference)+'.',r.difference!==0);
  },
  // Copias de seguridad
  'backup-download':function(id,b){return downloadExport(b.dataset.v==='gz');},
  'backup-now':async function(){await api('/backups',{body:{}});await reload();toast('Copia creada');},
  'pick-file':function(){var f=$('#bfile');if(f)f.click();},
  restore:async function(id,btn){
    var b=byId(ui.backups,id);if(!b)return;
    var label=btn.textContent;btn.disabled=true;btn.classList.add('busy');btn.textContent='Cargando…';
    try{
      var cur=(await api('/backups/current')).counts;
      restoreConfirm('«'+b.label+'» del '+fmtTs(b.createdAt),b.counts||{},cur,async function(empty){
        await api('/backups/'+id+'/restore',{body:{confirmEmpty:empty},timeout:180000});ui.csel=null;ui.cdetail=null;resetCart();await reload();toast('Copia restaurada');
      });
    }finally{btn.disabled=false;btn.classList.remove('busy');btn.textContent=label;}
  },
  'del-backup':function(id){
    confirmForm('Eliminar copia','Se borra esta copia guardada en el sistema. No se puede deshacer.','Eliminar',async function(){
      await api('/backups/'+id,{method:'DELETE'});await reload();toast('Copia eliminada');
    });
  },
  // Usuarios y actividad
  utab:function(id,b){ui.utab=b.dataset.v;return refreshView();},
  'new-user':function(){userForm();},
  'edit-user':function(id){userForm(byId(ui.users,id));},
  'change-pass':function(){passwordForm();},
  // Proveedores
  'new-supplier':function(){supplierForm();},
  'edit-supplier':function(id){supplierForm(byId(ui.suppliers,id));},
  'del-supplier':function(id){
    var s=byId(ui.suppliers,id);if(!s)return;
    var extra=s.productCount||s.purchaseCount?' Sus productos y compras no se borran: quedan sin proveedor.':'';
    confirmForm('Eliminar '+esc(s.name),'Se quita este proveedor de la lista.'+extra+' No se puede deshacer.','Eliminar',async function(){
      await api('/suppliers/'+id,{method:'DELETE'});await reload();toast('Proveedor eliminado');
    });
  },
  'supplier-view':function(id){supplierDetail(id);},
  logout:async function(){
    try{await api('/logout',{body:{}});}catch(e){}
    stopScanners();stripScanner=null;
    S.user=null;ui.cart=newCart();ui.sales=null;ui.cash=null;ui.closings=null;ui.backups=null;ui.users=null;ui.audit=null;
    ui.sum.data=null;ui.sum.products=null;ui.sum.clients=null;ui.sum.staff=null;ui.sum.proj=null;
    ui.suppliers=null;ui.csel=null;ui.cdetail=null;ui.appts=null;ui.cal={view:'week',anchor:todayIso()};
    main.innerHTML='';
    showLogin();
  }
};

/* ============================================================
   Eventos y arranque
   ============================================================ */
document.addEventListener('click',function(e){
  var b=e.target.closest('[data-action]');
  if(!b||(dlg.contains(b)&&!b.closest('#main')))return;
  var fn=actions[b.dataset.action];
  if(!fn)return;
  if(b.dataset.busy)return; // evita el doble clic mientras responde el servidor
  b.dataset.busy='1';
  Promise.resolve().then(function(){return fn(b.dataset.id,b);}).catch(function(err){if(!err.cancelled)toast(err.message||'Algo salió mal. Reintentá.',true);}).then(function(){delete b.dataset.busy;});
});
// Menú ⋮ de las filas de Stock: se posiciona con "fixed" (la tabla tiene scroll) y se cierra al hacer clic afuera.
document.addEventListener('toggle',function(e){
  var d=e.target;
  if(d.id==='cfilters'){ui.cfopen=d.open;return;}
  if(d.id==='monthsbox'){ui.sum.monthsOpen=d.open;return;}
  if(!d.classList||!d.classList.contains('rowmenu')||!d.open)return;
  document.querySelectorAll('details.rowmenu[open]').forEach(function(o){if(o!==d)o.open=false;});
  var m=d.querySelector('.menu'),r=d.getBoundingClientRect();
  m.style.top=Math.min(r.bottom+4,window.innerHeight-m.offsetHeight-8)+'px';
  m.style.left=Math.max(8,r.right-m.offsetWidth)+'px';
},true);
document.addEventListener('click',function(e){
  document.querySelectorAll('details.rowmenu[open]').forEach(function(o){if(!o.contains(e.target)||e.target.closest('.menu button'))o.open=false;});
});
window.addEventListener('scroll',function(){document.querySelectorAll('details.rowmenu[open]').forEach(function(o){o.open=false;});},true);
// Atajos de teclado: F2 buscar, F4 cobrar, Esc vaciar la venta (con confirmación). Enter agrega el primer resultado.
document.addEventListener('keydown',function(e){
  if(!S.user||document.body.dataset.state!=='app')return;
  var anyDialog=document.querySelector('dialog[open]');
  if(ui.view==='vender'&&!anyDialog){
    if(e.key==='F2'){e.preventDefault();var q=$('#posq');if(q){q.focus();q.select();}return;}
    if(e.key==='F4'){e.preventDefault();actions['cart-pay']().catch(function(err){if(!err.cancelled)toast(err.message,true);});return;}
    if(e.key==='Escape'&&ui.cart.items.length){e.preventDefault();actions['cart-clear']();return;}
  }
  if(e.key==='Enter'&&e.target&&(e.target.id==='posq'||e.target.id==='stq')){
    var code=e.target.value.trim();if(!code)return;
    e.preventDefault();
    var x=prodByBarcode(code);
    if(e.target.id==='posq'){
      // Con resultados en la lista, Enter agrega el primero aunque el texto sea el nombre exacto (no es un código nuevo).
      ui.posq=e.target.value;$('#posres').innerHTML=posResults();
      var first=$('#posres [data-action="cart-add"]:not([disabled])');
      var act=UR.posEnterAction(code,{barcodeMatch:!!x,results:first?1:0});
      if(act==='barcode'){if(addToCart('product',x.id))renderCart();}
      else if(act==='first')first.click();
      else if(act==='unknown'&&isAdmin()){unknownCode(code);return;}
      else{toast('No encontramos nada con «'+code+'».',true);return;}
      ui.posq='';e.target.value='';$('#posres').innerHTML=posResults();
    }else if(x)handleScanSell(code);
    return;
  }
  // Enter dentro de una línea del carrito confirma el valor sin enviar nada.
  if(e.key==='Enter'&&e.target&&e.target.closest&&e.target.closest('#cartbox')&&e.target.tagName==='INPUT'){e.preventDefault();e.target.blur();}
});
var searchTimer=null;
document.addEventListener('input',function(e){
  var id=e.target.id;
  if(id==='posq'){ui.posq=e.target.value;$('#posres').innerHTML=posResults();}
  else if(id==='stq'){ui.stq=e.target.value;ui.stLimit=PAGE;var t=$('#stocktable');if(t){t.innerHTML=stockTable();labelTables();}}
  else if(id==='cliq'){ui.cliq=e.target.value;ui.clLimit=PAGE;$('#clist').innerHTML=clientListHTML();}
  else if(id==='supq'){ui.supq=e.target.value;$('#srows').innerHTML=supplierRows();labelTables();}
  else if(id==='cart-dval'){ui.cart.discValue=e.target.value;refreshCartTotals();saveDraft();}
  else if(id==='salesq'||id==='cq'){
    // Búsqueda en el servidor (Ventas y Caja): espera a que termines de escribir.
    var v=e.target.value;clearTimeout(searchTimer);
    searchTimer=setTimeout(function(){if(id==='salesq'){ui.sq=v;ui.saLimit=PAGE;}else{ui.cq=v;ui.caLimit=PAGE;}refreshView().then(function(){var el=$('#'+id);if(el){el.focus();el.setSelectionRange(el.value.length,el.value.length);}});},350);
  }
  else if(e.target.classList&&e.target.classList.contains('creason')){var it=ui.cart.items[Number(e.target.dataset.i)];if(it)it.reason=e.target.value;saveDraft();}
  else if(e.target.classList&&e.target.classList.contains('cpay')){ui.cart.payments[e.target.dataset.m]=e.target.value;refreshCartTotals();saveDraft();}
});
document.addEventListener('change',function(e){
  var t=e.target,id=t.id;
  // Carrito: cantidades (con tope de stock), precios, descuento, cliente, mascota y pago mixto.
  if(t.classList.contains('cqty')||t.classList.contains('cprice')){
    var it=ui.cart.items[Number(t.dataset.i)];if(!it)return;
    var v=Number(t.value);
    if(t.classList.contains('cqty')){
      if(t.value===''||!(v>0)){ui.cart.items.splice(Number(t.dataset.i),1);toast('Se quitó '+it.name+' de la venta.');}
      else{
        v=it.unit==='kg'?r3(v):Math.max(1,Math.round(v));
        var left=stockLeft(it);if(v>left){toast('Solo quedan '+fmtQty(left,it.unit)+' de '+it.name+'.',true);v=left;}
        it.qty=v;
      }
    }else if(v>=0)it.price=r2(v);
    renderCart();return;
  }
  if(t.classList.contains('cpay')){refreshCartTotals();saveDraft();return;}
  if(id==='cart-mixed'){ui.cart.mixed=t.checked;if(t.checked){var tt=cartTotals();ui.cart.payments={};ui.cart.payments[ui.cart.method]=String(tt.total);}renderCart();return;}
  if(id==='cart-dtype'){ui.cart.discType=t.value;renderCart();return;}
  if(id==='cart-dval'){ui.cart.discValue=t.value;refreshCartTotals();saveDraft();return;}
  if(id==='cart-client'){ui.cart.clientId=t.value;var c=clientById(t.value);ui.cart.petId=c&&c.pets.length===1?String(c.pets[0].id):'';renderCart();return;}
  if(id==='cart-pet'){ui.cart.petId=t.value;saveDraft();return;}
  if(id==='stcat'){ui.cat=t.value;ui.stLimit=PAGE;render();return;}
  if(id==='auser'||id==='aaction'){ui[id]=t.value;refreshView();return;}
  var ranges={sfrom:['sfrom','sto'],sto:['sfrom','sto'],cfrom:['cfrom','cto'],cto:['cfrom','cto'],afrom:['afrom','ato'],ato:['afrom','ato'],sumfrom:['from','to'],sumto:['from','to']};
  if(ranges[id]){
    var k=ranges[id],obj=id.indexOf('sum')===0?ui.sum:ui,key=id.indexOf('sum')===0?(id==='sumfrom'?'from':'to'):id;
    obj[key]=t.value;
    if(obj[k[0]]&&obj[k[1]]&&obj[k[1]]<obj[k[0]]){toast('«Hasta» no puede ser anterior a «Desde».',true);obj[key]='';t.value='';return;}
    if(obj[k[0]]&&obj[k[1]]){if(id[0]==='c')ui.cashp='range';if(obj===ui.sum)clearSumData();refreshView();}
    else if(id[0]==='c'&&ui.cashp==='range'){ui.cashp='month';refreshView();}
    else if(id==='afrom'||id==='ato')refreshView();
    return;
  }
  if(id==='bfile'&&t.files&&t.files[0]){
    var f=t.files[0];t.value='';
    readBackupFile(f).then(function(j){
      var x=j&&(j.data||j);
      if(!x||!Array.isArray(x.products)||!Array.isArray(x.sales)||!Array.isArray(x.cash_movements))throw new Error('formato');
      return restoreFileForm(x,'el archivo '+f.name);
    }).catch(function(err){toast(err.message==='formato'||err instanceof SyntaxError?'El archivo no es una copia válida de este sistema.':err.message,true);});
  }
});
$('#menubtn').addEventListener('click',function(){var open=document.body.classList.toggle('navopen');this.setAttribute('aria-expanded',String(open));});
$('#loginform').addEventListener('submit',async function(e){
  e.preventDefault();
  var err=$('#lerror'),btn=$('#lbtn');
  if(btn.disabled)return;
  if(!$('#lemail').value||!$('#lpass').value){err.textContent='Escribí tu email y tu contraseña.';return;}
  err.textContent='';btn.disabled=true;btn.textContent='Entrando…';
  try{
    await api('/login',{body:{email:$('#lemail').value,password:$('#lpass').value}});
    $('#lpass').value='';
    await start();
  }catch(ex){err.textContent=ex.message;}
  btn.disabled=false;btn.textContent='Entrar';
});
$('#boot-retry').addEventListener('click',function(){
  $('#boot-retry').hidden=true;
  $('#boot-msg').textContent='Iniciando el sistema…';
  $('#boot-sub').textContent='La primera vez del día puede tardar hasta un minuto.';
  boot();
});
// App instalable: el service worker solo guarda los archivos de la pantalla; nunca respuestas de /api.
if('serviceWorker' in navigator&&location.protocol==='https:'){window.addEventListener('load',function(){navigator.serviceWorker.register('/sw.js').catch(function(){});});}
/* ============================================================
   Sesión compartida entre pestañas
   La sesión es una cookie: si en otra pestaña se inicia sesión con otro usuario, ésta seguiría mostrando la interfaz del
   anterior. Al volver a la pestaña se vuelve a preguntar quién es el usuario y, si cambió, se avisa de forma clara.
   ============================================================ */
var sessionCheckedAt=0;
function showStaleSession(u){
  document.body.dataset.stale='1';
  if(dlg.open)dlg.close();
  var bar=document.createElement('div');bar.id='sessbar';bar.setAttribute('role','alert');
  bar.innerHTML='<span><b>Tu sesión cambió en otra pestaña</b>'+(u&&u.name?' (ahora figura '+esc(u.name)+(u.role==='admin'?', Administrador':', Ayudante')+')':'')+'. Recargá la página para continuar.</span>'+
    '<button type="button" class="btn primary">Recargar</button>';
  bar.querySelector('button').addEventListener('click',function(){location.reload();});
  document.body.appendChild(bar);
}
async function checkSession(){
  if(!S.user||document.body.dataset.stale||document.body.dataset.state!=='app')return;
  var now=Date.now();if(now-sessionCheckedAt<2000)return;sessionCheckedAt=now;
  try{
    var r=await api('/me'); // si la sesión venció o se cerró en otra pestaña, api() ya muestra el ingreso
    var u=r&&r.user;
    if(u&&S.user&&(u.id!==S.user.id||u.role!==S.user.role))showStaleSession(u);
  }catch(e){/* sin conexión: no se molesta al usuario */}
}
document.addEventListener('visibilitychange',function(){if(document.visibilityState==='visible')checkSession();});
window.addEventListener('focus',checkSession);
boot();
})();
