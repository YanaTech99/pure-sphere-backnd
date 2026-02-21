import { createClient } from "redis";
import dotenv from "dotenv";

dotenv.config();
const redis = process.env.REDIS_URL
  ? createClient({ url: process.env.REDIS_URL })
  : null;

if (redis) {
  redis.on("error", (err) => console.error("Redis Error", err));
}

export default redis;
