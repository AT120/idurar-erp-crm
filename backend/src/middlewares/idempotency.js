function idempotencyMiddleware(redis, options = {}) {
  const {
    ttlSeconds = 60 * 60,
    lockTimeoutMs = 5000,
  } = options;

  return async function(req, res, next) {
    const key = req.header("Idempotency-Key");
    if (!key) {
      console.log("no key found, skipping a request");
      return next();
    }
    console.log("processing request with a key", key);

    const redisKey = `idem:${key}`;
    const lockKey = `${redisKey}:lock`;

    const cached = await redis.get(redisKey);
    if (cached) {
      const parsed = JSON.parse(cached);
      res.status(parsed.status);
      return res.json(parsed.body);
    }

    const lock = await redis.set(lockKey, "1", "NX", "PX", lockTimeoutMs);

    if (!lock) {
      return res.status(409).json({
        success: false,
        error: "Request already in progress",
      });
    }

    const originalSend = res.send.bind(res);

    const finalize = async (body) => {
      const payload = {
        status: res.statusCode,
        body,
      };

      await redis.set(redisKey, JSON.stringify(payload), "EX", ttlSeconds);
      await redis.del(lockKey);
    };

    res.send = async (body) => {
      await finalize(body);
      return originalSend(body);
    };

    try {
      next();
    } catch (err) {
      await redis.del(lockKey);
      throw err;
    }
  };
}

export default idempotencyMiddleware;
