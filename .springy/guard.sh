#!/bin/bash
# Polls run $1 every 5 minutes; cancels it if a job failed or the ci job's coverage step falls back for over 4 minutes.
RUN=$1
G=$(ls -dt /Users/microsoft/.local/agency/plugins/sessions/*/root-1/ms-desk/bin/gh-account.mjs | head -1)
for i in $(seq 1 24); do
  sleep 300
  G=$(ls -dt /Users/microsoft/.local/agency/plugins/sessions/*/root-1/ms-desk/bin/gh-account.mjs | head -1)
  node $G personal api "repos/ourostack/ouro-ui/actions/runs/$RUN/jobs?per_page=100" 2>&1 | node -e '
let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{let j;try{j=JSON.parse(s).jobs}catch{console.log("api error");process.exit(0)}
const failed=j.filter(x=>x.conclusion==="failure").map(x=>x.name);
const ci=j.find(x=>x.name==="ci");const step=ci&&ci.steps&&ci.steps.find(x=>x.name==="Browser test coverage"&&x.status==="in_progress");
const long=step&&(Date.now()-Date.parse(step.started_at))>4*60*1000;
const done=j.length>0&&j.every(x=>x.status==="completed");
console.log(new Date().toISOString(),JSON.stringify({failed,long:!!long,done,pending:j.filter(x=>x.status!=="completed").length}));
process.exit(failed.length?2:done?3:0);});'
  rc=$?
  if [ $rc = 2 ]; then node $G personal run cancel $RUN --repo ourostack/ouro-ui; echo CANCELLED; exit 2; fi
  if [ $rc = 3 ]; then echo DONE; exit 0; fi
done
