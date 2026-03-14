import { useState, useEffect, useCallback, useRef } from "react";
import {
  getAnonId, getUserDoc, upsertUserDoc,
  writeSession, incrementAnalytics, getGlobalAnalytics,
  subscribeLeaderboard, subscribeAnalytics
} from "./firebase";

// ─── SOUND ENGINE (Web Audio API — no files needed) ───────────────────
function playSound(type, enabled=true) {
  if (!enabled) return;
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (type === "correct") {
      [523.25, 659.25, 783.99].forEach((freq, i) => {
        const osc = ctx.createOscillator(), gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.frequency.value = freq; osc.type = "sine";
        gain.gain.setValueAtTime(0, ctx.currentTime + i*0.1);
        gain.gain.linearRampToValueAtTime(0.15, ctx.currentTime + i*0.1 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i*0.1 + 0.35);
        osc.start(ctx.currentTime + i*0.1); osc.stop(ctx.currentTime + i*0.1 + 0.4);
      });
    } else {
      const osc = ctx.createOscillator(), gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.frequency.value = 160; osc.type = "sawtooth";
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.28);
      osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.3);
    }
  } catch {}
}

// ─── STORAGE ─────────────────────────────────────────────────────────
const SK = "db-state-v2";
function save(data) { try { localStorage.setItem(SK, JSON.stringify(data)); } catch {} }
function load() { try { const r = localStorage.getItem(SK); return r ? JSON.parse(r) : null; } catch { return null; } }

// ─── DATA ─────────────────────────────────────────────────────────────
const TOPICS = [
  { id:"fundamentals", name:"Fundamentals",  icon:"🏗️",  sub:"Lakehouse, workspaces, ...", count:34 },
  { id:"delta",        name:"Delta Lake",     icon:"🔺",  sub:"ACID, time travel, optimiz...", count:46 },
  { id:"elt",          name:"ELT",            icon:"🔄",  sub:"Spark SQL, Auto Loader, ...", count:45 },
  { id:"streaming",    name:"Streaming",      icon:"⚡",  sub:"Structured Streaming, DLT", count:40 },
  { id:"production",   name:"Production",     icon:"🚀",  sub:"Jobs, monitoring, CI/CD", count:33 },
  { id:"governance",   name:"Governance",     icon:"🔒",  sub:"Unity Catalog, lineage, ac...", count:34 },
  { id:"performance",  name:"Performance",    icon:"⚙️",  sub:"Optimization, caching, ...", count:43 },
];

const QUESTIONS = [
  // Fundamentals - Beginner
  { id:1, topic:"fundamentals", sub:"Workspace", diff:"Beginner", type:"mcq", q:"What is the Databricks Lakehouse Platform primarily designed to do?", opts:["Replace data warehouses only","Combine data lake flexibility with data warehouse reliability","Store only structured data","Run only machine learning workloads"], a:1, exp:"The Lakehouse combines the scalability of data lakes with the reliability and performance of data warehouses — best of both worlds." },
  { id:2, topic:"fundamentals", sub:"Workspace", diff:"Beginner", type:"tf", q:'"Databricks workspaces are isolated per cloud region by default."', opts:["TRUE","FALSE"], a:0, exp:"Databricks workspaces are region-scoped. Each workspace is deployed in a specific cloud region and is isolated from other workspaces." },
  { id:3, topic:"fundamentals", sub:"Cluster", diff:"Beginner", type:"mcq", q:"What is the difference between an All-Purpose cluster and a Job cluster?", opts:["All-Purpose is cheaper","Job clusters are persistent","All-Purpose supports interactive use; Job clusters run automated workloads","Job clusters support multiple users"], a:2, exp:"All-Purpose clusters are for interactive development. Job clusters are created for a specific job run and terminated when done." },
  // Delta Lake - Beginner
  { id:4, topic:"delta", sub:"Optimization", diff:"Beginner", type:"mcq", q:"Liquid Clustered table. You run OPTIMIZE multiple times. What does each OPTIMIZE do?", opts:["Only rewrites the most-recently queried files","Nothing after the first OPTIMIZE run","Full table rewrite on every run","Only rewrites unclustered files — incremental"], a:3, exp:"Liquid Clustering is incremental. Each OPTIMIZE only rewrites files that haven't been clustered yet — not the whole table." },
  { id:5, topic:"delta", sub:"Time Travel", diff:"Beginner", type:"mcq", q:"Which Delta Lake feature enables querying historical versions of a table?", opts:["MERGE INTO","TIME TRAVEL","CLONE","VACUUM"], a:1, exp:"Delta Lake Time Travel lets you query historical snapshots using VERSION AS OF or TIMESTAMP AS OF syntax." },
  { id:6, topic:"delta", sub:"Maintenance", diff:"Intermediate", type:"mcq", q:"What does the VACUUM command do in Delta Lake?", opts:["Compacts small files","Removes old transaction log entries","Deletes files no longer referenced by the current table version","Refreshes statistics"], a:2, exp:"VACUUM removes data files no longer referenced by the Delta table and older than the retention threshold (default 7 days)." },
  { id:7, topic:"delta", sub:"CDF", diff:"Intermediate", type:"tf", q:'"You must restart a streaming query to start consuming Change Data Feed from an existing Delta table."', opts:["TRUE","FALSE"], a:1, exp:"You don't need to restart. Just set readChangeFeed option to true and optionally specify a startingVersion. The stream picks up CDF from there." },
  // ELT - Beginner
  { id:8, topic:"elt", sub:"Auto Loader", diff:"Intermediate", type:"mcq", q:"Source adds 3 new columns. Auto Loader pipeline ignores them silently. Which setting captures them?", opts:["cloudFiles.schemaEvolutionMode = addNewColumns","cloudFiles.inferColumnTypes = true","cloudFiles.format = json","mergeSchema = true"], a:0, exp:"cloudFiles.schemaEvolutionMode = addNewColumns tells Auto Loader to automatically detect and add new columns to the schema." },
  { id:9, topic:"elt", sub:"Spark SQL", diff:"Beginner", type:"mcq", q:"Which join type retains ALL rows from the left table, filling NULLs for non-matches?", opts:["INNER JOIN","LEFT OUTER JOIN","CROSS JOIN","RIGHT SEMI JOIN"], a:1, exp:"LEFT OUTER JOIN returns all rows from the left table. Rows with no match get NULL for right-side columns." },
  { id:10, topic:"elt", sub:"Spark SQL", diff:"Beginner", type:"tf", q:'"CTAS (CREATE TABLE AS SELECT) statements in Spark SQL always inherit the source table\'s properties and constraints."', opts:["TRUE","FALSE"], a:1, exp:"CTAS creates a new table with data from the SELECT but does NOT inherit source constraints, partition specs, or table properties by default." },
  // Streaming - Intermediate
  { id:11, topic:"streaming", sub:"Watermarks", diff:"Intermediate", type:"mcq", q:"Watermarking in Structured Streaming is used to:", opts:["Set checkpointing intervals","Define how late arriving data is tolerated for aggregations","Mark data quality issues","Encrypt streaming data"], a:1, exp:"Watermarks define the maximum allowed lateness for event-time data. Data older than the threshold is dropped from aggregations." },
  { id:12, topic:"streaming", sub:"DLT", diff:"Intermediate", type:"tf", q:'"Delta Live Tables pipelines can be configured to run in both continuous and triggered modes."', opts:["TRUE","FALSE"], a:0, exp:"DLT supports both Triggered (runs once and stops) and Continuous (runs indefinitely processing new data) pipeline modes." },
  { id:13, topic:"streaming", sub:"Auto Loader", diff:"Beginner", type:"mcq", q:"Which Structured Streaming trigger processes all available data then stops?", opts:["Trigger.ProcessingTime('1 minute')","Trigger.Once()","Trigger.Continuous('1 second')","Trigger.AvailableNow()"], a:3, exp:"Trigger.AvailableNow() processes all available data in micro-batches then stops. Introduced in Spark 3.3+." },
  // Production - Intermediate
  { id:14, topic:"production", sub:"Testing CICD", diff:"Intermediate", type:"tf", q:'"Databricks Asset Bundles can only be deployed through GitHub Actions."', opts:["TRUE","FALSE"], a:1, exp:"DABs are CI/CD-agnostic. The databricks bundle deploy CLI works with any provider: GitHub Actions, Azure DevOps, GitLab CI, Jenkins, or even manual terminal commands." },
  { id:15, topic:"production", sub:"Jobs", diff:"Beginner", type:"mcq", q:"What happens to a Job cluster when the job run completes?", opts:["It stays running for 30 minutes","It gets converted to an All-Purpose cluster","It is automatically terminated","It pauses and waits for the next run"], a:2, exp:"Job clusters are ephemeral — they are automatically terminated when the job run completes, saving costs." },
  { id:16, topic:"production", sub:"Monitoring", diff:"Intermediate", type:"mcq", q:"Where can you find detailed Spark execution plans and stage-level metrics for a completed job?", opts:["Cluster logs","Spark UI via the Jobs tab","DBFS audit logs","Workflow email alerts"], a:1, exp:"The Spark UI (accessible via the Jobs tab) shows DAGs, stage details, task metrics, and execution plans for completed and running jobs." },
  // Governance - Intermediate
  { id:17, topic:"governance", sub:"Unity Catalog", diff:"Intermediate", type:"mcq", q:"Engineers keep forgetting to prefix queries with the catalog name. How do you set a default catalog for a session?", opts:["USE CATALOG main","SET spark.sql.catalog = main","Default catalog can only be set in the workspace admin UI","USE DATABASE main"], a:0, exp:"USE CATALOG catalog_name sets the default catalog for the current session. All unqualified table references resolve against it." },
  { id:18, topic:"governance", sub:"Unity Catalog", diff:"Intermediate", type:"mcq", q:"You need to audit who queried a sensitive table last week. Where do you look?", opts:["Unity Catalog UI table details page","Delta table DESCRIBE HISTORY","Cluster driver logs","System tables (system.access.audit)"], a:3, exp:"UC audit logs are stored in system tables, queryable via SQL. system.access.audit records data access, permission changes, and more." },
  { id:19, topic:"governance", sub:"Unity Catalog", diff:"Beginner", type:"mcq", q:"In Unity Catalog, what is the correct 3-level namespace order?", opts:["schema.catalog.table","catalog.schema.table","table.schema.catalog","database.schema.table"], a:1, exp:"Unity Catalog uses catalog.schema.table — a three-level namespace providing hierarchy above the traditional database.table." },
  // Performance - Intermediate
  { id:20, topic:"performance", sub:"Optimization", diff:"Intermediate", type:"mcq", q:"What causes a shuffle in Spark?", opts:["Reading from Delta Lake","Operations requiring data redistribution across partitions","UDF execution","Schema validation"], a:1, exp:"Shuffles occur when data must move across partitions — e.g., groupBy, join, distinct, repartition. They are expensive I/O operations." },
  { id:21, topic:"performance", sub:"Optimization", diff:"Beginner", type:"tf", q:'"Increasing the number of shuffle partitions always improves Spark job performance."', opts:["TRUE","FALSE"], a:1, exp:"Too many shuffle partitions for small data causes overhead from task scheduling and small file problems. Tune spark.sql.shuffle.partitions to match your data size." },
  { id:22, topic:"performance", sub:"AQE", diff:"Intermediate", type:"mcq", q:"Adaptive Query Execution (AQE) can automatically:", opts:["Rewrite SQL queries","Coalesce shuffle partitions and convert sort-merge joins to broadcast joins","Cache frequently accessed tables","Reorder WHERE predicates"], a:1, exp:"AQE uses runtime statistics to dynamically coalesce partitions, switch join strategies, and optimize skew joins after each shuffle." },
  // Advanced questions
  { id:23, topic:"fundamentals", sub:"Workspace", diff:"Advanced", type:"mcq", q:"You want Git version control for notebooks without manual exports. Which feature?", opts:["Use Databricks Connect for Git sync","Export as .py and commit manually","Store notebooks in DBFS","Databricks Repos (Git folders)"], a:3, exp:"Databricks Repos (Git folders) provides native Git integration for notebooks and files directly in the Databricks workspace." },
  { id:24, topic:"delta", sub:"Optimization", diff:"Advanced", type:"mcq", q:"OPTIMIZE with ZORDER BY is used to:", opts:["Sort the entire table alphabetically","Co-locate related data for faster filter queries","Remove duplicate rows","Partition data by date"], a:1, exp:"ZORDER BY co-locates related information in the same set of files, improving query performance by reducing data scanned." },
  { id:25, topic:"elt", sub:"Auto Loader", diff:"Advanced", type:"mcq", q:"Auto Loader schema inference stores schema information in:", opts:["The Delta table metadata","A cloud storage schema location specified by the user","Driver memory only","The Hive metastore"], a:1, exp:"Auto Loader stores inferred schemas in a user-specified cloudFiles.schemaLocation path in cloud storage for recovery and evolution." },
];

const STYLES = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
:root{
  --bg:#0f172a;--bg2:#1e293b;--bg3:#263045;--bg4:#2d3a4f;
  --border:#334155;--border2:#3d4f66;
  --text:#f1f5f9;--text2:#94a3b8;--text3:#64748b;
  --yellow:#f5a623;--yellow2:#fbbf24;--yellow-bg:rgba(245,166,35,0.15);
  --green:#22c55e;--green-bg:rgba(34,197,94,0.15);--green-dark:#15803d;
  --red:#ef4444;--red-bg:rgba(239,68,68,0.15);--red-dark:#b91c1c;
  --blue:#3b82f6;--blue-bg:rgba(59,130,246,0.12);
}
html,body{height:100%;background:var(--bg);color:var(--text);font-family:'Inter',sans-serif;font-size:15px;}
.app{min-height:100vh;display:flex;flex-direction:column;max-width:480px;margin:0 auto;position:relative;}

/* TOPBAR */
.topbar{display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid var(--border);}
.tbar-logo{display:flex;align-items:center;gap:8px;}
.tbar-appname{font-size:15px;font-weight:700;color:var(--text);}
.tbar-bricks{color:var(--yellow);}
.tbar-stats{display:flex;align-items:center;gap:14px;font-size:14px;font-weight:500;}
.tbar-streak{color:var(--text);}
.tbar-pts{color:var(--text2);}
.tbar-pts span{color:var(--yellow);}

/* HOME */
.home{flex:1;padding:20px 16px 100px;overflow-y:auto;}
.greeting{margin-bottom:20px;}
.greeting h1{font-size:22px;font-weight:700;color:var(--text);}
.greeting p{font-size:14px;color:var(--text2);margin-top:4px;}
.pts-bar-wrap{margin-top:8px;height:4px;background:var(--bg3);border-radius:2px;overflow:hidden;}
.pts-bar-fill{height:100%;background:var(--yellow);border-radius:2px;transition:width 0.4s;}

.btn-start{width:100%;background:var(--yellow);color:#1a1000;border:none;padding:16px;border-radius:12px;font-size:16px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;margin-bottom:10px;transition:filter 0.15s;}
.btn-start:hover{filter:brightness(1.08);}
.btn-login{width:100%;background:var(--bg3);border:1px solid var(--border);color:var(--yellow);padding:13px;border-radius:12px;font-size:14px;font-weight:500;cursor:pointer;margin-bottom:24px;transition:background 0.15s;}
.btn-login:hover{background:var(--bg4);}

.section-head{display:flex;align-items:center;gap:8px;font-size:16px;font-weight:600;margin-bottom:12px;}
.cert-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:24px;}
.cert-card{background:var(--bg2);border:1px solid var(--border);border-radius:12px;padding:14px;cursor:pointer;transition:background 0.15s;}
.cert-card:hover{background:var(--bg3);}
.cert-card.disabled{opacity:0.5;cursor:default;}
.cert-dot{width:10px;height:10px;border-radius:50%;margin-bottom:8px;}
.cert-name{font-size:14px;font-weight:600;}
.cert-sub{font-size:12px;color:var(--text2);margin-top:3px;}

.topic-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;}
.topic-card{background:var(--bg2);border:1px solid var(--border);border-radius:12px;padding:14px;cursor:pointer;transition:background 0.15s;}
.topic-card:hover{background:var(--bg3);}
.topic-card.full{grid-column:span 1;}
.topic-icon{font-size:20px;margin-bottom:8px;}
.topic-name{font-size:14px;font-weight:600;}
.topic-count{font-size:12px;color:var(--text2);margin-top:3px;}

.footer-txt{text-align:center;font-size:12px;color:var(--text3);margin-top:32px;line-height:1.6;}
.footer-txt a{color:var(--text3);}

/* PRACTICE SETUP */
.setup{flex:1;padding:20px 16px 100px;overflow-y:auto;}
.back-btn{display:flex;align-items:center;gap:6px;font-size:14px;color:var(--text2);background:none;border:none;cursor:pointer;padding:0;margin-bottom:20px;}
.setup-title{font-size:20px;font-weight:700;margin-bottom:6px;}
.setup-sub{font-size:14px;color:var(--text2);margin-bottom:24px;}
.diff-row{display:flex;gap:8px;margin-bottom:16px;}
.diff-btn{flex:1;padding:10px 8px;border-radius:8px;border:1.5px solid var(--border);background:transparent;color:var(--text2);font-size:13px;font-weight:500;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px;transition:all 0.15s;}
.diff-btn.on{border-color:var(--yellow);background:var(--yellow-bg);color:var(--text);}
.topics-dropdown{width:100%;background:var(--bg2);border:1px solid var(--border);border-radius:10px;padding:12px 14px;color:var(--text2);font-size:14px;cursor:pointer;display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;}
.topics-list{background:var(--bg2);border:1px solid var(--border);border-radius:10px;overflow:hidden;margin-bottom:16px;}
.topic-row{display:flex;align-items:center;justify-content:space-between;padding:13px 14px;border-bottom:1px solid var(--border);cursor:pointer;transition:background 0.1s;}
.topic-row:last-child{border-bottom:none;}
.topic-row:hover{background:var(--bg3);}
.topic-row-left{display:flex;align-items:center;gap:10px;font-size:14px;}
.check{width:18px;height:18px;border-radius:4px;border:1.5px solid var(--border2);display:flex;align-items:center;justify-content:center;font-size:11px;color:var(--yellow);flex-shrink:0;}
.check.on{background:var(--yellow-bg);border-color:var(--yellow);}
.deselect-all{font-size:12px;color:var(--yellow);padding:6px 14px;text-align:right;cursor:pointer;}

/* ONBOARDING */
.onboard{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:40px 24px;text-align:center;}
.skip-btn{position:absolute;top:16px;right:16px;font-size:14px;color:var(--text2);background:none;border:none;cursor:pointer;}
.ob-icon{font-size:56px;margin-bottom:24px;}
.ob-title{font-size:22px;font-weight:700;margin-bottom:12px;}
.ob-sub{font-size:15px;color:var(--text2);line-height:1.6;max-width:320px;margin:0 auto 32px;}
.ob-feat-row{display:flex;gap:28px;justify-content:center;margin-bottom:36px;}
.ob-feat{display:flex;flex-direction:column;align-items:center;gap:6px;font-size:12px;color:var(--text2);}
.ob-feat-icon{font-size:28px;}
.ob-topic-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;width:100%;margin-bottom:32px;}
.ob-topic{background:var(--bg2);border:1px solid var(--border);border-radius:10px;padding:12px;text-align:left;}
.ob-topic-name{font-size:13px;font-weight:600;}
.ob-topic-sub{font-size:11px;color:var(--text3);margin-top:2px;}
.ob-dots{display:flex;gap:6px;justify-content:center;margin-bottom:24px;}
.ob-dot{width:8px;height:8px;border-radius:50%;background:var(--border2);}
.ob-dot.on{background:var(--yellow);width:24px;border-radius:4px;}
.btn-next{width:100%;background:var(--yellow);color:#1a1000;border:none;padding:15px;border-radius:12px;font-size:16px;font-weight:700;cursor:pointer;}
.ob-footer{font-size:12px;color:var(--text3);margin-top:20px;line-height:1.6;}

/* PRACTICE SESSION */
.session{flex:1;display:flex;flex-direction:column;background:var(--bg);}
.session-topbar{display:flex;align-items:center;gap:12px;padding:12px 16px;border-bottom:1px solid var(--border);}
.close-btn{width:32px;height:32px;display:flex;align-items:center;justify-content:center;color:var(--text2);background:none;border:none;cursor:pointer;font-size:18px;flex-shrink:0;}
.prog-track{flex:1;height:8px;background:var(--bg3);border-radius:4px;overflow:hidden;}
.prog-fill{height:100%;background:var(--yellow);border-radius:4px;transition:width 0.3s;}
.pts-badge{display:flex;align-items:center;gap:4px;font-size:14px;font-weight:600;color:var(--text);flex-shrink:0;}

.q-area{flex:1;padding:16px 16px 8px;overflow-y:auto;}
.q-meta{display:flex;align-items:center;gap:6px;margin-bottom:16px;flex-wrap:wrap;}
.q-tag{font-size:11px;padding:3px 8px;border-radius:5px;font-weight:500;}
.q-tag.topic{background:var(--bg3);color:var(--text2);}
.q-tag.sub{background:var(--bg3);color:var(--text2);}
.q-tag.diff{font-size:11px;padding:3px 8px;border-radius:5px;}
.q-tag.diff.beginner{background:rgba(34,197,94,0.15);color:#86efac;}
.q-tag.diff.intermediate{background:rgba(245,166,35,0.15);color:#fcd34d;}
.q-tag.diff.advanced{background:rgba(239,68,68,0.15);color:#fca5a5;}
.flag-btn{margin-left:auto;background:none;border:none;color:var(--text3);cursor:pointer;font-size:16px;padding:2px 4px;}
.flag-btn.flagged{color:var(--yellow);}
.q-num{font-size:13px;color:var(--text3);margin-bottom:6px;}
.q-correct-count{font-size:13px;color:var(--text2);}
.q-text{font-size:17px;font-weight:500;line-height:1.55;margin-bottom:20px;color:var(--text);}
.q-text.tf{text-align:center;font-size:18px;padding:8px 0;}

.opts-list{display:flex;flex-direction:column;gap:8px;}
.opt-btn{width:100%;text-align:left;background:var(--bg2);border:1.5px solid var(--border);border-radius:10px;padding:13px 14px;font-size:14px;color:var(--text);cursor:pointer;display:flex;align-items:center;gap:12px;transition:all 0.12s;line-height:1.4;}
.opt-btn:hover:not(.dis){background:var(--bg3);border-color:var(--border2);}
.opt-btn.sel{border-color:var(--yellow);background:var(--yellow-bg);}
.opt-btn.correct{border-color:var(--green);background:var(--green-bg);color:#86efac;}
.opt-btn.wrong{border-color:var(--red);background:var(--red-bg);color:#fca5a5;}
.opt-btn.dis{cursor:default;}
.opt-num{width:24px;height:24px;border-radius:6px;background:var(--bg3);display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:600;color:var(--text2);flex-shrink:0;}
.opt-btn.correct .opt-num{background:var(--green-bg);color:var(--green);}
.opt-btn.wrong .opt-num{background:var(--red-bg);color:var(--red);}

.tf-row{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:8px;}
.tf-btn{padding:20px;border-radius:12px;border:1.5px solid var(--border);background:var(--bg2);font-size:16px;font-weight:700;color:var(--text2);cursor:pointer;letter-spacing:1px;transition:all 0.12s;}
.tf-btn:hover:not(.dis){background:var(--bg3);}
.tf-btn.correct{border-color:var(--green);background:var(--green-bg);color:var(--green);}
.tf-btn.wrong{border-color:var(--red);background:var(--red-bg);color:var(--red);}

.feedback{margin-top:16px;border-radius:12px;padding:14px 16px;border:1px solid;}
.feedback.ok{border-color:var(--green-dark);background:rgba(21,128,61,0.15);}
.feedback.ng{border-color:var(--red-dark);background:rgba(185,28,28,0.15);}
.fb-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;}
.fb-title{font-size:15px;font-weight:700;}
.feedback.ok .fb-title{color:var(--green);}
.feedback.ng .fb-title{color:var(--red);}
.fb-auto{font-size:12px;color:var(--text3);cursor:pointer;}
.fb-exp{font-size:13px;color:var(--text2);line-height:1.6;}
.fb-actions{display:flex;gap:8px;margin-top:12px;}
.btn-continue{flex:1;background:var(--bg3);border:1px solid var(--border2);border-radius:8px;padding:11px;font-size:14px;font-weight:600;color:var(--text);cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px;}
.btn-continue:hover{background:var(--bg4);}

.keyboard-tip{position:fixed;bottom:90px;left:50%;transform:translateX(-50%);background:var(--bg3);border:1px solid var(--border2);border-radius:10px;padding:8px 14px;font-size:12px;color:var(--text2);display:flex;align-items:center;gap:8px;max-width:320px;width:90%;z-index:50;}
.tip-close{background:none;border:none;color:var(--text3);cursor:pointer;font-size:14px;margin-left:auto;}
kbd{background:var(--bg4);border:1px solid var(--border2);border-radius:4px;padding:1px 5px;font-size:11px;font-family:monospace;}

/* FLAG MENU */
.flag-menu{position:absolute;right:12px;top:210px;background:var(--bg3);border:1px solid var(--border2);border-radius:8px;z-index:100;min-width:160px;overflow:hidden;box-shadow:0 8px 24px rgba(0,0,0,0.4);}
.flag-option{padding:11px 16px;font-size:13px;cursor:pointer;color:var(--text);}
.flag-option:hover{background:var(--bg4);}

/* STATS */
.stats-screen{flex:1;padding:20px 16px 100px;overflow-y:auto;}
.stats-title{font-size:22px;font-weight:700;margin-bottom:4px;}
.stats-sub{font-size:13px;color:var(--text2);margin-bottom:20px;}
.stat-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px;}
.stat-card{background:var(--bg2);border:1px solid var(--border);border-radius:12px;padding:16px;}
.stat-card-label{font-size:12px;color:var(--text3);margin-bottom:6px;}
.stat-card-val{font-size:26px;font-weight:700;color:var(--text);}
.stat-card-val.yellow{color:var(--yellow);}
.stat-card-val.orange{color:#f97316;}
.stat-card-sub{font-size:12px;color:var(--text3);margin-top:4px;}
.stat-progress{height:4px;background:var(--bg3);border-radius:2px;margin-top:8px;overflow:hidden;}
.stat-progress-fill{height:100%;background:var(--yellow);border-radius:2px;}

.week-card{background:var(--bg2);border:1px solid var(--border);border-radius:12px;padding:16px;margin-bottom:16px;}
.week-title{font-size:14px;font-weight:600;margin-bottom:16px;}
.week-bars{display:flex;align-items:flex-end;gap:6px;height:60px;}
.week-bar-wrap{flex:1;display:flex;flex-direction:column;align-items:center;gap:4px;}
.week-bar-val{font-size:10px;color:var(--text3);}
.week-bar-track{width:100%;flex:1;background:var(--bg3);border-radius:3px;overflow:hidden;position:relative;}
.week-bar-fill{width:100%;background:var(--yellow);border-radius:3px;position:absolute;bottom:0;}
.week-day{font-size:10px;color:var(--text3);}
.week-goal{font-size:11px;color:var(--text3);margin-top:8px;text-align:right;}

.bests-card{background:var(--bg2);border:1px solid var(--border);border-radius:12px;padding:16px;margin-bottom:16px;}
.bests-title{font-size:14px;font-weight:600;margin-bottom:12px;}
.bests-row{display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border);}
.bests-row:last-child{border-bottom:none;}
.bests-label{font-size:13px;color:var(--text2);}
.bests-val{font-size:13px;font-weight:600;color:var(--text);}
.bests-val.yellow{color:var(--yellow);}
.bests-val.orange{color:#f97316;}

.topic-prog-card{background:var(--bg2);border:1px solid var(--border);border-radius:12px;padding:16px;margin-bottom:16px;}
.tp-title{font-size:14px;font-weight:600;margin-bottom:12px;}
.tp-row{display:flex;align-items:center;gap:10px;padding:7px 0;}
.tp-icon{font-size:16px;width:24px;text-align:center;}
.tp-name{font-size:13px;color:var(--text2);flex:1;}
.tp-bar-wrap{width:100px;height:5px;background:var(--bg3);border-radius:3px;overflow:hidden;}
.tp-bar{height:100%;background:var(--blue);border-radius:3px;}
.tp-pct{font-size:12px;color:var(--text3);width:28px;text-align:right;}

.acc-card{background:var(--bg2);border:1px solid var(--border);border-radius:12px;padding:16px;margin-bottom:16px;}
.acc-title{font-size:14px;font-weight:600;margin-bottom:12px;}
.acc-row{display:flex;align-items:center;justify-content:space-between;padding:7px 0;border-bottom:1px solid var(--border);}
.acc-row:last-child{border-bottom:none;}
.acc-left{display:flex;align-items:center;gap:8px;font-size:13px;color:var(--text2);}
.acc-val{font-size:13px;font-weight:600;}
.acc-val.green{color:var(--green);}
.acc-val.yellow{color:var(--yellow);}
.acc-val.red{color:var(--red);}

/* PROFILE */
.profile-screen{flex:1;padding:20px 16px 100px;overflow-y:auto;}
.profile-title{font-size:22px;font-weight:700;margin-bottom:4px;}
.profile-sub{font-size:13px;color:var(--text2);margin-bottom:16px;}
.email-input{width:100%;background:var(--bg2);border:1px solid var(--border);border-radius:10px;padding:12px 14px;color:var(--text);font-size:14px;margin-bottom:10px;outline:none;}
.email-input:focus{border-color:var(--blue);}
.btn-magic{width:100%;background:var(--yellow);color:#1a1000;border:none;padding:14px;border-radius:10px;font-size:15px;font-weight:700;cursor:pointer;margin-bottom:8px;}
.pw-link{text-align:center;font-size:13px;color:var(--text3);margin-bottom:24px;cursor:pointer;}
.settings-title{font-size:16px;font-weight:600;margin-bottom:14px;}
.settings-card{background:var(--bg2);border:1px solid var(--border);border-radius:12px;padding:16px;margin-bottom:12px;}
.sc-title{font-size:14px;font-weight:600;margin-bottom:4px;}
.sc-sub{font-size:12px;color:var(--text3);margin-bottom:12px;}
.diff-list{display:flex;flex-direction:column;gap:2px;}
.diff-row-item{display:flex;align-items:center;justify-content:space-between;padding:10px 12px;border-radius:8px;cursor:pointer;transition:background 0.1s;}
.diff-row-item:hover{background:var(--bg3);}
.diff-row-item.active{background:var(--bg3);}
.diff-dot{width:8px;height:8px;border-radius:50%;}
.diff-name{font-size:14px;margin-left:10px;}
.check-icon{color:var(--yellow);font-size:14px;}
.pts-goal-row{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;}
.pts-goal-btn{padding:10px;border-radius:8px;border:1.5px solid var(--border);background:transparent;color:var(--text2);font-size:13px;font-weight:500;cursor:pointer;transition:all 0.15s;}
.pts-goal-btn.on{border-color:var(--yellow);background:var(--yellow-bg);color:var(--text);font-weight:700;}
.sound-row{display:flex;align-items:center;justify-content:space-between;}
.toggle{width:44px;height:24px;border-radius:12px;background:var(--bg3);border:none;cursor:pointer;position:relative;transition:background 0.2s;}
.toggle.on{background:var(--yellow);}
.toggle::after{content:'';position:absolute;width:18px;height:18px;border-radius:50%;background:white;top:3px;left:3px;transition:left 0.2s;}
.toggle.on::after{left:23px;}
.freezes-row{display:flex;align-items:center;justify-content:space-between;padding:4px 0;}
.freeze-left{display:flex;align-items:center;gap:10px;}
.freeze-name{font-size:14px;font-weight:500;}
.freeze-sub{font-size:12px;color:var(--text3);}
.freeze-count{font-size:18px;font-weight:700;}
.profile-footer{font-size:12px;color:var(--text3);text-align:center;margin-top:16px;}

/* BOTTOM NAV */
.bot-nav{position:fixed;bottom:0;left:50%;transform:translateX(-50%);width:100%;max-width:480px;background:var(--bg);border-top:1px solid var(--border);display:flex;z-index:100;}
.nav-item{flex:1;display:flex;flex-direction:column;align-items:center;gap:3px;padding:10px 8px;cursor:pointer;border:none;background:transparent;color:var(--text3);font-size:11px;transition:color 0.15s;}
.nav-item.on{color:var(--yellow);}
.nav-icon{font-size:22px;line-height:1;}
.pb{padding-bottom:80px;}
.home-eyebrow{font-size:10px;color:var(--text3);letter-spacing:3px;text-transform:uppercase;margin-bottom:6px;}
.home-tagline{font-size:12px;color:var(--text3);margin-top:4px;line-height:1.6;}
.cert-banner{background:#0d2544;border:1px solid #1d4ed8;border-radius:12px;padding:14px 16px;margin-bottom:14px;}
.cert-eyebrow{font-size:9px;color:#60a5fa;letter-spacing:3px;text-transform:uppercase;margin-bottom:5px;}
.cert-title{font-size:15px;font-weight:700;color:var(--text);margin-bottom:3px;}
.cert-sub{font-size:12px;color:#93c5fd;margin-bottom:10px;}
.cert-pills{display:flex;flex-wrap:wrap;gap:5px;}
.cert-pill{font-size:10px;background:rgba(37,99,235,0.2);color:#93c5fd;border:1px solid rgba(59,130,246,0.3);border-radius:4px;padding:3px 8px;}
.tc-bar-track{height:3px;background:var(--bg3);border-radius:2px;margin-top:7px;overflow:hidden;}
.tc-bar-fill{height:100%;background:var(--blue);border-radius:2px;transition:width 0.4s ease;}
.footer-txt a{text-decoration:none;}
.footer-txt a:hover{text-decoration:underline;}
.profile-footer a{text-decoration:none;}
.profile-footer a:hover{text-decoration:underline;}

/* ANIMATIONS */
@keyframes slideUp{from{opacity:0;transform:translateY(16px);}to{opacity:1;transform:translateY(0);}}
@keyframes fadeIn{from{opacity:0;}to{opacity:1;}}
@keyframes popIn{from{opacity:0;transform:scale(0.92);}to{opacity:1;transform:scale(1);}}
@keyframes shake{0%,100%{transform:translateX(0);}20%{transform:translateX(-6px);}40%{transform:translateX(6px);}60%{transform:translateX(-4px);}80%{transform:translateX(4px);}}

.feedback{animation:slideUp 0.25s cubic-bezier(0.16,1,0.3,1);}
.onboard{animation:fadeIn 0.35s ease;}
.home{animation:fadeIn 0.25s ease;}
.session{animation:fadeIn 0.2s ease;}
.setup{animation:fadeIn 0.2s ease;}
.stats-screen{animation:fadeIn 0.2s ease;}
.profile-screen{animation:fadeIn 0.2s ease;}
.opt-btn{transition:all 0.15s cubic-bezier(0.4,0,0.2,1);}
.opt-btn.wrong{animation:shake 0.35s ease;}
.tf-btn{transition:all 0.15s cubic-bezier(0.4,0,0.2,1);}
.topic-card{transition:all 0.15s cubic-bezier(0.4,0,0.2,1);}
.topic-card:hover{transform:translateY(-2px);box-shadow:0 4px 16px rgba(0,0,0,0.3);}
.cert-card{transition:all 0.15s cubic-bezier(0.4,0,0.2,1);}
.cert-card:not(.disabled):hover{transform:translateY(-1px);}
.btn-start{transition:all 0.15s cubic-bezier(0.4,0,0.2,1);}
.btn-start:hover:not(:disabled){transform:translateY(-1px);box-shadow:0 4px 16px rgba(245,166,35,0.3);}
.nav-item{transition:color 0.15s ease;}
.flag-menu{animation:popIn 0.15s cubic-bezier(0.16,1,0.3,1);}
.keyboard-tip{animation:slideUp 0.3s cubic-bezier(0.16,1,0.3,1);}
.topics-list{animation:slideUp 0.2s cubic-bezier(0.16,1,0.3,1);}

`;

// ─── MAIN APP ──────────────────────────────────────────────────────────
export default function DailyBricks() {
  const [screen, setScreen] = useState("loading");
  const [onboardStep, setOnboardStep] = useState(0);
  const [tab, setTab] = useState("home");
  const [userId, setUserId] = useState(null);
  const [lbData, setLbData] = useState([]);
  const [globalAnalytics, setGlobalAnalytics] = useState(null);
  const [email, setEmail] = useState("");
  const [magicSent, setMagicSent] = useState(false);
  const [showPwMode, setShowPwMode] = useState(false);
  const [password, setPassword] = useState("");

  // Practice setup state
  const [setupDiff, setSetupDiff] = useState(["Beginner"]);
  const [selectedTopics, setSelectedTopics] = useState(TOPICS.map(t => t.id));
  const [topicsOpen, setTopicsOpen] = useState(false);
  const [setupMode, setSetupMode] = useState("mixed"); // mixed | topic

  // Session state
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
  const [autoAdvance, setAutoAdvance] = useState(false);

  // Persistent stats
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

  useEffect(() => {
    // Init anonymous user ID
    const uid = getAnonId();
    setUserId(uid);

    // Load local state first for instant UI
    const saved = load();
    if (!saved) {
      setScreen("onboard");
    } else {
      setTotalPts(saved.totalPts || 0);
      setStreak(saved.streak || 0);
      setDailyPts(saved.dailyPts || 0);
      setDailyGoal(saved.dailyGoal || 50);
      setDiffSetting(saved.diffSetting || "Beginner");
      setSoundOn(saved.soundOn !== false);
      setTopicProgress(saved.topicProgress || {});
      setTopicAccuracy(saved.topicAccuracy || {});
      setWeeklyPts(saved.weeklyPts || [0,0,0,0,0,0,0]);
      setExercisesCompleted(saved.exercisesCompleted || 0);
      setScreen("home");
    }

    // Sync from Firestore (overrides local if exists)
    getUserDoc(uid).then(remote => {
      if (remote) {
        setTotalPts(remote.totalPts || 0);
        setStreak(remote.streak || 0);
        setDailyPts(remote.dailyPts || 0);
        setTopicProgress(remote.topicProgress || {});
        setTopicAccuracy(remote.topicAccuracy || {});
        setExercisesCompleted(remote.exercisesCompleted || 0);
        setWeeklyPts(remote.weeklyPts || [0,0,0,0,0,0,0]);
        if (!saved) setScreen("home");
      }
    });

    // Subscribe to live leaderboard
    const unsubLb = subscribeLeaderboard(rows => setLbData(rows));
    // Subscribe to live analytics
    const unsubAn = subscribeAnalytics(data => setGlobalAnalytics(data));

    return () => { unsubLb(); unsubAn(); };
  }, []);

  function persist(updates = {}) {
    const data = { totalPts, streak, dailyPts, dailyGoal, diffSetting, soundOn, topicProgress, topicAccuracy, weeklyPts, exercisesCompleted, ...updates };
    save(data);
    // Sync to Firestore (non-blocking)
    if (userId) {
      const uid = userId;
      const fsData = {
        totalPts: data.totalPts,
        streak: data.streak,
        dailyPts: data.dailyPts,
        topicProgress: data.topicProgress,
        topicAccuracy: data.topicAccuracy,
        weeklyPts: data.weeklyPts,
        exercisesCompleted: data.exercisesCompleted,
        displayName: "anon_" + uid.slice(-4),
      };
      upsertUserDoc(uid, fsData);
    }
  }

  function startPractice(mode = "mixed", topicId = null) {
    let pool = QUESTIONS.filter(q => setupDiff.includes(q.diff));
    if (mode === "topic" && topicId) pool = pool.filter(q => q.topic === topicId);
    else if (mode === "mixed") pool = pool.filter(q => selectedTopics.includes(q.topic));
    if (pool.length === 0) pool = QUESTIONS.slice();
    const shuffled = [...pool].sort(() => Math.random() - 0.5).slice(0, 15);
    setSessionQs(shuffled);
    setQIdx(0);
    setAnswered(false);
    setChosen(null);
    setCorrect(false);
    setSessionPts(0);
    setSessionCorrect(0);
    setFlagged(false);
    setShowFlagMenu(false);
    setShowTip(true);
    setScreen("session");
  }

  function handleAnswer(idx) {
    if (answered) return;
    const q = sessionQs[qIdx];
    const isCorrect = idx === q.a;
    setChosen(idx);
    setAnswered(true);
    setCorrect(isCorrect);
    playSound(isCorrect ? "correct" : "wrong", soundOn);
    if (isCorrect) {
      const pts = 15;
      const newTotal = totalPts + pts;
      const newDaily = dailyPts + pts;
      const newSessPts = sessionPts + pts;
      const newSessCorrect = sessionCorrect + 1;
      const newExercises = exercisesCompleted + 1;
      const newAcc = { ...topicAccuracy };
      if (!newAcc[q.topic]) newAcc[q.topic] = { correct: 0, total: 0 };
      newAcc[q.topic].correct++;
      newAcc[q.topic].total++;
      const newProg = { ...topicProgress };
      newProg[q.topic] = (newProg[q.topic] || 0) + 1;
      const newWeekly = [...weeklyPts];
      const day = new Date().getDay();
      newWeekly[day === 0 ? 6 : day - 1] += pts;
      setTotalPts(newTotal);
      setDailyPts(newDaily);
      setSessionPts(newSessPts);
      setSessionCorrect(newSessCorrect);
      setExercisesCompleted(newExercises);
      setTopicAccuracy(newAcc);
      setTopicProgress(newProg);
      setWeeklyPts(newWeekly);
      persist({ totalPts: newTotal, dailyPts: newDaily, exercisesCompleted: newExercises, topicAccuracy: newAcc, topicProgress: newProg, weeklyPts: newWeekly });
    } else {
      const newAcc = { ...topicAccuracy };
      if (!newAcc[q.topic]) newAcc[q.topic] = { correct: 0, total: 0 };
      newAcc[q.topic].total++;
      setTopicAccuracy(newAcc);
      persist({ topicAccuracy: newAcc });
    }
  }

  // Write completed session to Firestore when session ends
  function flushSession(finalCorrect, finalTotal, finalPts, finalTopicAcc) {
    if (!userId) return;
    const topics = [...new Set(sessionQs.map(q => q.topic))];
    writeSession(userId, {
      topics,
      difficulty: setupDiff,
      correct: finalCorrect,
      total: finalTotal,
      pts: finalPts,
    });
    incrementAnalytics({
      total: finalTotal,
      correct: finalCorrect,
      topics,
      topicCorrect: finalTopicAcc,
    });
  }

  function nextQ() {
    if (qIdx + 1 >= sessionQs.length) {
      flushSession(sessionCorrect + (correct ? 1 : 0), sessionQs.length, sessionPts + (correct ? 15 : 0), topicAccuracy);
      setScreen("home"); setTab("home"); return;
    }
    setQIdx(qIdx + 1);
    setAnswered(false);
    setChosen(null);
    setCorrect(false);
    setFlagged(false);
    setShowFlagMenu(false);
  }

  // Keyboard shortcuts
  useEffect(() => {
    if (screen !== "session") return;
    function onKey(e) {
      if (answered) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); nextQ(); } return; }
      const q = sessionQs[qIdx];
      if (!q) return;
      const n = parseInt(e.key);
      if (n >= 1 && n <= q.opts.length) handleAnswer(n - 1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [screen, answered, qIdx, sessionQs]);

  const q = sessionQs[qIdx];
  const accuracy = exercisesCompleted > 0
    ? Math.round(Object.values(topicAccuracy).reduce((s,v) => s + v.correct, 0) / Math.max(1, Object.values(topicAccuracy).reduce((s,v) => s + v.total, 0)) * 100)
    : 0;

  const DAYS = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];

  // ── RENDER ──────────────────────────────────────────────────────────
  return (
    <>
      <style>{STYLES}</style>
      <div className="app" style={{ position: "relative" }}>

        {/* ONBOARDING */}
        {screen === "onboard" && (
          <div className="onboard">
            <button className="skip-btn" onClick={() => { setScreen("home"); persist(); }}>Skip</button>
            {onboardStep === 0 && (<>
              <div className="ob-icon">⚡</div>
              <h2 className="ob-title">Sharpen your Databricks skills</h2>
              <p className="ob-sub">Quick quiz sessions covering real-world data engineering topics</p>
              <div className="ob-topic-grid">
                {TOPICS.slice(0,6).map(t => (
                  <div key={t.id} className="ob-topic">
                    <div className="ob-topic-name">{t.icon} {t.name}</div>
                    <div className="ob-topic-sub">{t.sub}</div>
                  </div>
                ))}
              </div>
              <div className="ob-dots">{[0,1,2].map(i => <div key={i} className={`ob-dot ${i===0?"on":""}`}/>)}</div>
              <button className="btn-next" onClick={() => setOnboardStep(1)}>Next</button>
              <div className="ob-footer">Built with ❤️ for Databricks engineers<br/>Not affiliated with or endorsed by Databricks, Inc.</div>
            </>)}
            {onboardStep === 1 && (<>
              <div className="ob-icon">🎯</div>
              <h2 className="ob-title">3 minutes a day adds up</h2>
              <p className="ob-sub">Earn points for correct answers, build run streaks, and track your progress across every topic</p>
              <div className="ob-feat-row">
                <div className="ob-feat"><div className="ob-feat-icon">🔥</div>Run Streak</div>
                <div className="ob-feat"><div className="ob-feat-icon">⚡</div>Points</div>
                <div className="ob-feat"><div className="ob-feat-icon">🎯</div>Accuracy</div>
                <div className="ob-feat"><div className="ob-feat-icon">🛡️</div>Freezes</div>
              </div>
              <div className="ob-dots">{[0,1,2].map(i => <div key={i} className={`ob-dot ${i===1?"on":""}`}/>)}</div>
              <button className="btn-next" onClick={() => setOnboardStep(2)}>Next</button>
              <div className="ob-footer">Built with ❤️ for Databricks engineers<br/>Not affiliated with or endorsed by Databricks, Inc.</div>
            </>)}
            {onboardStep === 2 && (<>
              <div className="ob-icon">🚀</div>
              <h2 className="ob-title">Pick your level and go</h2>
              <p className="ob-sub">Beginner, intermediate, or advanced — no account needed to start</p>
              <div className="ob-dots" style={{marginTop:40}}>{[0,1,2].map(i => <div key={i} className={`ob-dot ${i===2?"on":""}`}/>)}</div>
              <button className="btn-next" onClick={() => { setScreen("home"); persist(); }}>Start practicing</button>
              <div className="ob-footer">Built with ❤️ for Databricks engineers<br/>Not affiliated with or endorsed by Databricks, Inc.</div>
            </>)}
          </div>
        )}

        {/* MAIN APP */}
        {["home","stats","profile"].includes(screen) && <>

          {/* TOPBAR */}
          <div className="topbar">
            <div className="tbar-logo">
              <svg width="20" height="22" viewBox="0 0 48 52" style={{flexShrink:0}}>
                <polygon points="24,0 48,10 24,20 0,10" fill="#f5a623"/>
                <polygon points="24,8 48,18 48,26 24,16" fill="#d97706" opacity="0.9"/>
                <polygon points="0,18 24,28 24,36 0,26" fill="#fbbf24" opacity="0.8"/>
                <polygon points="24,16 48,26 48,34 24,24" fill="#b45309" opacity="0.85"/>
                <polygon points="0,26 24,36 24,44 0,34" fill="#f59e0b" opacity="0.65"/>
                <polygon points="24,24 48,34 24,44 0,34" fill="#d97706" opacity="0.9"/>
              </svg>
              <span className="tbar-appname">Daily<span className="tbar-bricks">Bricks</span></span>
            </div>
            <div className="tbar-stats">
              <span className="tbar-streak">🔥{streak}</span>
              <span className="tbar-xp">⚡<span>{totalPts}</span>XP</span>
              <span className="tbar-lv">Lv<span>{Math.floor(totalPts/500)+1}</span></span>
            </div>
          </div>

          {/* HOME TAB */}
          {tab === "home" && (
            <div className="home pb">
              <div className="greeting">
                <div className="home-eyebrow">Databricks · DE Associate · Daily Practice</div>
                <h1>{dailyPts >= dailyGoal ? "Goal reached! 🎉" : dailyPts > 0 ? "Great work today!" : "Ready to practice?"}</h1>
                <p>{dailyPts}/{dailyGoal} pts today{dailyPts > 0 && dailyPts < dailyGoal ? " — keep going!" : ""}</p>
                <div className="home-tagline">5 minutes. Every day. Until it sticks.<br/>Stop cramming. Start training.</div>
                {dailyPts > 0 && (
                  <div className="pts-bar-wrap">
                    <div className="pts-bar-fill" style={{width: `${Math.min(100, dailyPts/dailyGoal*100)}%`}}/>
                  </div>
                )}
              </div>

              <div className="cert-banner">
                <div className="cert-eyebrow">🎓 Cert Prep</div>
                <div className="cert-title">DE Associate Exam</div>
                <div className="cert-sub">49 exercises across 7 zones · mapped directly to exam sections</div>
                <div className="cert-pills">
                  {["Delta Lake","Spark SQL","Streaming","Unity Catalog","Performance"].map(p => (
                    <span key={p} className="cert-pill">{p}</span>
                  ))}
                </div>
              </div>

              <button className="btn-start" onClick={() => setScreen("setup")}>
                Start Practice →
              </button>

              <div className="section-head">🎓 Cert Prep</div>
              <div className="cert-grid">
                <div className="cert-card" onClick={() => setScreen("setup")}>
                  <div className="cert-dot" style={{background:"#22c55e"}}/>
                  <div className="cert-name">DE Associate</div>
                  <div className="cert-sub">5 exam sections</div>
                </div>
                <div className="cert-card disabled">
                  <div className="cert-dot" style={{background:"#3b82f6"}}/>
                  <div className="cert-name">DE Professional</div>
                  <div className="cert-sub">Coming soon</div>
                </div>
              </div>

              <div className="section-head">📚 Practice by Topic</div>
              <div className="topic-grid">
                {TOPICS.map(t => (
                  <div key={t.id} className="topic-card" onClick={() => { setSetupMode("topic"); setScreen("setup_topic_" + t.id); startPractice("topic", t.id); }}>
                    <div className="topic-icon">{t.icon}</div>
                    <div className="topic-name">{t.name}</div>
                    <div className="topic-count">{t.count} exercises</div>
                    <div className="tc-bar-track"><div className="tc-bar-fill" style={{width:`${Math.min(100,Math.round((topicProgress[t.id]||0)/t.count*100))}%`}}/></div>
                  </div>
                ))}
              </div>

              <div className="footer-txt">
                Built by Neha Rani · Cert prep that actually sticks<br/>
                <a href="https://linkedin.com/in/neha-rani" target="_blank" rel="noopener" style={{color:"var(--text3)"}}>linkedin.com/in/neha-rani</a><br/>
              Not affiliated with or endorsed by Databricks, Inc.
              </div>
            </div>
          )}

          {/* STATS TAB */}
          {tab === "stats" && (
            <div className="stats-screen pb">
              <div className="stats-title">Stats</div>
              <div className="stats-sub">Your practice history and personal records</div>
              <div className="stat-grid">
                <div className="stat-card">
                  <div className="stat-card-label">Today</div>
                  <div className="stat-card-val yellow">{dailyPts} pts</div>
                  <div className="stat-progress"><div className="stat-progress-fill" style={{width:`${Math.min(100,dailyPts/dailyGoal*100)}%`}}/></div>
                  <div className="stat-card-sub">{dailyGoal} pts goal</div>
                </div>
                <div className="stat-card">
                  <div className="stat-card-label">This week</div>
                  <div className="stat-card-val yellow">{weeklyPts.reduce((a,b)=>a+b,0)} pts</div>
                  <div className="stat-card-sub">{exercisesCompleted} exercises</div>
                </div>
                <div className="stat-card">
                  <div className="stat-card-label">Run Streak</div>
                  <div className="stat-card-val orange">🔥 {streak}</div>
                  <div className="stat-card-sub">Best: {streak}</div>
                </div>
                <div className="stat-card">
                  <div className="stat-card-label">Accuracy</div>
                  <div className="stat-card-val yellow">{accuracy}%</div>
                  <div className="stat-card-sub">{exercisesCompleted} total</div>
                </div>
              </div>

              <div className="week-card">
                <div className="week-title">This Week</div>
                <div className="week-bars">
                  {weeklyPts.map((pts, i) => {
                    const max = Math.max(...weeklyPts, dailyGoal);
                    const pct = max > 0 ? pts/max*100 : 0;
                    return (
                      <div key={i} className="week-bar-wrap">
                        {pts > 0 && <div className="week-bar-val">{pts}</div>}
                        <div className="week-bar-track" style={{height:"48px"}}>
                          <div className="week-bar-fill" style={{height:`${pct}%`}}/>
                        </div>
                        <div className="week-day">{DAYS[i]}</div>
                      </div>
                    );
                  })}
                </div>
                <div className="week-goal">{dailyGoal} pts daily goal</div>
              </div>

              <div className="bests-card">
                <div className="bests-title">Personal Bests</div>
                <div className="bests-row"><span className="bests-label">Total points earned</span><span className="bests-val yellow">{totalPts}</span></div>
                <div className="bests-row"><span className="bests-label">Longest run streak</span><span className="bests-val orange">🔥 {streak} days</span></div>
                <div className="bests-row"><span className="bests-label">Best week</span><span className="bests-val yellow">{weeklyPts.reduce((a,b)=>a+b,0)} pts</span></div>
                <div className="bests-row"><span className="bests-label">Exercises completed</span><span className="bests-val">{exercisesCompleted}</span></div>
              </div>

              <div className="topic-prog-card">
                <div className="tp-title">Topic Progress</div>
                {TOPICS.map(t => {
                  const done = topicProgress[t.id] || 0;
                  const pct = Math.min(100, Math.round(done/t.count*100));
                  return (
                    <div key={t.id} className="tp-row">
                      <span className="tp-icon">{t.icon}</span>
                      <span className="tp-name">{t.name}</span>
                      <div className="tp-bar-wrap"><div className="tp-bar" style={{width:`${pct}%`}}/></div>
                      <span className="tp-pct">{pct}%</span>
                    </div>
                  );
                })}
              </div>

              {Object.keys(topicAccuracy).length > 0 && (
                <div className="acc-card">
                  <div className="acc-title">Topic Accuracy</div>
                  {TOPICS.filter(t => topicAccuracy[t.id]?.total > 0).map(t => {
                    const acc = topicAccuracy[t.id];
                    const pct = Math.round(acc.correct/acc.total*100);
                    return (
                      <div key={t.id} className="acc-row">
                        <span className="acc-left">{t.icon} {t.name}</span>
                        <span className={`acc-val ${pct>=80?"green":pct>=60?"yellow":"red"}`}>{pct}%</span>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* LIVE LEADERBOARD */}
              {lbData.length > 0 && (
                <div className="bests-card">
                  <div className="bests-title">🏆 Live Leaderboard</div>
                  {lbData.slice(0,10).map((row, i) => {
                    const isMe = row.id === userId;
                    const medals = ["🥇","🥈","🥉"];
                    return (
                      <div key={row.id} className="bests-row" style={isMe ? {background:"rgba(245,166,35,0.08)",borderRadius:6,padding:"4px 8px",margin:"0 -8px"} : {}}>
                        <span className="bests-label" style={{display:"flex",alignItems:"center",gap:8}}>
                          <span style={{width:24,textAlign:"center"}}>{medals[i] || `${i+1}`}</span>
                          <span style={isMe ? {color:"var(--yellow)",fontWeight:600} : {}}>
                            {isMe ? "You" : (row.displayName || `anon_${row.id.slice(-4)}`)}
                          </span>
                        </span>
                        <span className="bests-val yellow">{row.totalPts || 0} pts</span>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* GLOBAL ANALYTICS */}
              {globalAnalytics && (
                <div className="bests-card">
                  <div className="bests-title">📊 Community Stats</div>
                  <div className="bests-row"><span className="bests-label">Total sessions</span><span className="bests-val">{(globalAnalytics.totalSessions || 0).toLocaleString()}</span></div>
                  <div className="bests-row"><span className="bests-label">Questions answered</span><span className="bests-val">{(globalAnalytics.totalAnswers || 0).toLocaleString()}</span></div>
                  <div className="bests-row"><span className="bests-label">Global accuracy</span><span className="bests-val yellow">{globalAnalytics.totalAnswers > 0 ? Math.round(globalAnalytics.correctAnswers / globalAnalytics.totalAnswers * 100) : 0}%</span></div>
                  {globalAnalytics.zoneStats && (
                    <div className="bests-row"><span className="bests-label">Most popular topic</span>
                      <span className="bests-val">
                        {Object.entries(globalAnalytics.zoneStats).sort((a,b) => (b[1].sessions||0)-(a[1].sessions||0))[0]?.[0] || "—"}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* PROFILE TAB */}
          {tab === "profile" && (
            <div className="profile-screen pb">
              <div className="topbar" style={{borderBottom:"none",padding:"0 0 16px"}}>
                <div>
                  <div className="profile-title">Profile</div>
                  <div className="profile-sub">Enter your email to get a sign-in link — no password needed.</div>
                </div>
              </div>
              <input className="email-input" type="email" placeholder="you@email.com"/>
              <button className="btn-magic">Send magic link</button>
              <div className="pw-link">Sign in with password instead</div>

              <div className="settings-title">Settings</div>

              <div className="settings-card">
                <div className="sc-title">Difficulty Level</div>
                <div className="sc-sub">Select which difficulty levels to practice. Applied to all sessions.</div>
                <div className="diff-list">
                  {["Beginner","Intermediate","Advanced"].map((d,i) => (
                    <div key={d} className={`diff-row-item ${diffSetting===d?"active":""}`} onClick={() => { setDiffSetting(d); setSetupDiff([d]); persist({diffSetting:d}); }}>
                      <div className="diff-dot" style={{background:["#22c55e","#f59e0b","#ef4444"][i]}}/>
                      <span className="diff-name">{d}</span>
                      {diffSetting===d && <span className="check-icon">✓</span>}
                    </div>
                  ))}
                </div>
              </div>

              <div className="settings-card">
                <div className="sc-title">Daily Points Goal</div>
                <div className="pts-goal-row">
                  {[50,100,150].map(g => (
                    <button key={g} className={`pts-goal-btn ${dailyGoal===g?"on":""}`} onClick={() => { setDailyGoal(g); persist({dailyGoal:g}); }}>{g} pts</button>
                  ))}
                </div>
              </div>

              <div className="settings-card">
                <div className="sound-row">
                  <span style={{fontSize:14,fontWeight:500}}>Sound effects</span>
                  <button className={`toggle ${soundOn?"on":""}`} onClick={() => { setSoundOn(!soundOn); persist({soundOn:!soundOn}); }}/>
                </div>
              </div>

              <div className="settings-card">
                <div className="freezes-row">
                  <div className="freeze-left">
                    <span style={{fontSize:20}}>🛡️</span>
                    <div>
                      <div className="freeze-name">Run Streak Freezes</div>
                      <div className="freeze-sub">Earned every 7-day run streak (max 3)</div>
                    </div>
                  </div>
                  <div className="freeze-count">0</div>
                </div>
              </div>

              <div className="profile-footer">Built by <a href="https://www.linkedin.com/in/neha-rani-r/" target="_blank" rel="noopener noreferrer" style={{color:"var(--text2)"}}>Neha Rani</a> · Not affiliated with or endorsed by Databricks, Inc.</div>
            </div>
          )}

          {/* BOTTOM NAV */}
          <nav className="bot-nav">
            {[["home","🏠","Home"],["stats","📊","Stats"],["profile","⚙️","Settings"]].map(([id,icon,label]) => (
              <button key={id} className={`nav-item ${tab===id?"on":""}`} onClick={() => { setTab(id); setScreen(id); }}>
                <span className="nav-icon">{icon}</span>
                {label}
              </button>
            ))}
          </nav>
        </>}

        {/* PRACTICE SETUP */}
        {screen === "setup" && (
          <div className="setup pb">
            <button className="back-btn" onClick={() => setScreen("home")}>← Back</button>
            <div className="setup-title">Daily Practice</div>
            <div className="setup-sub">15 questions across your selected topics</div>

            <div style={{fontSize:13,color:"var(--text3)",marginBottom:8}}>Select difficulty</div>
            <div className="diff-row">
              {["Beginner","Intermediate","Advanced"].map((d,i) => (
                <button key={d} className={`diff-btn ${setupDiff.includes(d)?"on":""}`}
                  onClick={() => setSetupDiff(prev => prev.includes(d) ? prev.filter(x=>x!==d).length ? prev.filter(x=>x!==d) : [d] : [...prev,d])}>
                  <span>{["🟢","🟡","🔴"][i]}</span>{d}
                </button>
              ))}
            </div>

            <div className="topics-dropdown" onClick={() => setTopicsOpen(!topicsOpen)}>
              <span>{selectedTopics.length === TOPICS.length ? "All topics" : `${selectedTopics.length} topics`}</span>
              <span>{topicsOpen ? "▲" : "▼"}</span>
            </div>

            {topicsOpen && (
              <div className="topics-list">
                <div className="deselect-all" onClick={() => setSelectedTopics(selectedTopics.length === TOPICS.length ? [] : TOPICS.map(t=>t.id))}>
                  {selectedTopics.length === TOPICS.length ? "Deselect all" : "Select all"}
                </div>
                {TOPICS.map(t => (
                  <div key={t.id} className="topic-row" onClick={() => setSelectedTopics(prev => prev.includes(t.id) ? prev.filter(x=>x!==t.id) : [...prev,t.id])}>
                    <div className="topic-row-left">
                      <span>{t.icon}</span>
                      <span>{t.name}</span>
                    </div>
                    <div className={`check ${selectedTopics.includes(t.id)?"on":""}`}>
                      {selectedTopics.includes(t.id) && "✓"}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <button className="btn-start" style={{marginTop:8}} onClick={() => startPractice("mixed")}>
              Start Practice →
            </button>
          </div>
        )}

        {/* SESSION */}
        {screen === "session" && q && (
          <div className="session" style={{position:"relative"}}>
            <div className="session-topbar">
              <button className="close-btn" onClick={() => setScreen("home")}>✕</button>
              <div className="prog-track">
                <div className="prog-fill" style={{width:`${(qIdx/sessionQs.length)*100}%`}}/>
              </div>
              <div className="pts-badge">⚡ {sessionPts}</div>
            </div>

            <div className="q-area" onClick={() => showFlagMenu && setShowFlagMenu(false)}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6}}>
                <span style={{fontSize:13,color:"var(--text3)"}}>{qIdx+1} / {sessionQs.length}</span>
                <span style={{fontSize:13,color:"var(--text2)"}}>{sessionCorrect} correct</span>
              </div>
              <div className="q-meta">
                {(() => { const t = TOPICS.find(x=>x.id===q.topic); return t ? <span className="q-tag topic">{t.icon} {t.name}</span> : null; })()}
                <span className="q-tag sub">{q.sub}</span>
                <span className={`q-tag diff ${q.diff.toLowerCase()}`}>{q.diff}</span>
                <button className={`flag-btn ${flagged?"flagged":""}`} onClick={e => { e.stopPropagation(); setShowFlagMenu(!showFlagMenu); }}>⚑</button>
              </div>

              <div className={`q-text ${q.type==="tf"?"tf":""}`}>{q.q}</div>

              {q.type === "tf" ? (
                <div className="tf-row">
                  {q.opts.map((opt,i) => {
                    let cls = "tf-btn";
                    if (answered) { cls += " dis"; if (i===q.a) cls += " correct"; else if (i===chosen&&chosen!==q.a) cls += " wrong"; }
                    return <button key={i} className={cls} onClick={() => handleAnswer(i)}>{opt}</button>;
                  })}
                </div>
              ) : (
                <div className="opts-list">
                  {q.opts.map((opt,i) => {
                    let cls = "opt-btn";
                    if (answered) { cls += " dis"; if (i===q.a) cls += " correct"; else if (i===chosen&&chosen!==q.a) cls += " wrong"; }
                    else if (i===chosen) cls += " sel";
                    return (
                      <button key={i} className={cls} onClick={() => handleAnswer(i)}>
                        <span className="opt-num">{i+1}</span>
                        {opt}
                      </button>
                    );
                  })}
                </div>
              )}

              {answered && (
                <div className={`feedback ${correct?"ok":"ng"}`}>
                  <div className="fb-head">
                    <span className="fb-title">{correct ? "✓ Correct!" : "✗ Not quite"}</span>
                    <span className="fb-auto" onClick={() => setAutoAdvance(!autoAdvance)}>
                      {autoAdvance ? "⏸ Tap to disable auto-advance" : "▶"}
                    </span>
                  </div>
                  <div className="fb-exp">{q.exp}</div>
                  <div className="fb-actions">
                    <button className="btn-continue" style={{background:"var(--bg3)",flex:"0 0 auto",width:48}}></button>
                    <button className="btn-continue" onClick={nextQ}>
                      Continue <span style={{fontSize:12}}>↵</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {showFlagMenu && (
              <div className="flag-menu">
                {["Incorrect answer","Confusing question","Too easy","Too hard"].map(o => (
                  <div key={o} className="flag-option" onClick={() => { setFlagged(true); setShowFlagMenu(false); }}>{o}</div>
                ))}
              </div>
            )}

            {showTip && !answered && (
              <div className="keyboard-tip">
                <span>💡</span>
                <span>Press <kbd>1</kbd>–<kbd>{q.opts.length}</kbd> to answer, <kbd>↵</kbd> to continue. 10x faster.</span>
                <button className="tip-close" onClick={() => setShowTip(false)}>✕</button>
              </div>
            )}
          </div>
        )}

      </div>
    </>
  );
}
