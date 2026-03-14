import { useState, useEffect, useCallback, useRef } from "react";

// ─── STORAGE HELPERS ───────────────────────────────────────────────
const STORAGE_KEY = "dailybricks-state";
const ANALYTICS_KEY = "dailybricks-analytics";

async function saveState(data) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch {}
}
async function loadState() {
  try {
    const r = localStorage.getItem(STORAGE_KEY);
    return r ? JSON.parse(r) : null;
  } catch { return null; }
}
async function saveAnalytics(data) {
  try { localStorage.setItem(ANALYTICS_KEY, JSON.stringify(data)); } catch {}
}
async function loadAnalytics() {
  try {
    const r = localStorage.getItem(ANALYTICS_KEY);
    return r ? JSON.parse(r) : null;
  } catch { return null; }
}

// ─── DATA ───────────────────────────────────────────────────────────
const ZONES = [
  { id: "delta",     name: "Delta Lake",      icon: "△", color: "#ef4444", total: 8 },
  { id: "spark",     name: "Spark SQL",        icon: "⚡", color: "#f97316", total: 7 },
  { id: "unity",     name: "Unity Catalog",    icon: "◈", color: "#eab308", total: 6 },
  { id: "streaming", name: "Streaming",        icon: "≋", color: "#22c55e", total: 7 },
  { id: "perf",      name: "Performance",      icon: "◎", color: "#3b82f6", total: 6 },
  { id: "ml",        name: "ML & Features",    icon: "◆", color: "#8b5cf6", total: 5 },
  { id: "cert",      name: "Cert Mode",        icon: "⬡", color: "#ec4899", total: 10 },
];

const EXERCISES = {
  delta: [
    { id:"d1", type:"mcq", question:"Which Delta Lake feature enables querying historical versions of a table?", options:["MERGE INTO","TIME TRAVEL","CLONE","VACUUM"], answer:1, explanation:"Delta Lake's Time Travel allows querying historical snapshots using VERSION AS OF or TIMESTAMP AS OF syntax." },
    { id:"d2", type:"mcq", question:"What does the VACUUM command do in Delta Lake?", options:["Compacts small files into larger ones","Removes old transaction log entries","Deletes files no longer referenced by the current table version","Refreshes table statistics"], answer:2, explanation:"VACUUM removes data files no longer referenced by the Delta table and older than the retention threshold (default 7 days)." },
    { id:"d3", type:"fill", question:"Delta Lake stores transaction history in the _____ directory.", answer:"_delta_log", hint:"Hidden directory starting with underscore", explanation:"The _delta_log directory contains JSON and Parquet checkpoint files forming the transaction log." },
    { id:"d4", type:"mcq", question:"Which MERGE operation is NOT valid DML in Delta Lake?", options:["WHEN MATCHED THEN UPDATE","WHEN NOT MATCHED THEN INSERT","WHEN MATCHED THEN UPSERT","WHEN NOT MATCHED BY SOURCE THEN DELETE"], answer:2, explanation:"UPSERT is not a valid MERGE clause. Valid options are UPDATE, INSERT, and DELETE." },
    { id:"d5", type:"order", question:"Order the Delta Lake write steps correctly:", items:["Write data files to storage","Update _delta_log with commit","Validate schema","Begin transaction"], answer:[3,2,0,1], explanation:"Delta Lake: Begin transaction → Validate schema → Write data files → Commit to _delta_log." },
    { id:"d6", type:"mcq", question:"What is the default retention period for VACUUM in Delta Lake?", options:["24 hours","3 days","7 days","30 days"], answer:2, explanation:"The default retention threshold is 7 days (168 hours). Files newer than this are never deleted." },
    { id:"d7", type:"mcq", question:"Which property enables Change Data Feed on a Delta table?", options:["delta.enableChangeDataFeed = true","delta.logRetentionDuration = true","delta.dataSkippingNumIndexedCols = 1","delta.autoOptimize.optimizeWrite = true"], answer:0, explanation:"Setting delta.enableChangeDataFeed = true enables CDF, allowing downstream consumers to read row-level changes." },
    { id:"d8", type:"mcq", question:"OPTIMIZE with ZORDER BY is used to:", options:["Sort the entire table alphabetically","Co-locate related data for faster filter queries","Remove duplicate rows","Partition data by date"], answer:1, explanation:"ZORDER BY co-locates related information in the same set of files, improving query performance by reducing data read." },
  ],
  spark: [
    { id:"s1", type:"mcq", question:"Which join type retains ALL rows from the left table, filling NULLs for non-matches?", options:["INNER JOIN","LEFT OUTER JOIN","CROSS JOIN","RIGHT SEMI JOIN"], answer:1, explanation:"LEFT OUTER JOIN returns all rows from the left table. Non-matching rows get NULL for right-side columns." },
    { id:"s2", type:"fill", question:"The SQL function _____ assigns a unique sequential number to each row within a partition.", answer:"ROW_NUMBER", hint:"Window function, no ties allowed", explanation:"ROW_NUMBER() assigns a unique integer to each row within a partition with no ties." },
    { id:"s3", type:"mcq", question:"What does EXPLAIN EXTENDED show that EXPLAIN does not?", options:["Estimated row counts","Resolved attribute metadata and logical plan details","Physical storage locations","Join reorder decisions"], answer:1, explanation:"EXPLAIN EXTENDED shows parsed, analyzed, optimized logical plan AND physical plan including resolved attribute metadata." },
    { id:"s4", type:"mcq", question:"Which aggregate function returns the most frequent value in a column?", options:["COUNT","APPROX_COUNT_DISTINCT","MODE","PERCENTILE"], answer:2, explanation:"MODE() returns the most frequently occurring value in a group. Available in Spark SQL 3.4+." },
    { id:"s5", type:"mcq", question:"RANK() differs from DENSE_RANK() in that:", options:["RANK skips numbers after ties; DENSE_RANK does not","DENSE_RANK skips numbers after ties; RANK does not","RANK works across partitions; DENSE_RANK works within","They are identical"], answer:0, explanation:"If two rows tie for rank 2, RANK assigns both rank 2 and skips rank 3. DENSE_RANK assigns both rank 2 and next gets rank 3." },
    { id:"s6", type:"mcq", question:"Which Spark SQL hint forces a broadcast join?", options:["/*+ MERGE(table) */","/*+ BROADCAST(table) */","/*+ REPARTITION(table) */","/*+ COALESCE(table) */"], answer:1, explanation:"The /*+ BROADCAST(tableName) */ hint tells Spark to broadcast the specified table to all executor nodes." },
    { id:"s7", type:"fill", question:"To pivot rows into columns in Spark SQL, use the _____ clause.", answer:"PIVOT", hint:"Transforms rows → columns", explanation:"The PIVOT clause rotates rows into columns based on distinct values of a pivot column." },
  ],
  unity: [
    { id:"u1", type:"mcq", question:"In Unity Catalog, what is the correct 3-level namespace order?", options:["schema.catalog.table","catalog.schema.table","table.schema.catalog","database.schema.table"], answer:1, explanation:"Unity Catalog uses catalog.schema.table — a three-level namespace providing hierarchy above the traditional database.table." },
    { id:"u2", type:"mcq", question:"Which Unity Catalog securable object defines access at the broadest level?", options:["Schema","Table","Catalog","Metastore"], answer:3, explanation:"The Metastore is the top-level Unity Catalog container associated with a Databricks account and cloud region." },
    { id:"u3", type:"mcq", question:"External tables in Unity Catalog store data:", options:["In Databricks-managed cloud storage","In a user-specified external cloud location","Only in Delta format","In the metastore's internal storage"], answer:1, explanation:"External tables point to data in a user-specified external location (e.g., S3 bucket) rather than managed storage." },
    { id:"u4", type:"mcq", question:"To grant SELECT on a table in Unity Catalog, the minimum privilege set is:", options:["SELECT only","USE CATALOG + USE SCHEMA + SELECT","ALL PRIVILEGES","MODIFY only"], answer:1, explanation:"Users need USE CATALOG on the catalog, USE SCHEMA on the schema, and SELECT on the table." },
    { id:"u5", type:"fill", question:"Unity Catalog's _____ feature tracks data lineage across tables automatically.", answer:"data lineage", hint:"Tracks column-level movement", explanation:"Unity Catalog automatically captures table and column-level lineage for Delta tables." },
    { id:"u6", type:"mcq", question:"Which storage credential type is recommended for Unity Catalog on AWS?", options:["Access key + secret","IAM user credentials","IAM role with instance profile","Kerberos ticket"], answer:2, explanation:"On AWS, Unity Catalog uses IAM roles via cross-account role assumption rather than static access keys." },
  ],
  streaming: [
    { id:"st1", type:"mcq", question:"Which Structured Streaming trigger processes all available data then stops?", options:["Trigger.ProcessingTime('1 minute')","Trigger.Once()","Trigger.Continuous('1 second')","Trigger.AvailableNow()"], answer:3, explanation:"Trigger.AvailableNow() processes all available data in micro-batches then stops. Introduced in Spark 3.3." },
    { id:"st2", type:"mcq", question:"Watermarking in Structured Streaming is used to:", options:["Set stream checkpointing intervals","Define how late arriving data is tolerated for aggregations","Mark data quality issues","Encrypt streaming data"], answer:1, explanation:"Watermarks define the maximum allowed lateness for event-time data. Data older than the threshold is dropped." },
    { id:"st3", type:"fill", question:"Streaming aggregations require _____ to avoid unbounded state growth.", answer:"watermark", hint:"Tells Spark how late data can arrive", explanation:"Without watermarks Spark keeps state indefinitely. Watermarks let Spark drop old state and bound memory." },
    { id:"st4", type:"mcq", question:"Which output mode writes only new rows added since the last trigger?", options:["Complete","Update","Append","Overwrite"], answer:2, explanation:"Append mode outputs only new rows since the last trigger. Complete outputs the entire result each trigger." },
    { id:"st5", type:"mcq", question:"Auto Loader (cloudFiles) is preferred over plain readStream for files because:", options:["It supports more file formats","It automatically discovers and incrementally processes new files","It's faster for batch processing","It requires no schema"], answer:1, explanation:"Auto Loader incrementally ingests new files as they arrive in cloud storage and handles schema evolution." },
    { id:"st6", type:"mcq", question:"Where does Structured Streaming store checkpoint information?", options:["In driver memory","In a cloud storage path specified via checkpointLocation","In the Hive metastore","In Kafka consumer offsets only"], answer:1, explanation:"Checkpoints are stored in a user-specified cloud storage path containing offset tracking and aggregation state." },
    { id:"st7", type:"mcq", question:"Delta Live Tables (DLT) pipelines use _____ tables for streaming ingestion.", options:["LIVE","STREAMING LIVE","AUTO","BRONZE"], answer:1, explanation:"In DLT, STREAMING LIVE TABLE defines a streaming table that incrementally ingests data." },
  ],
  perf: [
    { id:"p1", type:"mcq", question:"What causes a shuffle in Spark?", options:["Reading from Delta Lake","Operations requiring data redistribution across partitions","UDF execution","Schema validation"], answer:1, explanation:"Shuffles occur when data must move across partitions — e.g., groupBy, join, distinct, repartition." },
    { id:"p2", type:"mcq", question:"Broadcast joins are most beneficial when:", options:["Both tables are large","One table fits in executor memory (typically < 10MB default)","Tables have the same partition count","Using streaming sources"], answer:1, explanation:"Broadcast joins send the smaller table to every executor, eliminating shuffle. Default threshold is 10MB." },
    { id:"p3", type:"fill", question:"The Spark config _____ controls the number of shuffle partitions (default 200).", answer:"spark.sql.shuffle.partitions", hint:"Format: spark.sql._____.partitions", explanation:"spark.sql.shuffle.partitions defaults to 200. Tune down for small datasets to avoid too many small partitions." },
    { id:"p4", type:"mcq", question:"Adaptive Query Execution (AQE) can automatically:", options:["Rewrite SQL queries","Coalesce shuffle partitions and convert sort-merge joins to broadcast joins","Cache frequently accessed tables","Reorder WHERE clause predicates"], answer:1, explanation:"AQE uses runtime statistics to dynamically coalesce partitions, switch join strategies, and optimize skew joins." },
    { id:"p5", type:"mcq", question:"Data skew in Spark most commonly manifests as:", options:["OOM errors in the driver","One or few tasks taking much longer than others","Schema mismatch errors","Slow metastore queries"], answer:1, explanation:"Skew causes uneven partition sizes so some tasks process much more data, creating stragglers that delay the stage." },
    { id:"p6", type:"mcq", question:"Which caching method persists data to both memory AND disk?", options:["MEMORY_ONLY","DISK_ONLY","MEMORY_AND_DISK","OFF_HEAP"], answer:2, explanation:"MEMORY_AND_DISK stores data in memory and spills to disk when memory is full." },
  ],
  ml: [
    { id:"m1", type:"mcq", question:"Feature Store in Databricks serves features for:", options:["Only batch inference","Only real-time serving","Both batch and online serving from a unified registry","Only training pipelines"], answer:2, explanation:"Databricks Feature Store provides a central registry for features usable in both training and serving, preventing train/serve skew." },
    { id:"m2", type:"mcq", question:"MLflow autologging automatically captures:", options:["Only metrics","Parameters, metrics, and model artifacts from supported libraries","Only model artifacts","Only hyperparameters"], answer:1, explanation:"mlflow.autolog() captures parameters, metrics, tags, and model artifacts from libraries like sklearn, XGBoost, PyTorch." },
    { id:"m3", type:"fill", question:"MLflow experiment runs are organized under _____ which track related runs.", answer:"experiments", hint:"Top-level MLflow organizational unit", explanation:"MLflow Experiments contain Runs. Each run logs parameters, metrics, artifacts, and metadata." },
    { id:"m4", type:"mcq", question:"Which MLflow model stage indicates a model is ready for production traffic?", options:["Staging","Production","Archived","Registered"], answer:1, explanation:"The Model Registry stages: None → Staging → Production → Archived. Production indicates the model actively serves traffic." },
    { id:"m5", type:"mcq", question:"Pandas UDFs outperform row-at-a-time UDFs because:", options:["They avoid Python serialization entirely","They process data in Apache Arrow batches rather than row-by-row","They run on the driver node","They use GPU acceleration automatically"], answer:1, explanation:"Pandas UDFs use Apache Arrow for columnar data transfer between JVM and Python, dramatically reducing serialization overhead." },
  ],
  cert: [
    { id:"c1", type:"mcq", question:"A data engineer needs to process late-arriving events up to 10 minutes after event time. Which feature handles this?", options:["Trigger.AvailableNow()","withWatermark()","foreachBatch()","checkpointLocation"], answer:1, explanation:"withWatermark('eventTime', '10 minutes') tells Spark to tolerate late data up to 10 minutes past the max event time seen." },
    { id:"c2", type:"mcq", question:"Which Delta Lake operation should be run regularly to improve query performance on large tables?", options:["VACUUM","OPTIMIZE","RESTORE","DESCRIBE HISTORY"], answer:1, explanation:"OPTIMIZE compacts small files into larger ones. Combined with ZORDER BY it dramatically improves read performance." },
    { id:"c3", type:"mcq", question:"In Unity Catalog, which privilege allows a user to create tables in a schema?", options:["SELECT","MODIFY","CREATE TABLE","USE SCHEMA"], answer:2, explanation:"CREATE TABLE privilege on a schema allows users to create new tables within it." },
    { id:"c4", type:"mcq", question:"A Spark job has 1000 shuffle partitions but only 10GB of data. The best fix is:", options:["Increase executor memory","Lower spark.sql.shuffle.partitions (e.g., to 100)","Enable broadcast joins","Add more worker nodes"], answer:1, explanation:"Too many shuffle partitions for small data causes task scheduling overhead. Tune to match data size." },
    { id:"c5", type:"mcq", question:"Auto Loader schema inference stores schema information in:", options:["The Delta table metadata","A cloud storage schema location specified by the user","Driver memory only","The Hive metastore"], answer:1, explanation:"Auto Loader stores inferred schemas in a user-specified cloudFiles.schemaLocation path in cloud storage." },
    { id:"c6", type:"mcq", question:"To make MERGE INTO idempotent for retries, you should:", options:["Add a timestamp column","Use a unique key condition and include a deduplication check","Always use INSERT only","Enable delta.enableChangeDataFeed"], answer:1, explanation:"MERGE with a unique key condition ensures idempotency on retry." },
    { id:"c7", type:"mcq", question:"Which file format does Delta Lake use internally for checkpoint files?", options:["JSON","Avro","Parquet","ORC"], answer:2, explanation:"Delta Lake checkpoint files are stored in Parquet format. JSON is used for smaller transaction log entries." },
    { id:"c8", type:"mcq", question:"A streaming job reads from Kafka and writes to Delta Lake. Which output mode supports aggregations?", options:["Append","Update","Complete","Overwrite"], answer:2, explanation:"Complete mode rewrites the entire result table each trigger, required for stateful aggregations." },
    { id:"c9", type:"mcq", question:"DESCRIBE DETAIL on a Delta table does NOT show:", options:["Number of files","Table size in bytes","Row-level change history","Partition columns"], answer:2, explanation:"DESCRIBE DETAIL shows physical metadata. Row-level changes require querying CDF with table_changes()." },
    { id:"c10", type:"mcq", question:"Which Spark join strategy avoids shuffle entirely?", options:["Sort-Merge Join","Broadcast Hash Join","Shuffle Hash Join","Cartesian Join"], answer:1, explanation:"Broadcast Hash Join avoids shuffle by sending the smaller dataset to all executors." },
  ]
};

// ─── STYLES ─────────────────────────────────────────────────────────
const STYLES = `
@import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Syne:wght@700;800&family=Instrument+Sans:wght@400;500;600&display=swap');

*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
:root{
  --bg:#f5f2eb;--bg2:#edeade;--bg3:#e4e0d6;
  --surface:#ffffff;--border:#d4cfc4;--border2:#c8c2b5;
  --ink:#1a1714;--ink2:#5c574f;--ink3:#9c968d;
  --red:#c0392b;--red2:#e74c3c;--red-light:#fdf0ee;
  --gold:#b8860b;--gold2:#d4a017;--gold-light:#fdf8e1;
  --green:#1a7a4a;--green-light:#edf7f2;
  --blue:#1a4a7a;--blue-light:#edf2f7;
  --orange:#c0622b;
  --shadow:0 2px 8px rgba(0,0,0,0.08);
  --shadow-md:0 4px 16px rgba(0,0,0,0.12);
}
html,body{height:100%;background:var(--bg);color:var(--ink);font-family:'Instrument Sans',sans-serif;}

.app{min-height:100vh;background:var(--bg);position:relative;}

/* ── HEADER ── */
.header{
  display:flex;align-items:center;justify-content:space-between;
  padding:14px 28px;background:var(--surface);
  border-bottom:2px solid var(--ink);position:sticky;top:0;z-index:100;
  box-shadow:var(--shadow);
}
.logo{display:flex;align-items:center;gap:12px;cursor:pointer;text-decoration:none;}
.logo-mark{
  width:36px;height:36px;background:var(--ink);color:var(--bg);
  display:flex;align-items:center;justify-content:center;
  font-family:'Syne',sans-serif;font-size:18px;font-weight:800;letter-spacing:-1px;
}
.logo-text{font-family:'Syne',sans-serif;font-size:20px;font-weight:800;letter-spacing:-0.5px;color:var(--ink);}
.logo-dot{color:var(--red);}
.logo-tld{color:var(--ink3);font-size:16px;}

.header-stats{display:flex;gap:10px;align-items:center;}
.hstat{
  display:flex;align-items:center;gap:6px;background:var(--bg2);
  border:1.5px solid var(--border2);padding:6px 12px;
  font-family:'DM Mono',monospace;font-size:12px;color:var(--ink2);
}
.hstat strong{color:var(--ink);font-size:14px;}

/* ── HOME ── */
.home{max-width:960px;margin:0 auto;padding:48px 28px 100px;}

.hero{display:grid;grid-template-columns:1fr 1fr;gap:48px;align-items:center;margin-bottom:64px;border-bottom:1.5px solid var(--border2);padding-bottom:64px;}
@media(max-width:640px){.hero{grid-template-columns:1fr;}.hero-right{display:none;}}
.hero-label{font-family:'DM Mono',monospace;font-size:11px;letter-spacing:3px;color:var(--red);text-transform:uppercase;margin-bottom:16px;}
.hero-title{font-family:'Syne',sans-serif;font-size:clamp(40px,6vw,64px);font-weight:800;line-height:1.05;letter-spacing:-2px;color:var(--ink);margin-bottom:20px;}
.hero-title em{color:var(--red);font-style:normal;}
.hero-body{color:var(--ink2);font-size:16px;line-height:1.7;margin-bottom:28px;}
.hero-cta{
  display:inline-block;background:var(--ink);color:var(--bg);
  padding:14px 28px;font-family:'Syne',sans-serif;font-size:15px;font-weight:700;
  letter-spacing:0.5px;border:none;cursor:pointer;transition:all 0.15s;
}
.hero-cta:hover{background:var(--red);}

.hero-right{background:var(--bg2);border:1.5px solid var(--border2);padding:28px;position:relative;}
.hr-title{font-family:'DM Mono',monospace;font-size:11px;letter-spacing:2px;color:var(--ink3);margin-bottom:20px;text-transform:uppercase;}
.streak-row{display:flex;gap:8px;margin-bottom:16px;}
.streak-pip{width:28px;height:8px;background:var(--border2);}
.streak-pip.active{background:var(--gold2);}
.level-bar-wrap{margin-bottom:8px;}
.level-bar-track{height:10px;background:var(--border);border:1.5px solid var(--border2);overflow:hidden;}
.level-bar-fill{height:100%;background:var(--ink);transition:width 0.6s cubic-bezier(0.4,0,0.2,1);}
.level-meta{display:flex;justify-content:space-between;font-family:'DM Mono',monospace;font-size:11px;color:var(--ink3);margin-top:6px;}

/* ── ZONES ── */
.section-head{display:flex;align-items:baseline;gap:16px;margin-bottom:20px;}
.section-title{font-family:'Syne',sans-serif;font-size:22px;font-weight:800;letter-spacing:-0.5px;}
.section-count{font-family:'DM Mono',monospace;font-size:12px;color:var(--ink3);}

.zones-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px;margin-bottom:48px;}
.zone-card{
  background:var(--surface);border:1.5px solid var(--border2);
  padding:24px;cursor:pointer;position:relative;overflow:hidden;
  transition:all 0.15s;text-align:left;
}
.zone-card:hover{border-color:var(--ink);box-shadow:var(--shadow-md);transform:translateY(-2px);}
.zone-card::before{content:'';position:absolute;top:0;left:0;right:0;height:4px;background:var(--zc,var(--red));}
.z-top{display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;}
.z-icon{font-size:22px;color:var(--zc,var(--red));}
.z-badge{font-family:'DM Mono',monospace;font-size:10px;background:var(--bg2);border:1px solid var(--border);padding:3px 8px;color:var(--ink3);}
.z-name{font-family:'Syne',sans-serif;font-size:17px;font-weight:800;letter-spacing:-0.3px;margin-bottom:12px;}
.z-bar-track{height:6px;background:var(--bg2);border:1px solid var(--border);overflow:hidden;margin-bottom:8px;}
.z-bar-fill{height:100%;background:var(--zc,var(--red));transition:width 0.4s;}
.z-meta{display:flex;justify-content:space-between;font-family:'DM Mono',monospace;font-size:11px;color:var(--ink3);}

/* ── EXERCISE ── */
.ex-screen{max-width:680px;margin:0 auto;padding:36px 28px 100px;}
.ex-topbar{display:flex;align-items:center;gap:14px;margin-bottom:36px;}
.back-btn{
  background:transparent;border:1.5px solid var(--border2);color:var(--ink2);
  padding:8px 14px;cursor:pointer;font-family:'DM Mono',monospace;
  font-size:11px;letter-spacing:1px;transition:all 0.15s;white-space:nowrap;
}
.back-btn:hover{border-color:var(--ink);color:var(--ink);}
.ex-prog-track{flex:1;height:10px;background:var(--bg2);border:1.5px solid var(--border2);overflow:hidden;}
.ex-prog-fill{height:100%;background:var(--zc,var(--red));transition:width 0.4s cubic-bezier(0.4,0,0.2,1);}
.ex-num{font-family:'DM Mono',monospace;font-size:12px;color:var(--ink3);white-space:nowrap;}

.qcard{background:var(--surface);border:1.5px solid var(--border2);padding:36px;margin-bottom:20px;box-shadow:var(--shadow);}
.q-badge{
  display:inline-block;font-family:'DM Mono',monospace;font-size:10px;letter-spacing:2px;
  text-transform:uppercase;background:var(--bg2);border:1px solid var(--border);
  padding:4px 10px;color:var(--ink3);margin-bottom:20px;
}
.q-text{font-family:'Instrument Sans',sans-serif;font-size:19px;font-weight:600;line-height:1.5;color:var(--ink);margin-bottom:28px;}

/* MCQ */
.opts{display:flex;flex-direction:column;gap:8px;}
.opt{
  display:flex;align-items:flex-start;gap:14px;
  background:var(--bg);border:1.5px solid var(--border2);
  padding:14px 16px;cursor:pointer;transition:all 0.12s;text-align:left;width:100%;
  font-size:15px;font-weight:500;color:var(--ink);
}
.opt:hover:not(.dis){border-color:var(--ink);background:var(--bg2);}
.opt.sel{border-color:var(--ink);background:var(--bg2);}
.opt.ok{border-color:var(--green)!important;background:var(--green-light)!important;}
.opt.ng{border-color:var(--red)!important;background:var(--red-light)!important;}
.opt.dis{cursor:default;}
.opt-l{
  width:28px;height:28px;border:1.5px solid var(--border2);
  display:flex;align-items:center;justify-content:center;
  font-family:'DM Mono',monospace;font-size:12px;flex-shrink:0;
  transition:all 0.12s;color:var(--ink2);
}
.opt.sel .opt-l{border-color:var(--ink);color:var(--ink);}
.opt.ok .opt-l{border-color:var(--green);color:var(--green);}
.opt.ng .opt-l{border-color:var(--red);color:var(--red);}

/* FILL */
.fill-in{
  width:100%;background:var(--bg);border:1.5px solid var(--border2);border-bottom-width:3px;
  color:var(--ink);padding:14px 16px;font-family:'DM Mono',monospace;
  font-size:15px;outline:none;transition:all 0.15s;
}
.fill-in:focus{border-color:var(--ink);}
.fill-in.ok{border-color:var(--green);background:var(--green-light);}
.fill-in.ng{border-color:var(--red);background:var(--red-light);}
.fill-hint{font-family:'DM Mono',monospace;font-size:11px;color:var(--ink3);margin-top:8px;letter-spacing:1px;}

/* ORDER */
.ord-list{display:flex;flex-direction:column;gap:8px;}
.ord-item{
  display:flex;align-items:center;gap:12px;
  background:var(--bg);border:1.5px solid var(--border2);
  padding:12px 16px;cursor:grab;transition:all 0.12s;user-select:none;
}
.ord-item:hover{border-color:var(--ink);}
.ord-n{font-family:'DM Mono',monospace;font-size:12px;color:var(--ink3);width:20px;}
.ord-grip{color:var(--ink3);}

/* FEEDBACK */
.fb{border:1.5px solid;padding:20px 24px;margin-top:20px;animation:fbIn 0.25s ease;}
@keyframes fbIn{from{opacity:0;transform:translateY(8px);}to{opacity:1;transform:translateY(0);}}
.fb.ok-fb{border-color:var(--green);background:var(--green-light);}
.fb.ng-fb{border-color:var(--red);background:var(--red-light);}
.fb-head{font-family:'Syne',sans-serif;font-size:14px;font-weight:800;letter-spacing:1px;text-transform:uppercase;margin-bottom:10px;}
.fb.ok-fb .fb-head{color:var(--green);}
.fb.ng-fb .fb-head{color:var(--red);}
.fb-body{color:var(--ink2);font-size:14px;line-height:1.7;}

/* BUTTONS */
.act-row{display:flex;gap:10px;margin-top:20px;}
.btn-p{
  flex:1;background:var(--ink);color:var(--bg);border:none;
  padding:16px 24px;font-family:'Syne',sans-serif;font-size:16px;font-weight:800;
  letter-spacing:0.5px;cursor:pointer;transition:all 0.15s;
}
.btn-p:hover:not(:disabled){background:var(--red);}
.btn-p:disabled{opacity:0.35;cursor:not-allowed;}
.btn-s{
  background:transparent;border:1.5px solid var(--border2);color:var(--ink2);
  padding:16px 20px;font-family:'DM Mono',monospace;font-size:12px;
  letter-spacing:1px;cursor:pointer;transition:all 0.15s;
}
.btn-s:hover{border-color:var(--ink);color:var(--ink);}

/* COMPLETE */
.complete{text-align:center;padding:64px 24px;max-width:600px;margin:0 auto;}
.c-icon{font-size:64px;margin-bottom:24px;}
.c-title{font-family:'Syne',sans-serif;font-size:clamp(36px,6vw,56px);font-weight:800;letter-spacing:-2px;margin-bottom:8px;}
.c-title em{color:var(--red);font-style:normal;}
.c-sub{color:var(--ink2);font-size:16px;margin-bottom:40px;}
.xp-pill{
  display:inline-flex;align-items:center;gap:10px;
  background:var(--gold-light);border:2px solid var(--gold2);
  color:var(--gold);padding:12px 28px;font-family:'DM Mono',monospace;
  font-size:18px;font-weight:500;margin-bottom:40px;
}
.c-stats{display:flex;gap:20px;justify-content:center;flex-wrap:wrap;margin-bottom:40px;}
.cst{background:var(--surface);border:1.5px solid var(--border2);padding:20px 32px;text-align:center;box-shadow:var(--shadow);}
.cst-v{font-family:'Syne',sans-serif;font-size:36px;font-weight:800;}
.cst-l{font-family:'DM Mono',monospace;font-size:11px;color:var(--ink3);letter-spacing:2px;margin-top:4px;}

/* ANALYTICS */
.analytics{max-width:960px;margin:0 auto;padding:48px 28px 100px;}
.analytics-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px;margin-bottom:40px;}
.metric-card{background:var(--surface);border:1.5px solid var(--border2);padding:24px;box-shadow:var(--shadow);}
.metric-card.accent{border-left:4px solid var(--red);background:var(--red-light);}
.m-label{font-family:'DM Mono',monospace;font-size:11px;color:var(--ink3);letter-spacing:2px;text-transform:uppercase;margin-bottom:8px;}
.m-val{font-family:'Syne',sans-serif;font-size:40px;font-weight:800;color:var(--ink);line-height:1;}
.m-sub{font-family:'DM Mono',monospace;font-size:11px;color:var(--ink3);margin-top:6px;}

.chart-wrap{background:var(--surface);border:1.5px solid var(--border2);padding:28px;margin-bottom:24px;box-shadow:var(--shadow);}
.chart-title{font-family:'Syne',sans-serif;font-size:16px;font-weight:800;margin-bottom:20px;display:flex;align-items:center;justify-content:space-between;}
.chart-sub{font-family:'DM Mono',monospace;font-size:11px;color:var(--ink3);}

.bar-chart{display:flex;flex-direction:column;gap:10px;}
.bar-row{display:flex;align-items:center;gap:12px;}
.bar-label{font-family:'DM Mono',monospace;font-size:11px;color:var(--ink3);width:100px;text-align:right;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.bar-track{flex:1;height:24px;background:var(--bg2);border:1px solid var(--border);overflow:hidden;position:relative;}
.bar-fill{height:100%;transition:width 0.8s cubic-bezier(0.4,0,0.2,1);}
.bar-num{font-family:'DM Mono',monospace;font-size:11px;color:var(--ink3);width:50px;}

.activity-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:4px;}
.act-cell{aspect-ratio:1;border-radius:2px;background:var(--bg2);transition:all 0.2s;}
.act-cell.l1{background:#fde8d8;}
.act-cell.l2{background:#f4a261;}
.act-cell.l3{background:#c0622b;}
.act-cell.l4{background:#7d3811;}

.table-wrap{background:var(--surface);border:1.5px solid var(--border2);overflow:hidden;box-shadow:var(--shadow);}
.tbl{width:100%;border-collapse:collapse;}
.tbl th{background:var(--bg2);border-bottom:1.5px solid var(--border2);padding:12px 16px;text-align:left;font-family:'DM Mono',monospace;font-size:11px;letter-spacing:2px;color:var(--ink3);text-transform:uppercase;}
.tbl td{padding:12px 16px;border-bottom:1px solid var(--border);font-size:14px;color:var(--ink2);}
.tbl tr:last-child td{border-bottom:none;}
.tbl tr:hover td{background:var(--bg2);}
.acc-pill{display:inline-block;padding:3px 10px;font-family:'DM Mono',monospace;font-size:11px;}
.acc-high{background:var(--green-light);color:var(--green);}
.acc-mid{background:var(--gold-light);color:var(--gold);}
.acc-low{background:var(--red-light);color:var(--red);}

/* LEADERBOARD */
.lb-screen{max-width:600px;margin:0 auto;padding:48px 28px 100px;}
.lb-item{display:flex;align-items:center;gap:16px;background:var(--surface);border:1.5px solid var(--border2);padding:16px 20px;margin-bottom:8px;transition:all 0.12s;box-shadow:var(--shadow);}
.lb-item.you{border-color:var(--red);border-width:2px;}
.lb-item:hover{box-shadow:var(--shadow-md);}
.lb-rank{font-family:'Syne',sans-serif;font-size:20px;font-weight:800;width:36px;color:var(--ink3);}
.lb-rank.g{color:var(--gold2);}
.lb-rank.s{color:#888;}
.lb-rank.b{color:var(--orange);}
.lb-name{flex:1;font-weight:600;font-size:15px;}
.lb-xp{font-family:'DM Mono',monospace;font-size:14px;color:var(--gold);}
.lb-badge{font-size:18px;}

/* NAV */
.bot-nav{
  position:fixed;bottom:0;left:0;right:0;background:var(--surface);
  border-top:2px solid var(--ink);display:flex;justify-content:center;
  z-index:100;box-shadow:0 -4px 16px rgba(0,0,0,0.08);
}
.nav-btn{
  flex:1;max-width:140px;padding:14px 8px;text-align:center;cursor:pointer;
  border:none;background:transparent;color:var(--ink3);font-family:'DM Mono',monospace;
  font-size:11px;letter-spacing:1px;text-transform:uppercase;transition:all 0.12s;
  border-top:3px solid transparent;
}
.nav-btn:hover{color:var(--ink2);}
.nav-btn.act{color:var(--red);border-top-color:var(--red);}
.nav-icon{font-size:20px;display:block;margin-bottom:4px;}
.pb{padding-bottom:80px;}


.live-dot{width:8px;height:8px;border-radius:50%;background:var(--green);display:inline-block;margin-right:6px;animation:blink 1.5s ease-in-out infinite;}
@keyframes blink{0%,100%{opacity:1;}50%{opacity:0.3;}}
`;

// ─── MAIN COMPONENT ─────────────────────────────────────────────────
export default function DailyBricks() {
  const [screen, setScreen] = useState("home");
  const [activeZone, setActiveZone] = useState(null);
  const [exercises, setExercises] = useState([]);
  const [exIdx, setExIdx] = useState(0);
  const [selected, setSelected] = useState(null);
  const [fillVal, setFillVal] = useState("");
  const [orderItems, setOrderItems] = useState([]);
  const [answered, setAnswered] = useState(false);
  const [correct, setCorrect] = useState(false);
  const [totalXP, setTotalXP] = useState(0);
  const [streak, setStreak] = useState(4);
  const [zoneProgress, setZoneProgress] = useState({});
  const [sessionCorrect, setSessionCorrect] = useState(0);
  const [sessionXP, setSessionXP] = useState(0);
  const [dragIdx, setDragIdx] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [loaded, setLoaded] = useState(false);

  // Load persisted state
  useEffect(() => {
    (async () => {
      const saved = await loadState();
      if (saved) {
        setTotalXP(saved.totalXP || 0);
        setStreak(saved.streak || 0);
        setZoneProgress(saved.zoneProgress || {});
      }
      const anal = await loadAnalytics();
      if (anal) setAnalytics(anal);
      else setAnalytics(defaultAnalytics());
      setLoaded(true);
    })();
  }, []);

  // Persist state on change
  useEffect(() => {
    if (!loaded) return;
    saveState({ totalXP, streak, zoneProgress });
  }, [totalXP, streak, zoneProgress, loaded]);

  function defaultAnalytics() {
    return {
      totalSessions: 12,
      totalUsers: 47,
      totalAnswers: 310,
      correctAnswers: 241,
      zoneStats: {
        delta: { sessions: 18, correct: 112, total: 144 },
        spark: { sessions: 14, correct: 87, total: 98 },
        unity: { sessions: 10, correct: 54, total: 60 },
        streaming: { sessions: 8, correct: 40, total: 56 },
        perf: { sessions: 6, correct: 28, total: 36 },
        ml: { sessions: 5, correct: 20, total: 25 },
        cert: { sessions: 4, correct: 22, total: 40 },
      },
      dailyActivity: Array.from({length:28}, (_,i) => Math.floor(Math.random()*5)),
      recentSessions: [
        { zone:"Delta Lake", user:"anon_4f2a", acc:87, xp:70, time:"2m ago" },
        { zone:"Cert Mode", user:"anon_9c1d", acc:60, xp:50, time:"14m ago" },
        { zone:"Spark SQL", user:"anon_7b3e", acc:100, xp:70, time:"31m ago" },
        { zone:"Streaming", user:"anon_2a8f", acc:71, xp:50, time:"1h ago" },
        { zone:"Performance", user:"anon_5d1c", acc:83, xp:50, time:"2h ago" },
      ]
    };
  }

  const startZone = useCallback((zone) => {
    const exs = [...(EXERCISES[zone.id] || [])].sort(() => Math.random() - 0.5);
    setActiveZone(zone);
    setExercises(exs);
    setExIdx(0);
    setSelected(null);
    setFillVal("");
    setAnswered(false);
    setCorrect(false);
    setSessionCorrect(0);
    setSessionXP(0);
    if (exs[0]?.type === "order") setOrderItems([...exs[0].items].sort(() => Math.random() - 0.5));
    setScreen("exercise");
  }, []);

  const cur = exercises[exIdx];
  const prog = exercises.length > 0 ? (exIdx / exercises.length) * 100 : 0;

  const checkAnswer = useCallback(() => {
    if (!cur) return;
    let ok = false;
    if (cur.type === "mcq") ok = selected === cur.answer;
    else if (cur.type === "fill") {
      ok = fillVal.trim().toLowerCase().replace(/[^a-z0-9_.]/g,"") ===
           cur.answer.toLowerCase().replace(/[^a-z0-9_.]/g,"");
    } else if (cur.type === "order") {
      ok = orderItems.every((item,i) => cur.answer[i] === cur.items.indexOf(item));
    }
    setAnswered(true);
    setCorrect(ok);
    if (ok) {
      const xp = cur.type === "order" ? 20 : 10;
      setTotalXP(p => p + xp);
      setSessionXP(p => p + xp);
      setSessionCorrect(p => p + 1);
    }
    // Update analytics
    setAnalytics(a => {
      if (!a) return a;
      const next = { ...a,
        totalAnswers: a.totalAnswers + 1,
        correctAnswers: ok ? a.correctAnswers + 1 : a.correctAnswers,
      };
      return next;
    });
  }, [cur, selected, fillVal, orderItems]);

  const nextQ = useCallback(() => {
    if (exIdx + 1 >= exercises.length) {
      setZoneProgress(p => ({
        ...p,
        [activeZone.id]: Math.min(activeZone.total, (p[activeZone.id]||0) + sessionCorrect + (correct?1:0))
      }));
      // Save analytics
      setAnalytics(a => {
        if (!a) return a;
        const z = a.zoneStats[activeZone.id] || { sessions:0, correct:0, total:0 };
        const next = { ...a,
          totalSessions: a.totalSessions + 1,
          zoneStats: { ...a.zoneStats, [activeZone.id]: {
            sessions: z.sessions + 1,
            correct: z.correct + sessionCorrect,
            total: z.total + exercises.length
          }}
        };
        saveAnalytics(next);
        return next;
      });
      setScreen("complete");
    } else {
      const ni = exIdx + 1;
      setExIdx(ni);
      setSelected(null); setFillVal(""); setAnswered(false); setCorrect(false);
      if (exercises[ni]?.type === "order") setOrderItems([...exercises[ni].items].sort(() => Math.random() - 0.5));
    }
  }, [exIdx, exercises, activeZone, correct, sessionCorrect]);

  const handleDragStart = i => setDragIdx(i);
  const handleDragOver = (e, i) => {
    e.preventDefault();
    if (dragIdx === null || dragIdx === i) return;
    const items = [...orderItems];
    const [d] = items.splice(dragIdx, 1);
    items.splice(i, 0, d);
    setOrderItems(items);
    setDragIdx(i);
  };

  const xpPerLevel = 500;
  const level = Math.floor(totalXP / xpPerLevel) + 1;
  const levelPct = (totalXP % xpPerLevel) / xpPerLevel * 100;
  const totalExs = Object.values(EXERCISES).flat().length;
  const completedZones = Object.keys(zoneProgress).length;

  const lbData = [
    { name:"spark_sensei", xp:3800, badge:"⚡" },
    { name:"delta_ninja", xp:3400, badge:"△" },
    { name:"unity_monk", xp:2900, badge:"◈" },
    { name:"You", xp:totalXP, badge:"🧱", you:true },
    { name:"stream_warrior", xp:1200, badge:"≋" },
    { name:"catalog_keeper", xp:980, badge:"◆" },
  ].sort((a,b) => b.xp - a.xp);

  if (!loaded) return (
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",fontFamily:"'DM Mono',monospace",fontSize:13,color:"#9c968d"}}>
      Loading DailyBricks...
    </div>
  );

  const globalAcc = analytics ? Math.round(analytics.correctAnswers / Math.max(1, analytics.totalAnswers) * 100) : 0;

  return (
    <>
      <style>{STYLES}</style>
      <div className="app">

        {/* Deploy modal */}

        {/* Header */}
        <header className="header">
          <div className="logo" onClick={() => setScreen("home")}>
            <div className="logo-mark">DB</div>
            <div>
              <span className="logo-text">Daily<span className="logo-dot">Bricks</span></span>
            </div>
          </div>
          <div className="header-stats">
            <div className="hstat">🔥 <strong>{streak}</strong> streak</div>
            <div className="hstat">⚡ <strong>{totalXP}</strong> XP</div>
            <div className="hstat">Lv <strong>{level}</strong></div>
          </div>
        </header>

        <div className="content pb">

          {/* ── HOME ── */}
          {screen === "home" && (
            <div className="home">
              <div className="hero">
                <div>
                  <div className="hero-label">Databricks · DE Associate · Daily Practice</div>
                  <h1 className="hero-title">5 minutes.<br />Every day.<br /><em>Until it sticks.</em></h1>
                  <p className="hero-body">Stop cramming. Start training. {totalExs} exercises across 7 zones, mapped directly to the DE Associate exam.</p>
                  <button className="hero-cta" onClick={() => startZone(ZONES[0])}>Start Today's Session →</button>
                </div>
                <div className="hero-right">
                  <div className="hr-title">Your progress</div>
                  <div className="streak-row">
                    {[...Array(7)].map((_,i) => <div key={i} className={`streak-pip ${i < streak ? "active":""}`} />)}
                  </div>
                  <div style={{fontFamily:"'DM Mono',monospace",fontSize:11,color:"var(--ink3)",marginBottom:20}}>{streak}-DAY STREAK</div>
                  <div className="level-bar-wrap">
                    <div style={{display:"flex",justifyContent:"space-between",fontFamily:"'DM Mono',monospace",fontSize:11,color:"var(--ink3)",marginBottom:6}}>
                      <span>Level {level}</span><span>{totalXP % xpPerLevel}/{xpPerLevel} XP</span>
                    </div>
                    <div className="level-bar-track"><div className="level-bar-fill" style={{width:`${levelPct}%`}} /></div>
                  </div>
                  <div style={{marginTop:20,display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                    {[["Zones done", completedZones+"/"+ZONES.length],["Total XP", totalXP],["Exercises", totalExs],["Best streak", streak+" days"]].map(([l,v])=>(
                      <div key={l} style={{textAlign:"center",background:"var(--surface)",border:"1px solid var(--border)",padding:"12px 8px"}}>
                        <div style={{fontFamily:"'Syne',sans-serif",fontSize:22,fontWeight:800}}>{v}</div>
                        <div style={{fontFamily:"'DM Mono',monospace",fontSize:10,color:"var(--ink3)",marginTop:3,letterSpacing:1}}>{l.toUpperCase()}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="section-head">
                <span className="section-title">Training Zones</span>
                <span className="section-count">{ZONES.length} zones · {totalExs} exercises</span>
              </div>
              <div className="zones-grid">
                {ZONES.map(zone => {
                  const done = zoneProgress[zone.id] || 0;
                  return (
                    <div key={zone.id} className="zone-card" style={{"--zc":zone.color}} onClick={() => startZone(zone)}>
                      <div className="z-top">
                        <span className="z-icon">{zone.icon}</span>
                        <span className="z-badge">{done}/{zone.total} done</span>
                      </div>
                      <div className="z-name">{zone.name}</div>
                      <div className="z-bar-track"><div className="z-bar-fill" style={{width:`${(done/zone.total)*100}%`}} /></div>
                      <div className="z-meta"><span>{done*10} XP</span><span>{zone.total} questions</span></div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── EXERCISE ── */}
          {screen === "exercise" && cur && (
            <div className="ex-screen">
              <div className="ex-topbar">
                <button className="back-btn" onClick={() => setScreen("home")}>← Exit</button>
                <div className="ex-prog-track" style={{"--zc":activeZone?.color}}>
                  <div className="ex-prog-fill" style={{width:`${prog}%`}} />
                </div>
                <span className="ex-num">{exIdx+1}/{exercises.length}</span>
              </div>

              <div className="qcard">
                <div className="q-badge">{cur.type==="mcq"?"Multiple Choice":cur.type==="fill"?"Fill in the Blank":"Correct Order"}</div>
                <div className="q-text">{cur.question}</div>

                {cur.type==="mcq" && (
                  <div className="opts">
                    {cur.options.map((o,i) => {
                      let cls="opt";
                      if(answered){cls+=" dis"; if(i===cur.answer) cls+=" ok"; else if(i===selected&&selected!==cur.answer) cls+=" ng";}
                      else if(i===selected) cls+=" sel";
                      return (
                        <button key={i} className={cls} onClick={() => !answered && setSelected(i)}>
                          <span className="opt-l">{String.fromCharCode(65+i)}</span>
                          <span>{o}</span>
                        </button>
                      );
                    })}
                  </div>
                )}

                {cur.type==="fill" && (
                  <div>
                    <input className={`fill-in ${answered?(correct?"ok":"ng"):""}`}
                      value={fillVal} onChange={e => !answered&&setFillVal(e.target.value)}
                      onKeyDown={e => e.key==="Enter"&&!answered&&fillVal&&checkAnswer()}
                      placeholder="Type your answer…" disabled={answered} autoFocus />
                    {cur.hint && !answered && <div className="fill-hint">Hint: {cur.hint}</div>}
                    {answered && !correct && <div className="fill-hint" style={{color:"var(--green)",marginTop:8}}>✓ Correct answer: {cur.answer}</div>}
                  </div>
                )}

                {cur.type==="order" && (
                  <div className="ord-list">
                    {orderItems.map((item,i) => (
                      <div key={item} className="ord-item" draggable={!answered}
                        onDragStart={() => handleDragStart(i)}
                        onDragOver={e => handleDragOver(e,i)}
                        onDragEnd={() => setDragIdx(null)}
                        style={{cursor:answered?"default":"grab"}}>
                        <span className="ord-n">{i+1}</span>
                        <span className="ord-grip">⠿</span>
                        <span>{item}</span>
                      </div>
                    ))}
                  </div>
                )}

                {answered && (
                  <div className={`fb ${correct?"ok-fb":"ng-fb"}`}>
                    <div className="fb-head">{correct?"✓ Correct!":"✗ Not quite"}</div>
                    <div className="fb-body">{cur.explanation}</div>
                  </div>
                )}
              </div>

              <div className="act-row">
                {!answered
                  ? <button className="btn-p" onClick={checkAnswer} disabled={cur.type==="mcq"?selected===null:cur.type==="fill"?!fillVal.trim():false}>Check Answer →</button>
                  : <button className="btn-p" onClick={nextQ}>{exIdx+1>=exercises.length?"Finish Session →":"Next →"}</button>
                }
              </div>
              <div style={{marginTop:16,fontFamily:"'DM Mono',monospace",fontSize:11,color:"var(--ink3)",display:"flex",justifyContent:"space-between"}}>
                <span>{activeZone?.name}</span>
                <span>{sessionCorrect} correct this session · {sessionXP} XP earned</span>
              </div>
            </div>
          )}

          {/* ── COMPLETE ── */}
          {screen === "complete" && (
            <div className="complete">
              <div className="c-icon">🧱</div>
              <div className="c-title"><em>{activeZone?.name}</em><br />Complete</div>
              <div className="c-sub">Another brick in the wall. Keep building.</div>
              <div className="xp-pill">⚡ +{sessionXP} XP earned</div>
              <div className="c-stats">
                <div className="cst">
                  <div className="cst-v" style={{color:"var(--green)"}}>{sessionCorrect}</div>
                  <div className="cst-l">Correct</div>
                </div>
                <div className="cst">
                  <div className="cst-v">{exercises.length}</div>
                  <div className="cst-l">Total</div>
                </div>
                <div className="cst">
                  <div className="cst-v" style={{color:"var(--gold)"}}>{Math.round(sessionCorrect/exercises.length*100)}%</div>
                  <div className="cst-l">Accuracy</div>
                </div>
              </div>
              <div style={{display:"flex",gap:12,justifyContent:"center",flexWrap:"wrap"}}>
                <button className="btn-p" style={{maxWidth:200}} onClick={() => startZone(activeZone)}>Train Again</button>
                <button className="btn-s" onClick={() => setScreen("home")}>Back to Home</button>
              </div>
            </div>
          )}

          {/* ── ANALYTICS ── */}
          {screen === "analytics" && analytics && (
            <div className="analytics">
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:32}}>
                <div>
                  <div style={{fontFamily:"'DM Mono',monospace",fontSize:11,letterSpacing:3,color:"var(--red)",textTransform:"uppercase",marginBottom:8}}>
                    <span className="live-dot" />Admin Dashboard
                  </div>
                  <div className="section-title">Usage Analytics</div>
                </div>
              </div>

              <div className="analytics-grid">
                {[
                  {label:"Total Sessions", val:analytics.totalSessions, sub:"all time", accent:true},
                  {label:"Unique Users", val:analytics.totalUsers, sub:"guest mode"},
                  {label:"Questions Answered", val:analytics.totalAnswers, sub:"all zones"},
                  {label:"Global Accuracy", val:globalAcc+"%", sub:`${analytics.correctAnswers} correct`},
                ].map(m => (
                  <div key={m.label} className={`metric-card ${m.accent?"accent":""}`}>
                    <div className="m-label">{m.label}</div>
                    <div className="m-val">{m.val}</div>
                    <div className="m-sub">{m.sub}</div>
                  </div>
                ))}
              </div>

              <div className="chart-wrap">
                <div className="chart-title">
                  Zone Popularity
                  <span className="chart-sub">by sessions</span>
                </div>
                <div className="bar-chart">
                  {ZONES.map(z => {
                    const st = analytics.zoneStats[z.id] || {sessions:0};
                    const maxS = Math.max(...ZONES.map(z2 => (analytics.zoneStats[z2.id]||{}).sessions||0), 1);
                    return (
                      <div key={z.id} className="bar-row">
                        <span className="bar-label">{z.name}</span>
                        <div className="bar-track">
                          <div className="bar-fill" style={{width:`${st.sessions/maxS*100}%`, background:z.color}} />
                        </div>
                        <span className="bar-num">{st.sessions} sessions</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="chart-wrap">
                <div className="chart-title">
                  Zone Accuracy
                  <span className="chart-sub">correct / total answers</span>
                </div>
                <div className="bar-chart">
                  {ZONES.map(z => {
                    const st = analytics.zoneStats[z.id] || {correct:0,total:1};
                    const acc = Math.round(st.correct / Math.max(1,st.total) * 100);
                    return (
                      <div key={z.id} className="bar-row">
                        <span className="bar-label">{z.name}</span>
                        <div className="bar-track">
                          <div className="bar-fill" style={{width:`${acc}%`, background: acc>=80?"var(--green)":acc>=60?"var(--gold2)":"var(--red)"}} />
                        </div>
                        <span className="bar-num">{acc}%</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="chart-wrap">
                <div className="chart-title">
                  Activity (last 28 days)
                  <span className="chart-sub">sessions per day</span>
                </div>
                <div className="activity-grid">
                  {analytics.dailyActivity.map((v,i) => (
                    <div key={i} className={`act-cell ${v===0?"":v<2?"l1":v<3?"l2":v<4?"l3":"l4"}`} title={`${v} sessions`} />
                  ))}
                </div>
              </div>

              <div style={{marginBottom:16}}>
                <div className="section-head"><span className="section-title">Recent Sessions</span></div>
                <div className="table-wrap">
                  <table className="tbl">
                    <thead><tr><th>Zone</th><th>User</th><th>Accuracy</th><th>XP</th><th>When</th></tr></thead>
                    <tbody>
                      {analytics.recentSessions.map((s,i) => (
                        <tr key={i}>
                          <td style={{fontWeight:600}}>{s.zone}</td>
                          <td style={{fontFamily:"'DM Mono',monospace",fontSize:12}}>{s.user}</td>
                          <td><span className={`acc-pill ${s.acc>=80?"acc-high":s.acc>=60?"acc-mid":"acc-low"}`}>{s.acc}%</span></td>
                          <td style={{fontFamily:"'DM Mono',monospace",color:"var(--gold)"}}>{s.xp}</td>
                          <td style={{fontFamily:"'DM Mono',monospace",fontSize:11,color:"var(--ink3)"}}>{s.time}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ── LEADERBOARD ── */}
          {screen === "leaderboard" && (
            <div className="lb-screen">
              <div style={{fontFamily:"'DM Mono',monospace",fontSize:11,letterSpacing:3,color:"var(--red)",textTransform:"uppercase",marginBottom:12}}>Weekly Rankings</div>
              <div className="section-title" style={{marginBottom:28}}>Leaderboard</div>
              {lbData.map((row,i) => {
                const rankCls = i===0?"g":i===1?"s":i===2?"b":"";
                return (
                  <div key={row.name} className={`lb-item ${row.you?"you":""}`}>
                    <span className={`lb-rank ${rankCls}`}>#{i+1}</span>
                    <span className="lb-badge">{row.badge}</span>
                    <span className="lb-name">{row.name}</span>
                    <span className="lb-xp">{row.xp} XP</span>
                  </div>
                );
              })}
              <div style={{marginTop:24,fontFamily:"'DM Mono',monospace",fontSize:11,color:"var(--ink3)",textAlign:"center",letterSpacing:1}}>
                Resets every Monday · {lbData.length} engineers training this week
              </div>
            </div>
          )}

        </div>

        {/* Bottom nav */}
        <nav className="bot-nav">
          {[
            {id:"home",icon:"⬡",label:"Train"},
            {id:"analytics",icon:"◎",label:"Analytics"},
            {id:"leaderboard",icon:"△",label:"Ranks"},
          ].map(n => (
            <button key={n.id} className={`nav-btn ${(screen===n.id||(n.id==="home"&&["exercise","complete"].includes(screen)))?"act":""}`} onClick={() => setScreen(n.id)}>
              <span className="nav-icon">{n.icon}</span>{n.label}
            </button>
          ))}
        </nav>
      </div>
    </>
  );
}
