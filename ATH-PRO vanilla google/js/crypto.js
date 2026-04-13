export const LocalCrypto = {
  key: null,
  async init() {
    let jwk = localStorage.getItem('ap-crypto-key');
    if (!jwk) {
      this.key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
      jwk = await crypto.subtle.exportKey("jwk", this.key);
      localStorage.setItem('ap-crypto-key', JSON.stringify(jwk));
    } else {
      this.key = await crypto.subtle.importKey("jwk", JSON.parse(jwk), { name: "AES-GCM" }, true, ["encrypt", "decrypt"]);
    }
  },
  async encrypt(obj) {
    if (!this.key) await this.init();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const enc = new TextEncoder();
    const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, this.key, enc.encode(JSON.stringify(obj)));
    return {
      _enc: true,
      iv: Array.from(iv),
      data: Array.from(new Uint8Array(cipher))
    };
  },
  async decrypt(obj) {
    if (!obj || !obj._enc) return obj;
    if (!this.key) await this.init();
    try {
      const iv = new Uint8Array(obj.iv);
      const cipher = new Uint8Array(obj.data);
      const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, this.key, cipher);
      const dec = new TextDecoder();
      return JSON.parse(dec.decode(plain));
    } catch (e) {
      console.error("Decryption error", e);
      return null;
    }
  }
};
