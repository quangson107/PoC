import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import axios from "axios";

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Use JSON middleware
  app.use(express.json());

  // API proxy route
  app.post("/api/dnse", async (req, res) => {
    try {
      const response = await axios.post("https://api.dnse.com.vn/price-api/query", req.body, {
        headers: {
          "Accept": "application/json, text/plain, */*",
          "Content-Type": "application/json",
          "origin": "https://banggia.dnse.com.vn",
          "referer": "https://banggia.dnse.com.vn/",
          "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36"
        }
      });
      res.json(response.data);
    } catch (error: any) {
      console.error("Error communicating with DNSE API:", error.message);
      res.status(500).json({ error: "Failed to fetch from DNSE API" });
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
    // In production, Vite produces its output in dist
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
