/* Beta Discover guided card entry. UI only: never correct identities, call providers, or save evidence. */
(()=>{"use strict";
const FIELD='[data-ffguided-field]',FORM='[data-customer-discovery-form]',MAIN='#main-content';
// Calendar years plus two-year seasons (basketball/hockey sets are printed as 2025-26), newest first.
const years=(()=>{const top=new Date().getFullYear()+1,out=[];for(let y=top;y>=1880;y-=1){if(y<top&&y>=1950)out.push(y+'-'+String((y+1)%100).padStart(2,'0'));out.push(String(y));}return out;})();
const makers=['Topps','Bowman','Panini','Upper Deck','Donruss','Fleer','Score','Leaf','O-Pee-Chee','Other'];
const graders=['PSA','BGS','SGC','CGC','CSG','TAG','BCCG'],grades=['10','9.5','9','8.5','8','7.5','7','6.5','6','5.5','5','4.5','4','3.5','3','2.5','2','1.5','1'];
const values={year:'',maker:'',other:'',set:'',player:'',number:'',parallel:'',grader:'',grade:''};
const esc=v=>String(v||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const norm=v=>String(v||'').trim().replace(/\s+/g,' ');
const route=()=>String(location.hash||'#/dashboard').replace(/^#\/?/,'').split(/[/?]/)[0]||'dashboard';
const opts=(items,current)=>items.map(s=>'<option value="'+esc(s)+'"'+(s===current?' selected':'')+'>'+esc(s)+'</option>').join('');
function compose(d){
 const year=norm(d.year),maker=norm(d.maker==='Other'?d.other:d.maker),set=norm(d.set),
 player=norm(d.player),number=norm(d.number).replace(/^(?:#|No\.?\s*)/i,''),parallel=norm(d.parallel),
 grader=norm(d.grader),grade=norm(d.grade);
 const season=year.match(/^(\d{4})-(\d{2})$/);const startYear=season?+season[1]:+year;
 if(!/^\d{4}(?:-\d{2})?$/.test(year)||startYear<1880||startYear>new Date().getFullYear()+1||(season&&(startYear+1)%100!==+season[2]))return {error:'Choose a release year.'};
 if(!maker||!set||!player)return {error:'Manufacturer, set/product and player are needed to distinguish cards.'};
 if(!/^[A-Za-z0-9][A-Za-z0-9.-]{0,35}$/.test(number))return {error:'Enter the exact card number (for example, 150 or PC-19).'};
 if((grader&&!grade)||(!grader&&grade))return {error:'Choose both grading company and numeric grade, or leave both unspecified.'};
 const query=[year,maker,set,player,'#'+number,parallel,grader?grader+' '+grade:''].filter(Boolean).join(' ');
 return query.length>500?{error:'Shorten the card description.'}:{query};
}
function field(label,key,placeholder,max=110){
 return '<label>'+label+'<input '+FIELD.slice(1,-1)+'="'+key+'" value="'+esc(values[key])+'" maxlength="'+max+'" placeholder="'+esc(placeholder)+'" autocomplete="off"></label>';
}
function picker(label,key,items,empty){
 return '<label>'+label+'<select data-ffguided-field="'+key+'"><option value="">'+esc(empty)+'</option>'+opts(items,values[key])+'</select></label>';
}
function guidedMarkup(){
 return '<summary><span>GUIDED SEARCH</span><strong>Choose the card details</strong><small>Or type directly in the search below.</small></summary>'+
 '<fieldset class="ffguided-fields"><legend>Build an exact-card description</legend>'+
 '<p>These help you write the card description. They don\u2019t confirm the exact card: after filling, search listings, or use <b>Check card identity</b> if you\u2019re unsure of the version.</p>'+
 '<div class="ffguided-grid">'+
 picker('Year or season','year',years,'Select year')+picker('Manufacturer','maker',makers,'Select manufacturer')+
 '<label class="ffguided-other"'+(values.maker==='Other'?'':' hidden')+'>Other manufacturer<input data-ffguided-field="other" maxlength="70" value="'+esc(values.other)+'" placeholder="As printed on card"></label>'+
 field('Set / product','set','e.g. Chrome, Prizm, Series 1')+field('Player / subject','player','e.g. Shohei Ohtani')+
 field('Card number','number','e.g. 150 or PC-19',36)+field('Parallel / variation (optional)','parallel','e.g. Silver')+
 picker('Grading company','grader',graders,'Unspecified / raw')+picker('Grade','grade',grades,'Not specified')+
 '</div><div class="ffguided-actions"><button type="button" class="button button-primary" data-ffguided-build>Fill card description ↓</button>'+
 '<small role="status" aria-live="polite" data-ffguided-message>Anything not listed here can still be typed in the search below.</small></div></fieldset>';
}
function addGuided(main){
 if(route()!=='discover')return;
 const form=main.querySelector(FORM),query=form?.querySelector('input[name="exactCardQuery"]');
 if(!query||form.querySelector('[data-ffguided]'))return;
 const details=document.createElement('details');details.className='ffguided-entry';details.dataset.ffguided='';details.open=!window.matchMedia('(max-width:960px)').matches;details.innerHTML=guidedMarkup();
 form.insertBefore(details,form.firstElementChild);
 const remember=event=>{const f=event.target.closest('[data-ffguided-field]');if(!f)return;values[f.dataset.ffguidedField]=f.value;
 if(f.dataset.ffguidedField==='maker'){const extra=details.querySelector('.ffguided-other');if(extra)extra.hidden=f.value!=='Other';}};
 details.addEventListener('input',remember);details.addEventListener('change',remember);
 details.querySelector('[data-ffguided-build]').addEventListener('click',()=>{
  const result=compose(values),status=details.querySelector('[data-ffguided-message]');
  if(result.error){status.textContent=result.error;return;}
  query.value=result.query;
  query.dispatchEvent(new Event('input',{bubbles:true}));
  status.textContent='Description filled below. Check it, then search listings.';
  details.open=false;try{query.focus({preventScroll:true});}catch(_){query.focus();}
 });
}
// The Private Beta Home "Start here" panel is rendered by the Dashboard owner (commercial-dashboard-v2.js).
let queued=false;
function enhance(){if(!/^\/(?:app|saas-prototype|owner\/customer)(?:\/|$)/i.test(location.pathname))return;
 const main=document.querySelector(MAIN);if(!main)return;addGuided(main);}
function queue(){if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;enhance();});}
function init(){const main=document.querySelector(MAIN);if(!main)return;new MutationObserver(queue).observe(main,{childList:true});
 window.addEventListener('hashchange',queue);window.addEventListener('pageshow',queue);queue();}
window.FlipForgeGuidedEntryV1=Object.freeze({compose});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();