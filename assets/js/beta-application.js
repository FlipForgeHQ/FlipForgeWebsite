(()=>{
  const error=document.querySelector("[data-beta-form-error]");
  if(!error)return;
  const status=new URLSearchParams(location.search).get("status");
  if(status!=="invalid")return;
  error.hidden=false;
  error.scrollIntoView({block:"center"});
})();
