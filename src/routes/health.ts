import express from "express";
import { PrismaClient } from "@prisma/client";
import { connectRabbitMQ } from "../utils/rabbitmq";

const router = express.Router();
const prisma = new PrismaClient();

/**
 * GET /health - Basic health check
 */
router.get("/", async (req: express.Request, res: express.Response) => {
  try {
    const healthCheck = {
      status: "healthy",
      timestamp: new Date().toISOString(),
      service: "auth-service",
      version: process.env.SERVICE_VERSION || "1.0.0",
      uptime: process.uptime()
    };

    res.status(200).json(healthCheck);
  } catch (error) {
    res.status(500).json({
      status: "unhealthy",
      timestamp: new Date().toISOString(),
      service: "auth-service",
      error: "Health check failed"
    });
  }
});

/**
 * GET /health/detailed - Detailed health check
 */
router.get("/detailed", async (req: express.Request, res: express.Response) => {
  const checks = {
    timestamp: new Date().toISOString(),
    service: "auth-service",
    version: process.env.SERVICE_VERSION || "1.0.0",
    uptime: process.uptime(),
    status: "healthy" as string,
    checks: {
      database: { status: "unknown" as string, error: undefined as string | undefined },
      rabbitmq: { status: "unknown" as string, error: undefined as string | undefined }
    }
  };

  try {
    // Database check
    try {
      await prisma.user.count();
      checks.checks.database = { status: "healthy", error: undefined };
    } catch (dbError) {
      checks.checks.database = { 
        status: "unhealthy", 
        error: "Database connection failed" 
      };
      checks.status = "unhealthy";
    }

    // RabbitMQ check
    try {
      await connectRabbitMQ();
      checks.checks.rabbitmq = { status: "healthy", error: undefined };
    } catch (mqError) {
      checks.checks.rabbitmq = { 
        status: "unhealthy", 
        error: "RabbitMQ connection failed" 
      };
      checks.status = "unhealthy";
    }

    const statusCode = checks.status === "healthy" ? 200 : 503;
    res.status(statusCode).json(checks);
  } catch (error) {
    checks.status = "unhealthy";
    res.status(503).json(checks);
  }
});

/**
 * GET /health/ready - Readiness probe
 */
router.get("/ready", async (req: express.Request, res: express.Response) => {
  try {
    // Check if service is ready to accept requests
    await prisma.user.count();
    await connectRabbitMQ();
    
    res.status(200).json({
      status: "ready",
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(503).json({
      status: "not ready",
      timestamp: new Date().toISOString(),
      error: "Service dependencies not available"
    });
  }
});

/**
 * GET /health/live - Liveness probe
 */
router.get("/live", (req: express.Request, res: express.Response) => {
  res.status(200).json({
    status: "alive",
    timestamp: new Date().toISOString()
  });
});

export default router;