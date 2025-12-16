// Convenience flag parser: REAL=G,L,P,T sets TEST_REAL_GMAIL/LLM/PUSHOVER/TWILIO.
const real = (process.env.REAL || '').toLowerCase();
const setFlag = (char, envVar) => {
  if (real.includes(char) && !process.env[envVar]) {
    process.env[envVar] = '1';
  }
};

setFlag('g', 'TEST_REAL_GMAIL');
setFlag('l', 'TEST_REAL_LLM');
setFlag('p', 'TEST_REAL_PUSHOVER');
setFlag('t', 'TEST_REAL_TWILIO');
