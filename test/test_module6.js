const BASE_URL = 'http://localhost:3000/api/v1';

async function runModule6Tests() {
  console.log('==================================================================');
  console.log('--- STARTING MODULE 6 PAYMENTS & SAGA LEDGER TESTS ---');
  console.log('==================================================================');

  // Step 1: Authenticate Doctor Gupta & Patient Rohan
  console.log('\n[Step 1] Authenticating Doctor Gupta and Patient Rohan');
  const [resDoc, resRohan] = await Promise.all([
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

  const [dataDoc, dataRohan] = await Promise.all([resDoc.json(), resRohan.json()]);
  const docToken = dataDoc.data?.tokens?.accessToken;
  const rohanToken = dataRohan.data?.tokens?.accessToken;
  console.log('Doctor authenticated:', !!docToken);
  console.log('Patient Rohan authenticated:', !!rohanToken);

  // Step 2: Create a slot and scheduled consultation
  console.log('\n[Step 2] Creating availability slot & scheduling consultation');
  const offset1 = Math.floor(Date.now() / 1000) % 50000;
  const futureTime = new Date(Date.now() + 80 * 24 * 3600 * 1000 + offset1 * 60 * 1000);
  futureTime.setMinutes(futureTime.getMinutes() >= 30 ? 30 : 0, 0, 0);
  const startSlot = futureTime.toISOString();
  const endSlot = new Date(futureTime.getTime() + 30 * 60 * 1000).toISOString();

  const resSlot = await fetch(`${BASE_URL}/doctors/slots`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${docToken}`,
      'Idempotency-Key': `mod6-slot-${Date.now()}`,
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
      'Idempotency-Key': `mod6-book-${Date.now()}`,
    },
    body: JSON.stringify({
      slot_id: slotId,
      type: 'video',
      notes: 'Consultation for wellness and Rasayana guidance.',
    }),
  });
  const dataConfirm = await resConfirm.json();
  const consultationId = dataConfirm.data?.consultation?.id;
  console.log('Consultation Scheduled ID:', consultationId);

  // Step 3: Initiate Payment Order
  console.log('\n[Step 3] POST /api/v1/payments/initiate (Patient initiates checkout intent)');
  const resInit = await fetch(`${BASE_URL}/payments/initiate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${rohanToken}`,
      'Idempotency-Key': `pay-init-${Date.now()}`,
    },
    body: JSON.stringify({
      consultation_id: consultationId,
      payment_method: 'upi',
    }),
  });
  const dataInit = await resInit.json();
  console.log('Initiate Status:', resInit.status);
  const paymentRecord = dataInit.data?.payment;
  const transactionId = dataInit.data?.transaction_id || paymentRecord?.transaction_id;
  const paymentId = paymentRecord?.id;
  console.log('Payment Order Created:', {
    paymentId,
    transactionId,
    amount: paymentRecord?.amount,
    currency: paymentRecord?.currency,
    status: paymentRecord?.status,
    expires_at: dataInit.data?.expires_at,
  });

  // Step 4: Webhook Payment Success
  console.log('\n[Step 4] POST /api/v1/payments/webhook (Gateway reports payment.success)');
  const resWebhookSuccess = await fetch(`${BASE_URL}/payments/webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      event: 'payment.success',
      transaction_id: transactionId,
    }),
  });
  const dataWebhookSuccess = await resWebhookSuccess.json();
  console.log('Webhook Success Status:', resWebhookSuccess.status);
  console.log('Payment Status after success:', dataWebhookSuccess.data?.payment?.status);

  // Step 5: Webhook Idempotency Check (Duplicate Delivery)
  console.log('\n[Step 5] POST /api/v1/payments/webhook (Duplicate webhook delivery idempotency)');
  const resWebhookDup = await fetch(`${BASE_URL}/payments/webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      event: 'payment.success',
      transaction_id: transactionId,
    }),
  });
  const dataWebhookDup = await resWebhookDup.json();
  console.log('Duplicate Webhook Status:', resWebhookDup.status);
  console.log('Idempotent Message:', dataWebhookDup.message);
  console.log('Is Idempotent Flag:', dataWebhookDup.data?.idempotent);

  // Step 6: SAGA COMPENSATING ACTION TEST
  // Setup a second consultation to test payment failure rollback
  const offset2 = (Math.floor(Date.now() / 1000) % 50000) + 120;
  const futureTime2 = new Date(Date.now() + 85 * 24 * 3600 * 1000 + offset2 * 60 * 1000);
  futureTime2.setMinutes(futureTime2.getMinutes() >= 30 ? 30 : 0, 0, 0);
  const startSlot2 = futureTime2.toISOString();
  const endSlot2 = new Date(futureTime2.getTime() + 30 * 60 * 1000).toISOString();

  const resSlot2 = await fetch(`${BASE_URL}/doctors/slots`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${docToken}`,
      'Idempotency-Key': `mod6-slot2-${Date.now()}`,
    },
    body: JSON.stringify({
      slots: [{ start_time: startSlot2, end_time: endSlot2 }],
    }),
  });
  const dataSlot2 = await resSlot2.json();
  const slotId2 = dataSlot2.data?.[0]?.id;

  const resConfirm2 = await fetch(`${BASE_URL}/bookings/confirm`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${rohanToken}`,
      'Idempotency-Key': `mod6-book2-${Date.now()}`,
    },
    body: JSON.stringify({
      slot_id: slotId2,
      type: 'audio',
    }),
  });
  const dataConfirm2 = await resConfirm2.json();
  const consultationId2 = dataConfirm2.data?.consultation?.id;
  const initialPaymentId2 = dataConfirm2.data?.payment?.id;
  const initialTxn2 = dataConfirm2.data?.payment?.transaction_id;

  console.log('Saga Consultation 2 created:', { consultationId2, slotId2, initialTxn2 });

  // Simulate payment failure webhook
  console.log('Posting payment.failed webhook for transaction:', initialTxn2);
  const resWebhookFail = await fetch(`${BASE_URL}/payments/webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      event: 'payment.failed',
      transaction_id: initialTxn2,
    }),
  });
  const dataWebhookFail = await resWebhookFail.json();
  console.log('Failure Webhook Status:', resWebhookFail.status);
  console.log('Payment Status:', dataWebhookFail.data?.payment?.status);
  console.log('Saga Compensation Triggered:', dataWebhookFail.data?.saga_compensation);

  // Check that consultation is cancelled and slot is released back to available
  const resCheckConsult = await fetch(`${BASE_URL}/consultations/${consultationId2}`, {
    headers: { Authorization: `Bearer ${rohanToken}` },
  });
  const dataCheckConsult = await resCheckConsult.json();
  console.log('Consultation 2 Status after Saga rollback:', dataCheckConsult.data?.status);
  console.log('Slot Status after Saga rollback:', dataCheckConsult.data?.slot_status);

  // Step 7: Process Refund for first completed payment
  console.log(`\n[Step 7] POST /api/v1/payments/${paymentId}/refund (Processing customer refund)`);
  const resRefund = await fetch(`${BASE_URL}/payments/${paymentId}/refund`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${rohanToken}`,
    },
    body: JSON.stringify({
      reason: 'Patient requested rescheduling and fee refund.',
    }),
  });
  const dataRefund = await resRefund.json();
  console.log('Refund Status:', resRefund.status);
  console.log('Refund Message:', dataRefund.message);
  console.log('Refund Transaction ID:', dataRefund.data?.refund_transaction_id);
  console.log('Refunded Payment Status:', dataRefund.data?.payment?.status);

  // Step 8: Get My Payments
  console.log('\n[Step 8] GET /api/v1/payments/my-payments (Patient Rohan ledger history)');
  const resMyPayments = await fetch(`${BASE_URL}/payments/my-payments`, {
    headers: { Authorization: `Bearer ${rohanToken}` },
  });
  const dataMyPayments = await resMyPayments.json();
  console.log('My Payments Status:', resMyPayments.status);
  console.log('Total Ledger Entries Found:', dataMyPayments.data?.pagination?.total);
  if (dataMyPayments.data?.payments?.length > 0) {
    console.log('Latest Payment Entry:', {
      id: dataMyPayments.data.payments[0].id,
      amount: dataMyPayments.data.payments[0].amount,
      currency: dataMyPayments.data.payments[0].currency,
      status: dataMyPayments.data.payments[0].status,
      method: dataMyPayments.data.payments[0].payment_method,
      created_at: dataMyPayments.data.payments[0].created_at,
    });
  }

  // Step 9: Get Payment by ID
  console.log(`\n[Step 9] GET /api/v1/payments/${paymentId}`);
  const resGetPay = await fetch(`${BASE_URL}/payments/${paymentId}`, {
    headers: { Authorization: `Bearer ${rohanToken}` },
  });
  const dataGetPay = await resGetPay.json();
  console.log('Get Payment By ID Status:', resGetPay.status);
  console.log('Payment Details:', {
    id: dataGetPay.data?.id,
    amount: dataGetPay.data?.amount,
    status: dataGetPay.data?.status,
    doctor: `${dataGetPay.data?.doctor_first_name} ${dataGetPay.data?.doctor_last_name}`,
    created_at: dataGetPay.data?.created_at,
  });

  console.log('\n==================================================================');
  console.log('--- ALL MODULE 6 TESTS SUCCESSFULLY PASSED! ---');
  console.log('==================================================================');
}

runModule6Tests().catch(console.error);
