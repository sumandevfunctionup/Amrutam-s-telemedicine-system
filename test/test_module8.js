const BASE_URL = 'http://localhost:3000/api/v1';

async function runModule8Tests() {
  console.log('==================================================================');
  console.log('--- STARTING MODULE 8: COMPLIANCE & ADMIN AUDIT TRAILS TESTS ---');
  console.log('==================================================================');

  // Step 1: Unauthenticated access attempt
  console.log('\n[Step 1] Attempting unauthenticated access to /admin/audit-logs');
  const resUnauth = await fetch(`${BASE_URL}/admin/audit-logs`);
  const dataUnauth = await resUnauth.json();
  console.log('Unauthenticated Status (Expected 401):', resUnauth.status, dataUnauth.message);
  if (resUnauth.status !== 401) {
    throw new Error(`Expected 401 Unauthorized, got ${resUnauth.status}`);
  }

  // Step 2: Authenticate Patient Rohan & Doctor Gupta
  console.log('\n[Step 2] Authenticating Patient Rohan and Doctor Gupta');
  const [resPatient, resDoctor] = await Promise.all([
    fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'rohan.verma@example.com', password: 'Password@123' }),
    }),
    fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'dr.gupta@amrutam.co.in', password: 'Password@123' }),
    }),
  ]);

  const [dataPatient, dataDoctor] = await Promise.all([resPatient.json(), resDoctor.json()]);
  const patientToken = dataPatient.data?.tokens?.accessToken;
  const doctorToken = dataDoctor.data?.tokens?.accessToken;

  // Step 3: Patient RBAC rejection
  console.log('\n[Step 3] Patient Rohan attempts to access /admin/audit-logs');
  const resPatientAccess = await fetch(`${BASE_URL}/admin/audit-logs`, {
    headers: { Authorization: `Bearer ${patientToken}` },
  });
  const dataPatientAccess = await resPatientAccess.json();
  console.log('Patient RBAC Status (Expected 403):', resPatientAccess.status, dataPatientAccess.message);
  if (resPatientAccess.status !== 403) {
    throw new Error(`Expected 403 Forbidden for patient, got ${resPatientAccess.status}`);
  }

  // Step 4: Doctor RBAC rejection
  console.log('\n[Step 4] Doctor Gupta attempts to access /admin/audit-logs');
  const resDocAccess = await fetch(`${BASE_URL}/admin/audit-logs`, {
    headers: { Authorization: `Bearer ${doctorToken}` },
  });
  const dataDocAccess = await resDocAccess.json();
  console.log('Doctor RBAC Status (Expected 403):', resDocAccess.status, dataDocAccess.message);
  if (resDocAccess.status !== 403) {
    throw new Error(`Expected 403 Forbidden for doctor, got ${resDocAccess.status}`);
  }

  // Step 5: Admin authentication
  console.log('\n[Step 5] Authenticating Super Admin (admin@amrutam.co.in)');
  const resAdminLogin = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@amrutam.co.in', password: 'Password@123' }),
  });
  const dataAdminLogin = await resAdminLogin.json();
  const adminToken = dataAdminLogin.data?.tokens?.accessToken;
  console.log('Admin Authenticated:', !!adminToken, 'Role:', dataAdminLogin.data?.user?.role);
  if (!adminToken || dataAdminLogin.data?.user?.role !== 'admin') {
    throw new Error('Failed to login as admin user');
  }

  // Step 6: Admin queries paginated audit logs
  console.log('\n[Step 6] Admin fetches paginated audit logs (GET /admin/audit-logs?limit=5)');
  const resLogs = await fetch(`${BASE_URL}/admin/audit-logs?limit=5`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const dataLogs = await resLogs.json();
  console.log('List Audit Logs Status:', resLogs.status);
  console.log('Total Logs in DB:', dataLogs.data?.pagination?.total);
  console.log('Current Page Logs Count:', dataLogs.data?.logs?.length);
  const sampleLog = dataLogs.data?.logs?.[0];
  console.log('Sample Audit Log Entry:', {
    id: sampleLog?.id,
    action: sampleLog?.action,
    entity_type: sampleLog?.entity_type,
    actor: sampleLog?.actor,
    created_at: sampleLog?.created_at,
  });

  if (!sampleLog || !sampleLog.id || !sampleLog.created_at) {
    throw new Error('Audit log record is missing required non-repudiation fields');
  }

  // Step 7: Filter by entity_type
  console.log('\n[Step 7] Filtering audit logs by entity_type=consultations');
  const resEntityFilter = await fetch(`${BASE_URL}/admin/audit-logs?entity_type=consultations&limit=10`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const dataEntityFilter = await resEntityFilter.json();
  console.log('Entity Filter Status:', resEntityFilter.status);
  console.log('Matching Consultation Logs Found:', dataEntityFilter.data?.logs?.length);
  const nonMatchingEntity = dataEntityFilter.data?.logs?.find((l) => l.entity_type !== 'consultations');
  if (nonMatchingEntity) {
    throw new Error(`Filter failure: found log with entity_type ${nonMatchingEntity.entity_type}`);
  }
  console.log('SUCCESS: All returned records match entity_type="consultations"');

  // Step 8: Filter by action
  console.log('\n[Step 8] Filtering audit logs by action=BOOKING_CONFIRMED');
  const resActionFilter = await fetch(`${BASE_URL}/admin/audit-logs?action=BOOKING_CONFIRMED&limit=5`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const dataActionFilter = await resActionFilter.json();
  console.log('Action Filter Status:', resActionFilter.status);
  console.log('Matching BOOKING_CONFIRMED Logs Found:', dataActionFilter.data?.logs?.length);
  if (dataActionFilter.data?.logs?.length > 0) {
    const nonMatchingAction = dataActionFilter.data?.logs?.find((l) => !l.action.includes('BOOKING_CONFIRMED'));
    if (nonMatchingAction) {
      throw new Error(`Filter failure: found log with action ${nonMatchingAction.action}`);
    }
    console.log('SUCCESS: All returned records match action="BOOKING_CONFIRMED"');
  }

  // Step 9: Compliance Summary Statistics
  console.log('\n[Step 9] Fetching compliance summary statistics (GET /admin/audit-logs/summary)');
  const resSummary = await fetch(`${BASE_URL}/admin/audit-logs/summary`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const dataSummary = await resSummary.json();
  console.log('Summary Status:', resSummary.status);
  console.log('Compliance Summary Data:', {
    total_events: dataSummary.data?.total_events,
    events_last_24h: dataSummary.data?.events_last_24h,
    top_actions: dataSummary.data?.action_breakdown?.slice(0, 3),
    top_entities: dataSummary.data?.entity_breakdown?.slice(0, 3),
    top_actors: dataSummary.data?.top_actors?.slice(0, 2),
  });

  if (typeof dataSummary.data?.total_events !== 'number') {
    throw new Error('Invalid summary structure returned');
  }

  // Step 10: Fetch single audit log entry by ID
  console.log(`\n[Step 10] Fetching single audit log by ID (GET /admin/audit-logs/${sampleLog.id})`);
  const resSingle = await fetch(`${BASE_URL}/admin/audit-logs/${sampleLog.id}`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const dataSingle = await resSingle.json();
  console.log('Single Log Status:', resSingle.status);
  console.log('Detailed Log Details Payload:', dataSingle.data?.details);
  console.log('Detailed Log Actor:', dataSingle.data?.actor);
  console.log('Detailed Log Timestamp (UTC):', dataSingle.data?.created_at);

  if (dataSingle.data?.id !== sampleLog.id) {
    throw new Error('Audit log ID mismatch in single fetch');
  }

  console.log('\n==================================================================');
  console.log('--- ALL MODULE 8 AUDIT & COMPLIANCE TESTS SUCCESSFULLY PASSED! ---');
  console.log('==================================================================');
}

runModule8Tests().catch((err) => {
  console.error('Module 8 test suite failed:', err);
  process.exit(1);
});
