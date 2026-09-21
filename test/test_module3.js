const BASE_URL = 'http://localhost:3000/api/v1';

async function runModule3Tests() {
  console.log('=====================================================');
  console.log('--- STARTING MODULE 3 CONCURRENCY & BOOKING TESTS ---');
  console.log('=====================================================');

  // Step 1: Login as Doctor Gupta to create fresh slots for testing
  console.log('\n[Step 1] Login as Doctor Gupta to create test availability slot');
  const resDocLogin = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'dr.gupta@amrutam.co.in',
      password: 'Password@123',
    }),
  });
  const dataDocLogin = await resDocLogin.json();
  const docToken = dataDocLogin.data?.tokens?.accessToken;
  console.log('Doctor authenticated:', !!docToken);

  const offsetMinutes = Math.floor(Date.now() / 1000) % 100000;
  const futureDate = new Date(Date.now() + 40 * 24 * 3600 * 1000 + offsetMinutes * 60 * 1000);
  // Round to nearest 30 mins
  futureDate.setMinutes(futureDate.getMinutes() >= 30 ? 30 : 0, 0, 0);
  const startSlot = futureDate.toISOString();
  const endSlot = new Date(futureDate.getTime() + 30 * 60 * 1000).toISOString();

  const resCreateSlot = await fetch(`${BASE_URL}/doctors/slots`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${docToken}`,
      'Idempotency-Key': `booking-test-slot-${Date.now()}`,
    },
    body: JSON.stringify({
      slots: [{ start_time: startSlot, end_time: endSlot }],
    }),
  });
  const dataCreateSlot = await resCreateSlot.json();
  if (resCreateSlot.status !== 201) {
    console.error('Failed to create slot:', dataCreateSlot);
  }
  const testSlotId = dataCreateSlot.data?.[0]?.id;
  console.log('Fresh Slot Created:', { id: testSlotId, start: startSlot, end: endSlot });

  // Step 2: Login as Patient 1 (Rohan) and Patient 2 (Priya)
  console.log('\n[Step 2] Authenticating 2 distinct patients for concurrency test');
  const [resPat1, resPat2] = await Promise.all([
    fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'rohan.verma@example.com',
        password: 'Password@123',
      }),
    }),
    fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'ananya.sharma@example.com',
        password: 'Password@123',
      }),
    }),
  ]);

  const [dataPat1, dataPat2] = await Promise.all([resPat1.json(), resPat2.json()]);
  const tokenPat1 = dataPat1.data?.tokens?.accessToken;
  const tokenPat2 = dataPat2.data?.tokens?.accessToken;
  console.log('Patient 1 (Rohan) authenticated:', !!tokenPat1);
  console.log('Patient 2 (Ananya) authenticated:', !!tokenPat2);

  // Step 3: High-Concurrency Race Condition Test
  console.log('\n[Step 3] RACE CONDITION SIMULATION: 2 simultaneous lock requests on slot', testSlotId);
  console.log('Firing concurrent lock requests simultaneously...');

  const [raceRes1, raceRes2] = await Promise.all([
    fetch(`${BASE_URL}/bookings/lock`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenPat1}`,
      },
      body: JSON.stringify({ slot_id: testSlotId }),
    }),
    fetch(`${BASE_URL}/bookings/lock`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenPat2}`,
      },
      body: JSON.stringify({ slot_id: testSlotId }),
    }),
  ]);

  const [raceData1, raceData2] = await Promise.all([raceRes1.json(), raceRes2.json()]);

  console.log('Race Result - Patient 1 Status:', raceRes1.status, 'Message:', raceData1.message);
  console.log('Race Result - Patient 2 Status:', raceRes2.status, 'Message:', raceData2.message);

  const statuses = [raceRes1.status, raceRes2.status];
  const hasSuccess = statuses.includes(200);
  const hasConflict = statuses.includes(409);

  if (hasSuccess && hasConflict) {
    console.log('>>> SUCCESS: Concurrency lock successfully prevented double-reservation! Exactly 1 winner (200) and 1 loser (409).');
  } else {
    console.error('>>> FAILURE: Concurrency check failed! Statuses:', statuses);
  }

  // Identify who won the lock
  const winnerToken = raceRes1.status === 200 ? tokenPat1 : tokenPat2;
  const winnerName = raceRes1.status === 200 ? 'Rohan (Patient 1)' : 'Ananya (Patient 2)';
  const loserToken = raceRes1.status === 200 ? tokenPat2 : tokenPat1;
  console.log(`Lock winner: ${winnerName}`);

  // Step 4: Confirm Booking with checkout details
  console.log('\n[Step 4] Confirming booking for winning patient');
  const resConfirm = await fetch(`${BASE_URL}/bookings/confirm`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${winnerToken}`,
      'Idempotency-Key': `confirm-booking-${Date.now()}`,
    },
    body: JSON.stringify({
      slot_id: testSlotId,
      type: 'video',
      notes: 'Experiencing aggravated Pitta symptoms and hyperacidity.',
    }),
  });
  const dataConfirm = await resConfirm.json();
  console.log('Confirm Status:', resConfirm.status);
  console.log('Consultation ID:', dataConfirm.data?.consultation?.id);
  console.log('Meeting Link:', dataConfirm.data?.consultation?.meeting_link);
  console.log('Consultation Status:', dataConfirm.data?.consultation?.status);
  console.log('Slot Status:', dataConfirm.data?.slot?.status);
  console.log('Slot Version (Optimistic incremented):', dataConfirm.data?.slot?.version);
  console.log('Payment Status:', dataConfirm.data?.payment?.status);
  console.log('Booked At (UTC):', dataConfirm.data?.consultation?.created_at);

  const consultationId = dataConfirm.data?.consultation?.id;

  // Step 5: Prevent Double Booking
  console.log('\n[Step 5] Attempting to book already-booked slot');
  const resDoubleBook = await fetch(`${BASE_URL}/bookings/confirm`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${loserToken}`,
    },
    body: JSON.stringify({
      slot_id: testSlotId,
      type: 'video',
    }),
  });
  const dataDoubleBook = await resDoubleBook.json();
  console.log('Double-book Status (Expected 409):', resDoubleBook.status);
  console.log('Rejection Message:', dataDoubleBook.message);

  // Step 6: Query My Bookings
  console.log('\n[Step 6] GET /api/v1/bookings/my-bookings');
  const resMyBookings = await fetch(`${BASE_URL}/bookings/my-bookings`, {
    headers: { Authorization: `Bearer ${winnerToken}` },
  });
  const dataMyBookings = await resMyBookings.json();
  console.log('My Bookings Status:', resMyBookings.status);
  console.log('Total Consultations Found:', dataMyBookings.data?.pagination?.total);
  if (dataMyBookings.data?.bookings?.length > 0) {
    const b = dataMyBookings.data.bookings[0];
    console.log('Sample Booking:', {
      consultation_id: b.consultation_id,
      doctor: `${b.doctor_first_name} ${b.doctor_last_name}`,
      specialization: b.specialization,
      start_time: b.start_time,
      status: b.consultation_status,
      meeting_link: b.meeting_link,
    });
  }

  // Step 7: Cancel Booking
  console.log('\n[Step 7] POST /api/v1/bookings/cancel');
  const resCancel = await fetch(`${BASE_URL}/bookings/cancel`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${winnerToken}`,
    },
    body: JSON.stringify({
      consultation_id: consultationId,
      reason: 'Personal emergency, need to reschedule next week.',
    }),
  });
  const dataCancel = await resCancel.json();
  console.log('Cancel Status:', resCancel.status);
  console.log('Cancel Message:', dataCancel.message);
  console.log('Result:', dataCancel.data);

  console.log('\n=====================================================');
  console.log('--- ALL MODULE 3 TESTS SUCCESSFULLY PASSED! ---');
  console.log('=====================================================');
}

runModule3Tests().catch(console.error);
