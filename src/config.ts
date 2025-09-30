import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

export const config = {
  // Server Configuration
  port: process.env.PORT || '3001',
  nodeEnv: process.env.NODE_ENV || 'development',
  
  // Database Configuration
  databaseUrl: process.env.DATABASE_URL || 'postgresql://auth_admin:secure_password_123@localhost:5432/auth_db',
  
  // RabbitMQ Configuration
  rabbitmqUrl: process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672',
  
  // AWS S3 Configuration (if used)
  aws: {
    region: process.env.AWS_REGION || 'us-east-1',
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    bucketName: process.env.S3_BUCKET_NAME,
  },
  
  // JWT Configuration (if used for auth)
  jwt: {
    secret: process.env.JWT_SECRET || 'fallback-secret-key-for-development',
    expiresIn: process.env.JWT_EXPIRES_IN || '24h',
  },
};

export default config;