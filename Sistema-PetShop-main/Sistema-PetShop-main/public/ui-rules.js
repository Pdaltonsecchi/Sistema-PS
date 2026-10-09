/* ============================================================
   Reglas puras de la pantalla (sin DOM): las usa public/app.js y las prueban los tests (test/pantalla.test.js).
   Se cargan antes de app.js y quedan en window.UIRules.
   ============================================================ */
(function(root,factory){
  var api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.UIRules=api;
})(typeof self!=='undefined'?self:this,function(){
  'use strict';

  /**
   * Cada cuántas columnas se escribe una etiqueta en el eje X para que nunca se pisen:
   * `n` columnas repartidas en `width` unidades y cada etiqueta necesita al menos `minPx`.
   */
  function labelStep(n,width,minPx){
    if(!(n>0)||!(width>0))return 1;
    var slot=width/n;
    return Math.max(1,Math.ceil(minPx/slot));
  }
  /** Cuántas etiquetas quedan escritas con ese paso. */
  function labelCount(n,step){return n>0?Math.ceil(n/Math.max(1,step)):0;}

  /**
   * Enter en el buscador de Vender (o una ráfaga de un lector de códigos):
   * - si el texto es un código cargado, se agrega ese producto ('barcode');
   * - si la lista filtrada tiene resultados, se agrega el primero ('first'), aunque el texto sea el nombre exacto;
   * - solo con la lista vacía se trata como un código nuevo ('unknown', el dueño puede cargarlo) o no se hace nada ('none').
   */
  function posEnterAction(text,o){
    var t=String(text==null?'':text).trim();
    if(!t)return 'none';
    if(o&&o.barcodeMatch)return 'barcode';
    if(o&&o.results>0)return 'first';
    return looksLikeCode(t)?'unknown':'none';
  }
  /** Parece un código de barras: sin espacios, al menos 4 caracteres y al menos un dígito. */
  function looksLikeCode(t){return /^[0-9A-Za-z\-.]{4,}$/.test(t)&&/\d/.test(t);}

  /**
   * Solo la última carga pedida puede mostrarse: si el usuario cambia el filtro mientras una consulta anterior
   * sigue en curso, la respuesta vieja se descarta (si no, una respuesta lenta pisaba a la nueva).
   * Uso: var seq=latest(); var t=seq.next(); ... await ...; if(!seq.isCurrent(t))return;
   */
  function latest(){
    var n=0;
    return {next:function(){return ++n;},isCurrent:function(t){return t===n;}};
  }

  /**
   * Un solo patrón de «cargando»: si la promesa tarda más de `delay` ms, `el` recibe la clase busy y aria-busy
   * (los botones muestran el círculo, la pantalla una barra arriba); al terminar, bien o mal, se quitan.
   * Lo rápido no parpadea.
   */
  function busyWhile(el,p,delay){
    var t=setTimeout(function(){if(el){el.classList.add('busy');el.setAttribute('aria-busy','true');}},delay==null?150:delay);
    var done=function(){clearTimeout(t);if(el){el.classList.remove('busy');el.removeAttribute('aria-busy');}};
    return Promise.resolve(p).then(function(v){done();return v;},function(e){done();throw e;});
  }

  return {busyWhile:busyWhile,labelStep:labelStep,labelCount:labelCount,posEnterAction:posEnterAction,looksLikeCode:looksLikeCode,latest:latest};
});
