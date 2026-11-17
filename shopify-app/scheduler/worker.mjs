const endpoint = 'https://corys32.sg-host.com/internal/worker/tick';
const schedule = '* * * * *';

export async function dispatchWorkerTick(env, send = globalThis.fetch) {
  const secret = env.PIT_WORKER_SECRET;
  if (typeof secret !== 'string' || !/^[a-f0-9]{64}$/.test(secret)) {
    throw new Error('Scheduler credential missing or invalid');
  }

  let response;
  try {
    response = await send(endpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${secret}`, Accept: 'application/json' },
      redirect: 'error',
      signal: AbortSignal.timeout(90_000),
    });
  } catch {
    throw new Error('Scheduler could not reach the app');
  }

  if (response.status !== 200 || response.redirected) {
    await response.body?.cancel().catch(() => {});
    throw new Error(`App did not complete the scheduled tick (HTTP ${response.status})`);
  }
  if (!/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type') ?? '')) {
    await response.body?.cancel().catch(() => {});
    throw new Error('App returned an unexpected scheduler response');
  }
  const result = await response.json().catch(() => null);
  if (result?.outcome !== 'completed' && result?.outcome !== 'already-completed') {
    throw new Error('App did not confirm scheduler completion');
  }
  return result.outcome;
}

export default {
  fetch() {
    return new Response(null, { status: 404 });
  },
  async scheduled(event, env) {
    if (event.cron !== schedule) throw new Error('Unexpected cron schedule');
    const outcome = await dispatchWorkerTick(env);
    console.info('Place in Thyme scheduler:', outcome);
  },
};
