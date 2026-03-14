import { useState, useEffect, useCallback } from "react";
import {
  getAnonId, getUserDoc, upsertUserDoc,
  writeSession, incrementAnalytics,
  subscribeLeaderboard, subscribeAnalytics
} from "./firebase";
import {
  supabase, sendMagicLink, signInWithPassword,
  signUpWithPassword, signOut, onAuthChange,
  saveProgressToSupabase, loadProgressFromSupabase
} from "./supabase";

// ── SOUND ENGINE ──────────────────────────────────────────────────────
function playSound(type, enabled = true) {
  if (!enabled) return;
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (type === "correct") {
      [523.25, 659.25, 783.99].forEach((freq, i) => {
        const osc = ctx.createOscillator(), gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.frequency.value = freq; osc.type = "sine";
        gain.gain.setValueAtTime(0, ctx.currentTime + i * 0.1);
        gain.gain.linearRampToValueAtTime(0.15, ctx.currentTime + i * 0.1 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.1 + 0.35);
        osc.start(ctx.currentTime + i * 0.1); osc.stop(ctx.currentTime + i * 0.1 + 0.4);
      });
    } else if (type === "wrong") {
      const osc = ctx.createOscillator(), gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.frequency.value = 160; osc.type = "sawtooth";
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.28);
      osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.3);
    } else if (type === "win") {
      [523, 659, 784, 1047].forEach((freq, i) => {
        const osc = ctx.createOscillator(), gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.frequency.value = freq; osc.type = "sine";
        gain.gain.setValueAtTime(0, ctx.currentTime + i * 0.12);
        gain.gain.linearRampToValueAtTime(0.2, ctx.currentTime + i * 0.12 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.12 + 0.5);
        osc.start(ctx.currentTime + i * 0.12); osc.stop(ctx.currentTime + i * 0.12 + 0.55);
      });
    }
  } catch {}
}

// ── STORAGE ───────────────────────────────────────────────────────────
const SK = "db-state-v3";
function save(data) { try { localStorage.setItem(SK, JSON.stringify(data)); } catch {} }
function load() { try { const r = localStorage.getItem(SK); return r ? JSON.parse(r) : null; } catch { return null; } }

// ── GOLD LOGO SVG ─────────────────────────────────────────────────────
const GoldLogo = ({ size = 20 }) => (
  <svg width={size} height={Math.round(size * 1.1)} viewBox="0 0 48 52" style={{ flexShrink: 0, filter: "drop-shadow(0 0 6px rgba(245,166,35,0.7))" }}>
    <polygon points="24,0 48,10 24,20 0,10" fill="#f5a623"/>
    <polygon points="24,8 48,18 48,26 24,16" fill="#d97706" opacity="0.9"/>
    <polygon points="0,18 24,28 24,36 0,26" fill="#fbbf24" opacity="0.8"/>
    <polygon points="24,16 48,26 48,34 24,24" fill="#b45309" opacity="0.85"/>
    <polygon points="0,26 24,36 24,44 0,34" fill="#f59e0b" opacity="0.65"/>
    <polygon points="24,24 48,34 24,44 0,34" fill="#d97706" opacity="0.9"/>
  </svg>
);

// ── TOPIC SVG SYMBOLS ─────────────────────────────────────────────────
const TopicSymbol = ({ id, size = 18 }) => {
  const syms = {
    lakehouse: <svg width={size} height={size} viewBox="0 0 28 28"><path d="M14,4 L14,24 M4,14 L24,14" stroke="#fbbf24" strokeWidth="1.5" opacity="0.3"/><circle cx="14" cy="14" r="8" fill="none" stroke="#fbbf24" strokeWidth="2"/><circle cx="14" cy="14" r="4" fill="none" stroke="#fbbf24" strokeWidth="1.5" opacity="0.6"/><circle cx="14" cy="14" r="1.5" fill="#fbbf24"/></svg>,
    delta: <svg width={size} height={size} viewBox="0 0 28 28"><polygon points="14,2 24,8 24,20 14,26 4,20 4,8" fill="none" stroke="#f59e0b" strokeWidth="2"/><polygon points="14,7 19,10 19,18 14,21 9,18 9,10" fill="#f59e0b" opacity="0.3"/><line x1="14" y1="2" x2="14" y2="26" stroke="#f59e0b" strokeWidth="1" opacity="0.4"/></svg>,
    elt: <svg width={size} height={size} viewBox="0 0 28 28"><path d="M4,20 Q8,4 14,8 Q20,12 24,4" fill="none" stroke="#60a5fa" strokeWidth="2.5" strokeLinecap="round"/><circle cx="14" cy="8" r="2.5" fill="#60a5fa"/><path d="M4,24 L8,20 L12,22 L16,17 L20,19 L24,14" fill="none" stroke="#60a5fa" strokeWidth="1.5" opacity="0.4"/></svg>,
    streaming: <svg width={size} height={size} viewBox="0 0 28 28"><path d="M4,14 Q7,8 11,14 Q15,20 19,14 Q23,8 26,14" fill="none" stroke="#34d399" strokeWidth="2.5" strokeLinecap="round"/><circle cx="4" cy="14" r="2" fill="#34d399"/><circle cx="26" cy="14" r="2" fill="#34d399"/></svg>,
    production: <svg width={size} height={size} viewBox="0 0 28 28"><rect x="3" y="6" width="22" height="16" rx="3" fill="none" stroke="#a78bfa" strokeWidth="2"/><circle cx="9" cy="14" r="2" fill="#a78bfa"/><circle cx="14" cy="14" r="2" fill="#a78bfa" opacity="0.6"/><circle cx="19" cy="14" r="2" fill="#a78bfa" opacity="0.3"/><path d="M9,14 L14,14 L19,14" stroke="#a78bfa" strokeWidth="1" opacity="0.4"/></svg>,
    governance: <svg width={size} height={size} viewBox="0 0 28 28"><rect x="4" y="4" width="9" height="9" rx="2" fill="none" stroke="#38bdf8" strokeWidth="1.8"/><rect x="15" y="4" width="9" height="9" rx="2" fill="none" stroke="#38bdf8" strokeWidth="1.8" opacity="0.6"/><rect x="4" y="15" width="9" height="9" rx="2" fill="none" stroke="#38bdf8" strokeWidth="1.8" opacity="0.6"/><rect x="15" y="15" width="9" height="9" rx="2" fill="none" stroke="#38bdf8" strokeWidth="1.8" opacity="0.3"/></svg>,
    performance: <svg width={size} height={size} viewBox="0 0 28 28"><path d="M14,3 L17,11 L26,11 L19,16 L22,24 L14,19 L6,24 L9,16 L2,11 L11,11 Z" fill="none" stroke="#fb923c" strokeWidth="1.8"/><path d="M14,8 L15.5,13 L20,13 L16.5,15.5 L18,20 L14,17.5 L10,20 L11.5,15.5 L8,13 L12.5,13 Z" fill="#fb923c" opacity="0.4"/></svg>,
  };
  return syms[id] || null;
};

// ── DATA ──────────────────────────────────────────────────────────────
const TOPICS = [
  { id:"lakehouse",   name:"Lakehouse Fundamentals", sub:"Workspace, clusters, notebooks, jobs", count:34, color:"#fbbf24", bg:"rgba(251,191,36,0.12)", border:"rgba(251,191,36,0.3)" },
  { id:"delta",       name:"Delta Lake",             sub:"ACID, time travel, OPTIMIZE, VACUUM",  count:46, color:"#f59e0b", bg:"rgba(245,158,11,0.12)", border:"rgba(245,158,11,0.3)" },
  { id:"elt",         name:"ELT & Spark SQL",        sub:"Auto Loader, COPY INTO, transforms",   count:45, color:"#60a5fa", bg:"rgba(96,165,250,0.12)", border:"rgba(96,165,250,0.3)" },
  { id:"streaming",   name:"Incremental Processing", sub:"Structured Streaming, DLT, triggers",  count:40, color:"#34d399", bg:"rgba(52,211,153,0.12)", border:"rgba(52,211,153,0.3)" },
  { id:"production",  name:"Production Workflows",   sub:"Jobs, CI/CD, Asset Bundles, alerts",   count:33, color:"#a78bfa", bg:"rgba(167,139,250,0.12)", border:"rgba(167,139,250,0.3)" },
  { id:"governance",  name:"Data Governance",        sub:"Unity Catalog, permissions, lineage",  count:34, color:"#38bdf8", bg:"rgba(56,189,248,0.12)", border:"rgba(56,189,248,0.3)" },
  { id:"performance", name:"Performance Tuning",     sub:"AQE, caching, Z-order, Photon",        count:43, color:"#fb923c", bg:"rgba(251,146,60,0.12)", border:"rgba(251,146,60,0.3)" },
];

const QUESTIONS = [
  { id:1,  topic:"lakehouse",   sub:"Workspace",       diff:"Beginner",     type:"mcq", q:"What is the Databricks Lakehouse Platform primarily designed to do?", opts:["Replace data warehouses only","Combine data lake flexibility with data warehouse reliability","Store only structured data","Run only ML workloads"], a:1, exp:"The Lakehouse combines the scalability of data lakes with the reliability and performance of data warehouses." },
  { id:2,  topic:"lakehouse",   sub:"Cluster",         diff:"Beginner",     type:"tf",  q:'"All-Purpose clusters are the most cost-effective option for running automated production jobs."', opts:["TRUE","FALSE"], a:1, exp:"Job clusters are cheaper for automated workloads — they start fresh per run and terminate when done. All-Purpose clusters are for interactive development." },
  { id:3,  topic:"lakehouse",   sub:"Workspace",       diff:"Intermediate", type:"mcq", q:"You want Git version control for notebooks without manual exports. Which feature?", opts:["Databricks Connect","Export as .py manually","Store in DBFS","Databricks Repos (Git folders)"], a:3, exp:"Databricks Repos provides native Git integration directly in the workspace." },
  { id:4,  topic:"delta",       sub:"Time Travel",     diff:"Beginner",     type:"mcq", q:"Which Delta Lake feature enables querying historical versions of a table?", opts:["MERGE INTO","TIME TRAVEL","CLONE","VACUUM"], a:1, exp:"Delta Lake Time Travel lets you query historical snapshots using VERSION AS OF or TIMESTAMP AS OF." },
  { id:5,  topic:"delta",       sub:"Maintenance",     diff:"Beginner",     type:"mcq", q:"What does the VACUUM command do in Delta Lake?", opts:["Compacts small files","Removes old transaction log entries","Deletes files no longer referenced by the current version","Refreshes statistics"], a:2, exp:"VACUUM removes data files no longer referenced by the Delta table older than the retention threshold (default 7 days)." },
  { id:6,  topic:"delta",       sub:"Optimization",    diff:"Intermediate", type:"mcq", q:"Liquid Clustered table. You run OPTIMIZE multiple times. What does each run do?", opts:["Rewrites the most-recently queried files","Nothing after the first run","Full table rewrite every run","Only rewrites unclustered files — incremental"], a:3, exp:"Liquid Clustering is incremental — each OPTIMIZE only rewrites files not yet clustered." },
  { id:7,  topic:"delta",       sub:"CDF",             diff:"Intermediate", type:"tf",  q:'"You must restart a streaming query to start consuming Change Data Feed from an existing Delta table."', opts:["TRUE","FALSE"], a:1, exp:"No restart needed. Just set readChangeFeed=true and optionally specify startingVersion." },
  { id:8,  topic:"delta",       sub:"Optimization",    diff:"Advanced",     type:"mcq", q:"OPTIMIZE with ZORDER BY is used to:", opts:["Sort the table alphabetically","Co-locate related data for faster filter queries","Remove duplicate rows","Partition data by date"], a:1, exp:"ZORDER BY co-locates related information in the same files, improving query performance by reducing data scanned." },
  { id:9,  topic:"elt",         sub:"Auto Loader",     diff:"Intermediate", type:"mcq", q:"Source adds 3 new columns. Auto Loader ignores them silently. Which setting captures them?", opts:["cloudFiles.schemaEvolutionMode = addNewColumns","cloudFiles.inferColumnTypes = true","cloudFiles.format = json","mergeSchema = true"], a:0, exp:"cloudFiles.schemaEvolutionMode = addNewColumns tells Auto Loader to automatically detect and add new columns." },
  { id:10, topic:"elt",         sub:"Spark SQL",       diff:"Beginner",     type:"mcq", q:"Which join type retains ALL rows from the left table, filling NULLs for non-matches?", opts:["INNER JOIN","LEFT OUTER JOIN","CROSS JOIN","RIGHT SEMI JOIN"], a:1, exp:"LEFT OUTER JOIN returns all rows from the left table. Non-matching rows get NULL for right-side columns." },
  { id:11, topic:"elt",         sub:"Spark SQL",       diff:"Beginner",     type:"tf",  q:'"CTAS statements in Spark SQL always inherit the source table\'s constraints."', opts:["TRUE","FALSE"], a:1, exp:"CTAS creates a new table but does NOT inherit source constraints, partition specs, or table properties by default." },
  { id:12, topic:"elt",         sub:"DLT",             diff:"Intermediate", type:"mcq", q:"What is the key difference between LIVE TABLE and STREAMING LIVE TABLE in DLT?", opts:["LIVE TABLE is faster","STREAMING LIVE TABLE processes all historical data on each run","LIVE TABLE does a full refresh; STREAMING LIVE TABLE processes only new data","They are identical"], a:2, exp:"LIVE TABLE does a full recompute each run. STREAMING LIVE TABLE only processes new incremental data." },
  { id:13, topic:"streaming",   sub:"Watermarks",      diff:"Intermediate", type:"mcq", q:"Watermarking in Structured Streaming is used to:", opts:["Set checkpointing intervals","Define how late data is tolerated for aggregations","Mark data quality issues","Encrypt streaming data"], a:1, exp:"Watermarks define the maximum allowed lateness for event-time data. Older data is dropped." },
  { id:14, topic:"streaming",   sub:"Triggers",        diff:"Beginner",     type:"mcq", q:"Which trigger processes all available data then stops the stream?", opts:["Trigger.ProcessingTime('1 minute')","Trigger.Once()","Trigger.Continuous('1 second')","Trigger.AvailableNow()"], a:3, exp:"Trigger.AvailableNow() processes all available data in micro-batches then stops. Introduced in Spark 3.3+." },
  { id:15, topic:"streaming",   sub:"Output Modes",    diff:"Intermediate", type:"mcq", q:"Which output mode writes only new rows since the last trigger?", opts:["Complete","Update","Append","Overwrite"], a:2, exp:"Append mode outputs only new rows added since the last trigger. Complete rewrites the entire result." },
  { id:16, topic:"streaming",   sub:"DLT",             diff:"Intermediate", type:"tf",  q:'"DLT pipelines support both Triggered and Continuous execution modes."', opts:["TRUE","FALSE"], a:0, exp:"DLT supports Triggered (runs once and stops) and Continuous (runs indefinitely) modes." },
  { id:17, topic:"production",  sub:"Testing CICD",    diff:"Intermediate", type:"tf",  q:'"Databricks Asset Bundles can only be deployed through GitHub Actions."', opts:["TRUE","FALSE"], a:1, exp:"DABs are CI/CD-agnostic — they work with GitHub Actions, Azure DevOps, GitLab CI, Jenkins, or manual terminal commands." },
  { id:18, topic:"production",  sub:"Jobs",            diff:"Beginner",     type:"mcq", q:"What happens to a Job cluster when the job run completes?", opts:["Stays running 30 minutes","Converts to All-Purpose cluster","Automatically terminated","Pauses for next run"], a:2, exp:"Job clusters are ephemeral — they terminate automatically when the job run completes, saving costs." },
  { id:19, topic:"production",  sub:"Monitoring",      diff:"Intermediate", type:"mcq", q:"Where do you find detailed Spark execution plans and stage metrics for a completed job?", opts:["Cluster logs","Spark UI via the Jobs tab","DBFS audit logs","Workflow email alerts"], a:1, exp:"The Spark UI shows DAGs, stage details, task metrics, and execution plans for completed and running jobs." },
  { id:20, topic:"governance",  sub:"Unity Catalog",   diff:"Beginner",     type:"mcq", q:"In Unity Catalog, what is the correct 3-level namespace order?", opts:["schema.catalog.table","catalog.schema.table","table.schema.catalog","database.schema.table"], a:1, exp:"Unity Catalog uses catalog.schema.table — a three-level namespace providing hierarchy above traditional database.table." },
  { id:21, topic:"governance",  sub:"Unity Catalog",   diff:"Intermediate", type:"mcq", q:"You need to audit who queried a sensitive table last week. Where do you look?", opts:["Unity Catalog UI table details","Delta table DESCRIBE HISTORY","Cluster driver logs","System tables (system.access.audit)"], a:3, exp:"UC audit logs are in system tables. system.access.audit records data access, permission changes, and more." },
  { id:22, topic:"governance",  sub:"Unity Catalog",   diff:"Intermediate", type:"mcq", q:"Engineers keep forgetting to prefix queries with the catalog name. How do you set a default catalog?", opts:["USE CATALOG main","SET spark.sql.catalog = main","Only in workspace admin UI","USE DATABASE main"], a:0, exp:"USE CATALOG catalog_name sets the default catalog for the current session." },
  { id:23, topic:"performance", sub:"Shuffle",         diff:"Beginner",     type:"mcq", q:"What causes a shuffle in Spark?", opts:["Reading from Delta Lake","Operations requiring data redistribution across partitions","UDF execution","Schema validation"], a:1, exp:"Shuffles occur when data must move across partitions — groupBy, join, distinct, repartition are common causes." },
  { id:24, topic:"performance", sub:"AQE",             diff:"Intermediate", type:"mcq", q:"Adaptive Query Execution (AQE) can automatically:", opts:["Rewrite SQL queries","Coalesce shuffle partitions and switch join strategies at runtime","Cache frequently accessed tables","Reorder WHERE predicates"], a:1, exp:"AQE uses runtime statistics to dynamically coalesce partitions, switch join strategies, and optimize skew joins." },
  { id:25, topic:"performance", sub:"Optimization",    diff:"Intermediate", type:"tf",  q:'"Increasing shuffle partitions always improves Spark job performance."', opts:["TRUE","FALSE"], a:1, exp:"Too many shuffle partitions for small data causes scheduling overhead. Tune spark.sql.shuffle.partitions to match data size." },
];

// ── STYLES ────────────────────────────────────────────────────────────
const STYLES = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
:root{
  --bg:#070d16;--bg2:#0d1829;--bg3:#112038;--bg4:#162840;
  --border:#1a3050;--border2:#1e3a5f;
  --text:#e2f0ff;--text2:#7ba8d4;--text3:#3d6080;
  --cyan:#06b6d4;--cyan2:#67e8f9;--cyan-bg:rgba(6,182,212,0.12);
  --yellow:#f5a623;--yellow2:#fbbf24;--yellow-bg:rgba(245,166,35,0.15);
  --green:#10b981;--green-bg:rgba(16,185,129,0.12);
  --red:#f43f5e;--red-bg:rgba(244,63,94,0.12);
  --blue:#3b82f6;
}
html,body{height:100%;background:var(--bg);color:var(--text);font-family:'Inter',sans-serif;}
.app{min-height:100vh;display:flex;flex-direction:column;max-width:480px;margin:0 auto;position:relative;}

/* TOPBAR */
.topbar{display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid var(--border);background:var(--bg);position:sticky;top:0;z-index:50;}
.logo-row{display:flex;align-items:center;gap:9px;cursor:pointer;}
.app-name{font-size:15px;font-weight:800;color:var(--text);letter-spacing:-0.3px;}
.app-name span{color:var(--cyan);}
.hstats{display:flex;gap:10px;font-size:13px;font-weight:600;align-items:center;}

/* ONBOARDING */
.onboard{flex:1;display:flex;flex-direction:column;background:var(--bg);min-height:100vh;position:relative;}
.ob-topbar{display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid var(--border);}
.skip-btn{font-size:13px;color:var(--text3);background:none;border:none;cursor:pointer;}
.ob-body{flex:1;padding:24px 20px 16px;display:flex;flex-direction:column;align-items:center;text-align:center;}
.ob-footer{font-size:11px;color:var(--text3);text-align:center;padding:0 20px 20px;line-height:1.7;}
.ob-footer a{color:var(--text2);text-decoration:none;}
.ob-footer a:hover{text-decoration:underline;}
.ob-dots{display:flex;gap:5px;justify-content:center;margin-bottom:16px;}
.ob-dot{width:7px;height:7px;border-radius:50%;background:var(--border2);}
.ob-dot.on{background:var(--cyan);width:22px;border-radius:4px;}
.btn-next{width:100%;background:var(--yellow);border:none;border-radius:12px;padding:14px;font-size:15px;font-weight:800;color:#1a1000;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;margin-bottom:14px;}

/* ORBIT animation for slide 1 */
.orbit-wrap{width:110px;height:110px;position:relative;margin:0 auto 20px;}
.orbit-center{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);animation:float-up 3s ease-in-out infinite;}
.orbit-ring{position:absolute;top:50%;left:50%;width:80px;height:80px;border-radius:50%;border:1px dashed rgba(6,182,212,0.2);transform:translate(-50%,-50%);}
.orbit-ring2{position:absolute;top:50%;left:50%;width:58px;height:58px;border-radius:50%;border:1px dashed rgba(245,166,35,0.15);transform:translate(-50%,-50%);}
.orbiter{position:absolute;top:50%;left:50%;width:10px;height:10px;border-radius:50%;margin:-5px;}
@keyframes float-up{0%,100%{transform:translate(-50%,-50%) scale(1);}50%{transform:translate(-50%,-54%) scale(1.05);}}
@keyframes orbit1{from{transform:rotate(0deg) translateX(40px) rotate(0deg);}to{transform:rotate(360deg) translateX(40px) rotate(-360deg);}}
@keyframes orbit2{from{transform:rotate(120deg) translateX(28px) rotate(-120deg);}to{transform:rotate(480deg) translateX(28px) rotate(-480deg);}}
@keyframes orbit3{from{transform:rotate(240deg) translateX(50px) rotate(-240deg);}to{transform:rotate(600deg) translateX(50px) rotate(-600deg);}}
.orb1{background:var(--cyan);animation:orbit1 3s linear infinite;}
.orb2{background:var(--yellow);animation:orbit2 4s linear infinite;}
.orb3{background:#34d399;animation:orbit3 5s linear infinite;}
.s1-title{font-size:22px;font-weight:800;color:var(--text);letter-spacing:-0.5px;margin-bottom:10px;line-height:1.25;}
.s1-title span{color:var(--cyan);}
.s1-sub{font-size:13px;color:var(--text2);line-height:1.65;margin-bottom:18px;}
.chip-wrap{display:flex;flex-wrap:wrap;gap:5px;justify-content:center;margin-bottom:20px;}
.chip{font-size:11px;padding:5px 10px;border-radius:6px;font-weight:600;animation:fade-stagger 0.4s ease forwards;opacity:0;}
@keyframes fade-stagger{to{opacity:1;}}
.chip:nth-child(1){animation-delay:0.1s;} .chip:nth-child(2){animation-delay:0.2s;} .chip:nth-child(3){animation-delay:0.3s;} .chip:nth-child(4){animation-delay:0.4s;} .chip:nth-child(5){animation-delay:0.5s;} .chip:nth-child(6){animation-delay:0.6s;} .chip:nth-child(7){animation-delay:0.7s;}

/* Slide 2 */
.big-num-wrap{position:relative;display:inline-block;margin-bottom:8px;}
.ping-ring{position:absolute;inset:-10px;border-radius:50%;border:2px solid var(--yellow);animation:ping 1.8s ease-out infinite;}
@keyframes ping{0%{transform:scale(1);opacity:0.6;}100%{transform:scale(2);opacity:0;}}
.big-num{font-size:72px;font-weight:800;color:var(--yellow);line-height:1;letter-spacing:-2px;}
.s2-sub2{font-size:12px;color:var(--text3);}
.habit-list{display:flex;flex-direction:column;gap:8px;width:100%;margin-bottom:20px;}
.habit-row{display:flex;align-items:center;gap:12px;background:var(--bg2);border:1px solid var(--border);border-radius:10px;padding:11px 13px;animation:slide-in 0.5s ease both;opacity:0;}
.habit-row:nth-child(1){animation-delay:0.2s;animation-name:slide-in-left;}
.habit-row:nth-child(2){animation-delay:0.4s;animation-name:slide-in-right;}
.habit-row:nth-child(3){animation-delay:0.6s;animation-name:slide-in-left;}
@keyframes slide-in-left{from{opacity:0;transform:translateX(-16px);}to{opacity:1;transform:translateX(0);}}
@keyframes slide-in-right{from{opacity:0;transform:translateX(16px);}to{opacity:1;transform:translateX(0);}}
.habit-icon{font-size:22px;width:30px;text-align:center;flex-shrink:0;}
.habit-text{font-size:13px;font-weight:700;color:var(--text);}
.habit-sub{font-size:11px;color:var(--text3);margin-top:1px;}
.habit-badge{margin-left:auto;font-size:10px;font-weight:700;padding:3px 8px;border-radius:4px;flex-shrink:0;}

/* Slide 3 */
.rocket-wrap{position:relative;width:80px;height:90px;margin:0 auto 16px;}
.rocket-icon{font-size:56px;display:block;animation:rocket-launch 2s ease-in-out infinite;filter:drop-shadow(0 0 16px rgba(6,182,212,0.5));}
.exhaust{position:absolute;bottom:2px;left:50%;transform:translateX(-50%);width:8px;height:20px;background:linear-gradient(to bottom,var(--yellow),transparent);border-radius:4px;animation:exhaust-anim 0.3s ease-in-out infinite;}
@keyframes rocket-launch{0%,100%{transform:translateY(0) rotate(-10deg);}50%{transform:translateY(-8px) rotate(-14deg);}}
@keyframes exhaust-anim{0%,100%{transform:translateX(-50%) scaleY(1);opacity:0.7;}50%{transform:translateX(-50%) scaleY(1.5);opacity:0.3;}}
.s3-title{font-size:22px;font-weight:800;color:var(--text);letter-spacing:-0.5px;margin-bottom:8px;line-height:1.25;}
.s3-shimmer{background:linear-gradient(90deg,var(--cyan),var(--cyan2),var(--cyan));background-size:200% 100%;-webkit-background-clip:text;-webkit-text-fill-color:transparent;animation:shimmer 2s linear infinite;}
@keyframes shimmer{0%{background-position:-200% 0;}100%{background-position:200% 0;}}
.diff-pills{display:flex;gap:8px;justify-content:center;margin-bottom:16px;flex-wrap:wrap;}
.dp{padding:9px 16px;border-radius:8px;font-size:12px;font-weight:700;border:2px solid;animation:pop-in 0.4s ease both;opacity:0;}
.dp:nth-child(1){animation-delay:0.3s;} .dp:nth-child(2){animation-delay:0.5s;} .dp:nth-child(3){animation-delay:0.7s;}
@keyframes pop-in{0%{transform:scale(0.7);opacity:0;}60%{transform:scale(1.1);}100%{transform:scale(1);opacity:1;}}
.level-card{background:var(--bg2);border:1px solid var(--border2);border-radius:10px;padding:12px 14px;width:100%;margin-bottom:16px;animation:pop-in 0.5s ease 0.9s both;opacity:0;}
.level-bar{height:7px;background:var(--bg3);border-radius:4px;overflow:hidden;}
.level-bar-fill{height:100%;background:linear-gradient(90deg,var(--cyan),var(--cyan2));border-radius:4px;animation:level-grow 1.5s ease 1.2s both;width:0%;}
@keyframes level-grow{from{width:0%;}to{width:35%;}}

/* HOME */
.home{flex:1;padding:18px 16px 100px;overflow-y:auto;}
.home-eyebrow{font-size:9px;color:var(--cyan);letter-spacing:3px;text-transform:uppercase;margin-bottom:6px;}
.home-h1{font-size:22px;font-weight:800;color:var(--text);margin-bottom:3px;letter-spacing:-0.5px;}
.home-pts{font-size:13px;color:var(--text2);margin-bottom:4px;}
.home-tagline{font-size:12px;color:var(--text3);margin-bottom:10px;line-height:1.6;}
.pts-bar{height:5px;background:var(--bg3);border-radius:3px;margin-bottom:14px;overflow:hidden;}
.pts-fill{height:100%;background:linear-gradient(90deg,var(--cyan),var(--cyan2));border-radius:3px;transition:width 0.6s ease;}
.cert-banner{background:var(--bg2);border:1px solid var(--cyan);border-radius:14px;padding:14px 16px;margin-bottom:14px;position:relative;overflow:hidden;}
.cert-glow{position:absolute;top:-30px;right:-30px;width:100px;height:100px;background:var(--cyan);opacity:0.06;border-radius:50%;}
.cert-eye{font-size:9px;color:var(--cyan);letter-spacing:3px;text-transform:uppercase;margin-bottom:5px;}
.cert-title{font-size:15px;font-weight:800;color:var(--text);margin-bottom:3px;}
.cert-sub{font-size:12px;color:var(--text2);margin-bottom:10px;}
.cert-pills{display:flex;flex-wrap:wrap;gap:4px;}
.cert-pill{font-size:10px;background:var(--cyan-bg);color:var(--cyan2);border:1px solid rgba(6,182,212,0.25);border-radius:4px;padding:3px 8px;}
.btn-start{width:100%;background:var(--yellow);border:none;border-radius:12px;padding:14px;font-size:15px;font-weight:800;color:#1a1000;cursor:pointer;margin-bottom:14px;display:flex;align-items:center;justify-content:center;gap:8px;transition:all 0.15s;}
.btn-start:hover{filter:brightness(1.08);transform:translateY(-1px);}
.sec-head{font-size:13px;font-weight:700;color:var(--text);margin-bottom:10px;display:flex;align-items:center;gap:6px;}
.topic-grid{display:grid;grid-template-columns:1fr 1fr;gap:9px;margin-bottom:14px;}
.tc{background:var(--bg2);border:1px solid var(--border);border-radius:12px;padding:12px;cursor:pointer;transition:all 0.15s;position:relative;overflow:hidden;}
.tc:hover{border-color:var(--border2);transform:translateY(-2px);box-shadow:0 4px 20px rgba(0,0,0,0.3);}
.tc-sym{width:32px;height:32px;display:flex;align-items:center;justify-content:center;border-radius:8px;margin-bottom:7px;animation:sym-pulse 3s ease-in-out infinite;}
@keyframes sym-pulse{0%,100%{filter:drop-shadow(0 0 3px currentColor);}50%{filter:drop-shadow(0 0 8px currentColor);}}
.tc-name{font-size:12px;font-weight:700;color:var(--text);line-height:1.3;}
.tc-count{font-size:10px;color:var(--text3);margin-top:2px;}
.tc-bar{height:2px;background:var(--border);border-radius:2px;margin-top:7px;overflow:hidden;}
.tc-fill{height:100%;border-radius:2px;transition:width 0.4s ease;}
.home-footer{font-size:10px;color:var(--text3);text-align:center;margin-top:8px;line-height:1.8;}
.home-footer a{color:var(--text2);text-decoration:none;}
.home-footer a:hover{text-decoration:underline;}

/* SETUP */
.setup{flex:1;padding:20px 16px 100px;overflow-y:auto;}
.back-btn{display:flex;align-items:center;gap:6px;font-size:13px;color:var(--text2);background:none;border:none;cursor:pointer;margin-bottom:20px;}
.setup-title{font-size:20px;font-weight:800;color:var(--text);margin-bottom:5px;}
.setup-sub{font-size:13px;color:var(--text2);margin-bottom:22px;}
.diff-row{display:flex;gap:8px;margin-bottom:16px;}
.diff-btn{flex:1;padding:10px 6px;border-radius:8px;border:1.5px solid var(--border);background:transparent;color:var(--text2);font-size:12px;font-weight:600;cursor:pointer;transition:all 0.15s;display:flex;align-items:center;justify-content:center;gap:5px;}
.diff-btn.on{border-color:var(--yellow);background:var(--yellow-bg);color:var(--text);}
.topics-dd{width:100%;background:var(--bg2);border:1px solid var(--border);border-radius:10px;padding:12px 14px;color:var(--text2);font-size:14px;cursor:pointer;display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;}
.topics-list{background:var(--bg2);border:1px solid var(--border);border-radius:10px;overflow:hidden;margin-bottom:16px;animation:slide-in-left 0.2s ease;}
.topic-row{display:flex;align-items:center;justify-content:space-between;padding:12px 14px;border-bottom:1px solid var(--border);cursor:pointer;transition:background 0.1s;}
.topic-row:last-child{border-bottom:none;}
.topic-row:hover{background:var(--bg3);}
.tr-left{display:flex;align-items:center;gap:10px;font-size:13px;color:var(--text);}
.check{width:18px;height:18px;border-radius:4px;border:1.5px solid var(--border2);display:flex;align-items:center;justify-content:center;font-size:11px;color:var(--yellow);flex-shrink:0;}
.check.on{background:var(--yellow-bg);border-color:var(--yellow);}
.deselect{font-size:12px;color:var(--cyan);padding:6px 14px;text-align:right;cursor:pointer;}

/* SESSION */
.session{flex:1;display:flex;flex-direction:column;background:var(--bg);}
.sess-top{display:flex;align-items:center;gap:12px;padding:12px 16px;border-bottom:1px solid var(--border);}
.close-btn{width:32px;height:32px;display:flex;align-items:center;justify-content:center;color:var(--text2);background:none;border:none;cursor:pointer;font-size:18px;flex-shrink:0;}
.prog-track{flex:1;height:8px;background:var(--bg3);border-radius:4px;overflow:hidden;}
.prog-fill{height:100%;background:linear-gradient(90deg,var(--cyan),var(--cyan2));border-radius:4px;transition:width 0.3s ease;}
.pts-badge{font-size:14px;font-weight:700;color:var(--cyan);flex-shrink:0;}
.q-area{flex:1;padding:16px;overflow-y:auto;}
.q-meta{display:flex;align-items:center;gap:5px;margin-bottom:12px;flex-wrap:wrap;}
.qtag{font-size:11px;padding:3px 8px;border-radius:5px;font-weight:600;}
.flag-btn{margin-left:auto;background:none;border:none;color:var(--text3);cursor:pointer;font-size:16px;}
.flag-btn.on{color:var(--yellow);}
.q-nums{display:flex;justify-content:space-between;margin-bottom:8px;}
.q-text{font-size:17px;font-weight:700;color:var(--text);margin-bottom:18px;line-height:1.5;}
.q-text.tf{text-align:center;font-size:18px;}
.opts-list{display:flex;flex-direction:column;gap:8px;}
.opt-btn{width:100%;text-align:left;background:var(--bg2);border:1.5px solid var(--border);border-radius:10px;padding:13px 14px;font-size:14px;color:var(--text2);cursor:pointer;display:flex;align-items:center;gap:12px;transition:all 0.12s;line-height:1.4;}
.opt-btn:hover:not(.dis){background:var(--bg3);border-color:var(--border2);}
.opt-btn.correct{border-color:var(--green);background:var(--green-bg);color:var(--cyan2);}
.opt-btn.wrong{border-color:var(--red);background:var(--red-bg);color:#fda4af;animation:shake 0.35s ease;}
.opt-btn.dis{cursor:default;}
@keyframes shake{0%,100%{transform:translateX(0);}25%{transform:translateX(-5px);}75%{transform:translateX(5px);}}
.opt-n{width:24px;height:24px;border-radius:6px;background:var(--bg3);font-size:12px;font-weight:700;display:flex;align-items:center;justify-content:center;color:var(--text3);flex-shrink:0;}
.opt-btn.correct .opt-n{background:var(--green-bg);color:var(--green);}
.opt-btn.wrong .opt-n{background:var(--red-bg);color:var(--red);}
.tf-row{display:grid;grid-template-columns:1fr 1fr;gap:10px;}
.tf-btn{padding:20px;border-radius:12px;border:1.5px solid var(--border);background:var(--bg2);font-size:16px;font-weight:800;color:var(--text2);cursor:pointer;transition:all 0.12s;letter-spacing:1px;}
.tf-btn:hover:not(.dis){background:var(--bg3);}
.tf-btn.correct{border-color:var(--green);background:var(--green-bg);color:var(--green);}
.tf-btn.wrong{border-color:var(--red);background:var(--red-bg);color:var(--red);}
.feedback{border-radius:12px;padding:14px;margin-top:14px;border:1px solid;animation:slide-up 0.25s cubic-bezier(0.16,1,0.3,1);}
@keyframes slide-up{from{opacity:0;transform:translateY(10px);}to{opacity:1;transform:translateY(0);}}
.fb.ok{border-color:var(--green);background:rgba(16,185,129,0.1);}
.fb.ng{border-color:var(--red);background:rgba(244,63,94,0.1);}
.fb-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;}
.fb-title{font-size:14px;font-weight:800;}
.fb.ok .fb-title{color:var(--green);}
.fb.ng .fb-title{color:var(--red);}
.fb-exp{font-size:13px;color:var(--text2);line-height:1.6;}
.btn-continue{flex:1;background:var(--bg3);border:1px solid var(--border2);border-radius:8px;padding:12px;font-size:14px;font-weight:700;color:var(--text);cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px;margin-top:12px;}
.kb-tip{position:fixed;bottom:90px;left:50%;transform:translateX(-50%);background:var(--bg3);border:1px solid var(--border2);border-radius:10px;padding:8px 14px;font-size:12px;color:var(--text2);display:flex;align-items:center;gap:8px;max-width:300px;z-index:50;animation:slide-up 0.3s ease;}
.kb-close{background:none;border:none;color:var(--text3);cursor:pointer;font-size:14px;margin-left:auto;}
kbd{background:var(--bg4);border:1px solid var(--border2);border-radius:4px;padding:1px 5px;font-size:10px;}
.flag-menu{position:absolute;right:12px;top:60px;background:var(--bg3);border:1px solid var(--border2);border-radius:8px;z-index:100;min-width:160px;box-shadow:0 8px 24px rgba(0,0,0,0.4);animation:pop-in 0.15s ease;}
.flag-opt{padding:11px 16px;font-size:13px;cursor:pointer;color:var(--text);}
.flag-opt:hover{background:var(--bg4);}

/* WIN SCREENS */
.win-screen{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px 20px;text-align:center;background:var(--bg);position:relative;overflow:hidden;}
.confetti-layer{position:absolute;inset:0;pointer-events:none;}
.conf-piece{position:absolute;width:8px;height:8px;border-radius:2px;animation:conf-fall linear infinite;}
@keyframes conf-fall{0%{transform:translateY(-20px) rotate(0deg);opacity:1;}100%{transform:translateY(110vh) rotate(720deg);opacity:0;}}
.trophy-icon{font-size:72px;animation:trophy-bounce 1s ease-in-out infinite;filter:drop-shadow(0 0 24px rgba(245,166,35,0.7));margin-bottom:10px;}
@keyframes trophy-bounce{0%,100%{transform:scale(1) translateY(0);}40%{transform:scale(1.12) translateY(-8px);}70%{transform:scale(1.06) translateY(-4px);}}
.pulse-ring-w{position:absolute;width:90px;height:90px;border-radius:50%;top:60px;left:50%;transform:translateX(-50%);border:2px solid var(--yellow);animation:pulse-ring 1.5s ease-out infinite;}
.pulse-ring-w2{position:absolute;width:90px;height:90px;border-radius:50%;top:60px;left:50%;transform:translateX(-50%);border:2px solid var(--cyan);animation:pulse-ring 1.5s ease-out 0.5s infinite;}
@keyframes pulse-ring{0%{transform:translateX(-50%) scale(1);opacity:0.6;}100%{transform:translateX(-50%) scale(2.2);opacity:0;}}
.win-woohoo{font-size:18px;font-weight:800;background:linear-gradient(90deg,var(--cyan),var(--yellow),var(--cyan));background-size:200% 100%;-webkit-background-clip:text;-webkit-text-fill-color:transparent;animation:shimmer 2s linear infinite;letter-spacing:2px;margin-bottom:10px;}
.win-title{font-size:26px;font-weight:800;color:var(--text);letter-spacing:-0.5px;margin-bottom:4px;}
.win-title span{color:var(--cyan);}
.win-sub{font-size:13px;color:var(--text2);margin-bottom:16px;}
.stars-row{display:flex;gap:8px;justify-content:center;margin-bottom:16px;}
.star{font-size:32px;opacity:0;animation:star-pop 0.4s ease both;}
.star:nth-child(1){animation-delay:0.5s;} .star:nth-child(2){animation-delay:0.7s;} .star:nth-child(3){animation-delay:0.9s;}
@keyframes star-pop{0%{transform:scale(0) rotate(-20deg);opacity:0;}60%{transform:scale(1.2) rotate(8deg);}100%{transform:scale(1) rotate(0deg);opacity:1;}}
.xp-earned{display:flex;align-items:center;gap:10px;background:var(--bg2);border:2px solid var(--yellow);border-radius:12px;padding:14px 24px;margin-bottom:16px;animation:pop-in 0.4s ease 0.4s both;opacity:0;}
.xp-num{font-size:38px;font-weight:800;color:var(--yellow);animation:glow-pulse 1.5s ease-in-out infinite;}
@keyframes glow-pulse{0%,100%{text-shadow:0 0 10px rgba(245,166,35,0.5);}50%{text-shadow:0 0 30px rgba(245,166,35,0.9);}}
.xp-lbl{text-align:left;font-size:11px;color:var(--text2);line-height:1.6;}
.lvl-bar-wrap{width:100%;margin-bottom:6px;}
.lvl-bar{height:7px;background:var(--bg3);border-radius:4px;overflow:hidden;}
.lvl-bar-fill{height:100%;background:linear-gradient(90deg,var(--cyan),var(--cyan2));border-radius:4px;animation:level-grow 1.2s ease 1s both;width:0%;}
.lvl-lbl{display:flex;justify-content:space-between;font-size:11px;color:var(--text3);margin-bottom:6px;}
.btn-continue-win{width:100%;background:var(--yellow);border:none;border-radius:12px;padding:14px;font-size:15px;font-weight:800;color:#1a1000;cursor:pointer;margin-top:8px;}

/* STREAK WIN */
.streak-win{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:28px 20px;text-align:center;background:var(--bg);}
.flame-icon{font-size:80px;animation:float-flame 1.5s ease-in-out infinite;filter:drop-shadow(0 0 28px rgba(245,166,35,0.85));margin-bottom:6px;}
@keyframes float-flame{0%,100%{transform:translateY(0) scale(1);}50%{transform:translateY(-8px) scale(1.05);}}
.streak-num{font-size:64px;font-weight:800;color:var(--yellow);line-height:1;animation:glow-pulse 1.5s ease-in-out infinite;}
.streak-days{font-size:14px;color:var(--text2);margin-bottom:8px;margin-top:4px;}
.streak-msg{font-size:20px;font-weight:800;color:var(--text);margin-bottom:6px;}
.streak-sub{font-size:13px;color:var(--text2);line-height:1.6;margin-bottom:20px;}
.week-bars{display:flex;gap:5px;width:100%;margin-bottom:20px;}
.wb-col{flex:1;display:flex;flex-direction:column;align-items:center;gap:4px;}
.wb-bar{width:100%;background:var(--bg3);border-radius:4px;overflow:hidden;height:36px;}
.wb-fill{width:100%;height:100%;background:var(--cyan);border-radius:4px;}
.wb-fill.today{background:var(--yellow);border:2px solid var(--yellow2);}
.wb-day{font-size:9px;color:var(--text3);}
.wb-day.today{color:var(--yellow);font-weight:700;}

/* STATS */
.stats-screen{flex:1;padding:20px 16px 100px;overflow-y:auto;}
.stat-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px;}
.stat-card{background:var(--bg2);border:1px solid var(--border);border-radius:12px;padding:16px;}
.sc-label{font-size:12px;color:var(--text3);margin-bottom:6px;}
.sc-val{font-size:28px;font-weight:800;color:var(--text);}
.sc-val.cyan{color:var(--cyan);} .sc-val.yellow{color:var(--yellow);} .sc-val.orange{color:#f97316;}
.sc-sub{font-size:11px;color:var(--text3);margin-top:4px;}
.stat-bar{height:4px;background:var(--bg3);border-radius:2px;margin-top:8px;overflow:hidden;}
.stat-bar-fill{height:100%;background:var(--yellow);border-radius:2px;}
.card-block{background:var(--bg2);border:1px solid var(--border);border-radius:12px;padding:16px;margin-bottom:14px;}
.cb-title{font-size:14px;font-weight:700;color:var(--text);margin-bottom:12px;}
.bests-row{display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border);}
.bests-row:last-child{border-bottom:none;}
.br-label{font-size:13px;color:var(--text2);}
.br-val{font-size:13px;font-weight:700;color:var(--text);}
.br-val.yellow{color:var(--yellow);} .br-val.orange{color:#f97316;}
.tp-row{display:flex;align-items:center;gap:10px;padding:7px 0;}
.tp-icon{width:24px;text-align:center;font-size:14px;}
.tp-name{font-size:13px;color:var(--text2);flex:1;}
.tp-bar{width:90px;height:5px;background:var(--bg3);border-radius:3px;overflow:hidden;}
.tp-fill{height:100%;background:var(--cyan);border-radius:3px;}
.tp-pct{font-size:12px;color:var(--text3);width:30px;text-align:right;}
.week-card{background:var(--bg2);border:1px solid var(--border);border-radius:12px;padding:16px;margin-bottom:14px;}
.wc-bars{display:flex;align-items:flex-end;gap:6px;height:60px;}
.wc-col{flex:1;display:flex;flex-direction:column;align-items:center;gap:4px;}
.wc-val{font-size:10px;color:var(--text3);}
.wc-track{width:100%;flex:1;background:var(--bg3);border-radius:3px;overflow:hidden;position:relative;}
.wc-fill{width:100%;background:var(--cyan);border-radius:3px;position:absolute;bottom:0;}
.wc-day{font-size:10px;color:var(--text3);}
.lb-row{display:flex;align-items:center;gap:12px;background:var(--bg2);border:1px solid var(--border);border-radius:10px;padding:13px 16px;margin-bottom:7px;transition:all 0.12s;}
.lb-row.me{border-color:var(--yellow);background:rgba(245,166,35,0.06);}
.lb-rank{font-size:18px;font-weight:800;color:var(--text3);width:28px;}
.lb-name{flex:1;font-size:14px;font-weight:600;color:var(--text);}
.lb-xp{font-size:13px;font-weight:700;color:var(--yellow);}

/* SETTINGS */
.settings-screen{flex:1;padding:20px 16px 100px;overflow-y:auto;}
.settings-title{font-size:22px;font-weight:800;color:var(--text);margin-bottom:16px;}
.auth-card{background:var(--bg2);border:1px solid var(--border);border-radius:12px;padding:16px;margin-bottom:16px;}
.auth-label{font-size:13px;font-weight:600;color:var(--text2);margin-bottom:12px;}
.auth-input{width:100%;background:var(--bg3);border:1px solid var(--border2);border-radius:9px;padding:12px 14px;color:var(--text);font-size:14px;margin-bottom:9px;outline:none;transition:border 0.15s;}
.auth-input:focus{border-color:var(--cyan);}
.auth-err{background:rgba(244,63,94,0.1);border:1px solid rgba(244,63,94,0.3);border-radius:7px;padding:8px 12px;font-size:12px;color:#fda4af;margin-bottom:9px;}
.auth-ok{background:rgba(16,185,129,0.1);border:1px solid rgba(16,185,129,0.3);border-radius:7px;padding:8px 12px;font-size:12px;color:#6ee7b7;margin-bottom:9px;}
.btn-magic{width:100%;background:var(--yellow);border:none;border-radius:10px;padding:13px;font-size:14px;font-weight:800;color:#1a1000;cursor:pointer;margin-bottom:10px;}
.auth-links{display:flex;gap:10px;justify-content:center;font-size:12px;color:var(--cyan);cursor:pointer;flex-wrap:wrap;}
.auth-logged{display:flex;align-items:center;gap:12px;margin-bottom:12px;}
.auth-av{width:40px;height:40px;border-radius:50%;background:var(--cyan-bg);border:2px solid var(--cyan);display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:800;color:var(--cyan);flex-shrink:0;}
.auth-email-txt{font-size:14px;font-weight:700;color:var(--text);}
.auth-sync{font-size:11px;color:var(--green);margin-top:2px;}
.btn-signout{width:100%;background:transparent;border:1px solid var(--border2);border-radius:9px;padding:10px;font-size:13px;color:var(--text2);cursor:pointer;transition:all 0.15s;}
.btn-signout:hover{border-color:var(--red);color:var(--red);}
.pref-title{font-size:11px;font-weight:600;color:var(--text3);letter-spacing:2px;text-transform:uppercase;margin-bottom:12px;margin-top:4px;}
.setting-card{background:var(--bg2);border:1px solid var(--border);border-radius:12px;padding:14px;margin-bottom:10px;}
.sc-head{font-size:13px;font-weight:700;color:var(--text);margin-bottom:4px;}
.sc-desc{font-size:11px;color:var(--text3);margin-bottom:12px;}
.diff-item{padding:9px 12px;border-radius:8px;font-size:13px;color:var(--text2);display:flex;align-items:center;gap:10px;cursor:pointer;transition:background 0.1s;}
.diff-item:hover{background:var(--bg3);}
.diff-item.active{background:var(--bg3);}
.diff-dot{width:8px;height:8px;border-radius:50%;}
.diff-check{margin-left:auto;color:var(--yellow);font-size:13px;}
.pts-goal-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:7px;}
.pg-btn{padding:10px;border-radius:8px;border:1.5px solid var(--border);background:transparent;color:var(--text2);font-size:12px;font-weight:600;cursor:pointer;transition:all 0.15s;}
.pg-btn.on{border-color:var(--yellow);background:var(--yellow-bg);color:var(--text);font-weight:800;}
.sound-row{display:flex;align-items:center;justify-content:space-between;}
.toggle{width:44px;height:24px;border-radius:12px;background:var(--bg3);border:none;cursor:pointer;position:relative;transition:background 0.2s;}
.toggle.on{background:var(--yellow);}
.toggle::after{content:'';position:absolute;width:18px;height:18px;border-radius:50%;background:white;top:3px;left:3px;transition:left 0.2s;}
.toggle.on::after{left:23px;}
.freeze-row{display:flex;align-items:center;justify-content:space-between;}
.freeze-info{display:flex;align-items:center;gap:10px;}
.freeze-txt .fn{font-size:13px;font-weight:600;color:var(--text);}
.freeze-txt .fs{font-size:11px;color:var(--text3);}
.freeze-count{font-size:20px;font-weight:800;color:var(--text);}
.settings-footer{font-size:11px;color:var(--text3);text-align:center;margin-top:16px;line-height:1.8;}
.settings-footer a{color:var(--text2);text-decoration:none;}
.settings-footer a:hover{text-decoration:underline;}

/* BOTTOM NAV */
.bot-nav{position:fixed;bottom:0;left:50%;transform:translateX(-50%);width:100%;max-width:480px;background:rgba(7,13,22,0.97);border-top:1px solid var(--border);display:flex;z-index:100;backdrop-filter:blur(12px);}
.nav-item{flex:1;display:flex;flex-direction:column;align-items:center;gap:3px;padding:11px 8px;cursor:pointer;border:none;background:transparent;color:var(--text3);font-size:11px;transition:color 0.15s;border-top:2px solid transparent;}
.nav-item.on{color:var(--cyan);border-top-color:var(--cyan);}
.nav-icon{font-size:20px;line-height:1;}
.pb{padding-bottom:80px;}

/* ANIMATIONS */
@keyframes fadeIn{from{opacity:0;}to{opacity:1;}}
.home{animation:fadeIn 0.25s ease;}
.session{animation:fadeIn 0.2s ease;}
.stats-screen{animation:fadeIn 0.2s ease;}
.settings-screen{animation:fadeIn 0.2s ease;}
`;

// ── MAIN ──────────────────────────────────────────────────────────────
export default function DailyBricks() {
  const [screen, setScreen] = useState("loading");
  const [obStep, setObStep] = useState(0);
  const [tab, setTab] = useState("home");
  const [userId, setUserId] = useState(null);
  const [authUser, setAuthUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState("");
  const [authSuccess, setAuthSuccess] = useState("");
  const [authMode, setAuthMode] = useState("magic");
  const [emailVal, setEmailVal] = useState("");
  const [passVal, setPassVal] = useState("");
  const [lbData, setLbData] = useState([]);
  const [globalAnalytics, setGlobalAnalytics] = useState(null);

  // Game state
  const [setupDiff, setSetupDiff] = useState(["Beginner"]);
  const [selTopics, setSelTopics] = useState(TOPICS.map(t => t.id));
  const [topicsOpen, setTopicsOpen] = useState(false);
  const [sessionQs, setSessionQs] = useState([]);
  const [qIdx, setQIdx] = useState(0);
  const [answered, setAnswered] = useState(false);
  const [chosen, setChosen] = useState(null);
  const [correct, setCorrect] = useState(false);
  const [sessionPts, setSessionPts] = useState(0);
  const [sessionCorrect, setSessionCorrect] = useState(0);
  const [flagged, setFlagged] = useState(false);
  const [showFlagMenu, setShowFlagMenu] = useState(false);
  const [showTip, setShowTip] = useState(true);
  const [winType, setWinType] = useState(null); // "perfect" | "streak_3" | "streak_7" | "streak_14" | "streak_30"

  // Persistent
  const [totalPts, setTotalPts] = useState(0);
  const [streak, setStreak] = useState(0);
  const [dailyPts, setDailyPts] = useState(0);
  const [dailyGoal, setDailyGoal] = useState(50);
  const [diffSetting, setDiffSetting] = useState("Beginner");
  const [soundOn, setSoundOn] = useState(true);
  const [topicProgress, setTopicProgress] = useState({});
  const [topicAccuracy, setTopicAccuracy] = useState({});
  const [weeklyPts, setWeeklyPts] = useState([0,0,0,0,0,0,0]);
  const [exercisesCompleted, setExercisesCompleted] = useState(0);
  const [lastActiveDay, setLastActiveDay] = useState(null);

  useEffect(() => {
    const uid = getAnonId(); setUserId(uid);
    const saved = load();
    if (!saved) { setScreen("onboard"); }
    else {
      setTotalPts(saved.totalPts||0); setStreak(saved.streak||0); setDailyPts(saved.dailyPts||0);
      setDailyGoal(saved.dailyGoal||50); setDiffSetting(saved.diffSetting||"Beginner");
      setSoundOn(saved.soundOn!==false); setTopicProgress(saved.topicProgress||{});
      setTopicAccuracy(saved.topicAccuracy||{}); setWeeklyPts(saved.weeklyPts||[0,0,0,0,0,0,0]);
      setExercisesCompleted(saved.exercisesCompleted||0); setLastActiveDay(saved.lastActiveDay||null);
      setScreen("home");
    }
    getUserDoc(uid).then(r => {
      if (r) { setTotalPts(r.totalPts||0); setStreak(r.streak||0); if(!saved) setScreen("home"); }
    });
    const unsubLb = subscribeLeaderboard(rows => setLbData(rows));
    const unsubAn = subscribeAnalytics(data => setGlobalAnalytics(data));
    const unsubAuth = onAuthChange(async user => {
      setAuthUser(user);
      if (user) {
        const remote = await loadProgressFromSupabase(user.id);
        if (remote) { setTotalPts(remote.totalPts||0); setStreak(remote.streak||0); save(remote); }
      }
    });
    return () => { unsubLb(); unsubAn(); unsubAuth(); };
  }, []);

  function persist(updates={}) {
    const today = new Date().toDateString();
    let newStreak = updates.streak !== undefined ? updates.streak : streak;
    if (lastActiveDay && lastActiveDay !== today) {
      const yesterday = new Date(Date.now()-86400000).toDateString();
      if (lastActiveDay !== yesterday) newStreak = 0;
    }
    const data = { totalPts, streak: newStreak, dailyPts, dailyGoal, diffSetting, soundOn, topicProgress, topicAccuracy, weeklyPts, exercisesCompleted, lastActiveDay: today, ...updates, streak: newStreak };
    save(data);
    if (userId) upsertUserDoc(userId, { totalPts: data.totalPts, streak: data.streak, displayName: "anon_"+userId.slice(-4), dailyPts: data.dailyPts, topicProgress: data.topicProgress, topicAccuracy: data.topicAccuracy, weeklyPts: data.weeklyPts, exercisesCompleted: data.exercisesCompleted });
    if (authUser) saveProgressToSupabase(authUser.id, data);
  }

  function startPractice(topicId=null) {
    let pool = QUESTIONS.filter(q => setupDiff.includes(q.diff));
    if (topicId) pool = pool.filter(q => q.topic === topicId);
    else pool = pool.filter(q => selTopics.includes(q.topic));
    if (pool.length === 0) pool = [...QUESTIONS];
    const qs = [...pool].sort(()=>Math.random()-0.5).slice(0,15);
    setSessionQs(qs); setQIdx(0); setAnswered(false); setChosen(null); setCorrect(false);
    setSessionPts(0); setSessionCorrect(0); setFlagged(false); setShowFlagMenu(false); setShowTip(true); setWinType(null);
    setScreen("session");
  }

  function handleAnswer(idx) {
    if (answered) return;
    const q = sessionQs[qIdx];
    const isOk = idx === q.a;
    setChosen(idx); setAnswered(true); setCorrect(isOk);
    playSound(isOk ? "correct" : "wrong", soundOn);
    if (isOk) {
      const pts = 15;
      const newTotal = totalPts + pts, newDaily = dailyPts + pts, newSess = sessionPts + pts;
      const newSessCorr = sessionCorrect + 1, newEx = exercisesCompleted + 1;
      const newAcc = { ...topicAccuracy };
      if (!newAcc[q.topic]) newAcc[q.topic] = { correct:0, total:0 };
      newAcc[q.topic].correct++; newAcc[q.topic].total++;
      const newProg = { ...topicProgress }; newProg[q.topic] = (newProg[q.topic]||0)+1;
      const nw = [...weeklyPts]; const day = new Date().getDay(); nw[day===0?6:day-1] += pts;
      setTotalPts(newTotal); setDailyPts(newDaily); setSessionPts(newSess);
      setSessionCorrect(newSessCorr); setExercisesCompleted(newEx);
      setTopicAccuracy(newAcc); setTopicProgress(newProg); setWeeklyPts(nw);
      persist({ totalPts:newTotal, dailyPts:newDaily, exercisesCompleted:newEx, topicAccuracy:newAcc, topicProgress:newProg, weeklyPts:nw });
    } else {
      const newAcc = { ...topicAccuracy };
      if (!newAcc[q.topic]) newAcc[q.topic] = { correct:0, total:0 };
      newAcc[q.topic].total++;
      setTopicAccuracy(newAcc); persist({ topicAccuracy:newAcc });
    }
  }

  function flushSession(finalCorrect, finalTotal, finalPts) {
    if (!userId) return;
    const topics = [...new Set(sessionQs.map(q=>q.topic))];
    writeSession(userId, { topics, difficulty:setupDiff, correct:finalCorrect, total:finalTotal, pts:finalPts });
    incrementAnalytics({ total:finalTotal, correct:finalCorrect, topics, topicCorrect:topicAccuracy });
  }

  function nextQ() {
    const isLast = qIdx + 1 >= sessionQs.length;
    const finalCorrect = sessionCorrect + (correct ? 1 : 0);
    const finalTotal = sessionQs.length;
    if (isLast) {
      flushSession(finalCorrect, finalTotal, sessionPts + (correct?15:0));
      // Check win conditions
      const isPerfect = finalCorrect === finalTotal;
      const newStreak = streak + 1;
      if (isPerfect) {
        playSound("win", soundOn);
        const newTotal = totalPts + 50; // bonus
        setTotalPts(newTotal);
        setStreak(newStreak);
        persist({ totalPts:newTotal, streak:newStreak });
        setWinType("perfect");
        setScreen("win");
      } else if ([3,7,14,30].includes(newStreak)) {
        setStreak(newStreak); persist({ streak:newStreak });
        setWinType("streak_"+newStreak);
        setScreen("win");
      } else {
        setStreak(newStreak); persist({ streak:newStreak });
        setScreen("home"); setTab("home");
      }
    } else {
      setQIdx(qIdx+1); setAnswered(false); setChosen(null); setCorrect(false);
      setFlagged(false); setShowFlagMenu(false);
    }
  }

  useEffect(() => {
    if (screen !== "session") return;
    function onKey(e) {
      if (answered) { if (e.key==="Enter"||e.key===" ") { e.preventDefault(); nextQ(); } return; }
      const q = sessionQs[qIdx]; if (!q) return;
      const n = parseInt(e.key);
      if (n>=1 && n<=q.opts.length) handleAnswer(n-1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [screen, answered, qIdx, sessionQs]);

  const q = sessionQs[qIdx];
  const level = Math.floor(totalPts/500)+1;
  const levelPct = (totalPts%500)/500*100;
  const accuracy = (() => {
    const v = Object.values(topicAccuracy);
    const tot = v.reduce((s,x)=>s+x.total,0);
    const cor = v.reduce((s,x)=>s+x.correct,0);
    return tot>0 ? Math.round(cor/tot*100) : 0;
  })();
  const DAYS = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];

  // Confetti generator
  function Confetti() {
    const colors = ["#06b6d4","#f5a623","#e2f0ff","#34d399","#a78bfa","#f43f5e","#fbbf24"];
    return (
      <div className="confetti-layer">
        {Array.from({length:30},(_,i)=>(
          <div key={i} className="conf-piece" style={{
            left:`${Math.random()*100}%`,
            background:colors[i%colors.length],
            animationDuration:`${1.5+Math.random()*2}s`,
            animationDelay:`${Math.random()*1}s`,
            width:`${6+Math.random()*6}px`,
            height:`${6+Math.random()*6}px`,
            borderRadius:Math.random()>0.5?"50%":"2px",
          }}/>
        ))}
      </div>
    );
  }

  return (
    <>
      <style>{STYLES}</style>
      <div className="app">

        {/* ONBOARDING */}
        {screen==="onboard" && (
          <div className="onboard">
            <div className="ob-topbar">
              <div className="logo-row">
                <GoldLogo size={20}/>
                <span className="app-name">Daily<span>Bricks</span></span>
              </div>
              <button className="skip-btn" onClick={()=>{setScreen("home");persist();}}>Skip</button>
            </div>

            {obStep===0 && (
              <div className="ob-body">
                <div className="orbit-wrap">
                  <div className="orbit-ring"/><div className="orbit-ring2"/>
                  <div className="orbit-center"><GoldLogo size={36}/></div>
                  <div className="orbiter orb1"/><div className="orbiter orb2"/><div className="orbiter orb3"/>
                </div>
                <div className="s1-title">The data engineering exam is <span>harder</span> than you think.</div>
                <div className="s1-sub">Don't cram the night before. Build real DE muscle — 5 minutes every day.</div>
                <div className="chip-wrap">
                  {[["#fbbf24","rgba(251,191,36,0.15)","rgba(251,191,36,0.3)","△ Delta Lake"],["#60a5fa","rgba(96,165,250,0.12)","rgba(96,165,250,0.25)","⚡ Spark SQL"],["#34d399","rgba(52,211,153,0.12)","rgba(52,211,153,0.25)","〜 Streaming"],["#38bdf8","rgba(56,189,248,0.12)","rgba(56,189,248,0.25)","⊞ Governance"],["#a78bfa","rgba(167,139,250,0.12)","rgba(167,139,250,0.25)","⬡ Workflows"],["#fb923c","rgba(251,146,60,0.12)","rgba(251,146,60,0.25)","★ Performance"],["#fbbf24","rgba(251,191,36,0.1)","rgba(251,191,36,0.2)","◎ Lakehouse"]].map(([c,bg,b,label])=>(
                    <span key={label} className="chip" style={{background:bg,color:c,border:`1px solid ${b}`}}>{label}</span>
                  ))}
                </div>
                <div className="ob-dots"><div className="ob-dot on"/><div className="ob-dot"/><div className="ob-dot"/></div>
                <button className="btn-next" onClick={()=>setObStep(1)}>Let's go →</button>
              </div>
            )}

            {obStep===1 && (
              <div className="ob-body">
                <div style={{marginBottom:16}}>
                  <div className="big-num-wrap"><div className="ping-ring"/><div className="big-num">5<span style={{fontSize:32,color:"#7ba8d4"}}>min</span></div></div>
                  <div style={{fontSize:20,fontWeight:800,color:"var(--text)",letterSpacing:"-0.5px",margin:"8px 0 6px"}}>Small reps. Big results.</div>
                  <div style={{fontSize:13,color:"var(--text2)",lineHeight:1.6}}>Certs aren't won in marathons.<br/>They're won in daily 5-minute sprints.</div>
                </div>
                <div className="habit-list">
                  <div className="habit-row"><div className="habit-icon">🔥</div><div><div className="habit-text">Run Streak</div><div className="habit-sub">Miss a day, lose your streak</div></div><div className="habit-badge" style={{background:"rgba(245,166,35,0.15)",color:"#f5a623",border:"1px solid rgba(245,166,35,0.3)"}}>addictive</div></div>
                  <div className="habit-row"><div className="habit-icon">⚡</div><div><div className="habit-text">XP Points</div><div className="habit-sub">Earn more for harder questions</div></div><div className="habit-badge" style={{background:"rgba(6,182,212,0.12)",color:"#06b6d4",border:"1px solid rgba(6,182,212,0.25)"}}>rewarding</div></div>
                  <div className="habit-row"><div className="habit-icon">🎯</div><div><div className="habit-text">Accuracy tracking</div><div className="habit-sub">Know exactly where you're weak</div></div><div className="habit-badge" style={{background:"rgba(52,211,153,0.12)",color:"#34d399",border:"1px solid rgba(52,211,153,0.25)"}}>insightful</div></div>
                </div>
                <div className="ob-dots"><div className="ob-dot"/><div className="ob-dot on"/><div className="ob-dot"/></div>
                <button className="btn-next" onClick={()=>setObStep(2)}>I'm ready →</button>
              </div>
            )}

            {obStep===2 && (
              <div className="ob-body">
                <div className="rocket-wrap"><span className="rocket-icon">🚀</span><div className="exhaust"/></div>
                <div className="s3-title">Pick your level.<br/><span className="s3-shimmer">Start right now.</span></div>
                <div style={{fontSize:13,color:"var(--text2)",lineHeight:1.6,marginBottom:16,textAlign:"center"}}>No account needed. No setup.<br/>Just pick your difficulty and go.</div>
                <div className="diff-pills">
                  <div className="dp" style={{borderColor:"#34d399",background:"rgba(52,211,153,0.1)",color:"#34d399"}}>🟢 Beginner</div>
                  <div className="dp" style={{borderColor:"#f5a623",background:"rgba(245,166,35,0.15)",color:"#f5a623"}}>🟡 Intermediate</div>
                  <div className="dp" style={{borderColor:"#f43f5e",background:"rgba(244,63,94,0.1)",color:"#f43f5e"}}>🔴 Advanced</div>
                </div>
                <div className="level-card">
                  <div style={{display:"flex",justifyContent:"space-between",fontSize:11,color:"var(--text2)",marginBottom:6}}><span>Your progress</span><span style={{color:"var(--cyan)"}}>Level {level}</span></div>
                  <div className="level-bar"><div className="level-bar-fill"/></div>
                  <div style={{fontSize:10,color:"var(--text3)",marginTop:6,textAlign:"right"}}>{totalPts%500} / 500 XP to Level {level+1}</div>
                </div>
                <div className="ob-dots"><div className="ob-dot"/><div className="ob-dot"/><div className="ob-dot on"/></div>
                <button className="btn-next" onClick={()=>{setScreen("home");persist();}}>
                  <GoldLogo size={18}/>
                  Start practicing 🎯
                </button>
              </div>
            )}
            <div className="ob-footer">Built by <a href="https://www.linkedin.com/in/neha-rani-r/" target="_blank" rel="noopener noreferrer">Neha Rani</a> · Not affiliated with or endorsed by Databricks, Inc.</div>
          </div>
        )}

        {/* MAIN SCREENS */}
        {["home","stats","settings"].includes(screen) && (
          <>
            <div className="topbar">
              <div className="logo-row" onClick={()=>{setScreen("home");setTab("home");}}>
                <GoldLogo size={20}/>
                <span className="app-name">Daily<span>Bricks</span></span>
              </div>
              <div className="hstats">
                <span style={{color:"var(--text)"}}>🔥{streak}</span>
                <span style={{color:"var(--yellow)"}}>⚡{totalPts}XP</span>
                <span style={{color:"var(--text2)"}}>Lv<span style={{color:"var(--text)",fontWeight:800}}>{level}</span></span>
              </div>
            </div>

            {tab==="home" && (
              <div className="home pb">
                <div className="home-eyebrow">Data Engineering Daily</div>
                <div className="home-h1">{dailyPts>=dailyGoal?"Goal reached! 🎉":dailyPts>0?"Great work today!":"Ready to practice?"}</div>
                <div className="home-pts">{dailyPts}/{dailyGoal} pts today{dailyPts>0&&dailyPts<dailyGoal?" — keep going!":""}</div>
                <div className="home-tagline">5 minutes. Every day. Until it sticks.<br/>Stop cramming. Start training.</div>
                {dailyPts>0&&<div className="pts-bar"><div className="pts-fill" style={{width:`${Math.min(100,dailyPts/dailyGoal*100)}%`}}/></div>}
                <div className="cert-banner">
                  <div className="cert-glow"/>
                  <div className="cert-eye">🎓 Cert Prep</div>
                  <div className="cert-title">Data Engineering Certification</div>
                  <div className="cert-sub">Sharpen your Data Engineering skills</div>
                  <div className="cert-pills">{["Delta Lake","Spark SQL","Streaming","Unity Catalog","Performance","DLT"].map(p=><span key={p} className="cert-pill">{p}</span>)}</div>
                </div>
                <button className="btn-start" onClick={()=>setScreen("setup")}><GoldLogo size={18}/>Start Practice →</button>
                <div className="sec-head">📚 Practice by Topic</div>
                <div className="topic-grid">
                  {TOPICS.map(t=>(
                    <div key={t.id} className="tc" onClick={()=>startPractice(t.id)}>
                      <div className="tc-sym" style={{background:t.bg,border:`1px solid ${t.border}`}}>
                        <TopicSymbol id={t.id} size={18}/>
                      </div>
                      <div className="tc-name">{t.name}</div>
                      <div className="tc-count">{t.count} questions</div>
                      <div className="tc-bar"><div className="tc-fill" style={{width:`${Math.min(100,Math.round((topicProgress[t.id]||0)/t.count*100))}%`,background:t.color}}/></div>
                    </div>
                  ))}
                </div>
                <div className="home-footer">Built by <a href="https://www.linkedin.com/in/neha-rani-r/" target="_blank" rel="noopener noreferrer">Neha Rani</a> · Not affiliated with or endorsed by Databricks, Inc.</div>
              </div>
            )}

            {tab==="stats" && (
              <div className="stats-screen pb">
                <div style={{fontSize:22,fontWeight:800,color:"var(--text)",marginBottom:4}}>Stats</div>
                <div style={{fontSize:13,color:"var(--text2)",marginBottom:16}}>Your practice history and personal records</div>
                <div className="stat-grid">
                  <div className="stat-card"><div className="sc-label">Today</div><div className="sc-val yellow">{dailyPts} pts</div><div className="stat-bar"><div className="stat-bar-fill" style={{width:`${Math.min(100,dailyPts/dailyGoal*100)}%`}}/></div><div className="sc-sub">{dailyGoal} pts goal</div></div>
                  <div className="stat-card"><div className="sc-label">This week</div><div className="sc-val yellow">{weeklyPts.reduce((a,b)=>a+b,0)} pts</div><div className="sc-sub">{exercisesCompleted} exercises</div></div>
                  <div className="stat-card"><div className="sc-label">Run Streak</div><div className="sc-val orange">🔥 {streak}</div><div className="sc-sub">Best: {streak}</div></div>
                  <div className="stat-card"><div className="sc-label">Accuracy</div><div className="sc-val cyan">{accuracy}%</div><div className="sc-sub">{exercisesCompleted} total</div></div>
                </div>
                <div className="week-card">
                  <div className="cb-title">This Week</div>
                  <div className="wc-bars">
                    {weeklyPts.map((pts,i)=>{const mx=Math.max(...weeklyPts,dailyGoal,1);return(<div key={i} className="wc-col">{pts>0&&<div className="wc-val">{pts}</div>}<div className="wc-track" style={{height:48}}><div className="wc-fill" style={{height:`${pts/mx*100}%`}}/></div><div className="wc-day">{DAYS[i]}</div></div>);})}
                  </div>
                  <div style={{fontSize:11,color:"var(--text3)",textAlign:"right",marginTop:8}}>{dailyGoal} pts daily goal</div>
                </div>
                <div className="card-block">
                  <div className="cb-title">Personal Bests</div>
                  <div className="bests-row"><span className="br-label">Total XP earned</span><span className="br-val yellow">{totalPts}</span></div>
                  <div className="bests-row"><span className="br-label">Longest streak</span><span className="br-val orange">🔥 {streak} days</span></div>
                  <div className="bests-row"><span className="br-label">Best week</span><span className="br-val yellow">{weeklyPts.reduce((a,b)=>a+b,0)} pts</span></div>
                  <div className="bests-row"><span className="br-label">Exercises done</span><span className="br-val">{exercisesCompleted}</span></div>
                </div>
                <div className="card-block">
                  <div className="cb-title">Topic Progress</div>
                  {TOPICS.map(t=>{const done=topicProgress[t.id]||0;const pct=Math.min(100,Math.round(done/t.count*100));return(<div key={t.id} className="tp-row"><span className="tp-icon"><TopicSymbol id={t.id} size={14}/></span><span className="tp-name">{t.name}</span><div className="tp-bar"><div className="tp-fill" style={{width:`${pct}%`,background:t.color}}/></div><span className="tp-pct">{pct}%</span></div>);})}
                </div>
                {lbData.length>0&&<div className="card-block">
                  <div className="cb-title">🏆 Live Leaderboard</div>
                  {lbData.slice(0,10).map((row,i)=>{const isMe=row.id===userId;const medals=["🥇","🥈","🥉"];return(<div key={row.id} className={`lb-row ${isMe?"me":""}`}><span className="lb-rank">{medals[i]||`#${i+1}`}</span><span className="lb-name">{isMe?"You":(row.displayName||`anon_${row.id.slice(-4)}`)}</span><span className="lb-xp">{row.totalPts||0} XP</span></div>);})}
                </div>}
                {globalAnalytics&&<div className="card-block">
                  <div className="cb-title">📊 Community</div>
                  <div className="bests-row"><span className="br-label">Total sessions</span><span className="br-val">{(globalAnalytics.totalSessions||0).toLocaleString()}</span></div>
                  <div className="bests-row"><span className="br-label">Questions answered</span><span className="br-val">{(globalAnalytics.totalAnswers||0).toLocaleString()}</span></div>
                  <div className="bests-row"><span className="br-label">Global accuracy</span><span className="br-val yellow">{globalAnalytics.totalAnswers>0?Math.round(globalAnalytics.correctAnswers/globalAnalytics.totalAnswers*100):0}%</span></div>
                </div>}
              </div>
            )}

            {tab==="settings" && (
              <div className="settings-screen pb">
                <div className="settings-title">Settings</div>
                <div className="auth-card">
                  {!authUser ? (
                    <>
                      <div className="auth-label">{authMode==="magic"?"Sign in — no password needed":authMode==="signup"?"Create account":"Sign in with password"}</div>
                      <input className="auth-input" type="email" placeholder="you@email.com" value={emailVal} onChange={e=>{setEmailVal(e.target.value);setAuthError("");}}/>
                      {authMode!=="magic"&&<input className="auth-input" type="password" placeholder="Password (min 6 characters)" value={passVal} onChange={e=>{setPassVal(e.target.value);setAuthError("");}}/>}
                      {authError&&<div className="auth-err">{authError}</div>}
                      {authSuccess&&<div className="auth-ok">{authSuccess}</div>}
                      <button className="btn-magic" disabled={authLoading} onClick={async()=>{
                        setAuthLoading(true);setAuthError("");setAuthSuccess("");
                        try{
                          if(authMode==="magic"){await sendMagicLink(emailVal);setAuthSuccess("✓ Check your email for a magic sign-in link!");}
                          else if(authMode==="password"){await signInWithPassword(emailVal,passVal);setAuthSuccess("✓ Signed in!");}
                          else{await signUpWithPassword(emailVal,passVal);setAuthSuccess("✓ Account created! Check your email to confirm.");}
                        }catch(e){setAuthError(e.message||"Something went wrong. Try again.");}
                        setAuthLoading(false);
                      }}>{authLoading?"Please wait...":authMode==="magic"?"Send magic link":authMode==="signup"?"Create account":"Sign in"}</button>
                      <div className="auth-links">
                        {authMode==="magic"?<span onClick={()=>{setAuthMode("password");setAuthError("");setAuthSuccess("");}}>Sign in with password</span>:authMode==="password"?<><span onClick={()=>{setAuthMode("magic");setAuthError("");setAuthSuccess("");}}>Use magic link</span><span style={{color:"var(--text3)"}}>·</span><span onClick={()=>{setAuthMode("signup");setAuthError("");setAuthSuccess("");}}>Sign up</span></> :<span onClick={()=>{setAuthMode("magic");setAuthError("");setAuthSuccess("");}}>Back to sign in</span>}
                      </div>
                    </>
                  ):(
                    <>
                      <div className="auth-logged"><div className="auth-av">{authUser.email?.[0]?.toUpperCase()||"U"}</div><div><div className="auth-email-txt">{authUser.email}</div><div className="auth-sync">Progress synced ✓</div></div></div>
                      <button className="btn-signout" onClick={async()=>{await signOut();setAuthUser(null);}}>Sign out</button>
                    </>
                  )}
                </div>
                <div className="pref-title">Preferences</div>
                <div className="setting-card">
                  <div className="sc-head">Difficulty Level</div>
                  <div className="sc-desc">Applied to all practice sessions</div>
                  {[["Beginner","#22c55e"],["Intermediate","#f59e0b"],["Advanced","#ef4444"]].map(([d,c])=>(
                    <div key={d} className={`diff-item ${diffSetting===d?"active":""}`} onClick={()=>{setDiffSetting(d);setSetupDiff([d]);persist({diffSetting:d});}}>
                      <div className="diff-dot" style={{background:c}}/><span>{d}</span>{diffSetting===d&&<span className="diff-check">✓</span>}
                    </div>
                  ))}
                </div>
                <div className="setting-card">
                  <div className="sc-head" style={{marginBottom:10}}>Daily Points Goal</div>
                  <div className="pts-goal-grid">{[50,100,150].map(g=><button key={g} className={`pg-btn ${dailyGoal===g?"on":""}`} onClick={()=>{setDailyGoal(g);persist({dailyGoal:g});}}>{g} pts</button>)}</div>
                </div>
                <div className="setting-card"><div className="sound-row"><span style={{fontSize:14,fontWeight:600,color:"var(--text)"}}>Sound effects</span><button className={`toggle ${soundOn?"on":""}`} onClick={()=>{setSoundOn(!soundOn);persist({soundOn:!soundOn});}}/></div></div>
                <div className="setting-card"><div className="freeze-row"><div className="freeze-info"><span style={{fontSize:20}}>🛡️</span><div className="freeze-txt"><div className="fn">Run Streak Freezes</div><div className="fs">Earned every 7-day streak (max 3)</div></div></div><div className="freeze-count">0</div></div></div>
                <div className="settings-footer">Built by <a href="https://www.linkedin.com/in/neha-rani-r/" target="_blank" rel="noopener noreferrer">Neha Rani</a> · Not affiliated with or endorsed by Databricks, Inc.</div>
              </div>
            )}

            <nav className="bot-nav">
              {[["home","🏠","Home"],["stats","📊","Stats"],["settings","⚙️","Settings"]].map(([id,icon,label])=>(
                <button key={id} className={`nav-item ${tab===id?"on":""}`} onClick={()=>{setTab(id);setScreen(id);}}>
                  <span className="nav-icon">{icon}</span>{label}
                </button>
              ))}
            </nav>
          </>
        )}

        {/* SETUP */}
        {screen==="setup" && (
          <div className="setup pb">
            <button className="back-btn" onClick={()=>setScreen("home")}>← Back</button>
            <div className="setup-title">Daily Practice</div>
            <div className="setup-sub">15 questions from your selected topics</div>
            <div style={{fontSize:13,color:"var(--text3)",marginBottom:8}}>Select difficulty</div>
            <div className="diff-row">
              {[["🟢","Beginner"],["🟡","Intermediate"],["🔴","Advanced"]].map(([e,d])=>(
                <button key={d} className={`diff-btn ${setupDiff.includes(d)?"on":""}`} onClick={()=>setSetupDiff(p=>p.includes(d)?p.filter(x=>x!==d).length?p.filter(x=>x!==d):[d]:[...p,d])}>{e} {d}</button>
              ))}
            </div>
            <div className="topics-dd" onClick={()=>setTopicsOpen(!topicsOpen)}>
              <span>{selTopics.length===TOPICS.length?"All topics":`${selTopics.length} topics selected`}</span>
              <span>{topicsOpen?"▲":"▼"}</span>
            </div>
            {topicsOpen&&(
              <div className="topics-list">
                <div className="deselect" onClick={()=>setSelTopics(selTopics.length===TOPICS.length?[]:TOPICS.map(t=>t.id))}>{selTopics.length===TOPICS.length?"Deselect all":"Select all"}</div>
                {TOPICS.map(t=>(
                  <div key={t.id} className="topic-row" onClick={()=>setSelTopics(p=>p.includes(t.id)?p.filter(x=>x!==t.id):[...p,t.id])}>
                    <div className="tr-left"><TopicSymbol id={t.id} size={16}/>{t.name}</div>
                    <div className={`check ${selTopics.includes(t.id)?"on":""}`}>{selTopics.includes(t.id)&&"✓"}</div>
                  </div>
                ))}
              </div>
            )}
            <button className="btn-start" style={{marginTop:8}} onClick={()=>startPractice(null)}><GoldLogo size={18}/>Start Practice →</button>
          </div>
        )}

        {/* SESSION */}
        {screen==="session" && q && (
          <div className="session" style={{position:"relative"}}>
            <div className="sess-top">
              <button className="close-btn" onClick={()=>setScreen("home")}>✕</button>
              <div className="prog-track"><div className="prog-fill" style={{width:`${(qIdx/sessionQs.length)*100}%`}}/></div>
              <div className="pts-badge">⚡{sessionPts}</div>
            </div>
            <div className="q-area" onClick={()=>showFlagMenu&&setShowFlagMenu(false)}>
              <div className="q-nums"><span style={{fontSize:12,color:"var(--text3)"}}>{qIdx+1}/{sessionQs.length}</span><span style={{fontSize:12,color:"var(--text2)"}}>{sessionCorrect} correct</span></div>
              <div className="q-meta">
                {(()=>{const t=TOPICS.find(x=>x.id===q.topic);return t?<span className="qtag" style={{background:t.bg,color:t.color,border:`1px solid ${t.border}`}}>{t.name}</span>:null;})()}
                <span className="qtag" style={{background:q.diff==="Beginner"?"rgba(52,211,153,0.12)":q.diff==="Intermediate"?"rgba(245,166,35,0.12)":"rgba(244,63,94,0.12)",color:q.diff==="Beginner"?"#34d399":q.diff==="Intermediate"?"#fcd34d":"#fda4af",border:`1px solid ${q.diff==="Beginner"?"rgba(52,211,153,0.25)":q.diff==="Intermediate"?"rgba(245,166,35,0.25)":"rgba(244,63,94,0.25)"}`}}>{q.diff}</span>
                <button className={`flag-btn ${flagged?"on":""}`} onClick={e=>{e.stopPropagation();setShowFlagMenu(!showFlagMenu);}}>⚑</button>
              </div>
              <div className={`q-text ${q.type==="tf"?"tf":""}`}>{q.q}</div>
              {q.type==="tf"?(
                <div className="tf-row">
                  {q.opts.map((o,i)=>{let c="tf-btn";if(answered){c+=" dis";if(i===q.a)c+=" correct";else if(i===chosen&&chosen!==q.a)c+=" wrong";}return<button key={i} className={c} onClick={()=>handleAnswer(i)}>{o}</button>;})}
                </div>
              ):(
                <div className="opts-list">
                  {q.opts.map((o,i)=>{let c="opt-btn";if(answered){c+=" dis";if(i===q.a)c+=" correct";else if(i===chosen&&chosen!==q.a)c+=" wrong";}else if(i===chosen)c+=" sel";return(<button key={i} className={c} onClick={()=>handleAnswer(i)}><span className="opt-n">{i+1}</span>{o}</button>);})}
                </div>
              )}
              {answered&&(
                <div className={`feedback fb ${correct?"ok":"ng"}`}>
                  <div className="fb-head"><span className="fb-title">{correct?"✓ Correct! +15 XP":"✗ Not quite"}</span></div>
                  <div className="fb-exp">{q.exp}</div>
                  <button className="btn-continue" onClick={nextQ}>{qIdx+1>=sessionQs.length?"Finish Session →":"Continue →"}</button>
                </div>
              )}
            </div>
            {showFlagMenu&&(
              <div className="flag-menu">
                {["Incorrect answer","Confusing question","Too easy","Too hard"].map(o=>(
                  <div key={o} className="flag-opt" onClick={()=>{setFlagged(true);setShowFlagMenu(false);}}>{o}</div>
                ))}
              </div>
            )}
            {showTip&&!answered&&(
              <div className="kb-tip">
                <span>💡</span><span>Press <kbd>1</kbd>–<kbd>{q.opts.length}</kbd> to answer, <kbd>↵</kbd> to continue</span>
                <button className="kb-close" onClick={()=>setShowTip(false)}>✕</button>
              </div>
            )}
          </div>
        )}

        {/* WIN SCREENS */}
        {screen==="win" && winType==="perfect" && (
          <div className="win-screen">
            <Confetti/>
            <div className="pulse-ring-w"/><div className="pulse-ring-w2"/>
            <div className="trophy-icon">🏆</div>
            <div className="win-woohoo">PERFECT SCORE!</div>
            <div className="win-title">You <span>crushed</span> it.</div>
            <div className="win-sub">{sessionQs.length}/{sessionQs.length} correct · +50 bonus XP</div>
            <div className="stars-row"><div className="star">⭐</div><div className="star">⭐</div><div className="star">⭐</div></div>
            <div className="xp-earned">
              <div className="xp-num">+{sessionPts+50}</div>
              <div className="xp-lbl">XP earned<br/>🔥 Streak +1<br/>⭐ Perfect bonus!</div>
            </div>
            <div className="lvl-lbl"><span>Level {level}</span><span>Level {level+1}</span></div>
            <div className="lvl-bar-wrap"><div className="lvl-bar"><div className="lvl-bar-fill"/></div></div>
            <button className="btn-continue-win" onClick={()=>{setScreen("home");setTab("home");}}>Keep going 🔥</button>
          </div>
        )}

        {screen==="win" && winType?.startsWith("streak_") && (
          <div className="streak-win">
            <Confetti/>
            <div className="flame-icon">🔥</div>
            <div className="streak-num">{streak}</div>
            <div className="streak-days">Day Streak!</div>
            <div className="streak-msg">You're unstoppable! 🎯</div>
            <div className="streak-sub">{streak} days straight of Data Engineering practice.<br/>That's how certifications get earned.</div>
            <div className="week-bars">
              {DAYS.map((d,i)=>(
                <div key={d} className="wb-col">
                  <div className="wb-bar"><div className={`wb-fill ${i===new Date().getDay()-1?"today":""}`} style={{height:weeklyPts[i]>0?"100%":"20%",opacity:weeklyPts[i]>0?1:0.2}}/></div>
                  <div className={`wb-day ${i===new Date().getDay()-1?"today":""}`}>{d[0]}</div>
                </div>
              ))}
            </div>
            <button className="btn-continue-win" onClick={()=>{setScreen("home");setTab("home");}}>Keep the streak! 🔥</button>
          </div>
        )}

      </div>
    </>
  );
}
