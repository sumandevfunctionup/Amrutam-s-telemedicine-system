import speakeasy from 'speakeasy';
import QRCode from 'qrcode';

const APP_NAME = process.env.MFA_APP_NAME || 'Amrutam Telemedicine';

/**
 * Generate a new base32 MFA secret and OTPAuth URI
 * @param {string} email
 * @returns {{ secret: string, otpauthUrl: string }}
 */
export function generateMfaSecret(email) {
  const secretObj = speakeasy.generateSecret({
    name: `${APP_NAME}:${email}`,
    issuer: APP_NAME,
    length: 20,
  });

  return {
    secret: secretObj.base32,
    otpauthUrl: secretObj.otpauth_url,
  };
}

/**
 * Generate a QR Code Data URL from an OTPAuth URI
 * @param {string} otpauthUrl
 * @returns {Promise<string>}
 */
export async function generateMfaQrCode(otpauthUrl) {
  return QRCode.toDataURL(otpauthUrl);
}

/**
 * Verify a 6-digit TOTP token against the stored secret
 * @param {string} token
 * @param {string} secret
 * @returns {boolean}
 */
export function verifyMfaToken(token, secret) {
  if (!token || !secret) {
    return false;
  }

  return speakeasy.totp.verify({
    secret,
    encoding: 'base32',
    token: String(token).trim(),
    window: 1, // Allow 1-step clock drift (30 seconds before or after)
  });
}
