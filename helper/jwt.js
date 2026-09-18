import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'amrutam_default_jwt_secret_key_change_in_production';
const JWT_REFRESH_SECRET =
  process.env.JWT_REFRESH_SECRET || 'amrutam_default_jwt_refresh_secret_key_change_in_production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '15m';
const JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || '7d';

/**
 * Generate Access and Refresh tokens for authenticated user
 * @param {object} user
 * @returns {{ accessToken: string, refreshToken: string, expiresIn: string }}
 */
export function generateTokens(user) {
  const payload = {
    sub: user.id,
    email: user.email,
    role: user.role,
  };

  const accessToken = jwt.sign(payload, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
  });

  const refreshToken = jwt.sign(payload, JWT_REFRESH_SECRET, {
    expiresIn: JWT_REFRESH_EXPIRES_IN,
  });

  return {
    accessToken,
    refreshToken,
    expiresIn: JWT_EXPIRES_IN,
  };
}

/**
 * Generate a short-lived temporary token for MFA verification step (5 mins)
 * @param {object} user
 * @returns {string}
 */
export function generateTempMfaToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      role: user.role,
      mfaPending: true,
    },
    JWT_SECRET,
    { expiresIn: '5m' }
  );
}

/**
 * Verify JWT Access Token
 * @param {string} token
 * @returns {object} Decoded payload
 */
export function verifyAccessToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

/**
 * Verify JWT Refresh Token
 * @param {string} token
 * @returns {object} Decoded payload
 */
export function verifyRefreshToken(token) {
  return jwt.verify(token, JWT_REFRESH_SECRET);
}
