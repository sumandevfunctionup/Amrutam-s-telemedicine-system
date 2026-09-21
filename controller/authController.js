import { db } from '../db/db.js';
import { hashPassword, comparePassword } from '../helper/password.js';
import {
  generateTokens,
  generateTempMfaToken,
  verifyAccessToken,
  verifyRefreshToken,
} from '../helper/jwt.js';
import {
  generateMfaSecret,
  generateMfaQrCode,
  verifyMfaToken,
} from '../helper/mfa.js';
import {
  ok,
  created,
  badRequest,
  unauthorized,
  forbidden,
  notFound,
  conflict,
} from '../helper/apiResponse.js';
import { revokeJwt, cacheDel } from '../helper/redis.js';

/**
 * Register a new user (patient or doctor)
 */
export async function register(req, res, next) {
  const {
    email,
    password,
    first_name,
    last_name,
    role = 'patient',
    phone_number,
    gender,
    date_of_birth,
    address,
    metadata,
    // Doctor specific fields
    specialization,
    license_number,
    experience_years,
    consultation_fee,
    bio,
  } = req.body;

  const normalizedEmail = email.toLowerCase().trim();

  // Check if email already registered
  const existing = await db('users').where({ email: normalizedEmail }).first();
  if (existing) {
    return conflict(res, 'Email is already registered.');
  }

  if (license_number) {
    const existingLicense = await db('doctors').where({ license_number }).first();
    if (existingLicense) {
      return conflict(res, 'License number is already registered.');
    }
  }

  try {
    const password_hash = await hashPassword(password);

    // Execute user creation in transaction
    const result = await db.transaction(async (trx) => {
      const [newUser] = await trx('users')
        .insert({
          email: normalizedEmail,
          password_hash,
          role,
          phone_number: phone_number || null,
          status: 'active',
          is_mfa_enabled: false,
        })
        .returning(['id', 'email', 'role', 'phone_number', 'status', 'created_at']);

      const [newProfile] = await trx('profiles')
        .insert({
          user_id: newUser.id,
          first_name,
          last_name,
          gender: gender || null,
          date_of_birth: date_of_birth || null,
          address: address || null,
          metadata: metadata ? JSON.stringify(metadata) : '{}',
        })
        .returning(['first_name', 'last_name', 'gender', 'avatar_url', 'metadata']);

      let doctorRecord = null;
      if (role === 'doctor') {
        [doctorRecord] = await trx('doctors')
          .insert({
            user_id: newUser.id,
            specialization,
            license_number,
            experience_years: Number(experience_years) || 0,
            consultation_fee: Number(consultation_fee) || 500.00,
            bio: bio || null,
            rating: 0.00,
            total_reviews: 0,
            is_verified: false,
          })
          .returning([
            'id',
            'specialization',
            'license_number',
            'experience_years',
            'consultation_fee',
            'is_verified',
          ]);
      }

      // Record audit log
      await trx('audit_logs').insert({
        user_id: newUser.id,
        action: 'USER_REGISTERED',
        entity_type: 'users',
        entity_id: newUser.id,
        ip_address: req.ip,
        user_agent: req.headers['user-agent'] || null,
        details: JSON.stringify({ role, email: normalizedEmail }),
      });

      return { user: newUser, profile: newProfile, doctor: doctorRecord };
    });

    const tokens = generateTokens(result.user);

    return created(
      res,
      {
        user: {
          ...result.user,
          profile: result.profile,
          doctor: result.doctor,
        },
        tokens,
      },
      'User registered successfully.'
    );
  } catch (error) {
    next(error);
  }
}

/**
 * Authenticate user credentials and issue tokens (or initiate MFA challenge)
 */
export async function login(req, res, next) {
  const { email, password } = req.body;

  const normalizedEmail = email.toLowerCase().trim();

  try {
    const user = await db('users').where({ email: normalizedEmail }).first();
    if (!user) {
      return unauthorized(res, 'Invalid email or password.');
    }

    if (user.status !== 'active') {
      return forbidden(res, `Account is ${user.status}. Please contact support.`);
    }

    const isMatch = await comparePassword(password, user.password_hash);
    if (!isMatch) {
      return unauthorized(res, 'Invalid email or password.');
    }

    // If user has MFA enabled, issue temporary token and request TOTP
    if (user.is_mfa_enabled) {
      const tempToken = generateTempMfaToken(user);
      return ok(
        res,
        {
          mfaRequired: true,
          tempToken,
        },
        'MFA verification code required.'
      );
    }

    // Generate tokens
    const tokens = generateTokens(user);

    // Fetch profile
    const profile = await db('profiles').where({ user_id: user.id }).first();
    const doctor = user.role === 'doctor' ? await db('doctors').where({ user_id: user.id }).first() : null;

    // Record login audit log
    await db('audit_logs').insert({
      user_id: user.id,
      action: 'USER_LOGIN',
      entity_type: 'users',
      entity_id: user.id,
      ip_address: req.ip,
      user_agent: req.headers['user-agent'] || null,
      details: JSON.stringify({ mfaUsed: false }),
    });

    return ok(
      res,
      {
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
          phone_number: user.phone_number,
          is_mfa_enabled: user.is_mfa_enabled,
          profile,
          doctor,
        },
        tokens,
      },
      'Login successful.'
    );
  } catch (error) {
    next(error);
  }
}

/**
 * Verify TOTP code after login with temporary MFA token
 */
export async function verifyMfaLogin(req, res, next) {
  const { tempToken, code } = req.body;

  try {
    const decoded = verifyAccessToken(tempToken);
    if (!decoded.mfaPending) {
      return badRequest(res, 'Invalid MFA verification token.');
    }

    const user = await db('users').where({ id: decoded.sub }).first();
    if (!user || !user.mfa_secret) {
      return notFound(res, 'User or MFA secret not found.');
    }

    const isValid = verifyMfaToken(code, user.mfa_secret);
    if (!isValid) {
      return unauthorized(res, 'Invalid 6-digit authentication code.');
    }

    const tokens = generateTokens(user);
    const profile = await db('profiles').where({ user_id: user.id }).first();
    const doctor = user.role === 'doctor' ? await db('doctors').where({ user_id: user.id }).first() : null;

    // Record audit log
    await db('audit_logs').insert({
      user_id: user.id,
      action: 'USER_LOGIN_MFA',
      entity_type: 'users',
      entity_id: user.id,
      ip_address: req.ip,
      user_agent: req.headers['user-agent'] || null,
      details: JSON.stringify({ mfaUsed: true }),
    });

    return ok(
      res,
      {
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
          is_mfa_enabled: user.is_mfa_enabled,
          profile,
          doctor,
        },
        tokens,
      },
      'MFA authentication successful.'
    );
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return unauthorized(res, 'MFA verification session expired. Please log in again.');
    }
    next(error);
  }
}

/**
 * Initiate MFA setup: generate secret & QR code
 */
export async function setupMfa(req, res, next) {
  const userId = req.user.id;

  try {
    const { secret, otpauthUrl } = generateMfaSecret(req.user.email);
    const qrCode = await generateMfaQrCode(otpauthUrl);

    // Save secret temporarily pending confirmation
    await db('users').where({ id: userId }).update({
      mfa_secret: secret,
      updated_at: db.fn.now(),
    });

    return ok(
      res,
      {
        secret,
        otpauthUrl,
        qrCode,
        instructions:
          'Scan the QR code in Google Authenticator or Authy, then submit a 6-digit code to /api/v1/auth/mfa/confirm to activate MFA.',
      },
      'MFA setup initiated.'
    );
  } catch (error) {
    next(error);
  }
}

/**
 * Confirm and activate MFA with initial valid code
 */
export async function confirmMfa(req, res, next) {
  const userId = req.user.id;
  const { code } = req.body;

  try {
    const user = await db('users').where({ id: userId }).first();
    if (!user || !user.mfa_secret) {
      return badRequest(res, 'Please initiate MFA setup before confirming.');
    }

    const isValid = verifyMfaToken(code, user.mfa_secret);
    if (!isValid) {
      return badRequest(res, 'Invalid verification code. Please check your authenticator app.');
    }

    await db('users').where({ id: userId }).update({
      is_mfa_enabled: true,
      updated_at: db.fn.now(),
    });

    await db('audit_logs').insert({
      user_id: userId,
      action: 'MFA_ACTIVATED',
      entity_type: 'users',
      entity_id: userId,
      ip_address: req.ip,
      user_agent: req.headers['user-agent'] || null,
    });

    return ok(res, { is_mfa_enabled: true }, 'MFA activated successfully.');
  } catch (error) {
    next(error);
  }
}

/**
 * Issue new access token using valid refresh token
 */
export async function refreshToken(req, res, next) {
  const token = req.body.refreshToken || req.headers['x-refresh-token'];

  try {
    const decoded = verifyRefreshToken(token);

    const user = await db('users').where({ id: decoded.sub, status: 'active' }).first();
    if (!user) {
      return unauthorized(res, 'User account not found or inactive.');
    }

    const newTokens = generateTokens(user);

    return ok(res, newTokens, 'Token refreshed successfully.');
  } catch (error) {
    return unauthorized(res, 'Invalid or expired refresh token. Please log in again.');
  }
}

/**
 * Fetch current user profile
 */
export async function getMe(req, res, next) {
  const userId = req.user.id;

  try {
    const user = await db('users')
      .where({ id: userId })
      .select('id', 'email', 'role', 'phone_number', 'is_mfa_enabled', 'status', 'created_at')
      .first();

    const profile = await db('profiles').where({ user_id: userId }).first();
    const doctor =
      user.role === 'doctor' ? await db('doctors').where({ user_id: userId }).first() : null;

    return ok(res, { ...user, profile, doctor }, 'Profile retrieved successfully.');
  } catch (error) {
    next(error);
  }
}

/**
 * Update current user profile
 */
export async function updateProfile(req, res, next) {
  const userId = req.user.id;
  const { first_name, last_name, gender, date_of_birth, address, emergency_contact, metadata } =
    req.body;

  try {
    const updates = { updated_at: db.fn.now() };

    if (first_name !== undefined) updates.first_name = first_name;
    if (last_name !== undefined) updates.last_name = last_name;
    if (gender !== undefined) updates.gender = gender;
    if (date_of_birth !== undefined) updates.date_of_birth = date_of_birth;
    if (address !== undefined) updates.address = address;
    if (emergency_contact !== undefined) updates.emergency_contact = emergency_contact;
    if (metadata !== undefined) updates.metadata = JSON.stringify(metadata);

    const [updatedProfile] = await db('profiles')
      .where({ user_id: userId })
      .update(updates)
      .returning('*');

    return ok(res, updatedProfile, 'Profile updated successfully.');
  } catch (error) {
    next(error);
  }
}

/**
 * Logout user: invalidates current access token in Redis blacklist and clears session cache
 * POST /api/v1/auth/logout
 */
export async function logout(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      // Revoke in Redis for 15 minutes (standard access token expiry)
      await revokeJwt(token, 900);
    }

    if (req.user?.id) {
      await cacheDel(`amrutam:user:${req.user.id}`);
    }

    return ok(res, null, 'Logged out successfully. Token has been revoked.');
  } catch (error) {
    next(error);
  }
}

