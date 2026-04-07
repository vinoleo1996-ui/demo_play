import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import { WebSocketServer, WebSocket } from "ws";
import http from "http";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Create HTTP server to attach WebSocket server
  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: "/ws" });

  wss.on("connection", (ws) => {
    console.log("Client connected to WebSocket");

    // Optional: Connect to Python GPU Engine (if running on 4090)
    // const pythonWs = new WebSocket("ws://localhost:8000/ws");
    
    ws.on("message", (message) => {
      try {
        const data = JSON.parse(message.toString());
        
        if (data.type === "frame") {
          // ------------------------------------------------------------------
          // 4090 终局架构：
          // 在本地部署时，将接收到的 base64 帧转发给 Python GPU 推理引擎
          // if (pythonWs.readyState === WebSocket.OPEN) {
          //   pythonWs.send(message);
          // }
          // ------------------------------------------------------------------

          // 这里为了保证预览环境不崩溃，提供一个 Mock 返回
          // 实际在 4090 上，由 Python 引擎返回 InsightFace/YOLO-Pose 的真实数据
          const mockResponse = {
            type: "inference_result",
            faces: [], // e.g., [{ box: [x, y, w, h], name: "User", emotion: "neutral" }]
            pose: "none",
            gesture: "none"
          };
          ws.send(JSON.stringify(mockResponse));
        }
      } catch (error) {
        console.error("WebSocket message error:", error);
      }
    });

    ws.on("close", () => {
      console.log("Client disconnected");
    });
  });

  // API routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
