import { initializeApp } from "firebase/app";
import {
  getFirestore,
  doc, getDoc, setDoc, updateDoc, increment,
  collection, addDoc, getDocs, query, orderBy, limit,
  serverTimestamp, onSnapshot
} from "firebase/firestore";

// ─── CONFIG ──────────────────────────────────────────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyAFZmR2G3WLDBQPBJz7a-FvsTUnzULSIXA",
  authDomain: "dailybricks-app.firebaseapp.com",
  projectId: "dailybricks-app",
  storageBucket: "dailybricks-app.firebasestorage.app",
  messagingSenderId: "639988463379",
  appId: "1:639988463379:web:598784b8d1a73de356cce6"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// ─── ANONYMOUS USER ID ────────────────────────────────────────────────
// Each browser gets a persistent anonymous ID stored in localStorage
export function getAnonId() {
  const key = "db-anon-id";
  let id = localStorage.getItem(key);
  if (!id) {
    id = "anon_" + Math.random().toString(36).slice(2, 9) + Date.now().toString(36);
    localStorage.setItem(key, id);
  }
  return id;
}

// ─── USER DOCUMENT ────────────────────────────────────────────────────
// users/{userId} → { totalPts, streak, dailyPts, topicProgress, topicAccuracy, exercisesCompleted, updatedAt }

export async function getUserDoc(userId) {
  try {
    const ref = doc(db, "users", userId);
    const snap = await getDoc(ref);
    return snap.exists() ? snap.data() : null;
  } catch (e) { console.error("getUserDoc:", e); return null; }
}

export async function upsertUserDoc(userId, data) {
  try {
    const ref = doc(db, "users", userId);
    await setDoc(ref, { ...data, updatedAt: serverTimestamp() }, { merge: true });
  } catch (e) { console.error("upsertUserDoc:", e); }
}

// ─── SESSION WRITE ────────────────────────────────────────────────────
// sessions/{auto-id} → { userId, topics, difficulty, correct, total, pts, createdAt }

export async function writeSession(userId, sessionData) {
  try {
    await addDoc(collection(db, "sessions"), {
      userId,
      ...sessionData,
      createdAt: serverTimestamp()
    });
  } catch (e) { console.error("writeSession:", e); }
}

// ─── GLOBAL ANALYTICS ────────────────────────────────────────────────
// analytics/global → { totalSessions, totalAnswers, correctAnswers, zoneStats:{} }

export async function incrementAnalytics(sessionData) {
  try {
    const ref = doc(db, "analytics", "global");
    const updates = {
      totalSessions: increment(1),
      totalAnswers: increment(sessionData.total || 0),
      correctAnswers: increment(sessionData.correct || 0),
    };
    // Increment per-topic session count
    if (sessionData.topics) {
      sessionData.topics.forEach(t => {
        updates[`zoneStats.${t}.sessions`] = increment(1);
      });
    }
    if (sessionData.topicCorrect) {
      Object.entries(sessionData.topicCorrect).forEach(([t, v]) => {
        updates[`zoneStats.${t}.correct`] = increment(v.correct || 0);
        updates[`zoneStats.${t}.total`] = increment(v.total || 0);
      });
    }
    await setDoc(ref, updates, { merge: true });
  } catch (e) { console.error("incrementAnalytics:", e); }
}

export async function getGlobalAnalytics() {
  try {
    const snap = await getDoc(doc(db, "analytics", "global"));
    return snap.exists() ? snap.data() : null;
  } catch (e) { console.error("getGlobalAnalytics:", e); return null; }
}

// ─── LEADERBOARD ─────────────────────────────────────────────────────
// Reads top 20 users by totalPts, returns sorted array

export async function getLeaderboard() {
  try {
    const q = query(collection(db, "users"), orderBy("totalPts", "desc"), limit(20));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (e) { console.error("getLeaderboard:", e); return []; }
}

// Live leaderboard listener (real-time updates)
export function subscribeLeaderboard(callback) {
  try {
    const q = query(collection(db, "users"), orderBy("totalPts", "desc"), limit(20));
    return onSnapshot(q, snap => {
      const rows = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      callback(rows);
    });
  } catch (e) { console.error("subscribeLeaderboard:", e); return () => {}; }
}

// Live analytics listener
export function subscribeAnalytics(callback) {
  try {
    return onSnapshot(doc(db, "analytics", "global"), snap => {
      if (snap.exists()) callback(snap.data());
    });
  } catch (e) { console.error("subscribeAnalytics:", e); return () => {}; }
}

export { db };
