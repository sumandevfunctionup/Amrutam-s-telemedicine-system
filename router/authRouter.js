import { Router } from 'express';
import {
  register,
  login,
  verifyMfaLogin,
  setupMfa,
  confirmMfa,
  refreshToken,
  getMe,
  updateProfile,
  logout,
} from '../controller/authController.js';
import { authenticate, idempotency } from '../auth/middleware.js';
import { rateLimiter } from '../auth/rateLimiter.js';
import { validate } from '../helper/validator.js';
import {
  registerSchema,
  loginSchema,
  mfaLoginSchema,
  mfaConfirmSchema,
  refreshTokenSchema,
  updateProfileSchema,
} from '../helper/schemas.js';

const router = Router();

/**
 * @openapi
 * /api/v1/auth/register:
 *   post:
 *     summary: Register a new patient or doctor
 *     tags:
 *       - Authentication
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *               - first_name
 *               - last_name
 *             properties:
 *               email:
 *                 type: string
 *                 example: rohan@example.com
 *               password:
 *                 type: string
 *                 example: Password@123
 *               first_name:
 *                 type: string
 *                 example: Rohan
 *               last_name:
 *                 type: string
 *                 example: Verma
 *               role:
 *                 type: string
 *                 enum: [patient, doctor]
 *                 default: patient
 *               phone_number:
 *                 type: string
 *                 example: "+919876543210"
 *               specialization:
 *                 type: string
 *                 example: "Kayachikitsa (Internal Medicine)"
 *               license_number:
 *                 type: string
 *                 example: "AYU-DEL-99999"
 *               consultation_fee:
 *                 type: number
 *                 example: 750
 *     responses:
 *       201:
 *         description: User registered successfully
 *       400:
 *         description: Validation error
 *       409:
 *         description: Email or license already exists
 */
router.post('/register', rateLimiter({ max: 10, windowSeconds: 60, keyPrefix: 'auth-register' }), idempotency, validate(registerSchema), register);

/**
 * @openapi
 * /api/v1/auth/login:
 *   post:
 *     summary: Log in with email and password
 *     tags:
 *       - Authentication
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 example: admin@amrutam.co.in
 *               password:
 *                 type: string
 *                 example: Password@123
 *     responses:
 *       200:
 *         description: Login successful (returns tokens or triggers MFA challenge)
 *       400:
 *         description: Validation error
 *       401:
 *         description: Invalid credentials
 *       429:
 *         description: Too many requests
 */
router.post('/login', rateLimiter({ max: 60, windowSeconds: 60, keyPrefix: 'auth-login' }), validate(loginSchema), login);

/**
 * @openapi
 * /api/v1/auth/login/mfa:
 *   post:
 *     summary: Verify 6-digit TOTP MFA code during login
 *     tags:
 *       - Authentication
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - tempToken
 *               - code
 *             properties:
 *               tempToken:
 *                 type: string
 *               code:
 *                 type: string
 *                 example: "123456"
 *     responses:
 *       200:
 *         description: MFA verified and tokens returned
 *       400:
 *         description: Validation error
 *       401:
 *         description: Invalid MFA code or token
 */
router.post('/login/mfa', validate(mfaLoginSchema), verifyMfaLogin);

/**
 * @openapi
 * /api/v1/auth/refresh:
 *   post:
 *     summary: Refresh access token
 *     tags:
 *       - Authentication
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - refreshToken
 *             properties:
 *               refreshToken:
 *                 type: string
 *     responses:
 *       200:
 *         description: New tokens issued
 *       400:
 *         description: Validation error
 *       401:
 *         description: Invalid or expired refresh token
 */
router.post('/refresh', validate(refreshTokenSchema), refreshToken);

/**
 * @openapi
 * /api/v1/auth/mfa/setup:
 *   post:
 *     summary: Generate MFA secret and QR code for authenticator apps
 *     tags:
 *       - Multi-Factor Authentication
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: QR code and secret generated
 *       401:
 *         description: Unauthorized
 */
router.post('/mfa/setup', authenticate, setupMfa);

/**
 * @openapi
 * /api/v1/auth/mfa/confirm:
 *   post:
 *     summary: Confirm 6-digit TOTP code and activate MFA on account
 *     tags:
 *       - Multi-Factor Authentication
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - code
 *             properties:
 *               code:
 *                 type: string
 *                 example: "123456"
 *     responses:
 *       200:
 *         description: MFA activated
 *       400:
 *         description: Validation error
 */
router.post('/mfa/confirm', authenticate, validate(mfaConfirmSchema), confirmMfa);

/**
 * @openapi
 * /api/v1/auth/me:
 *   get:
 *     summary: Fetch current authenticated user profile
 *     tags:
 *       - User Profile
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Current user profile
 *       401:
 *         description: Unauthorized
 */
router.get('/me', authenticate, getMe);

/**
 * @openapi
 * /api/v1/auth/profile:
 *   put:
 *     summary: Update profile details
 *     tags:
 *       - User Profile
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               first_name:
 *                 type: string
 *               last_name:
 *                 type: string
 *               gender:
 *                 type: string
 *                 enum: [male, female, other]
 *               address:
 *                 type: string
 *               metadata:
 *                 type: object
 *     responses:
 *       200:
 *         description: Profile updated successfully
 *       400:
 *         description: Validation error
 */
router.put('/profile', authenticate, idempotency, validate(updateProfileSchema), updateProfile);

/**
 * @openapi
 * /api/v1/auth/logout:
 *   post:
 *     summary: Logout user and invalidate access token in Redis blacklist
 *     tags:
 *       - Authentication
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Logged out successfully
 *       401:
 *         description: Unauthorized
 */
router.post('/logout', authenticate, logout);

export default router;
