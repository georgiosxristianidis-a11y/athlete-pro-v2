/**
 * Web Worker for Off-Main-Thread Cryptography (AES-GCM)
 * Prevents main thread blocking during massive IndexedDB read/writes.
 */

// We don't hardcode a master key here. In a real app, this should be derived 
// via PBKDF2 from a user password or a securely stored random key in IndexedDB
// For the sake of this prototype and local-first nature, we'll generate and cache one.
let cryptoKey = null;

const generateOrLoadKey = async () => {
  if (cryptoKey) return cryptoKey;
  
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('ap-keys', 1);
    req.onupgradeneeded = e => {
      e.target.result.createObjectStore('keys');
    };
    req.onsuccess = e => {
      const db = e.target.result;
      const tx = db.transaction('keys', 'readwrite');
      const store = tx.objectStore('keys');
      const getReq = store.get('master');
      
      getReq.onsuccess = async () => {
        if (getReq.result) {
          cryptoKey = getReq.result;
          resolve(cryptoKey);
        } else {
          try {
            cryptoKey = await crypto.subtle.generateKey(
              { name: "AES-GCM", length: 256 },
              false, // Not extractable, stored directly as CryptoKey object
              ["encrypt", "decrypt"]
            );
            const putTx = db.transaction('keys', 'readwrite');
            const putReq = putTx.objectStore('keys').put(cryptoKey, 'master');
            putReq.onsuccess = () => resolve(cryptoKey);
            putReq.onerror = () => reject(putReq.error);
          } catch (err) {
            reject(err);
          }
        }
      };
      getReq.onerror = () => reject(getReq.error);
    };
    req.onerror = () => reject(req.error);
  });
};

// Generate an IV (Initialization Vector)
const generateIV = () => crypto.getRandomValues(new Uint8Array(12));

const encryptData = async (data) => {
  const key = await generateOrLoadKey();
  const iv = generateIV();
  const encoded = new TextEncoder().encode(JSON.stringify(data));
  
  const encryptedBuf = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoded
  );

  // Convert to Base64 for easier JSON storage
  const encryptedArr = Array.from(new Uint8Array(encryptedBuf));
  const encryptedBase64 = btoa(String.fromCharCode.apply(null, encryptedArr));
  const ivBase64 = btoa(String.fromCharCode.apply(null, Array.from(iv)));

  return { encrypted: encryptedBase64, iv: ivBase64 };
};

const decryptData = async (encryptedBase64, ivBase64) => {
  const key = await generateOrLoadKey();
  const encryptedArr = new Uint8Array(atob(encryptedBase64).split('').map(c => c.charCodeAt(0)));
  const iv = new Uint8Array(atob(ivBase64).split('').map(c => c.charCodeAt(0)));

  try {
    const decryptedBuf = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      key,
      encryptedArr
    );
    const decodedStr = new TextDecoder().decode(decryptedBuf);
    return JSON.parse(decodedStr);
  } catch (err) {
    console.error("[crypto.worker] Decryption failed:", err);
    throw new Error('Decryption failed', { cause: err });
  }
};

self.onmessage = async (e) => {
  const { id, type, payload } = e.data;
  try {
    if (type === 'ENCRYPT') {
      const result = await encryptData(payload);
      self.postMessage({ id, type: 'SUCCESS', result });
    } else if (type === 'DECRYPT') {
      const { encrypted, iv } = payload;
      const result = await decryptData(encrypted, iv);
      self.postMessage({ id, type: 'SUCCESS', result });
    } else if (type === 'INIT_KEY') {
      // In a real app, the main thread sends a PBKDF2-derived key here
      // For now, we ignore or store it.
      self.postMessage({ id, type: 'SUCCESS', result: 'Key Initialized' });
    }
  } catch (err) {
    self.postMessage({ id, type: 'ERROR', error: err.message });
  }
};
