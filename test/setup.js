if (!globalThis.Worker) {
  globalThis.Worker = class Worker {
    constructor() {}
    postMessage() {}
    addEventListener() {}
    terminate() {}
  };
}
