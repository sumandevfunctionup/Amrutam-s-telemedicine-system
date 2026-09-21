import speakeasy from 'speakeasy';

const BASE_URL = 'http://localhost:3000/api/v1';

async function runModule1Tests() {
  console.log('==================================================================');
  console.log('--- STARTING MODULE 1: AUTH, RBAC, MFA & TOKENS TESTS ---');
  console.log('==================================================================');

  const randomSuffix = Math.floor(100000 + Math.random() * 900000);
  const testEmail = `patient_${randomSuffix}@test.com`;
  const testPassword = 'Password@123';

  // Step 1: User Registration
  console.log(`\n[Step 1] Registering New Patient (${testEmail})`);
  const regRes = await fetch(`${BASE_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: testEmail,
      password: testPassword,
      first_name: 'Test',
      last_name: 'Patient',
      role: 'patient',
      phone_number: `+9198${randomSuffix}`,
    }),
  });
  const regData = await regRes.json();
  console.log('Registration Status:', regRes.status);
  if (regRes.status !== 201) {
    throw new Error(`Registration failed: ${JSON.stringify(regData)}`);
  }
  console.log('SUCCESS: Patient registered successfully!');

  // Step 2: Idempotency Replay on Registration
  console.log('\n[Step 2] Testing Idempotency on Registration with Key');
  const idemKey = `reg-key-${randomSuffix}`;
  const idemEmail = `idem_${randomSuffix}@test.com`;
  const idemBody = JSON.stringify({
    email: idemEmail,
    password: testPassword,
    first_name: 'Idem',
    last_name: 'User',
    role: 'patient',
  });

  const idemRes1 = await fetch(`${BASE_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idemKey },
    body: idemBody,
  });
  console.log('First Idempotent Registration Status:', idemRes1.status);

  const idemRes2 = await fetch(`${BASE_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idemKey },
    body: idemBody,
  });
  console.log('Replayed Idempotent Registration Status:', idemRes2.status);
  const isReplay = idemRes2.headers.get('x-cache-lookup') || idemRes2.status === 201;
  if (!isReplay) {
    throw new Error('Idempotency replay failed');
  }
  console.log('SUCCESS: Idempotency protection verified on auth route!');

  // Step 3: Login
  console.log('\n[Step 3] Logging In as Registered Patient');
  const loginRes = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: testEmail,
      password: testPassword,
    }),
  });
  const loginData = await loginRes.json();
  console.log('Login Status:', loginRes.status);
  const accessToken = loginData.data?.tokens?.accessToken || loginData.data?.tokens?.access_token;
  const refreshToken = loginData.data?.tokens?.refreshToken || loginData.data?.tokens?.refresh_token;

  if (!accessToken || !refreshToken) {
    throw new Error(`Failed to obtain tokens on login: ${JSON.stringify(loginData)}`);
  }
  console.log('SUCCESS: Access and refresh tokens issued!');

  // Step 4: Get Profile (GET /auth/me)
  console.log('\n[Step 4] Fetching Authenticated Profile');
  const meRes = await fetch(`${BASE_URL}/auth/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const meData = await meRes.json();
  console.log('Profile Status:', meRes.status);
  console.log('Profile Email:', meData.data?.email);
  if (meData.data?.email !== testEmail) {
    throw new Error('Profile mismatch');
  }
  console.log('SUCCESS: Profile authenticated and retrieved!');

  // Step 5: Update Profile (PUT /auth/profile)
  console.log('\n[Step 5] Updating Profile');
  const updateRes = await fetch(`${BASE_URL}/auth/profile`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      first_name: 'UpdatedFirst',
      last_name: 'UpdatedLast',
    }),
  });
  const updateData = await updateRes.json();
  console.log('Update Status:', updateRes.status);
  if (updateData.data?.first_name !== 'UpdatedFirst') {
    throw new Error('Profile update failed');
  }
  console.log('SUCCESS: Profile updated successfully!');

  // Step 6: Refresh Token (POST /auth/refresh)
  console.log('\n[Step 6] Refreshing Token');
  const refreshRes = await fetch(`${BASE_URL}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });
  const refreshData = await refreshRes.json();
  console.log('Token Refresh Status:', refreshRes.status);
  const newAccessToken = refreshData.data?.accessToken || refreshData.data?.tokens?.accessToken || refreshData.data?.tokens?.access_token;
  if (!newAccessToken) {
    throw new Error('Refresh token rotation failed');
  }
  console.log('SUCCESS: Token rotated successfully!');

  // Step 7: MFA Setup
  console.log('\n[Step 7] Generating MFA TOTP Secret');
  const mfaRes = await fetch(`${BASE_URL}/auth/mfa/setup`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${newAccessToken}` },
  });
  const mfaData = await mfaRes.json();
  console.log('MFA Setup Status:', mfaRes.status);
  const mfaSecret = mfaData.data?.secret;
  if (!mfaSecret) {
    throw new Error('MFA secret not returned');
  }
  console.log('SUCCESS: TOTP secret and QR code generated!');

  // Confirm MFA
  const totpCode = speakeasy.totp({
    secret: mfaSecret,
    encoding: 'base32',
  });
  const mfaConfirmRes = await fetch(`${BASE_URL}/auth/mfa/confirm`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${newAccessToken}`,
    },
    body: JSON.stringify({ code: totpCode }),
  });
  console.log('MFA Confirm Status:', mfaConfirmRes.status);
  if (mfaConfirmRes.status !== 200) {
    throw new Error('MFA confirmation failed');
  }
  console.log('SUCCESS: TOTP MFA enabled on account!');

  // Step 8: Logout & Blacklisting
  console.log('\n[Step 8] Logging Out and Revoking Token');
  const logoutRes = await fetch(`${BASE_URL}/auth/logout`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${newAccessToken}` },
  });
  console.log('Logout Status:', logoutRes.status);

  // Access with blacklisted token should fail with 401
  const testRevokedRes = await fetch(`${BASE_URL}/auth/me`, {
    headers: { Authorization: `Bearer ${newAccessToken}` },
  });
  console.log('Access with Revoked Token (Expected 401):', testRevokedRes.status);
  if (testRevokedRes.status !== 401) {
    throw new Error('Revoked token was still accepted');
  }
  console.log('SUCCESS: Blacklisted token correctly rejected!');

  console.log('\n==================================================================');
  console.log('--- ALL MODULE 1 AUTH & TOKEN TESTS PASSED! ---');
  console.log('==================================================================');
}

runModule1Tests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Test Failed:', err);
    process.exit(1);
  });
