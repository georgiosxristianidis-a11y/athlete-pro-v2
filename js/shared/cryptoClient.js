/**
 * Client for communicating with crypto.worker.js
 */

let _worker = null;
let _msgId = 0;
const _callbacks = new Map();

/* Lazy init — keeps this module importable outside the browser (Node unit tests) */
function _getWorker() {
  if (_worker) return _worker;
  const workerUrl = new URL('../workers/crypto.worker.js', import.meta.url);
  _worker = new Worker(workerUrl);
  _worker.onmessage = (e) => {
    const { id, type, result, error } = e.data;
    if (_callbacks.has(id)) {
      const { resolve, reject } = _callbacks.get(id);
      _callbacks.delete(id);
      if (type === 'SUCCESS') resolve(result);
      else reject(new Error(error));
    }
  };
  return _worker;
}

export const encryptAsync = (payload) => {
  return new Promise((resolve, reject) => {
    const id = ++_msgId;
    _callbacks.set(id, { resolve, reject });
    _getWorker().postMessage({ id, type: 'ENCRYPT', payload });
  });
};

export const decryptAsync = (encrypted, iv) => {
  return new Promise((resolve, reject) => {
    const id = ++_msgId;
    _callbacks.set(id, { resolve, reject });
    _getWorker().postMessage({ id, type: 'DECRYPT', payload: { encrypted, iv } });
  });
};
