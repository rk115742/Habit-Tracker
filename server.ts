import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import { GoogleGenAI } from "@google/genai";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const db = new Database("habits.db");

// Initialize Database
db.exec(`
  CREATE TABLE IF NOT EXISTS habits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    frequency TEXT DEFAULT 'daily',
    start_date TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    habit_id INTEGER NOT NULL,
    date TEXT NOT NULL,
    status INTEGER DEFAULT 0, -- 0 for not done, 1 for done
    UNIQUE(habit_id, date),
    FOREIGN KEY (habit_id) REFERENCES habits(id) ON DELETE CASCADE
  );
`);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Routes
  app.get("/api/habits", (req, res) => {
    const habits = db.prepare("SELECT * FROM habits").all();
    res.json(habits);
  });

  app.post("/api/habits", (req, res) => {
    const { name, description, frequency, start_date } = req.body;
    const info = db.prepare("INSERT INTO habits (name, description, frequency, start_date) VALUES (?, ?, ?, ?)")
      .run(name, description, frequency, start_date);
    res.json({ id: info.lastInsertRowid });
  });

  app.delete("/api/habits/:id", (req, res) => {
    db.prepare("DELETE FROM habits WHERE id = ?").run(req.params.id);
    res.json({ success: true });
  });

  app.get("/api/logs", (req, res) => {
    const logs = db.prepare("SELECT * FROM logs").all();
    res.json(logs);
  });

  app.post("/api/logs", (req, res) => {
    const { habit_id, date, status } = req.body;
    db.prepare(`
      INSERT INTO logs (habit_id, date, status) 
      VALUES (?, ?, ?)
      ON CONFLICT(habit_id, date) DO UPDATE SET status = excluded.status
    `).run(habit_id, date, status);
    res.json({ success: true });
  });

  app.get("/api/analytics/summary", async (req, res) => {
    try {
      if (!process.env.GEMINI_API_KEY) {
        return res.status(500).json({ error: "Gemini API key not configured" });
      }

      const habits = db.prepare("SELECT * FROM habits").all();
      const logs = db.prepare("SELECT * FROM logs").all();

      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const model = ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Analyze these habit tracking logs and provide a concise, encouraging summary (max 100 words). 
        Habits: ${JSON.stringify(habits)}
        Logs: ${JSON.stringify(logs)}
        Focus on consistency, streaks, and areas for improvement.`,
      });

      const response = await model;
      res.json({ summary: response.text });
    } catch (error) {
      console.error("AI Summary Error:", error);
      res.status(500).json({ error: "Failed to generate AI summary" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
