(()=>{
  const error=document.querySelector("[data-beta-form-error]");
  if(!error)return;
  const status=new URLSearchParams(location.search).get("status");
  if(status!=="invalid")return;
  error.hidden=false;
  error.scrollIntoView({block:"center"});
})();

// Arriving from a homepage audience ("?goal=flipper"): pre-select matching answers the form already has.
// Only existing options are used; nothing is submitted and every answer stays editable.
(()=>{
  const form=document.querySelector("[data-beta-application-form]");
  if(!form)return;
  const goal=new URLSearchParams(location.search).get("goal");
  const GOALS={
    flipper:{label:"a flipper",type:"Flipper / reseller",focus:"Supported value / decision guidance"},
    investor:{label:"an investor",type:"",focus:"Tracking and outcome review"},
    collector:{label:"a collector",type:"Collector",focus:"Exact-card identity"},
    dealer:{label:"a dealer",type:"Dealer / shop",focus:"Evidence and comparable-sale review"},
    grading:{label:"a grading-focused buyer",type:"Grading-focused collector",focus:"PSA / grading scenarios",grading:true}
  };
  const fit=GOALS[goal];
  if(!fit)return;
  const choose=(name,value)=>{
    const select=form.querySelector(`select[name="${name}"]`);
    if(!select||!value||select.value)return;
    const option=[...select.options].find(o=>o.value===value||o.text===value);
    if(option)select.value=option.value;
  };
  choose("collector_type",fit.type);
  const focus=form.querySelector('select[name="testing_focus"]');
  const focusOption=focus&&[...focus.options].find(o=>o.text===fit.focus);
  if(focusOption)focus.value=focusOption.value;
  if(fit.grading){const box=form.querySelector('input[name="grading_interest"]');if(box)box.checked=true;}
  const intro=form.querySelector(".ff-aw-beta-form-intro");
  if(intro){
    const note=document.createElement("p");
    note.className="ff-beta-goal-note";
    note.textContent=`You chose FlipForge as ${fit.label} on the homepage, so a few answers are pre-selected. Change anything that does not fit.`;
    intro.append(note);
  }
})();
