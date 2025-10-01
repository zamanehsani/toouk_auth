import express from "express";
import cors from "cors";
import { authRoutes } from "./routes/authRoutes";
import healthRouter from "./routes/health";
import { startEventConsumers } from "./queue/consumer";
import { connectRabbitMQ, closeRabbitMQ } from "./utils/rabbitmq";  
import { authJobs } from "./workers/authJobs";

const app = express();
const PORT = parseInt(process.env.PORT || '3001', 10);

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use("/health", healthRouter);
app.use("/auth", authRoutes);

// Root endpoint
app.get("/", (req, res) => {
  res.json({
    service: "Auth Service",
    version: "1.0.0",
    status: "running",
    timestamp: new Date().toISOString()
  });
});

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error("Error:", err);
  res.status(500).json({
    error: "Internal server error",
    timestamp: new Date().toISOString()
  });
});

// 404 handler - catch all unmatched routes
app.use((req, res) => {
  res.status(404).json({
    error: "Route not found",
    path: req.originalUrl,
    timestamp: new Date().toISOString()
  });
});


async function startServer() {
  try {
    console.log("Starting server and connecting to RabbitMQ...");
    await connectRabbitMQ();
    console.log("Connected to RabbitMQ");

    // Start event consumers
    await startEventConsumers();
    
    // Schedule recurring jobs (in production, use a proper job scheduler)
    setInterval(async () => {
      try {
        await authJobs.cleanupExpiredSessions();
      } catch (error) {
        console.error("Job failed:", error);
      }
    }, 60 * 60 * 1000); // Every hour

    setInterval(async () => {
      try {
        await authJobs.generateAuthStats();
      } catch (error) {
        console.error("Job failed:", error);
      }
    }, 24 * 60 * 60 * 1000); // Every 24 hours

     // Start Express server
    app.listen(PORT, () => {
      console.log(`🚀 Auth Service running on port ${PORT}`);
      console.log(`📊 Health check: http://localhost:${PORT}/health`);
      console.log(`🔐 Auth endpoints: http://localhost:${PORT}/auth`);
    });

  }catch(error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down gracefully...');
  try {
    await closeRabbitMQ();
    console.log('✅ RabbitMQ connection closed');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error during shutdown:', error);
    process.exit(1);
  }
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Received SIGTERM, shutting down gracefully...');
  try {
    await closeRabbitMQ();
    console.log('✅ RabbitMQ connection closed');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error during shutdown:', error);
    process.exit(1);
  }
});

// Start the server
startServer();