/**
 * Timer manager with optional Redis persistence
 * - If REDIS_URL present, uses ioredis to persist timers
 * - emits via provided io instance
 * - simple structure: timers stored as JSON in Redis key "timers:{id}"
 *
 * Note: persistence is minimal — timers are reconstructed on server start only if Redis present.
 * For production: you may want a more robust scheduler (BullMQ, Agenda, etc.)
 */

const Redis = require('ioredis');

let redisClient = null;

function createTimerManager({ io, redisUrl }) {
  const useRedis = Boolean(redisUrl);
  if (useRedis) {
    redisClient = new Redis(redisUrl);
    redisClient.on('error', (e) => console.error('Redis error', e));
  }

  let counter = 0;
  const timers = {}; // in-memory: id -> { secondsLeft, intervalId }

  // Try to restore timers from Redis (basic)
  async function restoreFromRedis() {
    if (!useRedis) return;
    try {
      const keys = await redisClient.keys('timer:*');
      for (const k of keys) {
        const raw = await redisClient.get(k);
        if (!raw) continue;
        const parsed = JSON.parse(raw);
        if (parsed?.id && parsed?.secondsLeft > 0) {
          // start interval
          startLocalTimer(parsed.id, parsed.secondsLeft);
        }
      }
      console.log('Timer manager: restored timers from Redis');
    } catch (err) {
      console.error('Failed to restore timers from Redis', err);
    }
  }

  function persistTimerToRedis(id) {
    if (!useRedis) return;
    const t = timers[id];
    if (!t) return;
    redisClient.set(`timer:${id}`, JSON.stringify({ id, secondsLeft: t.secondsLeft }));
  }

  function removeTimerFromRedis(id) {
    if (!useRedis) return;
    redisClient.del(`timer:${id}`).catch((e) => console.warn('redis del error', e));
  }

  function startLocalTimer(id, secondsLeft) {
    if (timers[id]) clearInterval(timers[id].intervalId);
    const timer = { secondsLeft, intervalId: null };
    timer.intervalId = setInterval(() => {
      timer.secondsLeft -= 1;
      io.emit('timer:update', { id, secondsLeft: timer.secondsLeft });
      persistTimerToRedis(id);

      if (timer.secondsLeft <= 0) {
        clearInterval(timer.intervalId);
        io.emit('timer:done', { id });
        delete timers[id];
        removeTimerFromRedis(id);
      }
    }, 1000);
    timers[id] = timer;
    io.emit('timer:started', { id, secondsLeft: timer.secondsLeft });
    persistTimerToRedis(id);
    return id;
  }

  function startTimer(seconds) {
    const id = ++counter;
    startLocalTimer(id, seconds);
    return id;
  }

  function stopTimer(id) {
    const t = timers[id];
    if (!t) return;
    clearInterval(t.intervalId);
    delete timers[id];
    removeTimerFromRedis(id);
    io.emit('timer:stopped', { id });
  }

  function listTimers() {
    return Object.entries(timers).map(([id, t]) => ({ id: Number(id), secondsLeft: t.secondsLeft }));
  }

  async function shutdown() {
    // clear intervals
    Object.values(timers).forEach((t) => clearInterval(t.intervalId));
    if (redisClient) {
      try {
        await redisClient.quit();
      } catch (err) {
        console.warn('redis quit error', err);
      }
    }
  }

  // initialize: optionally restore
  (async () => { await restoreFromRedis(); })();

  return { startTimer, stopTimer, listTimers, shutdown };
}

module.exports = { createTimerManager };
