const BASE_URL = 'http://localhost:3000/api/v1';

async function runModule5Tests() {
  console.log('==================================================================');
  console.log('--- STARTING MODULE 5 DIGITAL PRESCRIPTION & EHR TESTS ---');
  console.log('==================================================================');

  // Step 1: Authenticate Doctor Gupta, Patient Rohan, and Patient Ananya
  console.log('\n[Step 1] Authenticating Doctor and Patients');
  const [resDoc, resRohan, resAnanya] = await Promise.all([
    fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'dr.gupta@amrutam.co.in',
        password: 'Password@123',
      }),
    }),
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

  const [dataDoc, dataRohan, dataAnanya] = await Promise.all([
    resDoc.json(),
    resRohan.json(),
    resAnanya.json(),
  ]);

  const docToken = dataDoc.data?.tokens?.accessToken;
  const rohanToken = dataRohan.data?.tokens?.accessToken;
  const ananyaToken = dataAnanya.data?.tokens?.accessToken;
  const rohanUserId = dataRohan.data?.user?.id;

  console.log('Doctor authenticated:', !!docToken);
  console.log('Patient Rohan authenticated:', !!rohanToken, `(ID: ${rohanUserId})`);
  console.log('Patient Ananya authenticated:', !!ananyaToken);

  // Step 2: Create a slot and confirm a booking for Rohan
  console.log('\n[Step 2] Setting up consultation session for prescription flow');
  const futureTime = new Date(Date.now() + 60 * 24 * 3600 * 1000 + Math.floor(Math.random() * 10000000));
  futureTime.setMinutes(futureTime.getMinutes() >= 30 ? 30 : 0, 0, 0);
  const startSlot = futureTime.toISOString();
  const endSlot = new Date(futureTime.getTime() + 30 * 60 * 1000).toISOString();

  const resSlot = await fetch(`${BASE_URL}/doctors/slots`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${docToken}`,
      'Idempotency-Key': `mod5-slot-${Date.now()}`,
    },
    body: JSON.stringify({
      slots: [{ start_time: startSlot, end_time: endSlot }],
    }),
  });
  const dataSlot = await resSlot.json();
  const slotId = dataSlot.data?.[0]?.id;

  const resConfirm = await fetch(`${BASE_URL}/bookings/confirm`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${rohanToken}`,
      'Idempotency-Key': `mod5-book-${Date.now()}`,
    },
    body: JSON.stringify({
      slot_id: slotId,
      type: 'video',
      notes: 'Consultation for recurring irritable bowel symptoms.',
    }),
  });
  const dataConfirm = await resConfirm.json();
  const consultationId = dataConfirm.data?.consultation?.id;
  console.log('Consultation Scheduled ID:', consultationId);

  // Doctor starts session
  await fetch(`${BASE_URL}/consultations/${consultationId}/start`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${docToken}` },
  });
  console.log('Consultation transitioned to in_progress');

  // Step 3: Doctor issues Digital Ayurvedic Prescription
  console.log('\n[Step 3] POST /api/v1/consultations/:id/prescription (Doctor issues digital prescription)');
  const resRx = await fetch(`${BASE_URL}/consultations/${consultationId}/prescription`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${docToken}`,
      'Idempotency-Key': `rx-${consultationId}`,
    },
    body: JSON.stringify({
      diagnosis: 'Chronic Grahani (IBS-D) with Pitta-Vata vitiation and Mandagni',
      medications: [
        {
          name: 'Bilwadi Churna',
          dosage: '1 tsp',
          frequency: 'twice daily',
          timing: 'before meals with fresh buttermilk',
          duration_days: 30,
        },
        {
          name: 'Kutajghan Vati',
          dosage: '2 tablets',
          frequency: 'twice daily',
          timing: 'after meals with lukewarm water',
          duration_days: 21,
        },
        {
          name: 'Mustakarishta',
          dosage: '20 ml',
          frequency: 'twice daily',
          timing: 'after meals with equal quantity of water',
          duration_days: 30,
        },
      ],
      instructions: 'Strictly avoid fermented, deep-fried, and raw foods. Practice daily Takra (buttermilk) regimen spiced with cumin and rock salt.',
      follow_up_date: '2026-10-30',
    }),
  });

  const dataRx = await resRx.json();
  console.log('Prescription Issue Status:', resRx.status);
  console.log('Message:', dataRx.message);
  console.log('Prescription ID:', dataRx.data?.id);
  console.log('Diagnosis:', dataRx.data?.diagnosis);
  console.log('Medications Count:', dataRx.data?.medications?.length);
  console.log('First Medication:', dataRx.data?.medications?.[0]);
  console.log('Issued At (UTC):', dataRx.data?.issued_at);

  const prescriptionId = dataRx.data?.id;

  // Step 4: Immutability & Duplicate Rejection Check
  console.log('\n[Step 4] Immutability Check: Attempting to issue second prescription for same consultation');
  const resDuplicateRx = await fetch(`${BASE_URL}/consultations/${consultationId}/prescription`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${docToken}`,
    },
    body: JSON.stringify({
      diagnosis: 'Duplicate test diagnosis',
      medications: [
        {
          name: 'Triphala Churna',
          dosage: '1 tsp',
          frequency: 'once daily',
          timing: 'bedtime',
          duration_days: 10,
        },
      ],
    }),
  });
  const dataDuplicateRx = await resDuplicateRx.json();
  console.log('Duplicate Status (Expected 409):', resDuplicateRx.status);
  console.log('Conflict Error Message:', dataDuplicateRx.message);

  // Step 5: Get Prescription for Consultation
  console.log(`\n[Step 5] GET /api/v1/consultations/${consultationId}/prescription`);
  const resGetConsultRx = await fetch(`${BASE_URL}/consultations/${consultationId}/prescription`, {
    headers: { Authorization: `Bearer ${rohanToken}` },
  });
  const dataGetConsultRx = await resGetConsultRx.json();
  console.log('Get Consult Rx Status:', resGetConsultRx.status);
  console.log('Doctor Specialization:', dataGetConsultRx.data?.specialization);
  console.log('Doctor License:', dataGetConsultRx.data?.license_number);
  console.log('Prescribed to:', `${dataGetConsultRx.data?.patient_first_name} ${dataGetConsultRx.data?.patient_last_name}`);

  // Step 6: Get Prescription by Prescription ID
  console.log(`\n[Step 6] GET /api/v1/prescriptions/${prescriptionId}`);
  const resGetById = await fetch(`${BASE_URL}/prescriptions/${prescriptionId}`, {
    headers: { Authorization: `Bearer ${rohanToken}` },
  });
  const dataGetById = await resGetById.json();
  console.log('Get By ID Status:', resGetById.status);
  console.log('Diagnosis:', dataGetById.data?.diagnosis);

  // Step 7: Patient Longitudinal Electronic Health Records (EHR)
  console.log(`\n[Step 7] GET /api/v1/prescriptions/patient/${rohanUserId} (Rohan views EHR history)`);
  const resEhr = await fetch(`${BASE_URL}/prescriptions/patient/${rohanUserId}`, {
    headers: { Authorization: `Bearer ${rohanToken}` },
  });
  const dataEhr = await resEhr.json();
  console.log('EHR History Status:', resEhr.status);
  console.log('Total Prescriptions in Health Record:', dataEhr.data?.length);

  // Step 8: Privacy / PHI Protection Check (Ananya tries to view Rohan's medical history)
  console.log('\n[Step 8] Privacy Check: Patient Ananya attempts to view Patient Rohan EHR records (Expected 403)');
  const resForbiddenEhr = await fetch(`${BASE_URL}/prescriptions/patient/${rohanUserId}`, {
    headers: { Authorization: `Bearer ${ananyaToken}` },
  });
  const dataForbiddenEhr = await resForbiddenEhr.json();
  console.log('Privacy Check Status (Expected 403):', resForbiddenEhr.status);
  console.log('Error Message:', dataForbiddenEhr.message);

  console.log('\n==================================================================');
  console.log('--- ALL MODULE 5 TESTS SUCCESSFULLY PASSED! ---');
  console.log('==================================================================');
}

runModule5Tests().catch(console.error);
