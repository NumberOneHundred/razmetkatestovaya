import { useState, useEffect, useMemo, useRef } from "react";
import { db, ref, set, onValue, update, remove } from "../lib/firebase";
import { CRITERIA, CRITERIA_ORDER, GROUP_COLORS } from "../lib/criteria";
import { parseBoardOps, renderBoardSvg } from "../lib/board";
import { extractImages } from "../lib/images";
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
const ROLES={editor:{label:"Разметчик",icon:"✏️"},reviewer:{label:"Ревьюер",icon:"⚡"},manager:{label:"Менеджер",icon:"📊"}};
function roleLabel(role){return ROLES[role]?.label||role||"Разметчик";}
function roleIcon(role){return ROLES[role]?.icon||"👁";}
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

function PairCard({pair,score,autoScore,onScore,criterion,showDiff,comment,onComment}){
  const cr=CRITERIA[criterion];const scores=cr?cr.scores:["1","0"];
  const parts=parseDialogueText(pair.text);const viz=renderViz(pair.text);
  const[showCom,setShowCom]=useState(false);const[comVal,setComVal]=useState(comment||"");
  return<div style={{background:C.s,border:"1px solid "+C.b,borderRadius:10,padding:14,marginBottom:8}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
      <div style={{display:"flex",alignItems:"center",gap:6}}>
        <span style={{fontSize:10,fontWeight:700,color:C.d,background:C.s3,padding:"2px 8px",borderRadius:4}}>#{pair.num}</span>
        {showDiff&&<DiffDot auto={autoScore} manual={score}/>}
      </div>
      <div style={{display:"flex",gap:4,alignItems:"center"}}>
        {comment&&<span style={{fontSize:9,color:C.y}} title={comment}>💬</span>}
        <button onClick={()=>setShowCom(!showCom)} style={{padding:"2px 6px",borderRadius:4,border:"1px solid "+C.b,background:showCom?C.ys:"transparent",color:showCom?C.y:C.d,fontSize:9,cursor:"pointer"}}>💬</button>
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
    {pair.imageData&&<div style={{marginTop:8,background:"#fff",borderRadius:8,padding:4,display:"inline-block"}}><img src={pair.imageData} style={{maxWidth:"100%",borderRadius:6,display:"block"}} alt="board"/></div>}
    {pair.boardOps&&(()=>{
      const ops=parseBoardOps(pair.boardOps);
      const svg=renderBoardSvg(ops);
      if(!svg)return null;
      return<div style={{marginTop:8,border:"1px solid "+C.b,borderRadius:8,overflow:"hidden"}} dangerouslySetInnerHTML={{__html:svg}}/>;
    })()}
    {showCom&&<div style={{marginTop:8,display:"flex",gap:4}}>
      <input value={comVal} onChange={e=>setComVal(e.target.value)} placeholder="Комментарий к реплике..." style={{flex:1,padding:"6px 10px",borderRadius:6,border:"1px solid "+C.b,background:C.bg,color:C.t,fontSize:11}} onKeyDown={e=>{if(e.key==="Enter"&&comVal.trim()){onComment(comVal.trim());setShowCom(false);}}}/>
      <Btn onClick={()=>{if(comVal.trim()){onComment(comVal.trim());setShowCom(false);}}} color={C.y} bg={C.ys}>→</Btn>
    </div>}
    {comment&&!showCom&&<div style={{marginTop:6,padding:"5px 10px",background:C.ys,border:"1px solid "+C.y+"30",borderRadius:6,fontSize:11,color:C.y}}>💬 {comment}</div>}
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

function UsersModal({users,onAdd,onRemove,onRoleChange,onClose}){
  const[email,setEmail]=useState("");const[name,setName]=useState("");const[role,setRole]=useState("editor");
  return<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.7)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000}} onClick={onClose}>
    <div onClick={e=>e.stopPropagation()} style={{background:C.s,border:"1px solid "+C.b,borderRadius:14,padding:24,width:560,maxHeight:"80vh",overflow:"auto"}}>
      <h2 style={{fontSize:16,fontWeight:700,marginBottom:6,color:C.t}}>👥 Сотрудники</h2>
      <div style={{fontSize:10,color:C.d,marginBottom:16}}>Ревьюер видит все диалоги и Diff с auto, но не получает менеджерские действия.</div>
      {users.map(u=><div key={u.email} style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,padding:"8px 12px",background:C.bg,border:"1px solid "+C.b,borderRadius:7,marginBottom:4}}>
        <div style={{minWidth:0,flex:1}}><div style={{fontSize:12,fontWeight:600,color:C.t}}>{u.name}</div><div style={{fontSize:10,color:C.d,overflow:"hidden",textOverflow:"ellipsis"}}>{u.email}</div></div>
        <select value={u.role||"editor"} onChange={e=>onRoleChange(u.email,e.target.value)} style={{padding:"5px 8px",borderRadius:5,border:"1px solid "+C.b,background:C.s,color:C.t,fontSize:11}}>
          {Object.entries(ROLES).map(([value,meta])=><option key={value} value={value}>{meta.icon} {meta.label}</option>)}
        </select>
        <Btn onClick={()=>onRemove(u.email)} color={C.r} bg={C.rs}>Удалить</Btn>
      </div>)}
      <div style={{borderTop:"1px solid "+C.b,paddingTop:16,marginTop:12}}>
        <div style={{display:"flex",gap:6,marginBottom:8}}>
          <input value={email} onChange={e=>setEmail(e.target.value)} placeholder="email" style={{flex:2,padding:"7px 10px",borderRadius:6,border:"1px solid "+C.b,background:C.bg,color:C.t,fontSize:12}}/>
          <input value={name} onChange={e=>setName(e.target.value)} placeholder="Имя" style={{flex:1,padding:"7px 10px",borderRadius:6,border:"1px solid "+C.b,background:C.bg,color:C.t,fontSize:12}}/>
        </div>
        <div style={{display:"flex",gap:6,marginBottom:10}}>
          {Object.entries(ROLES).map(([value,meta])=><Btn key={value} onClick={()=>setRole(value)} color={role===value?C.a:C.m} bg={role===value?C.as:"transparent"}>{meta.icon} {meta.label}</Btn>)}
        </div>
        <Btn onClick={()=>{if(email.trim()&&name.trim()){onAdd({email:email.trim(),name:name.trim(),role});setEmail("");setName("");setRole("editor");}}} color={C.g} bg={C.gs}>+ Добавить</Btn>
      </div>
    </div></div>;
}

/* ═══ IMPORT ═══ */
function findBoardOps(row){
  for(let c=0;c<row.length;c++){
    const v=String(row[c]||"");
    if(v.includes("board_ops"))return v;
  }
  return "";
}

async function parseXlsx(file){
  const XLSX=await import("xlsx");
  const buf=await file.arrayBuffer();
  const wb=XLSX.read(buf,{type:"array"});
  const skip=["критери","empty"];

  // Extract embedded images
  let images={};
  try { images=await extractImages(buf); } catch(e){ console.warn("Image extraction failed:",e); }

  // Detect labeled_images format (has "payload" column)
  const firstSheet=wb.Sheets[wb.SheetNames[0]];
  const firstHeaders=XLSX.utils.sheet_to_json(firstSheet,{header:1})[0]||[];
  if(firstHeaders.includes("payload")&&firstHeaders.includes("session_id")){
    return parseLabeledImages(wb);
  }

  // Map sheet names to indices for image lookup
  const sheetIndices={};
  wb.SheetNames.forEach((n,i)=>{sheetIndices[n]=String(i+1);});
  const autoSheets={},manualSheets={};
  let hasPrefix=false;

  for(const name of wb.SheetNames){
    if(skip.some(s=>name.toLowerCase().includes(s)))continue;
    if(name==="empty"||name==="Sheet1")continue;
    const prefix=name.match(/^(s\d+)/);
    if(prefix){
      hasPrefix=true;
      const p=prefix[1];
      if(name.includes("_auto")||/^s\d+_[A-Z]/.test(name)&&!name.includes("!")){
        autoSheets[p]=name;
      } else {
        if(!manualSheets[p])manualSheets[p]=[];
        manualSheets[p].push(name);
      }
    }
  }

  // Fallback: sheets without s-prefix (named "1","2","3" etc.)
  if(!hasPrefix){
    const dialogues=[];
    for(const name of wb.SheetNames){
      if(skip.some(s=>name.toLowerCase().includes(s)))continue;
      if(name==="empty"||name==="Sheet1")continue;
      const ws=wb.Sheets[name];
      const data=XLSX.utils.sheet_to_json(ws,{header:1});
      if(data.length<3)continue;
      // Find header row (row with №/pair_id and реплика/Диалоговая пара)
      let headerRow=1;
      for(let r=0;r<Math.min(data.length,3);r++){
        const row=data[r];
        if(row&&row.some&&row.some(v=>String(v||"").includes("реплика")||String(v||"").includes("Диалоговая")||String(v||"").includes("pair_id")))
          {headerRow=r;break;}
      }
      const headers=data[headerRow]||[];
      // Find column indices
      let textCol=-1,numCol=-1;
      headers.forEach((h,ci)=>{
        const hl=String(h||"").toLowerCase();
        if(textCol===-1&&(hl.includes("реплика")||hl.includes("диалоговая")||hl.includes("текст пары")))textCol=ci;
        if(numCol===-1&&(hl==="№"||hl==="pair_id"||hl==="num_replic"))numCol=ci;
      });
      if(textCol===-1)textCol=1;
      if(numCol===-1)numCol=0;

      const pairs=[];let sessionId="";const annotations={};
      const sIdx=sheetIndices[name];const imgMap=images[sIdx]||{};

      for(let r=headerRow+1;r<data.length;r++){
        const row=data[r];if(!row||!row[textCol])continue;
        const txt=String(row[textCol]||"");
        const pairNum=String(row[numCol]||r);
        if(/^[0-9a-f]{8}-[0-9a-f]{4}/i.test(txt.trim())){sessionId=txt.trim();continue;}
        pairs.push({num:pairNum,text:txt,board:String(row[2]||""),image:String(row[3]||""),boardOps:findBoardOps(row),imageData:imgMap[r]||""});
        // Parse existing annotations from criteria columns
        for(let c=0;c<headers.length;c++){
          const code=String(headers[c]||"").trim();
          const val=row[c];
          if(CRITERIA_ORDER.includes(code)&&val!==undefined&&val!==null&&val!==""){
            if(!annotations[code])annotations[code]={};
            annotations[code][pairNum]=String(val);
          }
        }
      }
      if(pairs.length>0){
        const id=name.replace(/[.#$/[\]!+ ]/g,"_");
        dialogues.push({id,title:name,pairs,status:Object.keys(annotations).length>0?"review":"unassigned",assignedTo:null,annotations,autoScores:{},sessionId});
      }
    }
    return dialogues;
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
        const sheetIdx=sheetIndices[autoSheets[p]];
        const imgMap=images[sheetIdx]||{};
        pairs.push({num:String(row[0]||r-1),text:txt,board:String(row[2]||""),image:String(row[3]||""),boardOps:findBoardOps(row),imageData:imgMap[r]||""});
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
        const mSheetIdx=sheetIndices[mName];
        const mImgMap=images[mSheetIdx]||{};
        pairs.push({num:pairNum,text:txt,board:String(row[2]||""),image:String(row[3]||""),boardOps:findBoardOps(row),imageData:mImgMap[r]||""});
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

function parseLabeledImages(wb){
  const XLSX=require("xlsx");
  const ws=wb.Sheets[wb.SheetNames[0]];
  const data=XLSX.utils.sheet_to_json(ws,{header:1});
  const headers=data[0]||[];
  const payloadCol=headers.indexOf("payload");
  const textCol=headers.indexOf("text");
  const numCol=headers.indexOf("num_replic");
  const sessionCol=headers.indexOf("session_id");
  const payloadTextCol=headers.indexOf("payload_text");

  const sessions={};
  for(let r=1;r<data.length;r++){
    const row=data[r];if(!row)continue;
    const sid=String(row[sessionCol]||"").trim();
    if(!sid)continue;
    if(!sessions[sid])sessions[sid]={pairs:[],annotations:{},sessionId:sid};
    const pairNum=String(row[numCol]||r);
    const text=String(row[textCol]||row[payloadTextCol]||"");
    const payload=String(row[payloadCol]||"");
    sessions[sid].pairs.push({num:pairNum,text,board:"",image:"",boardOps:payload.includes("board_ops")?payload:""});
    for(let c=0;c<headers.length;c++){
      const code=String(headers[c]||"").trim();
      const val=row[c];
      if(CRITERIA_ORDER.includes(code)&&val!==undefined&&val!==null&&val!==""){
        if(!sessions[sid].annotations[code])sessions[sid].annotations[code]={};
        sessions[sid].annotations[code][pairNum]=String(val);
      }
    }
  }
  return Object.entries(sessions).map(([sid,d])=>({
    id:sid.replace(/[.#$/[\]-]/g,"_"),title:"session_"+sid.substring(0,8),
    pairs:d.pairs,status:Object.keys(d.annotations).length>0?"review":"unassigned",
    assignedTo:null,annotations:d.annotations,autoScores:{},sessionId:d.sessionId
  }));
}


function normalizeDialogueText(value){
  return String(value||"")
    .replace(/_x([0-9a-fA-F]{4})_/g,(_,hex)=>String.fromCharCode(parseInt(hex,16)))
    .replace(/\r\n?/g,"\n")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g,"")
    .replace(/[ \t]+/g," ")
    .replace(/ *\n */g,"\n")
    .trim();
}

function normalizeDialogueTitle(value){
  return String(value||"")
    .replace(/(?:[_\s-]+auto(?:оценка)?)$/i,"")
    .trim()
    .toLowerCase();
}

async function parseAutoScoresXlsx(file){
  const XLSX=await import("xlsx");
  const buf=await file.arrayBuffer();
  const wb=XLSX.read(buf,{type:"array"});
  const sheets=[];

  for(const name of wb.SheetNames){
    const lower=name.toLowerCase();
    if(lower==="сводка"||lower==="empty"||lower==="sheet1"||lower.includes("критери"))continue;
    const data=XLSX.utils.sheet_to_json(wb.Sheets[name],{header:1});
    if(data.length<2)continue;

    let headerRow=-1,textCol=-1,numCol=-1,criterionCols=[];
    for(let r=0;r<Math.min(data.length,10);r++){
      const row=data[r]||[];
      const currentCriteria=[];
      let currentText=-1,currentNum=-1;
      row.forEach((h,c)=>{
        const raw=String(h||"").trim();
        const hl=raw.toLowerCase();
        if(currentText===-1&&(hl.includes("диалоговая")||hl.includes("реплика")||hl.includes("текст пары")))currentText=c;
        if(currentNum===-1&&(hl==="№"||hl==="pair_id"||hl==="num_replic"))currentNum=c;
        if(CRITERIA_ORDER.includes(raw))currentCriteria.push([c,raw]);
      });
      if(currentText!==-1&&currentCriteria.length>0){
        headerRow=r;textCol=currentText;numCol=currentNum;criterionCols=currentCriteria;break;
      }
    }
    if(headerRow===-1)continue;

    const rows=[];
    for(let r=headerRow+1;r<data.length;r++){
      const row=data[r]||[];
      const text=String(row[textCol]||"");
      if(!text.trim())continue;
      const scores={};
      for(const [c,code] of criterionCols){
        const val=row[c];
        if(val!==undefined&&val!==null&&val!=="")scores[code]=String(val);
      }
      rows.push({sourcePairNum:numCol===-1?String(r-headerRow):String(row[numCol]||r-headerRow),text,scores});
    }
    if(rows.length>0)sheets.push({title:name,rows});
  }
  return sheets;
}

function formatUploadDate(value){
  const ts=Number(value);
  if(!ts)return "дата загрузки не сохранена";
  return new Intl.DateTimeFormat("ru-RU",{
    day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"
  }).format(new Date(ts));
}

function exportFileName(batchName){
  const safe=String(batchName||"annotation_export").replace(/[\\/:*?"<>|]/g,"_").trim()||"annotation_export";
  return safe+"_annotation_export.xlsx";
}

async function exportXlsx(dialogues,fileName="annotation_export.xlsx"){
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
  XLSX.writeFile(wb,fileName);
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
  const[annotations,setAnnotations]=useState(dialogue.annotations||{});
  const[comments,setComments]=useState(dialogue.comments||{});
  const[reviewedCriteria,setReviewedCriteria]=useState(dialogue.reviewedCriteria||{});
  const code=CRITERIA_ORDER[crIdx];
  const pairs=dialogue.pairs||[];
  const autoScores=showDiff?(dialogue.autoScores||{}):{};
  const autoForCriterion=autoScores[code]||{};

  const totalCells=CRITERIA_ORDER.length*pairs.length;
  const doneCells=CRITERIA_ORDER.reduce((s,c)=>{const ann=annotations[c]||{};return s+pairs.filter(p=>ann[String(p.num)]!==undefined&&ann[String(p.num)]!=="").length;},0);
  const curScores=annotations[code]||{};
  const curDone=pairs.filter(p=>curScores[String(p.num)]!==undefined&&curScores[String(p.num)]!=="").length;
  const curDiffs=pairs.filter(p=>{const a=autoForCriterion[String(p.num)],m=curScores[String(p.num)];return a!==undefined&&a!==""&&m!==undefined&&m!==""&&String(a)!==String(m);}).length;
  const curComments=comments[code]||{};
  const isReviewer=user.role==="manager"||user.role==="reviewer";
  const currentCriterionReviewed=!!reviewedCriteria[code];
  const reviewedCount=CRITERIA_ORDER.filter(c=>!!reviewedCriteria[c]).length;
  const allCriteriaReviewed=reviewedCount===CRITERIA_ORDER.length;

  function invalidateCriterionReview(criterionCode){
    if(!reviewedCriteria[criterionCode])return;
    const next={...reviewedCriteria};delete next[criterionCode];setReviewedCriteria(next);
    remove(ref(db,"ann_dialogues/"+dialogue.id+"/reviewedCriteria/"+criterionCode));
  }

  function setScore(pairNum,val){
    invalidateCriterionReview(code);
    const newAnn={...annotations};if(!newAnn[code])newAnn[code]={};
    newAnn[code][String(pairNum)]=val;setAnnotations(newAnn);
    set(ref(db,"ann_dialogues/"+dialogue.id+"/annotations/"+code+"/"+String(pairNum)),val);
  }
  function setComment(pairNum,txt){
    const newCom={...comments};if(!newCom[code])newCom[code]={};
    newCom[code][String(pairNum)]=txt;setComments(newCom);
    set(ref(db,"ann_dialogues/"+dialogue.id+"/comments/"+code+"/"+String(pairNum)),txt);
  }
  function fillAll(val){
    invalidateCriterionReview(code);
    const newAnn={...annotations};if(!newAnn[code])newAnn[code]={};
    pairs.forEach(p=>{newAnn[code][String(p.num)]=val;});
    setAnnotations(newAnn);
    pairs.forEach(p=>{set(ref(db,"ann_dialogues/"+dialogue.id+"/annotations/"+code+"/"+String(p.num)),val);});
  }
  function toggleCriterionReviewed(){
    if(!isReviewer)return;
    if(currentCriterionReviewed){
      const next={...reviewedCriteria};delete next[code];setReviewedCriteria(next);
      remove(ref(db,"ann_dialogues/"+dialogue.id+"/reviewedCriteria/"+code));
      return;
    }
    if(curDone<pairs.length){
      alert("Сначала оцени все реплики по критерию "+code+".");
      return;
    }
    const reviewInfo={by:user.email,at:Date.now()};
    setReviewedCriteria({...reviewedCriteria,[code]:reviewInfo});
    set(ref(db,"ann_dialogues/"+dialogue.id+"/reviewedCriteria/"+code),reviewInfo);
  }
  function handleFinish(){
    update(ref(db),{
      ["ann_dialogues/"+dialogue.id+"/status"]:"review",
      ["ann_dialogues/"+dialogue.id+"/reviewedCriteria"]:null
    });
    onBack();
  }
  function handleApprove(){
    if(!allCriteriaReviewed){
      alert("Сначала прими все критерии: сейчас проверено "+reviewedCount+" из "+CRITERIA_ORDER.length+".");
      return;
    }
    set(ref(db,"ann_dialogues/"+dialogue.id+"/status"),"done");onBack();
  }
  function handleReject(){
    setReviewedCriteria({});
    update(ref(db),{
      ["ann_dialogues/"+dialogue.id+"/status"]:"annotating",
      ["ann_dialogues/"+dialogue.id+"/reviewedCriteria"]:null
    });
    onBack();
  }

  return<div style={{minHeight:"100vh",background:C.bg}}>
    {/* Header */}
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

    {/* Criteria tabs */}
    <div style={{padding:"8px 18px",borderBottom:"1px solid "+C.b,position:"sticky",top:46,zIndex:99,background:C.bg+"ee"}}>
      <div style={{display:"flex",gap:4,flexWrap:"wrap",maxWidth:900,margin:"0 auto"}}>
        {CRITERIA_ORDER.map((c,i)=>{
          const cr2=CRITERIA[c];const gc=GROUP_COLORS[cr2?.group]||C.a;const active=i===crIdx;
          const ann=annotations[c]||{};const filled=pairs.filter(p=>ann[String(p.num)]!==undefined&&ann[String(p.num)]!=="").length;const complete=filled===pairs.length;
          const asc=autoScores[c]||{};const hasDiff=pairs.some(p=>{const av=asc[String(p.num)],mv=(annotations[c]||{})[String(p.num)];return av!==undefined&&av!==""&&mv!==undefined&&mv!==""&&String(av)!==String(mv);});
          const reviewed=isReviewer&&!!reviewedCriteria[c];
          return<button key={c} onClick={()=>{setCrIdx(i);window.scrollTo(0,0);}} style={{padding:"3px 7px",borderRadius:4,border:"1px solid "+(active?gc:reviewed?C.g+"60":complete?C.g+"40":hasDiff?C.y+"40":C.b),background:active?gc+"20":reviewed?C.g+"16":complete?C.g+"10":hasDiff?C.y+"08":"transparent",color:active?gc:reviewed?C.g:complete?C.g:hasDiff?C.y:C.d,fontSize:9,fontWeight:600,cursor:"pointer"}}>{c}{reviewed?"✓":hasDiff?"⚡":""}</button>;
        })}
      </div>
    </div>

    {/* Two-column layout: pairs left, criterion right */}
    <div style={{display:"flex",maxWidth:1200,margin:"0 auto",padding:"16px 18px",gap:16}}>
      {/* Left: pairs */}
      <div style={{flex:1,minWidth:0}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
          <div style={{display:"flex",alignItems:"center",gap:12}}>
            <span style={{fontSize:12,fontWeight:600,color:curDone===pairs.length?C.g:C.m}}>Отмечено {curDone} из {pairs.length}</span>
            {curDone<pairs.length&&<span style={{fontSize:10,color:C.o}}>({pairs.length-curDone} без оценки)</span>}
            {showDiff&&curDiffs>0&&<span style={{fontSize:10,color:C.y,background:C.ys,padding:"2px 8px",borderRadius:4}}>⚡ {curDiffs} расхождений</span>}
          </div>
        </div>

        <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:12,padding:"8px 12px",background:C.s,border:"1px solid "+C.b,borderRadius:8}}>
          <span style={{fontSize:10,color:C.d,whiteSpace:"nowrap"}}>Заполнить все:</span>
          {(CRITERIA[code]?.scores||["1","0"]).map(s=>{const sc=s==="0"?C.r:s==="1"?C.g:s==="2"?C.a:C.d;
            return<button key={s} onClick={()=>{if(confirm("Проставить «"+s+"» во все "+pairs.length+" реплик?"))fillAll(s);}} style={{padding:"4px 12px",borderRadius:5,border:"1px solid "+sc+"40",background:sc+"10",color:sc,fontSize:11,fontWeight:600,cursor:"pointer"}}>{s}</button>;})}
        </div>

        {pairs.map(p=><PairCard key={p.num} pair={p} score={curScores[String(p.num)]||""} autoScore={showDiff?autoForCriterion[String(p.num)]:undefined} onScore={v=>setScore(p.num,v)} criterion={code} showDiff={showDiff} comment={curComments[String(p.num)]||""} onComment={txt=>setComment(p.num,txt)}/>)}

        {/* Bottom stats + nav */}
        <div style={{marginTop:16,paddingTop:12,borderTop:"1px solid "+C.b}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"center",marginBottom:12}}>
            <span style={{fontSize:13,fontWeight:600,color:curDone===pairs.length?C.g:C.o}}>{curDone===pairs.length?"✓ Все реплики отмечены":"⚠ Отмечено "+curDone+" из "+pairs.length}</span>
          </div>
          {isReviewer&&<div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:10,marginBottom:12}}>
            <Btn onClick={toggleCriterionReviewed} disabled={!currentCriterionReviewed&&curDone<pairs.length} color={currentCriterionReviewed?C.g:C.bl} bg={currentCriterionReviewed?C.gs:C.bls}>
              {currentCriterionReviewed?"✓ Критерий принят":"Принять критерий"}
            </Btn>
            <span style={{fontSize:10,color:C.d}}>Проверено {reviewedCount} из {CRITERIA_ORDER.length}</span>
          </div>}
          <div style={{display:"flex",justifyContent:"space-between"}}>
            <Btn onClick={()=>{setCrIdx(Math.max(0,crIdx-1));window.scrollTo(0,0);}} disabled={crIdx===0} color={C.m}>← Пред.</Btn>
            <span style={{fontSize:12,color:C.d}}>{crIdx+1} / {CRITERIA_ORDER.length}</span>
            {crIdx<CRITERIA_ORDER.length-1?
              <Btn onClick={()=>{setCrIdx(crIdx+1);window.scrollTo(0,0);}} color={C.a} bg={C.as}>След. →</Btn>:
              isReviewer?
                <div style={{display:"flex",gap:6}}>
                  <Btn onClick={handleApprove} disabled={!allCriteriaReviewed} color={C.g} bg={C.gs}>✓ Принять диалог</Btn>
                  <Btn onClick={handleReject} color={C.r} bg={C.rs}>✕ На доработку</Btn>
                </div>:
                <Btn onClick={handleFinish} color={C.g} bg={C.gs}>✓ Завершить</Btn>}
          </div>
        </div>
      </div>

      {/* Right: sticky criterion panel */}
      <div style={{width:320,flexShrink:0,position:"sticky",top:90,alignSelf:"flex-start",maxHeight:"calc(100vh - 100px)",overflowY:"auto"}}>
        <CriterionPanel code={code} expanded={true} onToggle={()=>{}}/>
        {isReviewer&&<div style={{padding:"10px 12px",marginBottom:8,border:"1px solid "+(currentCriterionReviewed?C.g+"40":C.b),borderRadius:8,background:currentCriterionReviewed?C.gs:C.s}}>
          <Btn onClick={toggleCriterionReviewed} disabled={!currentCriterionReviewed&&curDone<pairs.length} color={currentCriterionReviewed?C.g:C.bl} bg={currentCriterionReviewed?C.gs:C.bls} style={{width:"100%"}}>
            {currentCriterionReviewed?"✓ Критерий принят":"Принять критерий"}
          </Btn>
          <div style={{fontSize:9,color:C.d,textAlign:"center",marginTop:6}}>Проверено {reviewedCount} из {CRITERIA_ORDER.length}</div>
        </div>}
        <div style={{display:"flex",gap:6,marginTop:8}}>
          <Btn onClick={()=>{setCrIdx(Math.max(0,crIdx-1));window.scrollTo(0,0);}} disabled={crIdx===0} color={C.m} style={{flex:1}}>← Пред.</Btn>
          {crIdx<CRITERIA_ORDER.length-1?
            <Btn onClick={()=>{setCrIdx(crIdx+1);window.scrollTo(0,0);}} color={C.a} bg={C.as} style={{flex:1}}>След. →</Btn>:
            <Btn onClick={isReviewer?handleApprove:handleFinish} disabled={isReviewer&&!allCriteriaReviewed} color={C.g} bg={C.gs} style={{flex:1}}>✓ {isReviewer?"Принять диалог":"Завершить"}</Btn>}
        </div>
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
  const[filterUser,setFilterUser]=useState("all");
  const fileRef=useRef(null);
  const autoFileRef=useRef(null);
  const autoTargetBatchRef=useRef(null);

  useEffect(()=>{
    const u1=onValue(ref(db,"ann_users"),snap=>{if(snap.val())setUsers(Object.values(snap.val()));else setUsers([]);});
    const u2=onValue(ref(db,"ann_dialogues"),snap=>{if(snap.val())setDialogues(Object.values(snap.val()));else setDialogues([]);setLoading(false);});
    return()=>{u1();u2();};
  },[]);

  useEffect(()=>{
    if(!user)return;
    const fresh=users.find(u=>u.email===user.email);
    if(fresh&&fresh.role!==user.role)setUser(fresh);
  },[users,user]);

  const mode=user?.role||"editor";
  const canViewAuto=mode==="manager"||mode==="reviewer";
  const isManager=mode==="manager";
  const editors=useMemo(()=>[...new Set(dialogues.map(d=>d.assignedTo).filter(Boolean))],[dialogues]);
  const userName=(email)=>{const u=users.find(u=>u.email===email);return u?u.name:email?email.split("@")[0]:"";};
  const editorCounts=useMemo(()=>{const c={};dialogues.forEach(d=>{if(d.assignedTo){c[d.assignedTo]=(c[d.assignedTo]||0)+1;}});return c;},[dialogues]);
  let myDlgs=mode==="editor"?dialogues.filter(d=>d.assignedTo===user?.email||d.status==="unassigned"):dialogues;
  if(mode==="manager"&&filterUser!=="all"){
    if(filterUser==="__none")myDlgs=myDlgs.filter(d=>!d.assignedTo);
    else myDlgs=myDlgs.filter(d=>d.assignedTo===filterUser);
  }
  const sel=dialogues.find(d=>d.id===selId);
  const batchKey=d=>d.batchId||"__legacy";
  const groupedDialogues=Object.values(myDlgs.reduce((groups,dlg)=>{
    const key=batchKey(dlg);
    if(!groups[key])groups[key]={key,name:dlg.batchName||"Старые загрузки",createdAt:dlg.batchCreatedAt||0,dialogues:[]};
    groups[key].dialogues.push(dlg);
    return groups;
  },{})).sort((a,b)=>b.createdAt-a.createdAt);
  const allBatchDialogues=key=>dialogues.filter(d=>batchKey(d)===key);

  async function handleImport(e){
    const file=e.target.files[0];if(!file)return;
    const parsed=await parseXlsx(file);
    const batchId="batch_"+Date.now()+"_"+Math.random().toString(36).slice(2,8);
    const batchName=file.name.replace(/\.(xlsx|xls)$/i,"")||"Новая корзинка";
    const batchCreatedAt=Date.now();
    await Promise.all(parsed.map(dlg=>{
      const id=batchId+"_"+dlg.id;
      return set(ref(db,"ann_dialogues/"+id),{...dlg,id,batchId,batchName,batchCreatedAt});
    }));
    e.target.value="";
  }

  function openAutoImport(batchKey){
    autoTargetBatchRef.current=batchKey;
    autoFileRef.current?.click();
  }

  async function handleAutoImport(e){
    const file=e.target.files[0];if(!file)return;
    const batchKeyToUpdate=autoTargetBatchRef.current;
    const targetDialogues=batchKeyToUpdate?allBatchDialogues(batchKeyToUpdate):dialogues;

    try{
      const autoSheets=await parseAutoScoresXlsx(file);
      const rootUpdates={};
      const importedAt=Date.now();
      let matchedDialogues=0,matchedPairs=0,unmatchedPairs=0;
      const unmatchedSheets=[],ambiguousSheets=[],partialSheets=[];

      for(const autoSheet of autoSheets){
        const title=normalizeDialogueTitle(autoSheet.title);
        const candidates=targetDialogues.filter(d=>normalizeDialogueTitle(d.title)===title);
        if(candidates.length===0){unmatchedSheets.push(autoSheet.title);continue;}

        const ranked=candidates.map(dlg=>{
          const pairByText=new Map((dlg.pairs||[]).map(pair=>[normalizeDialogueText(pair.text),pair]));
          const matches=autoSheet.rows.filter(row=>pairByText.has(normalizeDialogueText(row.text))).length;
          return{dlg,pairByText,matches};
        }).sort((a,b)=>b.matches-a.matches);

        const best=ranked[0];
        if(!best||best.matches===0){unmatchedSheets.push(autoSheet.title);continue;}
        if(ranked[1]&&ranked[1].matches===best.matches){ambiguousSheets.push(autoSheet.title);continue;}

        const minimumMatches=Math.max(1,Math.ceil(autoSheet.rows.length*.8));
        if(best.matches<minimumMatches){unmatchedSheets.push(autoSheet.title);continue;}

        const autoScores={};
        let sheetMatched=0,sheetUnmatched=0;
        for(const row of autoSheet.rows){
          const pair=best.pairByText.get(normalizeDialogueText(row.text));
          if(!pair){sheetUnmatched++;continue;}
          sheetMatched++;
          for(const [code,val] of Object.entries(row.scores)){
            if(!autoScores[code])autoScores[code]={};
            autoScores[code][String(pair.num)]=String(val);
          }
        }

        rootUpdates["ann_dialogues/"+best.dlg.id+"/autoScores"]=autoScores;
        rootUpdates["ann_dialogues/"+best.dlg.id+"/autoImportedAt"]=importedAt;
        rootUpdates["ann_dialogues/"+best.dlg.id+"/autoSourceName"]=file.name;
        matchedDialogues++;
        matchedPairs+=sheetMatched;
        unmatchedPairs+=sheetUnmatched;
        if(sheetUnmatched>0)partialSheets.push(autoSheet.title);
      }

      if(matchedDialogues>0)await update(ref(db),rootUpdates);

      const report=[
        "Автооценка загружена: "+matchedDialogues+" диалогов, "+matchedPairs+" пар.",
        unmatchedPairs>0?"Не удалось привязать пар: "+unmatchedPairs+".":"",
        partialSheets.length>0?"Частично совпали: "+partialSheets.join(", ")+".":"",
        unmatchedSheets.length>0?"Не найдены: "+unmatchedSheets.join(", ")+".":"",
        ambiguousSheets.length>0?"Есть несколько одинаковых кандидатов, пропущены: "+ambiguousSheets.join(", ")+".":""
      ].filter(Boolean).join("\n");
      alert(report||"В файле не найдено листов с автооценкой.");
    }catch(err){
      console.error("Auto import failed:",err);
      alert("Не получилось загрузить автооценку. Проверь формат файла и попробуй ещё раз.");
    }finally{
      e.target.value="";
      autoTargetBatchRef.current=null;
    }
  }
  function assignDlg(id,email){
    set(ref(db,"ann_dialogues/"+id+"/assignedTo"),email);
    set(ref(db,"ann_dialogues/"+id+"/status"),"annotating");
  }

  if(user&&sel){
    const sd=showDiff&&canViewAuto&&Object.keys(sel.autoScores||{}).length>0;
    return<><Head><title>Annotation — {sel.title}</title></Head>
      <AnnotatorScreen dialogue={sel} user={user} onBack={()=>setSelId(null)} showDiff={sd}/></>;
  }
  if(!user)return<><Head><title>Annotation Tool</title></Head><LoginScreen users={users} onLogin={u=>setUser(u)}/></>;
  if(loading)return<div style={{minHeight:"100vh",background:C.bg,display:"flex",alignItems:"center",justifyContent:"center",color:C.m}}>Загрузка...</div>;

  return<><Head><title>Annotation Tool — {user.name}</title></Head>
    <div style={{minHeight:"100vh",background:C.bg,color:C.t}}>
      {showUsers&&<UsersModal users={users} onAdd={u=>set(ref(db,"ann_users/"+ek(u.email)),u)} onRemove={e=>remove(ref(db,"ann_users/"+ek(e)))} onRoleChange={(email,role)=>set(ref(db,"ann_users/"+ek(email)+"/role"),role)} onClose={()=>setShowUsers(false)}/>}

      <div style={{borderBottom:"1px solid "+C.b,padding:"10px 18px",display:"flex",alignItems:"center",justifyContent:"space-between",position:"sticky",top:0,zIndex:100,background:C.bg+"ee"}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <span style={{fontSize:16,fontWeight:800}}><span style={{color:C.a}}>◈</span> Annotation Tool</span>
          <span style={{fontSize:10,color:C.d,background:C.as,padding:"2px 8px",borderRadius:4}}>{user.name} • {roleIcon(mode)} {roleLabel(mode)}</span>
        </div>
        <div style={{display:"flex",gap:6,alignItems:"center"}}>
          {canViewAuto&&<label style={{display:"flex",alignItems:"center",gap:4,fontSize:10,color:C.m,cursor:"pointer"}}><input type="checkbox" checked={showDiff} onChange={e=>setShowDiff(e.target.checked)}/>⚡ Diff с auto</label>}
          {isManager&&<><Btn onClick={()=>fileRef.current?.click()} color={C.g} bg={C.gs}>+ Импорт</Btn><input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={handleImport} style={{display:"none"}}/>
          <input ref={autoFileRef} type="file" accept=".xlsx,.xls" onChange={handleAutoImport} style={{display:"none"}}/>
          <Btn onClick={()=>setShowUsers(true)} color={C.bl} bg={C.bls}>👥</Btn>
          {dialogues.length>0&&<Btn onClick={()=>exportXlsx(dialogues)} color={C.a} bg={C.as}>↓ Экспорт всего</Btn>}</>}
          <Btn onClick={()=>setUser(null)} color={C.r} bg={C.rs}>Выйти</Btn>
        </div>
      </div>

      <div style={{maxWidth:860,margin:"0 auto",padding:20}}>
        {mode==="manager"&&<div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,marginBottom:24}}>
          {["unassigned","annotating","review","done"].map(st=>{const cnt=dialogues.filter(d=>d.status===st).length;const s=STS[st];
            return<div key={st} style={{background:s.c+"10",border:"1px solid "+s.c+"25",borderRadius:10,padding:"12px 14px",textAlign:"center"}}><div style={{fontSize:22,fontWeight:800,color:s.c}}>{cnt}</div><div style={{fontSize:10,color:s.c,marginTop:2}}>{s.l}</div></div>;})}
        </div>}

        {mode==="manager"&&editors.length>0&&<div style={{display:"flex",gap:4,flexWrap:"wrap",marginBottom:14}}>
          <Btn onClick={()=>setFilterUser("all")} color={filterUser==="all"?C.a:C.m} bg={filterUser==="all"?C.as:"transparent"} style={{fontSize:10}}>Все ({dialogues.length})</Btn>
          {editors.map(e=><Btn key={e} onClick={()=>setFilterUser(e)} color={filterUser===e?C.a:C.m} bg={filterUser===e?C.as:"transparent"} style={{fontSize:10}}>{userName(e)} ({editorCounts[e]||0})</Btn>)}
          <Btn onClick={()=>setFilterUser("__none")} color={filterUser==="__none"?C.a:C.m} bg={filterUser==="__none"?C.as:"transparent"} style={{fontSize:10}}>∅ ({dialogues.filter(d=>!d.assignedTo).length})</Btn>
        </div>}

        {myDlgs.length===0?
          <div style={{textAlign:"center",padding:"80px 20px",color:C.d}}><div style={{fontSize:40,marginBottom:12,opacity:.3}}>◇</div><div style={{fontSize:14}}>{mode==="manager"?"Импортируй диалоги":"Нет назначенных диалогов"}</div></div>:
          <div style={{display:"flex",flexDirection:"column",gap:14}}>
            {groupedDialogues.map(group=>{
              const fullBatch=allBatchDialogues(group.key);
              const doneCount=fullBatch.filter(d=>d.status==="done").length;
              const hiddenCount=fullBatch.length-group.dialogues.length;
              return<div key={group.key} style={{border:"1px solid "+C.b,borderRadius:12,overflow:"hidden",background:C.s2}}>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 14px",borderBottom:"1px solid "+C.b,background:C.s3}}>
                  <div>
                    <div style={{display:"flex",alignItems:"center",gap:8}}>
                      <span style={{fontSize:14,fontWeight:700,color:C.t}}>▣ {group.name}</span>
                      <span style={{fontSize:10,color:C.m}}>{fullBatch.length} диалогов</span>
                      <span style={{fontSize:10,color:doneCount===fullBatch.length?C.g:C.d}}>готово {doneCount}/{fullBatch.length}</span>
                    </div>
                    <div style={{fontSize:9,color:group.createdAt?C.m:C.d,marginTop:3}}>Загружено: {formatUploadDate(group.createdAt)}</div>
                    {hiddenCount>0&&<div style={{fontSize:9,color:C.d,marginTop:3}}>По текущему фильтру показано {group.dialogues.length} из {fullBatch.length}</div>}
                  </div>
                  {mode==="manager"&&<div style={{display:"flex",gap:6}}>
                    <Btn onClick={()=>openAutoImport(group.key)} color={C.y} bg={C.ys}>🤖 Загрузить auto</Btn>
                    <Btn onClick={()=>exportXlsx(fullBatch,exportFileName(group.name))} color={C.a} bg={C.as}>↓ Скачать корзинку</Btn>
                  </div>}
                </div>
                <div style={{display:"flex",flexDirection:"column",gap:4,padding:8}}>
                  {group.dialogues.map(dlg=>{
                    const tc=CRITERIA_ORDER.length*(dlg.pairs||[]).length;
                    const dc=CRITERIA_ORDER.reduce((s,c)=>{const ann=(dlg.annotations||{})[c]||{};return s+(dlg.pairs||[]).filter(p=>ann[String(p.num)]!==undefined&&ann[String(p.num)]!=="").length;},0);
                    const hasAuto=Object.keys(dlg.autoScores||{}).length>0;

                    return<div key={dlg.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 14px",background:C.s,border:"1px solid "+C.b,borderRadius:8,cursor:"pointer"}} onClick={()=>setSelId(dlg.id)}>
                      <div style={{flex:1}}>
                        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
                          <span style={{fontSize:13,fontWeight:600}}>{dlg.title}</span>
                          <Badge status={dlg.status}/>
                          {dlg.assignedTo&&<span style={{fontSize:10,padding:"1px 6px",borderRadius:3,background:C.s3,color:C.m}}>{userName(dlg.assignedTo)}</span>}
                          {canViewAuto&&hasAuto&&<span style={{fontSize:9,padding:"1px 6px",borderRadius:3,background:C.s3,color:C.d}}>🤖 auto</span>}
                        </div>
                        <div style={{display:"flex",alignItems:"center",gap:8}}>
                          <span style={{fontSize:10,color:C.d}}>{(dlg.pairs||[]).length} пар</span>
                          <span style={{fontSize:10,color:dlg.batchCreatedAt?C.m:C.d}}>загружено {formatUploadDate(dlg.batchCreatedAt)}</span>
                          <div style={{width:100}}><Progress done={dc} total={tc}/></div>
                          {canViewAuto&&hasAuto&&showDiff&&<DiffSummary dialogue={dlg}/>} 
                        </div>
                      </div>
                      <div style={{display:"flex",gap:4}} onClick={e=>e.stopPropagation()}>
                        {mode==="manager"&&
                          <select onChange={e=>{if(e.target.value)assignDlg(dlg.id,e.target.value);}} value={dlg.assignedTo||""} style={{padding:"4px 8px",borderRadius:5,border:"1px solid "+C.b,background:C.bg,color:C.t,fontSize:11}}>
                            <option value="">Не назначен</option>
                            {users.filter(u=>u.role==="editor").map(u=><option key={u.email} value={u.email}>{u.name}</option>)}
                          </select>}
                        {mode==="editor"&&dlg.status==="unassigned"&&<Btn onClick={()=>assignDlg(dlg.id,user.email)} color={C.g} bg={C.gs}>Забрать →</Btn>}
                        <Btn onClick={()=>setSelId(dlg.id)} color={C.a}>Открыть →</Btn>
                        {mode==="manager"&&<Btn onClick={()=>{if(confirm("Удалить «"+dlg.title+"»?"))remove(ref(db,"ann_dialogues/"+dlg.id));}} color={C.r} bg={C.rs}>🗑</Btn>}
                      </div>
                    </div>;})}
                </div>
              </div>;})}
          </div>}
      </div>
    </div></>;
}
