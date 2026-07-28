const crypto = require('crypto');

module.exports = (config) => {
  const signingKey = config.impersonationKey || 'this is WareHowz';
  const EXPIRY_MS = 3 * 24 * 60 * 60 * 1000; // 72 hours

  const buildContinuityAuthQuery = (email, entityId) => {
    const authExp = Date.now() + EXPIRY_MS;
    const authSig = crypto
      .createHmac('sha256', signingKey)
      .update(`${email}:${entityId}:${authExp}`)
      .digest('hex');

    return `?authEmail=${encodeURIComponent(email)}&authExp=${authExp}&authSig=${authSig}`;
  };

  const verifyContinuityAuth = (authEmail, authExp, authSig, entityId) => {
    if (!authEmail || !authExp || !authSig) {
      return false;
    }
    if (Number(authExp) < Date.now()) {
      return false;
    }
    const expectedSig = crypto
      .createHmac('sha256', signingKey)
      .update(`${authEmail}:${entityId}:${authExp}`)
      .digest('hex');
    const provided = Buffer.from(String(authSig));
    const expected = Buffer.from(expectedSig);

    return (
      provided.length === expected.length &&
      crypto.timingSafeEqual(provided, expected)
    );
  };

  return { buildContinuityAuthQuery, verifyContinuityAuth };
};
