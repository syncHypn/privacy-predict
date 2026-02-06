export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startFlushLoop } = await import("./lib/flush-service");
    startFlushLoop();
  }
}
