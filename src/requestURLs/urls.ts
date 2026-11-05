const TEST_WORKER_URL = 'https://tabworker-test.tabyrinth.workers.dev';
const LIVE_WORKER_URL = 'https://tabworker.tabyrinth.workers.dev';

// wxt                      -> development (test Worker, or WXT_WORKER_URL for local wrangler dev)
// wxt build --mode staging -> staging     (test Worker)
// wxt build / wxt zip      -> production  (live Worker, no override possible)
export const WORKER_URL: string = import.meta.env.MODE === 'production' ?
    LIVE_WORKER_URL : import.meta.env.MODE === 'staging' ?
        TEST_WORKER_URL : import.meta.env.WXT_WORKER_URL ?? TEST_WORKER_URL;