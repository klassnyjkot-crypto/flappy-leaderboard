// Simple leaderboard server for Render + Postgres
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
app.use(cors());
app.use(express.json());

// Read DATABASE_URL from environment (Render provides this from Postgres add-on)
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('ERROR: Please set DATABASE_URL environment variable (Postgres connection).');
  process.exit(1);
}

// On Render, Postgres often requires SSL rejectUnauthorized false
const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false }
});

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS scores (
      token TEXT PRIMARY KEY,
      name TEXT,
      best_score INTEGER NOT NULL,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
    );
  `);
}
initDb().catch(err => { console.error('DB init error', err); process.exit(1); });

// Health
app.get('/', (req, res) => res.send({ ok: true, version: '1.0' }));

// POST /score
// body: { token: string, score: number, name?: string }
// Saves the score and ensures best_score is updated only if new is higher.
app.post('/score', async (req, res) => {
  try {
    const { token, score, name } = req.body;
    if (!token || typeof score !== 'number') return res.status(400).json({ error: 'token and numeric score required' });

    const result = await pool.query(
      `INSERT INTO scores(token, name, best_score, updated_at)
       VALUES ($1, $2, $3, now())
       ON CONFLICT (token)
       DO UPDATE SET
         best_score = GREATEST(scores.best_score, EXCLUDED.best_score),
         name = COALESCE(EXCLUDED.name, scores.name),
         updated_at = now()
       RETURNING best_score;`,
      [token, name || null, score]
    );

    return res.json({ ok: true, best: result.rows[0].best_score });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'internal' });
  }
});

// Compatibility: POST /record behaves like /score (older client versions may call /record)
app.post('/record', (req, res) => app._router.handle(req, res, () => {}, 'POST', '/score'));

// GET /leaders?limit=10
app.get('/leaders', async (req, res) => {
  try {
    const limit = Math.min(100, Number(req.query.limit) || 10);
    const q = await pool.query(
      `SELECT token, name, best_score
       FROM scores
       ORDER BY best_score DESC, updated_at ASC
       LIMIT $1`,
      [limit]
    );
    res.json(q.rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'internal' });
  }
});

// GET /me?token=...
app.get('/me', async (req, res) => {
  try {
    const token = req.query.token;
    if (!token) return res.status(400).json({ error: 'token required' });
    const q = await pool.query(`SELECT token, name, best_score FROM scores WHERE token = $1`, [token]);
    if (!q.rows.length) return res.json({ token, best_score: 0 });
    res.json(q.rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'internal' });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Leaderboard API listening on ${port}`);
});
