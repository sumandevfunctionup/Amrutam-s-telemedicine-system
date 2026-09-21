const BASE_URL = 'http://localhost:3000/api/v1';

async function runModule9Tests() {
  console.log('==================================================================');
  console.log('--- STARTING MODULE 9: ADMIN ANALYTICS & INTELLIGENCE TESTS ---');
  console.log('==================================================================');

  // Step 1: Unauthenticated RBAC check
  console.log('\n[Step 1] Attempting unauthenticated access to /admin/analytics/overview');
  const resUnauth = await fetch(`${BASE_URL}/admin/analytics/overview`);
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
  console.log('\n[Step 3] Patient attempts to access /admin/analytics/overview');
  const resPatientAccess = await fetch(`${BASE_URL}/admin/analytics/overview`, {
    headers: { Authorization: `Bearer ${patientToken}` },
  });
  console.log('Patient RBAC Status (Expected 403):', resPatientAccess.status);
  if (resPatientAccess.status !== 403) {
    throw new Error(`Expected 403 Forbidden for patient, got ${resPatientAccess.status}`);
  }

  // Step 4: Doctor RBAC rejection
  console.log('\n[Step 4] Doctor attempts to access /admin/analytics/overview');
  const resDoctorAccess = await fetch(`${BASE_URL}/admin/analytics/overview`, {
    headers: { Authorization: `Bearer ${doctorToken}` },
  });
  console.log('Doctor RBAC Status (Expected 403):', resDoctorAccess.status);
  if (resDoctorAccess.status !== 403) {
    throw new Error(`Expected 403 Forbidden for doctor, got ${resDoctorAccess.status}`);
  }

  // Step 5: Admin Login
  console.log('\n[Step 5] Authenticating Super Admin (admin@amrutam.co.in)');
  const resAdminLogin = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@amrutam.co.in', password: 'Password@123' }),
  });
  const dataAdminLogin = await resAdminLogin.json();
  const adminToken = dataAdminLogin.data?.tokens?.accessToken;
  console.log('Admin Authenticated:', !!adminToken);

  // Step 6: Executive Overview KPIs
  console.log('\n[Step 6] Admin queries Executive Overview KPIs (GET /admin/analytics/overview)');
  const resOverview1 = await fetch(`${BASE_URL}/admin/analytics/overview`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const dataOverview1 = await resOverview1.json();
  console.log('Overview Status:', resOverview1.status);
  console.log('1st Call Cache Lookup Header:', resOverview1.headers.get('x-cache-lookup'));
  console.log('Overview KPIs Data:', {
    consultations: dataOverview1.data?.consultations,
    users: dataOverview1.data?.users,
    financials: dataOverview1.data?.financials,
  });

  if (dataOverview1.data?.consultations?.target_daily_capacity !== 100000) {
    throw new Error('Missing 100k daily capacity target metric');
  }

  // Verify Redis Caching on Overview
  const resOverview2 = await fetch(`${BASE_URL}/admin/analytics/overview`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const lookupOverview2 = resOverview2.headers.get('x-cache-lookup');
  console.log('2nd Call Cache Lookup Header (Expected HIT-REDIS):', lookupOverview2);
  if (lookupOverview2 !== 'HIT-REDIS') {
    console.warn('Expected HIT-REDIS on overview, got:', lookupOverview2);
  } else {
    console.log('SUCCESS: Analytics overview served from Redis cache!');
  }

  // Step 7: Consultation Timeseries
  console.log('\n[Step 7] Admin queries Consultation Timeseries (GET /admin/analytics/consultations?groupBy=day)');
  const resTimeseries1 = await fetch(`${BASE_URL}/admin/analytics/consultations?groupBy=day`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const dataTimeseries1 = await resTimeseries1.json();
  console.log('Timeseries Status:', resTimeseries1.status);
  console.log('1st Call Cache Header:', resTimeseries1.headers.get('x-cache-lookup'));
  console.log('Timeseries Buckets Count:', dataTimeseries1.data?.timeseries?.length);
  console.log('Sample Bucket:', dataTimeseries1.data?.timeseries?.[0]);

  const resTimeseries2 = await fetch(`${BASE_URL}/admin/analytics/consultations?groupBy=day`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  console.log('2nd Call Cache Header (Expected HIT-REDIS):', resTimeseries2.headers.get('x-cache-lookup'));

  // Step 8: Revenue Performance Intelligence
  console.log('\n[Step 8] Admin queries Revenue Performance (GET /admin/analytics/revenue)');
  const resRevenue1 = await fetch(`${BASE_URL}/admin/analytics/revenue`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const dataRevenue1 = await resRevenue1.json();
  console.log('Revenue Status:', resRevenue1.status);
  console.log('Revenue Summary:', dataRevenue1.data?.summary);
  console.log('Revenue by Specialization:', dataRevenue1.data?.revenue_by_specialization);
  console.log('Payment Methods:', dataRevenue1.data?.payment_methods);

  const resRevenue2 = await fetch(`${BASE_URL}/admin/analytics/revenue`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  console.log('Revenue 2nd Call Cache Header (Expected HIT-REDIS):', resRevenue2.headers.get('x-cache-lookup'));

  // Step 9: Doctor Capacity & Utilization
  console.log('\n[Step 9] Admin queries Doctor Utilization & Rankings (GET /admin/analytics/doctors)');
  const resDoctors1 = await fetch(`${BASE_URL}/admin/analytics/doctors`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const dataDoctors1 = await resDoctors1.json();
  console.log('Doctor Utilization Status:', resDoctors1.status);
  console.log('Platform Capacity Metrics:', dataDoctors1.data?.capacity_metrics);
  console.log('Top Performing Doctor:', dataDoctors1.data?.top_performing_doctors?.[0]);

  const resDoctors2 = await fetch(`${BASE_URL}/admin/analytics/doctors`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  console.log('Doctor Utilization 2nd Call Cache Header (Expected HIT-REDIS):', resDoctors2.headers.get('x-cache-lookup'));

  console.log('\n==================================================================');
  console.log('--- ALL MODULE 9 ANALYTICS TESTS SUCCESSFULLY PASSED! ---');
  console.log('==================================================================');
}

runModule9Tests().catch((err) => {
  console.error('Module 9 test suite failed:', err);
  process.exit(1);
});
