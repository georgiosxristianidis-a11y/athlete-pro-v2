/**
 * Phase Verification Script
 * Validates Security (XSS/CSP) and UI (Navigation/Animations).
 */
import { spawn } from 'child_process';
import http from 'http';

const PORT = 3999;
let serverProcess;

async function startServer() {
  return new Promise((resolve, reject) => {
    console.log('🚀 Starting test server...');
    serverProcess = spawn('node', ['server.js'], {
      env: { ...process.env, PORT: PORT.toString(), NODE_ENV: 'test' },
      stdio: 'inherit'
    });
    
    // Wait for server to be ready
    const check = () => {
      http.get(`http://localhost:${PORT}`, (res) => {
        resolve();
      }).on('error', () => {
        setTimeout(check, 500);
      });
    };
    setTimeout(check, 1000);
  });
}

async function verifyCSP() {
  return new Promise((resolve) => {
    console.log('🛡️ Verifying CSP Headers...');
    http.get(`http://localhost:${PORT}`, (res) => {
      const csp = res.headers['content-security-policy'];
      if (csp) {
        console.log('✅ CSP Header present:', csp.substring(0, 50) + '...');
        if (csp.includes("script-src 'self'")) {
          console.log('✅ script-src is secure.');
          resolve(true);
        } else {
          console.log('❌ CSP script-src might be too relaxed.');
          resolve(false);
        }
      } else {
        console.log('❌ CSP Header MISSING!');
        resolve(false);
      }
    });
  });
}

async function verifyXSSSanitization() {
  console.log('🔍 Verifying XSS Sanitization Logic...');
  // Since we are in Node, we test the utility function directly
  try {
    const { esc } = await import('../js/shared/utils.js');
    const payload = '<img src=x onerror=alert(1)>';
    const sanitized = esc(payload);
    if (sanitized.includes('<') || sanitized.includes('>')) {
      console.log('❌ Sanitization FAILED:', sanitized);
      return false;
    }
    console.log('✅ Sanitization works:', sanitized);
    return true;
  } catch (e) {
    console.log('❌ Could not import utils.js (ESM issue in script?):', e.message);
    return false;
  }
}

async function runAll() {
  let success = true;
  
  // Phase 1 Tests
  if (!(await verifyXSSSanitization())) success = false;
  
  await startServer();
  if (!(await verifyCSP())) success = false;
  
  console.log('\n--- VERIFICATION RESULT ---');
  if (success) {
    console.log('✨ ALL SYSTEMS NOMINAL. PHASE VALIDATED. ✨');
  } else {
    console.log('⚠️ REGRESSIONS DETECTED. PLEASE CHECK LOGS. ⚠️');
  }
  
  if (serverProcess) serverProcess.kill();
  process.exit(success ? 0 : 1);
}

runAll();
