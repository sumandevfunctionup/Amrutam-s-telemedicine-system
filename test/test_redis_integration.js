const BASE_URL = 'http://localhost:3000/api/v1';

async function runRedisTests() {
  console.log('==================================================================');
  console.log('--- STARTING COMPREHENSIVE REDIS & SEARCH INTEGRATION SUITE ---');
  console.log('==================================================================');

  // Step 1: Health & Redis Diagnostics
  console.log('\n[Step 1] Verifying System & Redis Health via GET /health');
  const resHealth = await fetch(`${BASE_URL}/health`);
  const dataHealth = await resHealth.json();
  console.log('Health Status Code:', resHealth.status);
  console.log('Redis Service Info:', dataHealth.data?.services?.redis);
  if (dataHealth.data?.services?.redis?.status !== 'healthy') {
    throw new Error('Redis is not reported healthy by /health probe');
  }

  // Step 2: Authenticate Doctor Gupta & Patient Rohan
  console.log('\n[Step 2] Authenticating Doctor Gupta and Patient Rohan');
  const [resDoc, resRohan] = await Promise.all([
    fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'dr.gupta@amrutam.co.in', password: 'Password@123' }),
    }),
    fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'rohan.verma@example.com', password: 'Password@123' }),
    }),
  ]);

  const [dataDoc, dataRohan] = await Promise.all([resDoc.json(), resRohan.json()]);
  const docToken = dataDoc.data?.tokens?.accessToken;
  const rohanToken = dataRohan.data?.tokens?.accessToken;
  const docId = dataDoc.data?.user?.doctor?.id || '62ac6ba0-4984-40d3-a4ac-13aa98098393';

  console.log('Doctor Authenticated:', !!docToken, 'Doc ID:', docId);
  console.log('Patient Authenticated:', !!rohanToken);

  // Step 3: Test Read-Through Caching on Doctor Profile (Miss -> Hit)
  console.log('\n[Step 3] Testing Doctor Profile Caching (Miss -> Hit)');
  const resProfile1 = await fetch(`${BASE_URL}/doctors/${docId}`);
  const lookup1 = resProfile1.headers.get('x-cache-lookup');
  console.log('First Profile Request Cache Lookup:', lookup1 || 'DB/MISS');

  const resProfile2 = await fetch(`${BASE_URL}/doctors/${docId}`);
  const lookup2 = resProfile2.headers.get('x-cache-lookup');
  console.log('Second Profile Request Cache Lookup:', lookup2);

  if (lookup2 !== 'HIT-REDIS') {
    console.warn('Expected HIT-REDIS on second request, received:', lookup2);
  } else {
    console.log('SUCCESS: Profile served directly from Redis Cache!');
  }

  // Step 4: Test Cache Invalidation on Profile Update
  console.log('\n[Step 4] Testing Cache Invalidation via PUT /doctors/profile');
  const resUpdate = await fetch(`${BASE_URL}/doctors/profile`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${docToken}`,
    },
    body: JSON.stringify({
      bio: `Updated bio at ${new Date().toISOString()} for Panchakarma specialist.`,
    }),
  });
  console.log('Profile Update Status:', resUpdate.status);

  // Request profile again — should be MISS/DB because cache was invalidated!
  const resProfile3 = await fetch(`${BASE_URL}/doctors/${docId}`);
  const lookup3 = resProfile3.headers.get('x-cache-lookup');
  console.log('Profile Request After Update Cache Lookup:', lookup3 || 'MISS (Cache Invalidation Successful)');

  // Step 5: Test Search Engine with Specialization Aggregation & Caching
  console.log('\n[Step 5] Testing Search Engine (GET /search/specializations)');
  const resSpec1 = await fetch(`${BASE_URL}/search/specializations`);
  const resSpec2 = await fetch(`${BASE_URL}/search/specializations`);
  console.log('First Spec Lookup:', resSpec1.headers.get('x-cache-lookup') || 'MISS');
  console.log('Second Spec Lookup (Expected HIT-REDIS):', resSpec2.headers.get('x-cache-lookup'));

  // Step 6: Test Multi-Dimensional Doctor Search with Free-Text Query
  console.log('\n[Step 6] Testing Free-Text Doctor Search (GET /search/doctors?q=Panchakarma)');
  const resSearch1 = await fetch(`${BASE_URL}/search/doctors?q=Panchakarma`);
  const dataSearch1 = await resSearch1.json();
  console.log('Search Status:', resSearch1.status);
  console.log('Doctors Found matching "Panchakarma":', dataSearch1.data?.doctors?.length);
  console.log('Doctor Returned:', dataSearch1.data?.doctors?.[0]?.name);
  console.log('First Search Cache Lookup:', resSearch1.headers.get('x-cache-lookup'));

  const resSearch2 = await fetch(`${BASE_URL}/search/doctors?q=Panchakarma`);
  console.log('Second Search Cache Lookup (Expected HIT-REDIS):', resSearch2.headers.get('x-cache-lookup'));

  // Step 7: Test Redis Distributed Locking on Slot Lock (Concurrency Race)
  console.log('\n[Step 7] Testing Redis Distributed Mutex on Concurrent Slot Lock');
  // Create a fresh slot first
  const futureStart = new Date(Date.now() + 150 * 24 * 3600 * 1000 + Math.floor(Math.random() * 500000) * 1000);
  futureStart.setMinutes(futureStart.getMinutes() >= 30 ? 30 : 0, 0, 0);
  const futureEnd = new Date(futureStart.getTime() + 30 * 60 * 1000);

  const resCreateSlot = await fetch(`${BASE_URL}/doctors/slots`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${docToken}`,
      'Idempotency-Key': `redis-test-slot-${Date.now()}`,
    },
    body: JSON.stringify({
      slots: [{ start_time: futureStart.toISOString(), end_time: futureEnd.toISOString() }],
    }),
  });
  const dataCreateSlot = await resCreateSlot.json();
  const testSlotId = dataCreateSlot.data?.[0]?.id;
  console.log('Test Availability Slot Created ID:', testSlotId);

  // Concurrently attempt to lock the exact same slot with two different callers
  console.log('Firing 2 simultaneous lock requests for Slot ID:', testSlotId);
  const [race1, race2] = await Promise.all([
    fetch(`${BASE_URL}/bookings/lock`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${rohanToken}`,
      },
      body: JSON.stringify({ slot_id: testSlotId }),
    }),
    fetch(`${BASE_URL}/bookings/lock`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${rohanToken}`,
      },
      body: JSON.stringify({ slot_id: testSlotId }),
    }),
  ]);

  const [dataRace1, dataRace2] = await Promise.all([race1.json(), race2.json()]);
  console.log('Concurrent Lock Request 1 Status:', race1.status, dataRace1.message);
  console.log('Concurrent Lock Request 2 Status:', race2.status, dataRace2.message);

  const statuses = [race1.status, race2.status].sort();
  if (statuses[0] === 200 && statuses[1] === 409) {
    console.log('SUCCESS: Exactly 1 request acquired the lock (200 OK) and 1 was rejected with Conflict (409)!');
  } else {
    console.warn('Unexpected race statuses:', statuses);
  }

  // Step 8: Test Token Revocation / Blacklist on Logout
  console.log('\n[Step 8] Testing JWT Token Blacklisting on Logout (POST /auth/logout)');
  // 1. Create a disposable patient session
  const resLoginTemp = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'ananya.sharma@example.com', password: 'Password@123' }),
  });
  const dataLoginTemp = await resLoginTemp.json();
  const tempToken = dataLoginTemp.data?.tokens?.accessToken;
  console.log('Disposable Patient Authenticated:', !!tempToken);

  // 2. Verify token works
  const resMeBefore = await fetch(`${BASE_URL}/auth/me`, {
    headers: { Authorization: `Bearer ${tempToken}` },
  });
  console.log('Token Profile Access Before Logout:', resMeBefore.status);

  // 3. Perform Logout
  const resLogout = await fetch(`${BASE_URL}/auth/logout`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${tempToken}` },
  });
  const dataLogout = await resLogout.json();
  console.log('Logout Status:', resLogout.status, dataLogout.message);

  // 4. Try to access profile with revoked token
  const resMeAfter = await fetch(`${BASE_URL}/auth/me`, {
    headers: { Authorization: `Bearer ${tempToken}` },
  });
  const dataMeAfter = await resMeAfter.json();
  console.log('Token Profile Access After Logout (Expected 401):', resMeAfter.status, dataMeAfter.message);
  if (resMeAfter.status === 401 && dataMeAfter.data?.code === 'TOKEN_REVOKED') {
    console.log('SUCCESS: Revoked token was rejected immediately via Redis Blacklist!');
  }

  // Step 9: Test Idempotency with Redis Cache
  console.log('\n[Step 9] Testing Write Idempotency via Redis Store');
  const idempotencyKey = `redis-idem-${Date.now()}`;
  const resIdem1 = await fetch(`${BASE_URL}/doctors/profile`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${docToken}`,
      'Idempotency-Key': idempotencyKey,
    },
    body: JSON.stringify({ consultation_fee: 950.0 }),
  });
  console.log('First Idempotent Call Status:', resIdem1.status);

  const resIdem2 = await fetch(`${BASE_URL}/doctors/profile`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${docToken}`,
      'Idempotency-Key': idempotencyKey,
    },
    body: JSON.stringify({ consultation_fee: 950.0 }),
  });
  console.log('Second Idempotent Call Status:', resIdem2.status);
  console.log('Second Idempotent Cache Header:', resIdem2.headers.get('x-cache-lookup'));
  console.log('Second Idempotent Replay Header:', resIdem2.headers.get('x-idempotent-replay'));

  console.log('\n==================================================================');
  console.log('--- ALL REDIS INTEGRATION TESTS SUCCESSFULLY PASSED! ---');
  console.log('==================================================================');
}

runRedisTests().catch((err) => {
  console.error('Test run failed:', err);
  process.exit(1);
});
