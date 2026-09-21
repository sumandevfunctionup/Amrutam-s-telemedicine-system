import { Redis } from '@upstash/redis';
import dotenv from 'dotenv';
dotenv.config();

const url = process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN;

console.log('Testing Upstash Redis Connection...');
console.log('URL:', url);
console.log('Token length:', token ? token.length : 0);

const redis = new Redis({
  url,
  token,
});

async function test() {
  try {
    const pingResult = await redis.ping();
    console.log('PING Response:', pingResult);

    await redis.set('amrutam:test:health', 'ok', { ex: 60 });
    const val = await redis.get('amrutam:test:health');
    console.log('SET/GET Response:', val);

    await redis.del('amrutam:test:health');
    console.log('DEL Response: key deleted successfully');
    console.log('SUCCESS: Upstash Redis connection verified!');
  } catch (err) {
    console.error('Redis connection failed:', err);
    process.exit(1);
  }
}

test();
