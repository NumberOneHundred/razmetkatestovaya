import { useState, useEffect, useMemo, useRef } from "react";
import { db, ref, set, onValue, remove } from "../lib/firebase";
import { CRITERIA, CRITERIA_ORDER, GROUP_COLORS } from "../lib/criteria";
import Head from "next/head";

const C = {
  bg:"#0D1117",s:"#161B22",s2:"#1C2333",s3:"#21262D",
  b:"#30363D",ba:"#4A9EFF",t:"#C9D1D9",m:"#8B949E",d:"#484F58",
  a:"#4A9EFF",as:"rgba(74,158,255,.1)",ah:"rgba(74,158,255,.2)",
  g:"#3FB950",gs:"rgba(63,185,80,.12)",o:"#D29922",os:"rgba(210,153,34,.12)",
  r:"#F85149",rs:"rgba(248,81,73,.12)",bl:"#58A6FF",bls:"rgba(88,166,255,.1)",
  tu:"#4A9EFF",st:"#F0883E",y:"#E3B341",ys:"rgba(227,179,65,.12)",
};
const STS={unassigned:{l:"Не назначен",c:C.d},annotating:{l:"Разметка",c:C.o},review:{l:"На ревью",c:C.bl},done:{l:"Готово",c:C.g}};
function ek(e){return e.replace(/[.#$/[\]@]/g,"_");}

function Btn({children,onClick,color,bg,disabled,style}){return<button onClick={onClick} disabled={disabled} style={{padding:"6px 14px",borderRadius:6,border:"1px solid "+(color||C.b),background:bg||"transparent",color:color||C.m,fontSize:11,fontWeight:600,cursor:disabled?"default":"pointer",opacity:disabled?.5:1,...style}}>{children}</button>;}
function Badge({status}){const s=STS[status]||STS.unassigned;return<span style={{display:"inline-flex",alignItems:"center",gap:4,padding:"2px 8px",borderRadius:12,fontSize:10,fontWeight:600,color:s.c,border:"1px solid "+s.c+"30",background:s.c+"10"}}><span style={{width:5,height:5,borderRadius:"50%",background:s.c}}/>{s.l}</span>;}
function Progress({done,total}){const pct=total?Math.round(done/total*100):0;return<div style={{display:"flex",alignItems:"center",gap:8}}><div style={{flex:1,height:4,background:C.s3,borderRadius:2,overflow:"hidden"}}><div style={{width:pct+"%",height:"100%",background:pct===100?C.g:C.a,borderRadius:2,transition:"width .3s"}}/></div><span style={{fontSize:10,color:C.m,minWidth:32}}>{pct}%</span></div>;}

function DiffDot({auto,manual}){
  if(auto===undefined||auto===null||auto==="")return null;
  const a=String(auto),m=String(manual||"");
  if(!m)return<span style={{fontSize:9,padding:"1px 5px",borderRadius:3,background:C.s3,color:C.d}} title={"auto: "+a}>🤖{a}</span>;
  if(a===m)return<span style={{fontSize:9,padding:"1px 5px",borderRadius:3,background:C.gs,color:C.g}} title="auto=manual">✓</span>;
  return<span style={{fontSize:9,padding:"1px 5px",borderRadius:3,background:C.ys,color:C.y}} title={"auto:"+a+" manual:"+m}>⚡{a}→{m}</span>;
}

function parseDialogueText(text){
  if(!text)return[];const parts=[],lines=String(text).split("\n");let cur=null;
  for(const line of lines){const tl=line.trim();
    if(/^[Тт][:ьютор]/i.test(tl)||tl.startsWith("tutor")||tl.startsWith("Т:")){if(cur)parts.push(cur);cur={role:"tutor",lines:[tl.replace(/^tutor\s*/,"").replace(/^Т:\s*/,"").replace(/^Тьютор:\s*/i,"")]};}
    else if(/^[Уу][:ченик]/i.test(tl)||tl.startsWith("student")||tl.startsWith("У:")){if(cur)parts.push(cur);cur={role:"student",lines:[tl.replace(/^student\s*/,"").replace(/^У:\s*/,"").replace(/^Ученик:\s*/i,"")]};}
    else if(cur){cur.lines.push(tl);}
    else{parts.push({role:"system",lines:[tl]});}}
  if(cur)parts.push(cur);return parts;
}

function renderViz(text){
  if(!text||!text.includes("<viz"))return null;
  const intent=(text.match(/intent="([^"]*)"/) ||[])[1]||"";
  const style=(text.match(/style="([^"]*)"/) ||[])[1]||"";
  const desc=intent?intent:style?style:"визуализация";
  return<div style={{background:"#1a2332",border:"1px solid "+C.bl+"30",borderRadius:8,padding:"8px 12px",margin:"6px 0",fontSize:11,color:C.bl}}>
    <span style={{marginRight:6,fontSize:13}}>🎨</span>
    <span style={{fontStyle:"italic"}}>{desc}</span>
  </div>;
}

function PairCard({pair,score,autoScore,onScore,criterion,showDiff}){
  const cr=CRITERIA[criterion];const scores=cr?cr.scores:["1","0"];
  const parts=parseDialogueText(pair.text);const viz=renderViz(pair.text);
  return<div style={{background:C.s,border:"1px solid "+C.b,borderRadius:10,padding:14,marginBottom:8}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
      <div style={{display:"flex",alignItems:"center",gap:6}}>
        <span style={{fontSize:10,fontWeight:700,color:C.d,background:C.s3,padding:"2px 8px",borderRadius:4}}>#{pair.num}</span>
        {showDiff&&<DiffDot auto={autoScore} manual={score}/>}
      </div>
      <div style={{display:"flex",gap:4}}>
        {scores.map(s=>{const active=score===s;const sc=s==="0"?C.r:s==="1"?C.g:s==="2"?C.a:C.d;
          return<button key={s} onClick={()=>onScore(s)} style={{padding:"4px 10px",borderRadius:5,border:"1px solid "+(active?sc:C.b),background:active?sc+"20":"transparent",color:active?sc:C.m,fontSize:11,fontWeight:600,cursor:"pointer",minWidth:28}}>{s}</button>;})}
      </div>
    </div>
    <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:12,lineHeight:1.7}}>
      {parts.map((p,i)=><div key={i} style={{marginBottom:4}}>
        <span style={{fontWeight:600,color:p.role==="tutor"?C.tu:p.role==="student"?C.st:C.d,marginRight:6,fontSize:10,textTransform:"uppercase"}}>{p.role==="tutor"?"tutor":p.role==="student"?"student":""}</span>
        <span style={{color:p.role==="tutor"?C.tu+"dd":C.t}}>{p.lines.join("\n")}</span>
      </div>)}
      {viz}
    </div>
    {pair.board&&<div style={{marginTop:6,padding:"6px 10px",background:C.s3,borderRadius:6,fontSize:11,color:C.m}}>📋 {pair.board}</div>}
  </div>;
}

function CriterionPanel({code,expanded,onToggle}){
  const cr=CRITERIA[code];if(!cr)return null;const gc=GROUP_COLORS[cr.group]||C.a;
  return<div style={{background:C.s,border:"1px solid "+C.b,borderRadius:10,padding:"12px 16px",marginBottom:12}}>
    <div onClick={onToggle} style={{cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
      <div style={{display:"flex",alignItems:"center",gap:8}}>
        <span style={{fontSize:9,fontWeight:700,padding:"2px 6px",borderRadius:4,background:gc+"20",color:gc}}>{cr.groupName}</span>
        <span style={{fontSize:18,fontWeight:800,color:C.a}}>{code}</span>
        <span style={{fontSize:13,fontWeight:600,color:C.t}}>{cr.name}</span>
      </div>
      <span style={{color:C.d,fontSize:12}}>{expanded?"▲":"▼"}</span>
    </div>
    {expanded&&<div style={{marginTop:10,borderTop:"1px solid "+C.b,paddingTop:10}}>
      <div style={{marginBottom:8}}><div style={{fontSize:10,fontWeight:600,color:C.d,marginBottom:4}}>ЧТО ОЦЕНИВАЕТ</div><div style={{fontSize:12,lineHeight:1.6,color:C.m,whiteSpace:"pre-wrap"}}>{cr.what}</div></div>
      <div style={{marginBottom:8}}><div style={{fontSize:10,fontWeight:600,color:C.d,marginBottom:4}}>КАК ОЦЕНИВАТЬ</div><div style={{fontSize:12,lineHeight:1.6,color:C.t,whiteSpace:"pre-wrap",background:C.s2,padding:10,borderRadius:6}}>{cr.how}</div></div>
      {cr.examples&&<div><div style={{fontSize:10,fontWeight:600,color:C.d,marginBottom:4}}>ПРИМЕРЫ</div><div style={{fontSize:11,lineHeight:1.6,color:C.m,whiteSpace:"pre-wrap",borderLeft:"3px solid "+C.a,paddingLeft:10}}>{cr.examples}</div></div>}
    </div>}
  </div>;
}

function LoginScreen({users,onLogin}){
  const[email,setEmail]=useState("");const[err,setErr]=useState("");
  function go(){const u=users.find(u=>u.email.toLowerCase()===email.trim().toLowerCase());if(u)onLogin(u);else setErr("Нет доступа");}
  return<div style={{minHeight:"100vh",background:C.bg,display:"flex",alignItems:"center",justifyContent:"center"}}>
    <div style={{background:C.s,border:"1px solid "+C.b,borderRadius:14,padding:32,width:380}}>
      <div style={{textAlign:"center",marginBottom:24}}><div style={{fontSize:22,fontWeight:800}}><span style={{color:C.a}}>◈</span> Annotation Tool</div><div style={{fontSize:12,color:C.d,marginTop:4}}>Введи корпоративный email</div></div>
      <input value={email} onChange={e=>{setEmail(e.target.value);setErr("");}} placeholder="email@company.ru" style={{width:"100%",padding:"10px 14px",borderRadius:8,border:"1px solid "+C.b,background:C.bg,color:C.t,fontSize:14,boxSizing:"border-box",marginBottom:12}} onKeyDown={e=>{if(e.key==="Enter")go();}}/>
      {err&&<div style={{fontSize:11,color:C.r,marginBottom:10}}>{err}</div>}
      <button onClick={go} style={{width:"100%",padding:"10px",borderRadius:8,border:"none",background:email.trim()?C.a:C.d,color:"#fff",fontSize:13,fontWeight:700,cursor:email.trim()?"pointer":"default"}}>Войти</button>
    </div></div>;
}

function UsersModal({users,onAdd,onRemove,onClose}){
  const[email,setEmail]=useState("");const[name,setName]=useState("");const[role,setRole]=useState("editor");
  return<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.7)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000}} onClick={onClose}>
    <div onClick={e=>e.stopPropagation()} style={{background:C.s,border:"1px solid "+C.b,borderRadius:14,padding:24,width:480,maxHeight:"80vh",overflow:"auto"}}>
      <h2 style={{fontSize:16,fontWeight:700,marginBottom:16,color:C.t}}>👥 Сотрудники</h2>
      {users.map(u=><div key={u.email} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"8px 12px",background:C.bg,border:"1px solid "+C.b,borderRadius:7,marginBottom:4}}>
        <div><div style={{fontSize:12,fontWeight:600,color:C.t}}>{u.name}</div><div style={{fontSize:10,color:C.d}}>{u.email} • {u.role}</div></div>
        <Btn onClick={()=>onRemove(u.email)} color={C.r} bg={C.rs}>Удалить</Btn>
      </div>)}
      <div style={{borderTop:"1px solid "+C.b,paddingTop:16,marginTop:12}}>
        <div style={{display:"flex",gap:6,marginBottom:8}}>
          <input value={email} onChange={e=>setEmail(e.target.value)} placeholder="email" style={{flex:2,padding:"7px 10px",borderRadius:6,border:"1px solid "+C.b,background:C.bg,color:C.t,fontSize:12}}/>
          <input value={name} onChange={e=>setName(e.target.value)} placeholder="Имя" style={{flex:1,padding:"7px 10px",borderRadius:6,border:"1px solid "+C.b,background:C.bg,color:C.t,fontSize:12}}/>
        </div>
        <div style={{display:"flex",gap:6,marginBottom:10}}>
          {["editor","reviewer","manager"].map(r=><Btn key={r} onClick={()=>setRole(r)} color={role===r?C.a:C.m} bg={role===r?C.as:"transparent"}>{r==="editor"?"✏️ Разметчик":r==="reviewer"?"👁 Ревьюер":"📊 Менеджер"}</Btn>)}
        </div>
        <Btn onClick={()=>{if(email.trim()&&name.trim()){onAdd({email:email.trim(),name:name.trim(),role});setEmail("");setName("");}}} color={C.g} bg={C.gs}>+ Добавить</Btn>
      </div>
    </div></div>;
}

/* ═══ IMPORT ═══ */
async function parseXlsx(file){
  const XLSX=await import("xlsx");
  const buf=await file.arrayBuffer();
  const wb=XLSX.read(buf,{type:"array"});
  const skip=["критери","empty"];
  const autoSheets={},manualSheets={};

  for(const name of wb.SheetNames){
    if(skip.some(s=>name.toLowerCase().includes(s)))continue;
    const prefix=name.match(/^(s\d+)/);
    if(!prefix)continue;
    const p=prefix[1];
    if(name.includes("_auto")||/^s\d+_[A-Z]/.test(name)&&!name.includes("!")){
      autoSheets[p]=name;
    } else {
      if(!manualSheets[p])manualSheets[p]=[];
      manualSheets[p].push(name);
    }
  }

  const dialogues=[];
  const allPrefixes=new Set([...Object.keys(autoSheets),...Object.keys(manualSheets)]);

  for(const p of allPrefixes){
    // Parse auto scores if available
    let autoScores={};
    if(autoSheets[p]){
      const ws=wb.Sheets[autoSheets[p]];
      const data=XLSX.utils.sheet_to_json(ws,{header:1});
      const headers=data[1]||[];
      for(let r=2;r<data.length;r++){
        const row=data[r];if(!row||!row[1])continue;
        const pairNum=String(row[0]||r-1);
        for(let c=4;c<headers.length;c++){
          const code=String(headers[c]||"").trim();
          const val=row[c];
          if(code&&val!==undefined&&val!==null&&val!==""){
            if(!autoScores[code])autoScores[code]={};
            autoScores[code][pairNum]=String(val);
          }
        }
      }
    }

    // Parse manual sheets
    const manuals=manualSheets[p]||[];
    if(manuals.length===0&&autoSheets[p]){
      // Only auto exists — create dialogue from auto
      const ws=wb.Sheets[autoSheets[p]];
      const data=XLSX.utils.sheet_to_json(ws,{header:1});
      const pairs=[];let sessionId="";
      for(let r=2;r<data.length;r++){
        const row=data[r];if(!row||!row[1])continue;
        const txt=String(row[1]||"");
        if(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(txt.trim())){sessionId=txt.trim();continue;}
        if(/^#?id.?сессии$/i.test(txt.trim())||/^session.?id$/i.test(txt.trim())){sessionId=String(row[0]||"");continue;}
        pairs.push({num:String(row[0]||r-1),text:txt,board:String(row[2]||""),image:String(row[3]||"")});
      }
      if(pairs.length>0){
        const id=autoSheets[p].replace(/[.#$/[\]!+ ]/g,"_");
        dialogues.push({id,title:autoSheets[p],pairs,status:"unassigned",assignedTo:null,annotations:{},autoScores,sessionId});
      }
      continue;
    }

    for(const mName of manuals){
      const ws=wb.Sheets[mName];
      const data=XLSX.utils.sheet_to_json(ws,{header:1});
      const headers=data[1]||[];
      const pairs=[];
      const annotations={};
      let sessionId="";

      for(let r=2;r<data.length;r++){
        const row=data[r];if(!row||!row[1])continue;
        const pairNum=String(row[0]||r-1);
        const txt=String(row[1]||"");
        if(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(txt.trim())){sessionId=txt.trim();continue;}
        if(/^#?id.?сессии$/i.test(txt.trim())||/^session.?id$/i.test(txt.trim())){sessionId=pairNum;continue;}
        pairs.push({num:pairNum,text:txt,board:String(row[2]||""),image:String(row[3]||"")});
        for(let c2=4;c2<headers.length;c2++){
          const code=String(headers[c2]||"").trim();
          const val=row[c2];
          if(code&&val!==undefined&&val!==null&&val!==""&&!code.includes("Комментарий")&&!code.includes("IFERROR")){
            if(!annotations[code])annotations[code]={};
            annotations[code][pairNum]=String(val);
          }
        }
      }

      if(pairs.length>0){
        const id=mName.replace(/[.#$/[\]!+ ]/g,"_");
        dialogues.push({id,title:mName,pairs,status:Object.keys(annotations).length>0?"review":"unassigned",assignedTo:null,annotations,autoScores,sessionId});
      }
    }
  }
  return dialogues;
}

async function exportXlsx(dialogues){
  const XLSX=await import("xlsx");const wb=XLSX.utils.book_new();
  for(const dlg of dialogues){
    const h2=["ID сессии","№","Диалоговая пара","Доска","Скриншот"].concat(CRITERIA_ORDER);
    const rows=[h2];
    for(const pair of(dlg.pairs||[])){
      const row=[dlg.sessionId||"",pair.num,pair.text,pair.board,pair.image];
      for(const code of CRITERIA_ORDER){const ann=(dlg.annotations||{})[code];row.push(ann?ann[String(pair.num)]||"":"");}
      rows.push(row);
    }
    const ws=XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb,ws,dlg.title.substring(0,31));
  }
  XLSX.writeFile(wb,"annotation_export.xlsx");
}

/* ═══ DIFF SUMMARY ═══ */
function DiffSummary({dialogue}){
  const auto=dialogue.autoScores||{};
  const manual=dialogue.annotations||{};
  const pairs=dialogue.pairs||[];
  let total=0,diffs=0,agree=0;
  for(const code of CRITERIA_ORDER){
    const a=auto[code]||{};const m=manual[code]||{};
    for(const p of pairs){
      const av=a[String(p.num)],mv=m[String(p.num)];
      if(av!==undefined&&av!==""&&mv!==undefined&&mv!==""){total++;if(String(av)!==String(mv))diffs++;else agree++;}
    }
  }
  if(total===0)return<span style={{fontSize:10,color:C.d}}>нет auto</span>;
  const pct=Math.round(agree/total*100);
  return<div style={{display:"flex",alignItems:"center",gap:8}}>
    <span style={{fontSize:10,color:diffs>0?C.y:C.g}}>⚡ {diffs} расхождений из {total}</span>
    <span style={{fontSize:10,color:C.d}}>({pct}% совпадение)</span>
  </div>;
}

/* ═══ ANNOTATOR SCREEN ═══ */
function AnnotatorScreen({dialogue,user,onBack,showDiff}){
  const[crIdx,setCrIdx]=useState(0);
  const[expanded,setExpanded]=useState(true);
  const[annotations,setAnnotations]=useState(dialogue.annotations||{});
  const code=CRITERIA_ORDER[crIdx];
  const pairs=dialogue.pairs||[];
  const autoScores=dialogue.autoScores||{};
  const autoForCriterion=autoScores[code]||{};

  const totalCells=CRITERIA_ORDER.length*pairs.length;
  const doneCells=CRITERIA_ORDER.reduce((s,c)=>{const ann=annotations[c]||{};return s+pairs.filter(p=>ann[String(p.num)]!==undefined&&ann[String(p.num)]!=="").length;},0);
  const curScores=annotations[code]||{};
  const curDone=pairs.filter(p=>curScores[String(p.num)]!==undefined&&curScores[String(p.num)]!=="").length;

  // Count diffs for current criterion
  const curDiffs=pairs.filter(p=>{const a=autoForCriterion[String(p.num)],m=curScores[String(p.num)];return a!==undefined&&a!==""&&m!==undefined&&m!==""&&String(a)!==String(m);}).length;

  function setScore(pairNum,val){
    const newAnn={...annotations};if(!newAnn[code])newAnn[code]={};
    newAnn[code][String(pairNum)]=val;setAnnotations(newAnn);
    set(ref(db,"ann_dialogues/"+dialogue.id+"/annotations/"+code+"/"+String(pairNum)),val);
  }
  function handleFinish(){set(ref(db,"ann_dialogues/"+dialogue.id+"/status"),"review");onBack();}
  function handleApprove(){set(ref(db,"ann_dialogues/"+dialogue.id+"/status"),"done");onBack();}
  function handleReject(){set(ref(db,"ann_dialogues/"+dialogue.id+"/status"),"annotating");onBack();}
  const isReviewer=user.role==="reviewer"||user.role==="manager";

  return<div style={{minHeight:"100vh",background:C.bg}}>
    <div style={{borderBottom:"1px solid "+C.b,padding:"10px 18px",display:"flex",alignItems:"center",justifyContent:"space-between",position:"sticky",top:0,zIndex:100,background:C.bg+"ee"}}>
      <div style={{display:"flex",alignItems:"center",gap:10}}>
        <button onClick={onBack} style={{background:"transparent",border:"none",color:C.m,fontSize:14,cursor:"pointer"}}>←</button>
        <span style={{fontSize:14,fontWeight:700,color:C.t}}>{dialogue.title}</span>
        {dialogue.sessionId&&<span style={{fontSize:9,color:C.d,background:C.s3,padding:"2px 6px",borderRadius:3,fontFamily:"'JetBrains Mono',monospace"}}>ID: {dialogue.sessionId.substring(0,8)}...</span>}
      </div>
      <div style={{display:"flex",alignItems:"center",gap:12}}>
        <div style={{width:120}}><Progress done={doneCells} total={totalCells}/></div>
        <span style={{fontSize:10,color:C.d}}>{doneCells}/{totalCells}</span>
      </div>
    </div>

    <div style={{maxWidth:900,margin:"0 auto",padding:"16px 18px"}}>
      <div style={{display:"flex",gap:4,flexWrap:"wrap",marginBottom:12}}>
        {CRITERIA_ORDER.map((c,i)=>{
          const cr2=CRITERIA[c];const gc=GROUP_COLORS[cr2?.group]||C.a;const active=i===crIdx;
          const ann=annotations[c]||{};const filled=pairs.filter(p=>ann[String(p.num)]!==undefined&&ann[String(p.num)]!=="").length;const complete=filled===pairs.length;
          // Check if this criterion has diffs
          const asc=autoScores[c]||{};const hasDiff=pairs.some(p=>{const av=asc[String(p.num)],mv=(annotations[c]||{})[String(p.num)];return av!==undefined&&av!==""&&mv!==undefined&&mv!==""&&String(av)!==String(mv);});
          return<button key={c} onClick={()=>setCrIdx(i)} style={{padding:"3px 7px",borderRadius:4,border:"1px solid "+(active?gc:complete?C.g+"40":hasDiff?C.y+"40":C.b),background:active?gc+"20":complete?C.g+"10":hasDiff?C.y+"08":"transparent",color:active?gc:complete?C.g:hasDiff?C.y:C.d,fontSize:9,fontWeight:600,cursor:"pointer"}}>{c}{hasDiff?"⚡":""}</button>;
        })}
      </div>

      <CriterionPanel code={code} expanded={expanded} onToggle={()=>setExpanded(!expanded)}/>

      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <span style={{fontSize:11,color:C.m}}>Размечено: {curDone}/{pairs.length}</span>
          {showDiff&&curDiffs>0&&<span style={{fontSize:10,color:C.y,background:C.ys,padding:"2px 8px",borderRadius:4}}>⚡ {curDiffs} расхождений с auto</span>}
        </div>
        <div style={{display:"flex",gap:6}}>
          <Btn onClick={()=>{setCrIdx(Math.max(0,crIdx-1));window.scrollTo(0,0);}} disabled={crIdx===0} color={C.m}>← Пред.</Btn>
          {crIdx<CRITERIA_ORDER.length-1?
            <Btn onClick={()=>{setCrIdx(crIdx+1);window.scrollTo(0,0);}} color={C.a} bg={C.as}>След. →</Btn>:
            isReviewer?
              <div style={{display:"flex",gap:4}}>
                <Btn onClick={handleApprove} color={C.g} bg={C.gs}>✓ Принять</Btn>
                <Btn onClick={handleReject} color={C.r} bg={C.rs}>✕ Доработка</Btn>
              </div>:
              <Btn onClick={handleFinish} color={C.g} bg={C.gs}>✓ Завершить</Btn>}
        </div>
      </div>

      {pairs.map(p=><PairCard key={p.num} pair={p} score={curScores[String(p.num)]||""} autoScore={showDiff?autoForCriterion[String(p.num)]:undefined} onScore={v=>setScore(p.num,v)} criterion={code} showDiff={showDiff}/>)}

      <div style={{display:"flex",justifyContent:"space-between",marginTop:16,paddingTop:12,borderTop:"1px solid "+C.b}}>
        <Btn onClick={()=>{setCrIdx(Math.max(0,crIdx-1));window.scrollTo(0,0);}} disabled={crIdx===0} color={C.m}>← Пред.</Btn>
        <span style={{fontSize:12,color:C.d}}>{crIdx+1} / {CRITERIA_ORDER.length}</span>
        {crIdx<CRITERIA_ORDER.length-1?
          <Btn onClick={()=>{setCrIdx(crIdx+1);window.scrollTo(0,0);}} color={C.a} bg={C.as}>След. →</Btn>:
          isReviewer?
            <div style={{display:"flex",gap:6}}>
              <Btn onClick={handleApprove} color={C.g} bg={C.gs}>✓ Принять</Btn>
              <Btn onClick={handleReject} color={C.r} bg={C.rs}>✕ На доработку</Btn>
            </div>:
            <Btn onClick={handleFinish} color={C.g} bg={C.gs}>✓ Завершить</Btn>}
      </div>
    </div>
  </div>;
}

/* ═══ MAIN ═══ */
export default function Home(){
  const[user,setUser]=useState(null);
  const[users,setUsers]=useState([]);
  const[dialogues,setDialogues]=useState([]);
  const[selId,setSelId]=useState(null);
  const[showUsers,setShowUsers]=useState(false);
  const[loading,setLoading]=useState(true);
  const[showDiff,setShowDiff]=useState(true);
  const fileRef=useRef(null);

  useEffect(()=>{
    const u1=onValue(ref(db,"ann_users"),snap=>{if(snap.val())setUsers(Object.values(snap.val()));else setUsers([]);});
    const u2=onValue(ref(db,"ann_dialogues"),snap=>{if(snap.val())setDialogues(Object.values(snap.val()));else setDialogues([]);setLoading(false);});
    return()=>{u1();u2();};
  },[]);

  const mode=user?.role||"editor";
  const myDlgs=mode==="editor"?dialogues.filter(d=>d.assignedTo===user?.email||d.status==="unassigned"):dialogues;
  const sel=dialogues.find(d=>d.id===selId);

  async function handleImport(e){
    const file=e.target.files[0];if(!file)return;
    const parsed=await parseXlsx(file);
    for(const dlg of parsed){set(ref(db,"ann_dialogues/"+dlg.id),dlg);}
    e.target.value="";
  }
  function assignDlg(id,email){
    set(ref(db,"ann_dialogues/"+id+"/assignedTo"),email);
    set(ref(db,"ann_dialogues/"+id+"/status"),"annotating");
  }

  if(user&&sel){
    const sd=showDiff&&(mode==="reviewer"||mode==="manager")&&Object.keys(sel.autoScores||{}).length>0;
    return<><Head><title>Annotation — {sel.title}</title></Head>
      <AnnotatorScreen dialogue={sel} user={user} onBack={()=>setSelId(null)} showDiff={sd}/></>;
  }
  if(!user)return<><Head><title>Annotation Tool</title></Head><LoginScreen users={users} onLogin={u=>setUser(u)}/></>;
  if(loading)return<div style={{minHeight:"100vh",background:C.bg,display:"flex",alignItems:"center",justifyContent:"center",color:C.m}}>Загрузка...</div>;

  return<><Head><title>Annotation Tool — {user.name}</title></Head>
    <div style={{minHeight:"100vh",background:C.bg,color:C.t}}>
      {showUsers&&<UsersModal users={users} onAdd={u=>set(ref(db,"ann_users/"+ek(u.email)),u)} onRemove={e=>remove(ref(db,"ann_users/"+ek(e)))} onClose={()=>setShowUsers(false)}/>}

      <div style={{borderBottom:"1px solid "+C.b,padding:"10px 18px",display:"flex",alignItems:"center",justifyContent:"space-between",position:"sticky",top:0,zIndex:100,background:C.bg+"ee"}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <span style={{fontSize:16,fontWeight:800}}><span style={{color:C.a}}>◈</span> Annotation Tool</span>
          <span style={{fontSize:10,color:C.d,background:C.as,padding:"2px 8px",borderRadius:4}}>{user.name} • {mode==="manager"?"📊":mode==="editor"?"✏️":"👁"}</span>
        </div>
        <div style={{display:"flex",gap:6,alignItems:"center"}}>
          {(mode==="manager"||mode==="reviewer")&&<label style={{display:"flex",alignItems:"center",gap:4,fontSize:10,color:C.m,cursor:"pointer"}}><input type="checkbox" checked={showDiff} onChange={e=>setShowDiff(e.target.checked)}/>⚡ Diff с auto</label>}
          {mode==="manager"&&<><Btn onClick={()=>fileRef.current?.click()} color={C.g} bg={C.gs}>+ Импорт</Btn><input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={handleImport} style={{display:"none"}}/>
          <Btn onClick={()=>setShowUsers(true)} color={C.bl} bg={C.bls}>👥</Btn>
          {dialogues.length>0&&<Btn onClick={()=>exportXlsx(dialogues)} color={C.a} bg={C.as}>↓ Экспорт</Btn>}</>}
          <Btn onClick={()=>setUser(null)} color={C.r} bg={C.rs}>Выйти</Btn>
        </div>
      </div>

      <div style={{maxWidth:860,margin:"0 auto",padding:20}}>
        {mode==="manager"&&<div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,marginBottom:24}}>
          {["unassigned","annotating","review","done"].map(st=>{const cnt=dialogues.filter(d=>d.status===st).length;const s=STS[st];
            return<div key={st} style={{background:s.c+"10",border:"1px solid "+s.c+"25",borderRadius:10,padding:"12px 14px",textAlign:"center"}}><div style={{fontSize:22,fontWeight:800,color:s.c}}>{cnt}</div><div style={{fontSize:10,color:s.c,marginTop:2}}>{s.l}</div></div>;})}
        </div>}

        {myDlgs.length===0?
          <div style={{textAlign:"center",padding:"80px 20px",color:C.d}}><div style={{fontSize:40,marginBottom:12,opacity:.3}}>◇</div><div style={{fontSize:14}}>{mode==="manager"?"Импортируй диалоги":"Нет назначенных диалогов"}</div></div>:
          <div style={{display:"flex",flexDirection:"column",gap:4}}>
            {myDlgs.map(dlg=>{
              const tc=CRITERIA_ORDER.length*(dlg.pairs||[]).length;
              const dc=CRITERIA_ORDER.reduce((s,c)=>{const ann=(dlg.annotations||{})[c]||{};return s+(dlg.pairs||[]).filter(p=>ann[String(p.num)]!==undefined&&ann[String(p.num)]!=="").length;},0);
              const hasAuto=Object.keys(dlg.autoScores||{}).length>0;

              return<div key={dlg.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 14px",background:C.s,border:"1px solid "+C.b,borderRadius:8,cursor:"pointer"}} onClick={()=>setSelId(dlg.id)}>
                <div style={{flex:1}}>
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
                    <span style={{fontSize:13,fontWeight:600}}>{dlg.title}</span>
                    <Badge status={dlg.status}/>
                    {hasAuto&&<span style={{fontSize:9,padding:"1px 6px",borderRadius:3,background:C.s3,color:C.d}}>🤖 auto</span>}
                  </div>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <span style={{fontSize:10,color:C.d}}>{(dlg.pairs||[]).length} пар</span>
                    <div style={{width:100}}><Progress done={dc} total={tc}/></div>
                    {hasAuto&&showDiff&&<DiffSummary dialogue={dlg}/>}
                  </div>
                </div>
                <div style={{display:"flex",gap:4}} onClick={e=>e.stopPropagation()}>
                  {mode==="manager"&&dlg.status==="unassigned"&&
                    <select onChange={e=>{if(e.target.value)assignDlg(dlg.id,e.target.value);}} defaultValue="" style={{padding:"4px 8px",borderRadius:5,border:"1px solid "+C.b,background:C.bg,color:C.t,fontSize:11}}>
                      <option value="" disabled>Назначить...</option>
                      {users.filter(u=>u.role==="editor").map(u=><option key={u.email} value={u.email}>{u.name}</option>)}
                    </select>}
                  {mode==="editor"&&dlg.status==="unassigned"&&<Btn onClick={()=>assignDlg(dlg.id,user.email)} color={C.g} bg={C.gs}>Забрать →</Btn>}
                  <Btn onClick={()=>setSelId(dlg.id)} color={C.a}>Открыть →</Btn>
                  {mode==="manager"&&<Btn onClick={()=>{if(confirm("Удалить «"+dlg.title+"»?"))remove(ref(db,"ann_dialogues/"+dlg.id));}} color={C.r} bg={C.rs}>🗑</Btn>}
                </div>
              </div>;})}
          </div>}
      </div>
    </div></>;
}
