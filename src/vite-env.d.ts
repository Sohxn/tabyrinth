declare module '*.css?raw' {
    const content: string;
    export default content;
}

interface ImportMetaEnv {
    readonly WXT_WORKER_URL?: string;
}