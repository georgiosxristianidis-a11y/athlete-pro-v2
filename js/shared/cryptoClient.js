/**
 * Client for communicating with crypto.worker.js
 */

const workerUrl = new URL('../workers/crypto.worker.js', import.meta.url);
const worker = new Worker(workerUrl);

let _msgId = 0;
const _callbacks = new Map();

worker.onmessage = (e) => {
  const { id, type, result, error } = e.data;
  if (_callbacks.has(id)) {
    const { resolve, reject } = _callbacks.get(id);
    _callbacks.delete(id);
    if (type === 'SUCCESS') resolve(result);
    else reject(new Error(error));
  }
};

export const encryptAsync = (payload) => {
  return new Promise((resolve, reject) => {
    const id = ++_msgId;
    _callbacks.set(id, { resolve, reject });
    worker.postMessage({ id, type: 'ENCRYPT', payload });
  });
};

export const decryptAsync = (encrypted, iv) => {
  return new Promise((resolve, reject) => {
    const id = ++_msgId;
    _callbacks.set(id, { resolve, reject });
    worker.postMessage({ id, type: 'DECRYPT', payload: { encrypted, iv } });
  });
};
