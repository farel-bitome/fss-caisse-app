// Clavier virtuel AZERTY + pavé numérique — copie autonome (mêmes touches que dans l'application principale) pour les écrans locaux
// (connexion du poste client, activation, choix du mode…). Bouton ⌨️ en bas à gauche ou touche F8. S'ouvre aussi tout seul au toucher d'un champ.
(function(){
  if (window.__fssKbInit) return; window.__fssKbInit = true;
  function monter(){
    var st=document.createElement('style');st.textContent="\n#fssKbBtn{position:fixed;left:10px;bottom:10px;z-index:2147483000;width:46px;height:46px;border-radius:50%;border:2px solid #CC0000;background:#1a1a1a;color:#fff;font-size:22px;cursor:pointer;opacity:.85;box-shadow:0 2px 8px rgba(0,0,0,.5)}\n#fssKbBtn:hover,#fssKbBtn.on{opacity:1;background:#CC0000}\n#fssKbBtn.on{display:none}\n#fssKb{--kbs:1;position:fixed;left:50%;transform:translateX(-50%);bottom:10px;z-index:2147483001;width:min(calc(1000px*var(--kbs)),98vw);background:#111;border:2px solid #CC0000;border-radius:12px;padding:6px 8px 8px;display:none;box-shadow:0 6px 24px rgba(0,0,0,.7);user-select:none;-webkit-user-select:none;touch-action:none;font-family:Arial,sans-serif}\n#fssKb.on{display:block}\n#fssKb .kbh{display:flex;align-items:center;gap:8px;color:#aaa;font-size:11px;padding:0 2px 5px;cursor:move}\n#fssKb .kbh .kbx{margin-left:8px;background:#CC0000;color:#fff;border:0;border-radius:6px;padding:3px 12px;font-size:13px;cursor:pointer}\n#fssKb .kbm{display:flex;gap:10px}\n#fssKb .kbl{flex:1;display:flex;flex-direction:column;gap:4px;min-width:0}\n#fssKb .kbn{width:24%;min-width:calc(150px*var(--kbs));display:grid;grid-template-columns:repeat(3,1fr);gap:4px}\n#fssKb .kr{display:flex;gap:4px}\n#fssKb .k{flex:1;min-width:0;height:calc(46px*var(--kbs));background:#2a2a2a;color:#fff;border:1px solid #3a3a3a;border-radius:7px;font-size:calc(18px*var(--kbs));font-weight:700;display:flex;align-items:center;justify-content:center;cursor:pointer;touch-action:none}\n#fssKb .k:active,#fssKb .k.press{background:#CC0000}\n#fssKb .k.f{background:#1b2a55;border-color:#2c4388}\n#fssKb .k.sp{flex:5}\n#fssKb .k.w{flex:1.5}\n#fssKb .k.act{background:#CC0000}\n#fssKb .k.ent{background:#1F7A3A;grid-column:3;grid-row:4 / span 2;height:auto}\n@media (max-width:700px){#fssKb .k{height:calc(40px*var(--kbs));font-size:calc(15px*var(--kbs))}#fssKb .kbn{min-width:calc(120px*var(--kbs))}}\n#fssKb .kbz{background:#2a2a2a;color:#fff;border:1px solid #555;border-radius:6px;min-width:34px;padding:3px 8px;font-size:15px;font-weight:700;cursor:pointer}\n#fssKb .kbz:active{background:#CC0000}\n#fssKb .kbs{color:#ccc;font-size:11px;min-width:34px;text-align:center}\n@media print{#fssKb,#fssKbBtn{display:none!important}}\n";document.head.appendChild(st);
    var d=document.createElement('div');d.innerHTML="<button id=\"fssKbBtn\" type=\"button\" title=\"Clavier \u00e0 l'\u00e9cran (AZERTY + pav\u00e9 num\u00e9rique)\">\u2328\ufe0f</button>\n<div id=\"fssKb\"><div class=\"kbh\" id=\"fssKbH\"><span>\u2328\ufe0f Clavier \u2014 glisser pour d\u00e9placer</span><span style=\"margin-left:auto;display:flex;align-items:center;gap:4px\"><button class=\"kbz\" id=\"fssKbMoins\" type=\"button\" title=\"R\u00e9duire le clavier\">A\u2212</button><span class=\"kbs\" id=\"fssKbPct\">100%</span><button class=\"kbz\" id=\"fssKbPlus\" type=\"button\" title=\"Agrandir le clavier\">A+</button></span><button class=\"kbx\" id=\"fssKbX\" type=\"button\">\u2715 Fermer</button></div>\n<div class=\"kbm\"><div class=\"kbl\" id=\"fssKbL\"></div><div class=\"kbn\" id=\"fssKbN\"></div></div></div>\n";while(d.firstChild)document.body.appendChild(d.firstChild);
    
(function(){
  var kb=document.getElementById('fssKb'),btn=document.getElementById('fssKbBtn'),L=document.getElementById('fssKbL'),N=document.getElementById('fssKbN');
  var cible=null,maj=false,verr=false,deplace=false,touches=[];
  // Clavier AZERTY complet : [normal, avec Maj, avec AltGr]
  var ctrl=false,alt=false,altgr=false,KEYS=[];
  var lignes=[
    ['ESC','F1','F2','F3','F4','F5','F6','F7','F8','F9','F10','F11','F12','HOME','END','DEL'],
    [['²'],['&','1'],['é','2','~'],['"','3','#'],["'",'4','{'],['(','5','['],['-','6','|'],['è','7','`'],['_','8','\\'],['ç','9','^'],['à','0','@'],[')','°',']'],['=','+','}'],'BACK'],
    ['TAB',['a'],['z'],['e'],['r'],['t'],['y'],['u'],['i'],['o'],['p'],['^','¨'],['$','£','¤'],'ENTER'],
    ['CAPS',['q'],['s'],['d'],['f'],['g'],['h'],['j'],['k'],['l'],['m'],['ù','%'],['*','µ']],
    ['SHIFT',['<','>'],['w'],['x'],['c'],['v'],['b'],['n'],[',','?'],[';','.'],[':','/'],['!','§'],'SHIFT'],
    ['CTRL','ALT','SPACE','ALTGR','CTRL','LEFT','UP','DOWN','RIGHT']
  ];
  var LARG={BACK:2,TAB:1.6,CAPS:1.9,ENTER:2.3,SHIFT:1.5,CTRL:1.4,ALT:1.2,ALTGR:1.2,SPACE:6,ESC:1.3,DEL:1.3,HOME:1.3,END:1.3};
  var SPEC={CTRL:'Ctrl',ALT:'Alt',ALTGR:'Alt Gr',ESC:'Échap',DEL:'Suppr',HOME:'Début',END:'Fin',LEFT:'←',RIGHT:'→',UP:'↑',DOWN:'↓',BACK:'⌫',TAB:'Tab ⇥',CAPS:'Verr. Maj',ENTER:'Entrée ↵',SPACE:'Espace',SHIFT:'⇧'};
  for(var fi=1;fi<=12;fi++)SPEC['F'+fi]='F'+fi;
  var pave=['7','8','9','4','5','6','1','2','3','0','000','BACK2','ENTER'];
  function champ(el){
    if(!el||!el.matches)return false;
    if(el.matches('textarea'))return !el.readOnly&&!el.disabled;
    if(!el.matches('input'))return el.isContentEditable===true;
    var t=(el.type||'text').toLowerCase();
    if(['checkbox','radio','button','submit','file','color','range','hidden','image','reset'].indexOf(t)!==-1)return false;
    return !el.readOnly&&!el.disabled;
  }
  document.addEventListener('focusin',function(e){
    if(kb.contains(e.target)||e.target===btn)return;
    if(champ(e.target)){cible=e.target;if(kb.classList.contains('on')){neutraliser(cible);placer();}}
  });
  function neutraliser(el){try{if(!el.__kbIm){el.__kbIm=[el.getAttribute('inputmode')];touches.push(el);}el.setAttribute('inputmode','none');}catch(e){}}
  function restaurer(){touches.forEach(function(el){try{var v=el.__kbIm&&el.__kbIm[0];if(v==null)el.removeAttribute('inputmode');else el.setAttribute('inputmode',v);delete el.__kbIm;}catch(e){}});touches=[];}
  function placer(){
    if(deplace||!cible||!document.body.contains(cible))return;
    var r=cible.getBoundingClientRect();
    kb.style.left='50%';kb.style.transform='translateX(-50%)';
    // Toujours en BAS de l'écran (jamais en haut). Si le champ visé passe derrière le clavier,
    // on fait défiler la page pour le ramener au-dessus plutôt que de déplacer le clavier.
    kb.style.bottom='10px';kb.style.top='auto';
    var h=kb.offsetHeight||300;
    if(r.bottom>window.innerHeight-h-10){try{cible.scrollIntoView({block:'center'});}catch(e){}}
  }
  function estLettre(c){return c.toLowerCase()!==c.toUpperCase();}
  function car(k){
    if(altgr&&k[2])return k[2];
    var n=k[0],l=estLettre(n);
    if(maj)return l?n.toUpperCase():(k[1]||n);
    if(verr)return l?n.toUpperCase():n;
    return n;
  }
  function majLabels(){
    L.querySelectorAll('.k[data-k]').forEach(function(b){b.textContent=car(KEYS[+b.getAttribute('data-k')]);});
    L.querySelectorAll('.k[data-a="SHIFT"]').forEach(function(s){s.classList.toggle('act',maj);});
    L.querySelectorAll('.k[data-a="CAPS"]').forEach(function(s){s.classList.toggle('act',verr);});
    L.querySelectorAll('.k[data-a="CTRL"]').forEach(function(s){s.classList.toggle('act',ctrl);});
    L.querySelectorAll('.k[data-a="ALT"]').forEach(function(s){s.classList.toggle('act',alt);});
    L.querySelectorAll('.k[data-a="ALTGR"]').forEach(function(s){s.classList.toggle('act',altgr);});
  }
  lignes.forEach(function(row){
    var r=document.createElement('div');r.className='kr';L.appendChild(r);
    row.forEach(function(k){
      var b=document.createElement('div');b.setAttribute('role','button');
      if(typeof k==='string'){
        b.className='k f';b.setAttribute('data-a',k);b.textContent=SPEC[k]||k;
        if(k==='SPACE')b.className='k';
        b.style.flex=String(LARG[k]||1);
        if(/^F\d+$/.test(k)){b.style.fontSize='calc(13px*var(--kbs))';b.style.height='calc(34px*var(--kbs))';}
      }else{
        b.className='k';b.setAttribute('data-k',String(KEYS.length));KEYS.push(k);b.textContent=k[0];
      }
      r.appendChild(b);
    });
  });
  majLabels();
  pave.forEach(function(k){
    var b=document.createElement('div');b.className='k'+(k==='ENTER'?' ent':(k==='BACK2'||k==='000'?' f':''));b.setAttribute('role','button');
    if(k==='BACK2'){b.setAttribute('data-a','BACK');b.textContent='⌫';}
    else if(k==='ENTER'){b.setAttribute('data-a','ENTER');b.textContent='↵';}
    else{b.setAttribute('data-n',k);b.textContent=k;}
    N.appendChild(b);
  });
  function declencher(el,type,opts){try{el.dispatchEvent(new Event(type,Object.assign({bubbles:true},opts||{})));}catch(e){}}
  function nombre(el){return (el.type||'').toLowerCase()==='number'||!('selectionStart' in el)||el.selectionStart==null;}
  function inserer(txt){
    var el=cible;if(!el||!document.body.contains(el))return;
    if(document.activeElement!==el)try{el.focus({preventScroll:true});}catch(e){}
    if(el.isContentEditable){document.execCommand('insertText',false,txt);return;}
    if(nombre(el)){
      if(txt==='.'||txt===',')txt=(el.type||'')==='number'?'.':txt;
      el.value=(el.value||'')+txt;
    }else{
      var s=el.selectionStart,e2=el.selectionEnd;
      el.setRangeText(txt,s,e2,'end');
    }
    declencher(el,'input');
  }
  function effacer(){
    var el=cible;if(!el||!document.body.contains(el))return;
    if(document.activeElement!==el)try{el.focus({preventScroll:true});}catch(e){}
    if(el.isContentEditable){document.execCommand('delete');return;}
    if(nombre(el)){el.value=String(el.value||'').slice(0,-1);}
    else{
      var s=el.selectionStart,e2=el.selectionEnd;
      if(s!==e2)el.setRangeText('',s,e2,'end');
      else if(s>0)el.setRangeText('',s-1,s,'end');
    }
    declencher(el,'input');
  }
  function entree(){
    var el=cible;if(!el)return;
    if(el.matches&&el.matches('textarea')){inserer('\n');return;}
    ['keydown','keypress','keyup'].forEach(function(t){
      evtMod(el,t,'Enter','Enter',13);
    });
    declencher(el,'change');
    if(el.form&&el.form.requestSubmit&&el.matches('input')){try{el.form.requestSubmit();}catch(e){}}
  }
  function tab(){
    var el=cible;if(!el)return;
    var liste=[].filter.call(document.querySelectorAll('input,textarea,select'),function(x){return champ(x)&&x.offsetParent!==null;});
    var i=liste.indexOf(el),n=liste[i+1]||liste[0];if(n){n.focus();}
  }
  function evtMod(el,type,key,code,kc){try{el.dispatchEvent(new KeyboardEvent(type,{key:key,code:code,keyCode:kc,which:kc,ctrlKey:ctrl,altKey:alt,bubbles:true,cancelable:true}));}catch(e){}}
  function combo(c){
    var el=pret()||document.body,k=String(c).toLowerCase(),K=k.toUpperCase();
    var code=/\d/.test(k)?'Digit'+k:/[a-z]/.test(k)?'Key'+K:'';
    var kc=K.charCodeAt(0);
    var ok=el.dispatchEvent(new KeyboardEvent('keydown',{key:k,code:code,keyCode:kc,which:kc,ctrlKey:ctrl,altKey:alt,bubbles:true,cancelable:true}));
    if(ok&&ctrl&&!alt){
      if(k==='a')toutSel();else if(k==='c')presse('copy');else if(k==='x')presse('cut');else if(k==='v')presse('paste');
      else if(k==='z'){try{document.execCommand('undo');}catch(e){}}else if(k==='y'){try{document.execCommand('redo');}catch(e){}}
    }
    el.dispatchEvent(new KeyboardEvent('keyup',{key:k,code:code,keyCode:kc,which:kc,ctrlKey:ctrl,altKey:alt,bubbles:true,cancelable:true}));
  }
  function pret(){var el=cible;if(!el||!document.body.contains(el))return null;if(document.activeElement!==el)try{el.focus({preventScroll:true});}catch(e){}return el;}
  function deplacer(d){
    var el=pret();if(!el)return;
    if(el.isContentEditable){try{window.getSelection().modify('move',d<0?'backward':'forward','character');}catch(e){}return;}
    if(nombre(el)){fleche(d<0?'ArrowLeft':'ArrowRight');return;}
    var n=Math.max(0,Math.min(el.value.length,(d>0?el.selectionEnd:el.selectionStart)+d));
    try{el.setSelectionRange(n,n);}catch(e){}
  }
  function fleche(key){
    var el=pret()||document.body;
    var code={ArrowUp:38,ArrowDown:40,ArrowLeft:37,ArrowRight:39}[key];
    ['keydown','keyup'].forEach(function(t){evtMod(el,t,key,key,code);});
  }
  function supprDevant(){
    var el=pret();if(!el)return;
    if(el.isContentEditable){document.execCommand('forwardDelete');return;}
    if(nombre(el)){el.value='';declencher(el,'input');return;}
    var s=el.selectionStart,e2=el.selectionEnd;
    if(s!==e2)el.setRangeText('',s,e2,'end');else if(s<el.value.length)el.setRangeText('',s,s+1,'end');
    declencher(el,'input');
  }
  function echap(){
    var el=pret()||document.body;
    ['keydown','keyup'].forEach(function(t){evtMod(el,t,'Escape','Escape',27);});
  }
  function toutSel(){var el=pret();if(!el)return;try{if(el.select)el.select();else document.execCommand('selectAll');}catch(e){}}
  function presse(op){
    var el=pret();if(!el)return;
    if(op==='paste'){
      var fini=false;
      try{if(navigator.clipboard&&navigator.clipboard.readText){navigator.clipboard.readText().then(function(t){fini=true;if(t)inserer(t);}).catch(function(){try{document.execCommand('paste');}catch(e){}});return;}}catch(e){}
      try{document.execCommand('paste');}catch(e){}
      return;
    }
    try{document.execCommand(op);}catch(e){}
    if(op==='cut')declencher(el,'input');
  }
  function action(b){
    var a=b.getAttribute('data-a'),kk=b.getAttribute('data-k'),n=b.getAttribute('data-n');
    if(a==='CTRL'){ctrl=!ctrl;majLabels();return;}
    if(a==='ALT'){alt=!alt;majLabels();return;}
    if(a==='ALTGR'){altgr=!altgr;majLabels();return;}
    var K=kk!=null?KEYS[+kk]:null;
    if((ctrl||alt)&&(K||n!=null)){
      var base=K?(/^[a-z]$/.test(K[0])?K[0]:(K[1]&&/\d/.test(K[1])?K[1]:K[0])):n;
      combo(base);ctrl=alt=false;majLabels();return;
    }
    if(K){inserer(car(K));if((maj||altgr)){maj=false;altgr=false;majLabels();}return;}
    if(n!=null){inserer(n);return;}
    if(/^F\d+$/.test(a||'')){var fn=+a.slice(1),el=pret()||document.body;['keydown','keyup'].forEach(function(t){evtMod(el,t,a,a,111+fn);});return;}
    if(a==='SHIFT'){maj=!maj;majLabels();return;}
    if(a==='CAPS'){verr=!verr;majLabels();return;}
    if(a==='SPACE')inserer(' ');
    else if(a==='BACK')effacer();
    else if(a==='ENTER')entree();
    else if(a==='TAB')tab();
    else if(a==='HIDE')fermer();
    else if(a==='LEFT')deplacer(-1);
    else if(a==='RIGHT')deplacer(1);
    else if(a==='HOME')deplacer(-1e9);
    else if(a==='END')deplacer(1e9);
    else if(a==='UP'||a==='DOWN')fleche(a==='UP'?'ArrowUp':'ArrowDown');
    else if(a==='DEL')supprDevant();
    else if(a==='ESC')echap();
    else if(a==='CTRLA')toutSel();
    else if(a==='COPY')presse('copy');
    else if(a==='CUT')presse('cut');
    else if(a==='PASTE')presse('paste');
  }
  var actionBase=action;
  action=function(b){var a=b.getAttribute('data-a');actionBase(b);if((ctrl||alt)&&a!=='CTRL'&&a!=='ALT'&&a!=='ALTGR'&&a!=='SHIFT'){ctrl=alt=false;majLabels();}};
  var rep=null,repI=null;
  function stopRep(){clearTimeout(rep);clearInterval(repI);rep=repI=null;document.querySelectorAll('#fssKb .k.press').forEach(function(k){k.classList.remove('press');});}
  kb.addEventListener('pointerdown',function(e){
    var b=e.target.closest&&e.target.closest('.k');
    if(!b)return;
    e.preventDefault();
    b.classList.add('press');
    action(b);
    if(['BACK','SPACE','LEFT','RIGHT','UP','DOWN','DEL'].indexOf(b.getAttribute('data-a'))!==-1){
      rep=setTimeout(function(){repI=setInterval(function(){action(b);},70);},420);
    }
  });
  ['pointerup','pointercancel','pointerleave'].forEach(function(ev){kb.addEventListener(ev,stopRep);});
  kb.addEventListener('mousedown',function(e){if(!(e.target.id==='fssKbX'))e.preventDefault();});
  // déplacer le clavier
  var dx=0,dy=0,drag=false;
  document.getElementById('fssKbH').addEventListener('pointerdown',function(e){
    if(e.target.id==='fssKbX'||(e.target.classList&&e.target.classList.contains('kbz')))return;
    drag=true;var r=kb.getBoundingClientRect();dx=e.clientX-r.left;dy=e.clientY-r.top;
    try{this.setPointerCapture(e.pointerId);}catch(x){}
    e.preventDefault();
  });
  document.getElementById('fssKbH').addEventListener('pointermove',function(e){
    if(!drag)return;deplace=true;
    kb.style.transform='none';kb.style.left=Math.max(0,Math.min(window.innerWidth-60,e.clientX-dx))+'px';kb.style.top=Math.max(0,Math.min(window.innerHeight-40,e.clientY-dy))+'px';kb.style.bottom='auto';
  });
  document.getElementById('fssKbH').addEventListener('pointerup',function(){drag=false;});
  // Taille du clavier réglable (A− / A+), mémorisée sur ce poste
  var echelle=1;
  try{var sv=parseFloat(localStorage.getItem('fss-kb-echelle'));if(sv>=0.4&&sv<=1.3)echelle=sv;}catch(x){}
  function appliquerEchelle(){
    kb.style.setProperty('--kbs',echelle);
    var pc=document.getElementById('fssKbPct');if(pc)pc.textContent=Math.round(echelle*100)+'%';
    try{localStorage.setItem('fss-kb-echelle',String(echelle));}catch(x){}
    if(kb.classList.contains('on'))placer();
  }
  function changerEchelle(d){echelle=Math.max(0.4,Math.min(1.3,Math.round((echelle+d)*10)/10));appliquerEchelle();}
  document.getElementById('fssKbMoins').addEventListener('click',function(){changerEchelle(-0.1);});
  document.getElementById('fssKbPlus').addEventListener('click',function(){changerEchelle(0.1);});
  appliquerEchelle();
  function ouvrir(){
    kb.classList.add('on');btn.classList.add('on');deplace=false;
    var a=document.activeElement;if(champ(a)&&!kb.contains(a))cible=a;
    if(cible)neutraliser(cible);
    placer();majLabels();
  }
  function fermer(){kb.classList.remove('on');btn.classList.remove('on');restaurer();stopRep();}
  btn.addEventListener('mousedown',function(e){e.preventDefault();});
  btn.addEventListener('pointerdown',function(e){e.preventDefault();});
  btn.addEventListener('click',function(){if(kb.classList.contains('on'))fermer();else ouvrir();});
  document.getElementById('fssKbX').addEventListener('click',fermer);
  document.addEventListener('keydown',function(e){if(e.key==='F8'){e.preventDefault();if(kb.classList.contains('on'))fermer();else ouvrir();}});
  window.fssClavierOuvrir=ouvrir;window.fssClavierFermer=fermer;
})();

  }
  function auto(){
    // Écran tactile sans clavier physique : le clavier s'ouvre tout seul dès qu'on touche un champ de saisie.
    document.addEventListener('focusin',function(e){
      var t=e.target;if(!t||!t.tagName)return;
      var ok=(t.tagName==='TEXTAREA')||(t.tagName==='INPUT'&&/^(text|password|number|tel|search|email|url|)$/i.test(t.type||''));
      if(ok&&!(t.readOnly||t.disabled)&&window.fssClavierOuvrir)setTimeout(function(){try{window.fssClavierOuvrir();}catch(x){}},60);
    });
  }
  if(document.body){monter();auto();}else document.addEventListener('DOMContentLoaded',function(){monter();auto();});
})();
