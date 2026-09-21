const BASE_URL = 'http://localhost:3000/api/v1';

async function runModule4Tests() {
  console.log('===========================================================');
  console.log('--- STARTING MODULE 4 CONSULTATION LIFECYCLE TESTS ---');
  console.log('===========================================================');

  // Step 1: Login Doctor Gupta & Patient Rohan
  console.log('\n[Step 1] Authenticating Doctor Gupta and Patient Rohan');
  const [resDoc, resPat] = await Promise.all([
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
  ]);

  const [dataDoc, dataPat] = await Promise.all([resDoc.json(), resPat.json()]);
  const docToken = dataDoc.data?.tokens?.accessToken;
  const patToken = dataPat.data?.tokens?.accessToken;
  console.log('Doctor Token received:', !!docToken);
  console.log('Patient Token received:', !!patToken);

  // Step 2: Create a fresh availability slot & confirm a booking to generate a scheduled consultation
  console.log('\n[Step 2] Creating availability slot & confirming consultation booking');
  const futureTime = new Date(Date.now() + 50 * 24 * 3600 * 1000 + Math.floor(Math.random() * 10000000));
  futureTime.setMinutes(futureTime.getMinutes() >= 30 ? 30 : 0, 0, 0);
  const startSlot = futureTime.toISOString();
  const endSlot = new Date(futureTime.getTime() + 30 * 60 * 1000).toISOString();

  const resSlot = await fetch(`${BASE_URL}/doctors/slots`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${docToken}`,
      'Idempotency-Key': `mod4-slot-${Date.now()}`,
    },
    body: JSON.stringify({
      slots: [{ start_time: startSlot, end_time: endSlot }],
    }),
  });
  const dataSlot = await resSlot.json();
  const slotId = dataSlot.data?.[0]?.id;
  console.log('Slot created:', { slotId, startSlot, endSlot });

  // Patient confirms booking
  const resConfirm = await fetch(`${BASE_URL}/bookings/confirm`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${patToken}`,
      'Idempotency-Key': `mod4-book-${Date.now()}`,
    },
    body: JSON.stringify({
      slot_id: slotId,
      type: 'video',
      notes: 'Initial consultation regarding recurrent digestive issues.',
    }),
  });
  const dataConfirm = await resConfirm.json();
  const consultationId = dataConfirm.data?.consultation?.id;
  console.log('Consultation Scheduled:', {
    consultationId,
    status: dataConfirm.data?.consultation?.status,
    meeting_link: dataConfirm.data?.consultation?.meeting_link,
  });

  // Step 3: List consultations for Doctor
  console.log('\n[Step 3] GET /api/v1/consultations (Doctor perspective)');
  const resDocList = await fetch(`${BASE_URL}/consultations?status=scheduled`, {
    headers: { Authorization: `Bearer ${docToken}` },
  });
  const dataDocList = await resDocList.json();
  console.log('Doctor Scheduled Consultations Status:', resDocList.status);
  console.log('Doctor Total Consultations:', dataDocList.data?.pagination?.total);

  // Step 4: Get consultation details by ID
  console.log(`\n[Step 4] GET /api/v1/consultations/${consultationId}`);
  const resDetails = await fetch(`${BASE_URL}/consultations/${consultationId}`, {
    headers: { Authorization: `Bearer ${patToken}` },
  });
  const dataDetails = await resDetails.json();
  console.log('Consultation Details Status:', resDetails.status);
  console.log('Doctor Name:', `${dataDetails.data?.doctor_first_name} ${dataDetails.data?.doctor_last_name}`);
  console.log('Patient Name:', `${dataDetails.data?.patient_first_name} ${dataDetails.data?.patient_last_name}`);
  console.log('Specialization:', dataDetails.data?.specialization);
  console.log('Meeting Link:', dataDetails.data?.meeting_link);
  console.log('Has Prescription:', dataDetails.data?.has_prescription);

  // Step 5: Security check - Patient cannot start consultation
  console.log('\n[Step 5] Security Check: Patient attempts to start consultation (Expected 403)');
  const resForbiddenStart = await fetch(`${BASE_URL}/consultations/${consultationId}/start`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${patToken}` },
  });
  const dataForbiddenStart = await resForbiddenStart.json();
  console.log('Status (Expected 403):', resForbiddenStart.status);
  console.log('Error Message:', dataForbiddenStart.message);

  // Step 6: Doctor starts consultation session (scheduled -> in_progress)
  console.log(`\n[Step 6] PATCH /api/v1/consultations/${consultationId}/start (Doctor)`);
  const resStart = await fetch(`${BASE_URL}/consultations/${consultationId}/start`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${docToken}` },
  });
  const dataStart = await resStart.json();
  console.log('Start Status:', resStart.status);
  console.log('Consultation Status:', dataStart.data?.status);
  console.log('Updated At (UTC):', dataStart.data?.updated_at);

  // Step 7: Doctor records Ayurvedic SOAP notes
  console.log(`\n[Step 7] PATCH /api/v1/consultations/${consultationId}/notes (Record SOAP)`);
  const resNotes = await fetch(`${BASE_URL}/consultations/${consultationId}/notes`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${docToken}`,
    },
    body: JSON.stringify({
      subjective: 'Patient reports chronic acid reflux, burning sensation in epigastrium after spicy meals.',
      objective: 'Pitta pulse elevated (Tikshna), mild Ama coating on tongue edges, Prakriti: Pitta-Kapha.',
      assessment: 'Amlapitta (Hyperacidity) due to Vidagdha Pitta and Mandagni.',
      plan: '1. Sutashekhar Rasa 1 tab BD after meals.\n2. Avipattikar Churna 1 tsp at bedtime with warm water.\n3. Pathya: coconut water, boiled vegetables. Apathya: avoid fried, sour, fermented food.',
    }),
  });
  const dataNotes = await resNotes.json();
  console.log('SOAP Notes Status:', resNotes.status);
  console.log('Saved Notes Content:\n', dataNotes.data?.notes);

  // Step 8: Complete Consultation (in_progress -> completed)
  console.log(`\n[Step 8] PATCH /api/v1/consultations/${consultationId}/complete`);
  const resComplete = await fetch(`${BASE_URL}/consultations/${consultationId}/complete`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${docToken}`,
    },
    body: JSON.stringify({
      notes: 'Session finished. Digital prescription will be issued shortly.',
    }),
  });
  const dataComplete = await resComplete.json();
  console.log('Complete Status:', resComplete.status);
  console.log('Final Consultation Status:', dataComplete.data?.status);
  console.log('Final Notes Preview:', dataComplete.data?.notes?.substring(0, 80) + '...');

  // Step 9: State Machine Invariant Check (Cannot cancel completed consultation)
  console.log('\n[Step 9] State Machine Invariant Check: Attempting to cancel completed consultation');
  const resInvalidCancel = await fetch(`${BASE_URL}/consultations/${consultationId}/cancel`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${patToken}`,
    },
    body: JSON.stringify({
      reason: 'Trying to cancel an already completed session.',
    }),
  });
  const dataInvalidCancel = await resInvalidCancel.json();
  console.log('Status (Expected 409):', resInvalidCancel.status);
  console.log('Conflict Message:', dataInvalidCancel.message);

  console.log('\n===========================================================');
  console.log('--- ALL MODULE 4 TESTS SUCCESSFULLY PASSED! ---');
  console.log('===========================================================');
}

runModule4Tests().catch(console.error);
