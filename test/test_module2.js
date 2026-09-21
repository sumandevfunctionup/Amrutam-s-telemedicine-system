const BASE_URL = 'http://localhost:3000/api/v1';

async function runTests() {
  console.log('--- STARTING MODULE 2 VERIFICATION TESTS ---');

  // Test 1: List doctors
  console.log('\n[Test 1] GET /api/v1/doctors');
  const resList = await fetch(`${BASE_URL}/doctors`);
  const dataList = await resList.json();
  console.log('Status:', resList.status);
  console.log('Total Doctors Found:', dataList.data?.pagination?.total);
  if (dataList.data?.doctors?.length > 0) {
    console.log('Sample Doctor:', {
      id: dataList.data.doctors[0].id,
      name: `${dataList.data.doctors[0].first_name} ${dataList.data.doctors[0].last_name}`,
      specialization: dataList.data.doctors[0].specialization,
      fee: dataList.data.doctors[0].consultation_fee,
      rating: dataList.data.doctors[0].rating,
      created_at: dataList.data.doctors[0].created_at,
    });
  }

  const doctorId = dataList.data?.doctors[0]?.id;

  // Test 2: Get Doctor by ID
  console.log(`\n[Test 2] GET /api/v1/doctors/${doctorId}`);
  const resDoc = await fetch(`${BASE_URL}/doctors/${doctorId}`);
  const dataDoc = await resDoc.json();
  console.log('Status:', resDoc.status);
  console.log('Doctor details:', {
    name: `${dataDoc.data?.first_name} ${dataDoc.data?.last_name}`,
    email: dataDoc.data?.email,
    bio: dataDoc.data?.bio,
    license: dataDoc.data?.license_number,
    created_at: dataDoc.data?.created_at,
  });

  // Test 3: Log in as Doctor Gupta
  console.log('\n[Test 3] POST /api/v1/auth/login (Doctor Gupta)');
  const resLogin = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'dr.gupta@amrutam.co.in',
      password: 'Password@123',
    }),
  });
  const dataLogin = await resLogin.json();
  console.log('Login Status:', resLogin.status);
  const token = dataLogin.data?.tokens?.accessToken;
  console.log('Access Token received:', !!token);

  // Fetch logged in doctor profile to get Dr. Gupta's doctor ID
  const resMe = await fetch(`${BASE_URL}/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const dataMe = await resMe.json();
  const drGuptaDocId = dataMe.data?.doctor?.id;
  console.log('Dr Gupta Doctor ID:', drGuptaDocId);

  // Test 4: Update Doctor Profile
  console.log('\n[Test 4] PUT /api/v1/doctors/profile');
  const resUpdate = await fetch(`${BASE_URL}/doctors/profile`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      consultation_fee: 950,
      bio: 'Panchakarma and detox specialist with 14+ years clinical experience.',
    }),
  });
  const dataUpdate = await resUpdate.json();
  console.log('Update Status:', resUpdate.status);
  console.log('Updated Fee:', dataUpdate.data?.consultation_fee);
  console.log('Updated At (UTC):', dataUpdate.data?.updated_at);

  // Use a clean future test date: 2026-10-15
  const testDate = '2026-10-15';
  const start1 = `${testDate}T10:00:00.000Z`;
  const end1 = `${testDate}T10:30:00.000Z`;
  const start2 = `${testDate}T10:30:00.000Z`;
  const end2 = `${testDate}T11:00:00.000Z`;

  // Test 5: Batch Create Availability Slots
  console.log('\n[Test 5] POST /api/v1/doctors/slots (Batch creation)');
  const resSlots = await fetch(`${BASE_URL}/doctors/slots`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      'Idempotency-Key': `slot-batch-${Date.now()}`,
    },
    body: JSON.stringify({
      slots: [
        { start_time: start1, end_time: end1 },
        { start_time: start2, end_time: end2 },
      ],
    }),
  });
  const dataSlots = await resSlots.json();
  console.log('Create Slots Status:', resSlots.status);
  console.log('Message:', dataSlots.message);
  console.log('Created Slots:', dataSlots.data?.map(s => ({
    id: s.id,
    start: s.start_time,
    end: s.end_time,
    status: s.status,
  })));

  const newSlotId = dataSlots.data?.[0]?.id;

  // Test 6: Overlap Conflict Rejection
  console.log('\n[Test 6] POST /api/v1/doctors/slots (Overlap conflict test)');
  const resOverlap = await fetch(`${BASE_URL}/doctors/slots`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      slots: [
        {
          start_time: `${testDate}T10:15:00.000Z`, // Overlaps with 10:00-10:30
          end_time: `${testDate}T10:45:00.000Z`,
        },
      ],
    }),
  });
  const dataOverlap = await resOverlap.json();
  console.log('Overlap Status (Expected 409):', resOverlap.status);
  console.log('Conflict Error Message:', dataOverlap.message);

  // Test 7: Query Doctor Availability Slots for Dr Gupta
  console.log(`\n[Test 7] GET /api/v1/doctors/${drGuptaDocId}/slots`);
  const resGetSlots = await fetch(
    `${BASE_URL}/doctors/${drGuptaDocId}/slots?startDate=${testDate}T00:00:00.000Z&status=available`
  );
  const dataGetSlots = await resGetSlots.json();
  console.log('Get Slots Status:', resGetSlots.status);
  console.log('Slots Count on', testDate, ':', dataGetSlots.data?.length);
  console.log('Returned slots timestamps (UTC):', dataGetSlots.data?.map(s => ({
    start: s.start_time,
    end: s.end_time,
    status: s.status,
  })));

  // Test 8: Cancel an Available Slot
  if (newSlotId) {
    console.log(`\n[Test 8] DELETE /api/v1/doctors/slots/${newSlotId}`);
    const resCancel = await fetch(`${BASE_URL}/doctors/slots/${newSlotId}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    const dataCancel = await resCancel.json();
    console.log('Cancel Status:', resCancel.status);
    console.log('Cancel Message:', dataCancel.message);
    console.log('Result:', dataCancel.data);
  }

  // Test 9: Authorization enforcement (Patient cannot create slots)
  console.log('\n[Test 9] POST /api/v1/auth/login (Patient)');
  const resPatientLogin = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'rohan.verma@example.com',
      password: 'Password@123',
    }),
  });
  const dataPatientLogin = await resPatientLogin.json();
  const patientToken = dataPatientLogin.data?.tokens?.accessToken;

  console.log('Attempt slot creation as Patient:');
  const resForbidden = await fetch(`${BASE_URL}/doctors/slots`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${patientToken}`,
    },
    body: JSON.stringify({
      slots: [
        {
          start_time: '2026-09-26T10:00:00.000Z',
          end_time: '2026-09-26T10:30:00.000Z',
        },
      ],
    }),
  });
  const dataForbidden = await resForbidden.json();
  console.log('Patient Slot Creation Status (Expected 403):', resForbidden.status);
  console.log('Error Message:', dataForbidden.message);

  console.log('\n--- ALL MODULE 2 TESTS COMPLETED ---');
}

runTests().catch(console.error);
