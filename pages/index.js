import { useState, useEffect, useMemo, useRef } from "react";
import { db, ref, set, onValue, remove } from "../lib/firebase";
import { CRITERIA, CRITERIA_ORDER, GROUP_COLORS } from "../lib/criteria";
import Head from "next/head";

/* ═══ PALETTE ═══ */
const C = {
  bg:"#0D1117", s:"#161B22", s2:"#1C2333", s3:"#21262D",
  b:"#30363D", ba:"#4A9EFF",
  t:"#C9D1D9", m:"#8B949E", d:"#484F58",
  a:"#4A9EFF", as:"rgba(74,158,255,.1)", ah:"rgba(74,158,255,.2)",
  g:"#3FB950", gs:"rgba(63,185,80,.12)",
  o:"#D29922", os:"rgba(210,153,34,.12)",
  r:"#F85149", rs:"rgba(248,81,73,.12)",
  bl:"#58A6FF", bls:"rgba(88,166,255,.1)",
  tu:"#4A9EFF", st:"#F0883E", // tutor=blue, student=orange
};
const STS={unassigned:{l:"Не назначен",c:C.d},annotating:{l:"Разметка",c:C.o},review:{l:"На ревью",c:C.bl},done:{l:"Готово",c:C.g}};
function emailKey(e){return e.replace(/[.#$/[\]@]/g,"_");}

/* ═══ SMALL UI ═══ */
function Btn({children,onClick,color,bg,disabled,style}){return<button onClick={onClick} disabled={disabled} style={{padding:"6px 14px",borderRadius:6,border:"1px solid "+(color||C.b),background:bg||"transparent",color:color||C.m,fontSize:11,fontWeight:600,cursor:disabled?"default":"pointer",opacity:disabled?.5:1,...style}}>{children}</button>;}
function Badge({status}){const s=STS[status]||STS.unassigned;return<span style={{display:"inline-flex",alignItems:"center",gap:4,padding:"2px 8px",borderRadius:12,fontSize:10,fontWeight:600,color:s.c,border:"1px solid "+s.c+"30",background:s.c+"10"}}><span style={{width:5,height:5,borderRadius:"50%",background:s.c}}/>{s.l}</span>;}
function Progress({done,total}){const pct=total?Math.round(done/total*100):0;return<div style={{display:"flex",alignItems:"center",gap:8}}><div style={{flex:1,height:4,background:C.s3,borderRadius:2,overflow:"hidden"}}><div style={{width:pct+"%",height:"100%",background:pct===100?C.g:C.a,borderRadius:2,transition:"width .3s"}}/></div><span style={{fontSize:10,color:C.m,minWidth:32}}>{pct}%</span></div>;}

/* ═══ VIZ TAG PARSER ═══ */
function parseDialogueText(text){
  if(!text) return [];
  const parts=[];
  const lines=String(text).split("\n");
  let current=null;
  for(const line of lines){
    const tl=line.trim();
    if(tl.startsWith("tutor")||tl.startsWith("Т:")){
      if(current)parts.push(current);
      current={role:"tutor",lines:[tl.replace(/^tutor\s*/,"").replace(/^Т:\s*/,"")]};
    } else if(tl.startsWith("student")||tl.startsWith("У:")){
      if(current)parts.push(current);
      current={role:"student",lines:[tl.replace(/^student\s*/,"").replace(/^У:\s*/,"")]};
    } else if(current){
      current.lines.push(tl);
    } else {
      parts.push({role:"system",lines:[tl]});
    }
  }
  if(current)parts.push(current);
  return parts;
}
function renderVizTag(text){
  const vizMatch=text.match(/<viz[^>]*>/);
  if(!vizMatch)return null;
  const intent=(text.match(/intent="([^"]*)"/) ||[])[1]||"";
  const style=(text.match(/style="([^"]*)"/) ||[])[1]||"";
  const desc=intent||style||"визуализация";
  return<div style={{background:C.s3,border:"1px solid "+C.b,borderRadius:8,padding:"8px 12px",margin:"4px 0",fontSize:11,color:C.bl}}><span style={{marginRight:6}}>🎨</span>{desc}</div>;
}

/* ═══ DIALOGUE PAIR CARD ═══ */
function PairCard({pair,score,onScore,criterion,isActive}){
  const cr=CRITERIA[criterion];
  const scores=cr?cr.scores:["1","0"];
  const parts=parseDialogueText(pair.text);
  const vizContent=pair.text&&pair.text.includes("<viz")?renderVizTag(pair.text):null;

  return<div style={{background:isActive?C.s2:C.s,border:"1px solid "+(isActive?C.a+"40":C.b),borderRadius:10,padding:14,marginBottom:8,transition:"border .2s"}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
      <span style={{fontSize:10,fontWeight:700,color:C.d,background:C.s3,padding:"2px 8px",borderRadius:4}}>#{pair.num}</span>
      <div style={{display:"flex",gap:4}}>
        {scores.map(s=>{
          const active=score===s;
          const sc=s==="0"?C.r:s==="1"?C.g:s==="2"?C.a:C.d;
          return<button key={s} onClick={()=>onScore(s)} style={{padding:"4px 10px",borderRadius:5,border:"1px solid "+(active?sc:C.b),background:active?sc+"20":"transparent",color:active?sc:C.m,fontSize:11,fontWeight:600,cursor:"pointer",minWidth:28}}>{s}</button>;
        })}
      </div>
    </div>
    <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:12,lineHeight:1.7}}>
      {parts.map((p,i)=><div key={i} style={{marginBottom:4}}>
        <span style={{fontWeight:600,color:p.role==="tutor"?C.tu:p.role==="student"?C.st:C.d,marginRight:6,fontSize:10,textTransform:"uppercase"}}>{p.role==="tutor"?"tutor":p.role==="student"?"student":""}</span>
        <span style={{color:p.role==="tutor"?C.tu+"dd":C.t}}>{p.lines.join("\n")}</span>
      </div>)}
      {vizContent}
    </div>
    {pair.board&&<div style={{marginTop:6,padding:"6px 10px",background:C.s3,borderRadius:6,fontSize:11,color:C.m}}><span style={{marginRight:4}}>📋</span>{pair.board}</div>}
  </div>;
}

/* ═══ CRITERION PANEL ═══ */
function CriterionPanel({code,expanded,onToggle}){
  const cr=CRITERIA[code];
  if(!cr)return null;
  const gc=GROUP_COLORS[cr.group]||C.a;
  return<div style={{background:C.s,border:"1px solid "+C.b,borderRadius:10,padding:"12px 16px",marginBottom:12}}>
    <div onClick={onToggle} style={{cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
      <div style={{display:"flex",alignItems:"center",gap:8}}>
        <span style={{fontSize:9,fontWeight:700,padding:"2px 6px",borderRadius:4,background:gc+"20",color:gc}}>{cr.groupName}</span>
        <span style={{fontSize:18,fontWeight:800,color:C.a}}>{code}</span>
        <span style={{fontSize:13,fontWeight:600,color:C.t}}>{cr.name}</span>
        {cr.level&&<span style={{fontSize:9,color:C.d,background:C.s3,padding:"1px 6px",borderRadius:3}}>{cr.level}</span>}
      </div>
      <span style={{color:C.d,fontSize:12}}>{expanded?"▲":"▼"}</span>
    </div>
    {expanded&&<div style={{marginTop:10,borderTop:"1px solid "+C.b,paddingTop:10}}>
      <div style={{marginBottom:8}}><div style={{fontSize:10,fontWeight:600,color:C.d,marginBottom:4,textTransform:"uppercase"}}>Что оценивает</div><div style={{fontSize:12,lineHeight:1.6,color:C.m,whiteSpace:"pre-wrap"}}>{cr.what}</div></div>
      <div style={{marginBottom:8}}><div style={{fontSize:10,fontWeight:600,color:C.d,marginBottom:4,textTransform:"uppercase"}}>Как оценивать</div><div style={{fontSize:12,lineHeight:1.6,color:C.t,whiteSpace:"pre-wrap",background:C.s2,padding:10,borderRadius:6}}>{cr.how}</div></div>
      {cr.examples&&<div><div style={{fontSize:10,fontWeight:600,color:C.d,marginBottom:4,textTransform:"uppercase"}}>Примеры</div><div style={{fontSize:11,lineHeight:1.6,color:C.m,whiteSpace:"pre-wrap",borderLeft:"3px solid "+C.a,paddingLeft:10}}>{cr.examples}</div></div>}
    </div>}
  </div>;
}

/* ═══ LOGIN ═══ */
function LoginScreen({users,onLogin}){
  const[email,setEmail]=useState("");const[err,setErr]=useState("");
  function tryLogin(){const u=users.find(u=>u.email.toLowerCase()===email.trim().toLowerCase());if(u)onLogin(u);else setErr("Нет доступа");}
  return<div style={{minHeight:"100vh",background:C.bg,display:"flex",alignItems:"center",justifyContent:"center"}}>
    <div style={{background:C.s,border:"1px solid "+C.b,borderRadius:14,padding:32,width:380}}>
      <div style={{textAlign:"center",marginBottom:24}}><div style={{fontSize:22,fontWeight:800,marginBottom:4}}><span style={{color:C.a}}>◈</span> Annotation Tool</div><div style={{fontSize:12,color:C.d}}>Введи корпоративный email</div></div>
      <input value={email} onChange={e=>{setEmail(e.target.value);setErr("");}} placeholder="email@company.ru" style={{width:"100%",padding:"10px 14px",borderRadius:8,border:"1px solid "+C.b,background:C.bg,color:C.t,fontSize:14,boxSizing:"border-box",marginBottom:12}} onKeyDown={e=>{if(e.key==="Enter")tryLogin();}}/>
      {err&&<div style={{fontSize:11,color:C.r,marginBottom:10}}>{err}</div>}
      <button onClick={tryLogin} style={{width:"100%",padding:"10px",borderRadius:8,border:"none",background:email.trim()?C.a:C.d,color:"#fff",fontSize:13,fontWeight:700,cursor:email.trim()?"pointer":"default"}}>Войти</button>
    </div>
  </div>;
}

/* ═══ USERS MODAL ═══ */
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
        <div style={{fontSize:11,color:C.d,marginBottom:8,fontWeight:600}}>Добавить:</div>
        <div style={{display:"flex",gap:6,marginBottom:8}}>
          <input value={email} onChange={e=>setEmail(e.target.value)} placeholder="email" style={{flex:2,padding:"7px 10px",borderRadius:6,border:"1px solid "+C.b,background:C.bg,color:C.t,fontSize:12}}/>
          <input value={name} onChange={e=>setName(e.target.value)} placeholder="Имя" style={{flex:1,padding:"7px 10px",borderRadius:6,border:"1px solid "+C.b,background:C.bg,color:C.t,fontSize:12}}/>
        </div>
        <div style={{display:"flex",gap:6,marginBottom:10}}>
          {["editor","reviewer","manager"].map(r=><Btn key={r} onClick={()=>setRole(r)} color={role===r?C.a:C.m} bg={role===r?C.as:"transparent"}>{r==="editor"?"✏️ Разметчик":r==="reviewer"?"👁 Ревьюер":"📊 Менеджер"}</Btn>)}
        </div>
        <Btn onClick={()=>{if(email.trim()&&name.trim()){onAdd({email:email.trim(),name:name.trim(),role});setEmail("");setName("");}}} color={C.g} bg={C.gs}>+ Добавить</Btn>
      </div>
    </div>
  </div>;
}

/* ═══ IMPORT ═══ */
async function parseXlsx(file){
  const XLSX=await import("xlsx");
  const buf=await file.arrayBuffer();
  const wb=XLSX.read(buf,{type:"array"});
  const dialogues=[];
  for(const name of wb.SheetNames){
    if(name.toLowerCase().includes("критери")||name.toLowerCase().includes("тестовое"))continue;
    const ws=wb.Sheets[name];
    const data=XLSX.utils.sheet_to_json(ws,{header:1});
    if(data.length<3)continue;
    const pairs=[];
    for(let r=2;r<data.length;r++){
      const row=data[r];
      if(!row||!row[1])continue;
      pairs.push({num:row[0]||r-1,text:String(row[1]||""),board:String(row[2]||""),image:String(row[3]||"")});
    }
    if(pairs.length>0)dialogues.push({id:name.replace(/[.#$/[\]]/g,"_"),title:name,pairs,status:"unassigned",assignedTo:null,annotations:{}});
  }
  return dialogues;
}

/* ═══ EXPORT ═══ */
async function exportXlsx(dialogues){
  const XLSX=await import("xlsx");
  const wb=XLSX.utils.book_new();
  for(const dlg of dialogues){
    const header1=["","","",""].concat(CRITERIA_ORDER.map(c=>{const cr=CRITERIA[c];return cr?cr.groupName:"";}));
    const header2=["№","Диалоговая пара","Доска","Скриншот"].concat(CRITERIA_ORDER);
    const rows=[header1,header2];
    for(const pair of(dlg.pairs||[])){
      const row=[pair.num,pair.text,pair.board,pair.image];
      for(const code of CRITERIA_ORDER){
        const ann=dlg.annotations&&dlg.annotations[code];
        row.push(ann?ann[String(pair.num)]||"":"");
      }
      rows.push(row);
    }
    const ws=XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb,ws,dlg.title.substring(0,31));
  }
  XLSX.writeFile(wb,"annotation_export.xlsx");
}

/* ═══ ANNOTATOR SCREEN ═══ */
function AnnotatorScreen({dialogue,user,onBack}){
  const[crIdx,setCrIdx]=useState(0);
  const[expanded,setExpanded]=useState(true);
  const[annotations,setAnnotations]=useState(dialogue.annotations||{});
  const code=CRITERIA_ORDER[crIdx];
  const cr=CRITERIA[code];
  const pairs=dialogue.pairs||[];

  // Count progress
  const totalCells=CRITERIA_ORDER.length*pairs.length;
  const doneCells=CRITERIA_ORDER.reduce((sum,c)=>{
    const ann=annotations[c]||{};
    return sum+pairs.filter(p=>ann[String(p.num)]!==undefined&&ann[String(p.num)]!=="").length;
  },0);

  // Scores for current criterion
  const currentScores=annotations[code]||{};
  const currentDone=pairs.filter(p=>currentScores[String(p.num)]!==undefined&&currentScores[String(p.num)]!=="").length;

  function setScore(pairNum,val){
    const newAnn={...annotations};
    if(!newAnn[code])newAnn[code]={};
    newAnn[code][String(pairNum)]=val;
    setAnnotations(newAnn);
    // Auto-save to Firebase
    const safeId=dialogue.id;
    const userKey=emailKey(user.email);
    set(ref(db,"ann_dialogues/"+safeId+"/annotations/"+code+"/"+String(pairNum)),val);
  }

  function handleFinish(){
    set(ref(db,"ann_dialogues/"+dialogue.id+"/status"),"review");
    onBack();
  }

  return<div style={{minHeight:"100vh",background:C.bg}}>
    {/* Header */}
    <div style={{borderBottom:"1px solid "+C.b,padding:"10px 18px",display:"flex",alignItems:"center",justifyContent:"space-between",position:"sticky",top:0,zIndex:100,background:C.bg+"ee"}}>
      <div style={{display:"flex",alignItems:"center",gap:10}}>
        <button onClick={onBack} style={{background:"transparent",border:"none",color:C.m,fontSize:14,cursor:"pointer"}}>← Назад</button>
        <span style={{fontSize:14,fontWeight:700,color:C.t}}>{dialogue.title}</span>
      </div>
      <div style={{display:"flex",alignItems:"center",gap:12}}>
        <div style={{width:120}}><Progress done={doneCells} total={totalCells}/></div>
        <span style={{fontSize:10,color:C.d}}>{doneCells}/{totalCells}</span>
      </div>
    </div>

    <div style={{maxWidth:900,margin:"0 auto",padding:"16px 18px"}}>
      {/* Criterion navigation */}
      <div style={{display:"flex",gap:4,flexWrap:"wrap",marginBottom:12}}>
        {CRITERIA_ORDER.map((c,i)=>{
          const cr2=CRITERIA[c];
          const gc=GROUP_COLORS[cr2?.group]||C.a;
          const active=i===crIdx;
          const ann=annotations[c]||{};
          const filled=pairs.filter(p=>ann[String(p.num)]!==undefined&&ann[String(p.num)]!=="").length;
          const complete=filled===pairs.length;
          return<button key={c} onClick={()=>setCrIdx(i)} style={{padding:"3px 7px",borderRadius:4,border:"1px solid "+(active?gc:complete?C.g+"40":C.b),background:active?gc+"20":complete?C.g+"10":"transparent",color:active?gc:complete?C.g:C.d,fontSize:9,fontWeight:600,cursor:"pointer"}}>{c}</button>;
        })}
      </div>

      {/* Current criterion info */}
      <CriterionPanel code={code} expanded={expanded} onToggle={()=>setExpanded(!expanded)}/>

      {/* Progress for current criterion */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
        <span style={{fontSize:11,color:C.m}}>Размечено: {currentDone}/{pairs.length}</span>
        <div style={{display:"flex",gap:6}}>
          <Btn onClick={()=>setCrIdx(Math.max(0,crIdx-1))} disabled={crIdx===0} color={C.m}>← Пред.</Btn>
          {crIdx<CRITERIA_ORDER.length-1?
            <Btn onClick={()=>setCrIdx(crIdx+1)} color={C.a} bg={C.as}>След. →</Btn>:
            <Btn onClick={handleFinish} color={C.g} bg={C.gs}>✓ Завершить</Btn>
          }
        </div>
      </div>

      {/* Dialogue pairs */}
      {pairs.map(p=><PairCard key={p.num} pair={p} score={currentScores[String(p.num)]||""} onScore={v=>setScore(p.num,v)} criterion={code} isActive={false}/>)}

      {/* Bottom nav */}
      <div style={{display:"flex",justifyContent:"space-between",marginTop:16,paddingTop:12,borderTop:"1px solid "+C.b}}>
        <Btn onClick={()=>setCrIdx(Math.max(0,crIdx-1))} disabled={crIdx===0} color={C.m}>← Пред. критерий</Btn>
        <span style={{fontSize:12,color:C.d}}>{crIdx+1} / {CRITERIA_ORDER.length}</span>
        {crIdx<CRITERIA_ORDER.length-1?
          <Btn onClick={()=>{setCrIdx(crIdx+1);window.scrollTo(0,0);}} color={C.a} bg={C.as}>След. критерий →</Btn>:
          <Btn onClick={handleFinish} color={C.g} bg={C.gs}>✓ Завершить разметку</Btn>
        }
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
  const fileRef=useRef(null);

  useEffect(()=>{
    const u1=onValue(ref(db,"ann_users"),snap=>{if(snap.val())setUsers(Object.values(snap.val()));else setUsers([]);});
    const u2=onValue(ref(db,"ann_dialogues"),snap=>{if(snap.val())setDialogues(Object.values(snap.val()));else setDialogues([]);setLoading(false);});
    return()=>{u1();u2();};
  },[]);

  const mode=user?.role||"editor";
  const myDialogues=mode==="editor"?dialogues.filter(d=>d.assignedTo===user?.email):dialogues;
  const sel=dialogues.find(d=>d.id===selId);

  async function handleImport(e){
    const file=e.target.files[0];if(!file)return;
    const parsed=await parseXlsx(file);
    for(const dlg of parsed){set(ref(db,"ann_dialogues/"+dlg.id),dlg);}
    e.target.value="";
  }

  function assignDialogue(dlgId,email){
    set(ref(db,"ann_dialogues/"+dlgId+"/assignedTo"),email);
    set(ref(db,"ann_dialogues/"+dlgId+"/status"),"annotating");
  }

  // If annotating, show annotator screen
  if(user&&sel&&(mode==="editor"||mode==="reviewer"||mode==="manager")){
    return<><Head><title>Annotation — {sel.title}</title></Head>
      <AnnotatorScreen dialogue={sel} user={user} onBack={()=>setSelId(null)}/></>;
  }

  if(!user)return<><Head><title>Annotation Tool</title></Head><LoginScreen users={users} onLogin={u=>setUser(u)}/></>;
  if(loading)return<div style={{minHeight:"100vh",background:C.bg,display:"flex",alignItems:"center",justifyContent:"center",color:C.m}}>Загрузка...</div>;

  return<><Head><title>Annotation Tool — {user.name}</title></Head>
    <div style={{minHeight:"100vh",background:C.bg,color:C.t}}>
      {showUsers&&<UsersModal users={users} onAdd={u=>set(ref(db,"ann_users/"+emailKey(u.email)),u)} onRemove={e=>remove(ref(db,"ann_users/"+emailKey(e)))} onClose={()=>setShowUsers(false)}/>}

      {/* Header */}
      <div style={{borderBottom:"1px solid "+C.b,padding:"10px 18px",display:"flex",alignItems:"center",justifyContent:"space-between",position:"sticky",top:0,zIndex:100,background:C.bg+"ee"}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <span style={{fontSize:16,fontWeight:800}}><span style={{color:C.a}}>◈</span> Annotation Tool</span>
          <span style={{fontSize:10,color:C.d,background:C.as,padding:"2px 8px",borderRadius:4}}>{user.name} • {mode==="manager"?"📊":mode==="editor"?"✏️":"👁"}</span>
        </div>
        <div style={{display:"flex",gap:6}}>
          {mode==="manager"&&<><Btn onClick={()=>fileRef.current?.click()} color={C.g} bg={C.gs}>+ Импорт</Btn><input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={handleImport} style={{display:"none"}}/>
          <Btn onClick={()=>setShowUsers(true)} color={C.bl} bg={C.bls}>👥</Btn>
          {dialogues.length>0&&<Btn onClick={()=>exportXlsx(dialogues)} color={C.a} bg={C.as}>↓ Экспорт</Btn>}</>}
          <Btn onClick={()=>setUser(null)} color={C.r} bg={C.rs}>Выйти</Btn>
        </div>
      </div>

      <div style={{maxWidth:860,margin:"0 auto",padding:20}}>
        {/* Dashboard stats for manager */}
        {mode==="manager"&&<div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,marginBottom:24}}>
          {["unassigned","annotating","review","done"].map(st=>{
            const cnt=dialogues.filter(d=>d.status===st).length;
            const s=STS[st];
            return<div key={st} style={{background:s.c+"10",border:"1px solid "+s.c+"25",borderRadius:10,padding:"12px 14px",textAlign:"center"}}>
              <div style={{fontSize:22,fontWeight:800,color:s.c}}>{cnt}</div>
              <div style={{fontSize:10,color:s.c,marginTop:2}}>{s.l}</div>
            </div>;
          })}
        </div>}

        {myDialogues.length===0?
          <div style={{textAlign:"center",padding:"80px 20px",color:C.d}}>
            <div style={{fontSize:40,marginBottom:12,opacity:.3}}>◇</div>
            <div style={{fontSize:14}}>{mode==="manager"?"Импортируй диалоги для начала":"Нет назначенных диалогов"}</div>
          </div>:
          <div style={{display:"flex",flexDirection:"column",gap:4}}>
            {myDialogues.map(dlg=>{
              const totalCells=CRITERIA_ORDER.length*(dlg.pairs||[]).length;
              const doneCells=CRITERIA_ORDER.reduce((sum,c)=>{
                const ann=(dlg.annotations||{})[c]||{};
                return sum+(dlg.pairs||[]).filter(p=>ann[String(p.num)]!==undefined&&ann[String(p.num)]!=="").length;
              },0);

              return<div key={dlg.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 14px",background:C.s,border:"1px solid "+C.b,borderRadius:8,cursor:"pointer"}} onClick={()=>setSelId(dlg.id)}>
                <div style={{flex:1}}>
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
                    <span style={{fontSize:13,fontWeight:600}}>{dlg.title}</span>
                    <Badge status={dlg.status}/>
                    {dlg.assignedTo&&<span style={{fontSize:10,color:C.d}}>{dlg.assignedTo}</span>}
                  </div>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <span style={{fontSize:10,color:C.d}}>{(dlg.pairs||[]).length} пар</span>
                    <div style={{width:100}}><Progress done={doneCells} total={totalCells}/></div>
                  </div>
                </div>
                <div style={{display:"flex",gap:4}}>
                  {mode==="manager"&&dlg.status==="unassigned"&&
                    <select onChange={e=>{if(e.target.value)assignDialogue(dlg.id,e.target.value);}} onClick={e=>e.stopPropagation()} defaultValue="" style={{padding:"4px 8px",borderRadius:5,border:"1px solid "+C.b,background:C.bg,color:C.t,fontSize:11}}>
                      <option value="" disabled>Назначить...</option>
                      {users.filter(u=>u.role==="editor").map(u=><option key={u.email} value={u.email}>{u.name}</option>)}
                    </select>
                  }
                  <Btn onClick={e=>{e.stopPropagation();setSelId(dlg.id);}} color={C.a}>Открыть →</Btn>
                </div>
              </div>;
            })}
          </div>
        }
      </div>
    </div>
  </>;
}
