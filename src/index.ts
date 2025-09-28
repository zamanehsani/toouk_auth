import express from "express";
import dotenv from "dotenv";

// Load environment variables
dotenv.config({ path: '.env' });

console.log("starting the auth service.")
const app = express();

app.get("/", (req: express.Request, res: express.Response) => {
  console.log("Request received", req.body);
  res.send("Hello, World!, Auth Service");
});

// Health check endpoint for Docker
app.get("/health", (req: express.Request, res: express.Response) => {
  res.status(200).json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    service: "auth-service",
    port: process.env.PORT
  });
});

const PORT: number = parseInt(process.env.PORT || '3001', 10);

console.log('Environment PORT:', process.env.PORT);
console.log('Resolved PORT:', PORT);

app.listen(PORT, () => {
  console.log(`Auth Server is running on port ${PORT}`);
});

