import amqp, { Connection, Channel } from "amqplib/callback_api";
import config from '../config';

let channel: Channel | null = null;
let connection: Connection | null = null;

export async function connectRabbitMQ(retries = 5, delay = 5000): Promise<Channel> {
  if (channel) return channel;

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      // Use config for RabbitMQ URL
      const rabbitmqUrl = config.rabbitmqUrl;
      
      console.log(`🔗 Connecting to RabbitMQ at: ${rabbitmqUrl.replace(/\/\/.*@/, '//***:***@')} (attempt ${attempt}/${retries})`);
      
      // Connect using callback API with promisify
      connection = await new Promise<Connection>((resolve, reject) => {
        amqp.connect(rabbitmqUrl, (error0, connection) => {
          if (error0) {
            reject(error0);
            return;
          }
          resolve(connection);
        });
      });
      
      // Create channel
      channel = await new Promise<Channel>((resolve, reject) => {
        connection!.createChannel((error1, channel) => {
          if (error1) {
            reject(error1);
            return;
          }
          resolve(channel);
        });
      });

      console.log("✅ Connected to RabbitMQ");
      
      // Handle connection events
      connection.on('close', (err) => {
        console.warn('⚠️ RabbitMQ connection closed', err ? err.message : '');
        channel = null;
        connection = null;
      });

      connection.on('error', (err) => {
        console.error('❌ RabbitMQ connection error:', err.message);
        channel = null;
        connection = null;
      });

      return channel;
    } catch (error) {
      lastError = error as Error;
      console.error(`❌ Failed to connect to RabbitMQ (attempt ${attempt}/${retries}):`, error);
      
      if (attempt === retries) {
        console.error('❌ All RabbitMQ connection attempts failed');
        channel = null;
        connection = null;
        throw lastError;
      }
      
      console.log(`⏳ Retrying RabbitMQ connection in ${delay/1000} seconds...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError || new Error('Failed to connect to RabbitMQ after all retries');
}

export async function publishEvent(queue: string, message: any) {
  try {
    const ch = await connectRabbitMQ();
    await new Promise<void>((resolve, reject) => {
      ch.assertQueue(queue, { durable: true }, (error0, ok) => {
        if (error0) {
          reject(error0);
          return;
        }
        
        const sent = ch.sendToQueue(queue, Buffer.from(JSON.stringify(message)), {
          persistent: true,
        });
        
        if (sent) {
          console.log(`📤 Published to [${queue}]:`, message);
          resolve();
        } else {
          reject(new Error('Failed to send message to queue'));
        }
      });
    });
  } catch (error) {
    console.error(`❌ Failed to publish to [${queue}]:`, error);
    throw error;
  }
}

export async function consumeEvents(queue: string, handler: (msg: any) => void) {
  try {
    const ch = await connectRabbitMQ();
    
    await new Promise<void>((resolve, reject) => {
      ch.assertQueue(queue, { durable: true }, (error0, ok) => {
        if (error0) {
          reject(error0);
          return;
        }

        ch.consume(queue, (msg) => {
          if (msg) {
            try {
              const content = JSON.parse(msg.content.toString());
              console.log(`📥 Received from [${queue}]:`, content);
              handler(content);
              ch.ack(msg);
            } catch (parseError) {
              console.error(`❌ Failed to parse message from [${queue}]:`, parseError);
              ch.nack(msg, false, false); // Reject and don't requeue
            }
          }
        }, { noAck: false }, (error1, ok) => {
          if (error1) {
            reject(error1);
            return;
          }
          console.log(`👂 Listening on [${queue}]`);
          resolve();
        });
      });
    });
  } catch (error) {
    console.error(`❌ Failed to consume from [${queue}]:`, error);
    throw error;
  }
}

// Add graceful shutdown function
export async function closeRabbitMQ(): Promise<void> {
  try {
    if (channel) {
      await new Promise<void>((resolve, reject) => {
        channel!.close((err) => {
          if (err) reject(err);
          else resolve();
        });
      });
      channel = null;
    }
    
    if (connection) {
      await new Promise<void>((resolve, reject) => {
        connection!.close((err) => {
          if (err) reject(err);
          else resolve();
        });
      });
      connection = null;
    }
    
    console.log("✅ RabbitMQ connection closed gracefully");
  } catch (error) {
    console.error("❌ Error closing RabbitMQ connection:", error);
    throw error;
  }
}
