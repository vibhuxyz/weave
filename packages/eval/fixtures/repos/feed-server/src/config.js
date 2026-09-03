/** Runtime configuration, read from the environment with defaults. */
export function loadConfig(env = process.env) {
  return {
    server: {
      // Port 0 asks the OS for any free port. Handy in tests and in CI, where
      // a fixed port collides with whatever else is running.
      port: Number(env.PORT ?? 0),
      host: env.HOST ?? "127.0.0.1",
    },
    feed: {
      title: env.FEED_TITLE ?? "Updates",
      pageSize: Number(env.PAGE_SIZE ?? 20),
    },
  };
}
