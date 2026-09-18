/**
 * Seed initial realistic data for Amrutam Telemedicine System:
 * - Admin, Doctors, Patients
 * - Doctor profiles & availability slots
 * - Consultations, Prescriptions, Payments, Audit Logs
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export async function seed(knex) {
  // Clear existing data in reverse dependency order
  await knex('idempotency_keys').del();
  await knex('audit_logs').del();
  await knex('payments').del();
  await knex('prescriptions').del();
  await knex('consultations').del();
  await knex('availability_slots').del();
  await knex('doctors').del();
  await knex('profiles').del();
  await knex('users').del();

  const defaultPassword = 'Password@123';
  // Valid bcrypt hash for 'Password@123'
  const passwordHash = '$2b$12$8i/5nxVG8P4JhXifykxQjus.gJNfQcIjHP82FfeSoJ4y2oQOX9auG';

  // 1. Users
  const [adminUser] = await knex('users')
    .insert({
      email: 'admin@amrutam.co.in',
      password_hash: passwordHash,
      role: 'admin',
      phone_number: '+919876543210',
      status: 'active',
      is_mfa_enabled: false,
    })
    .returning(['id', 'email']);

  const [drSharma] = await knex('users')
    .insert({
      email: 'dr.sharma@amrutam.co.in',
      password_hash: passwordHash,
      role: 'doctor',
      phone_number: '+919811122233',
      status: 'active',
      is_mfa_enabled: true,
    })
    .returning(['id', 'email']);

  const [drGupta] = await knex('users')
    .insert({
      email: 'dr.gupta@amrutam.co.in',
      password_hash: passwordHash,
      role: 'doctor',
      phone_number: '+919822233344',
      status: 'active',
      is_mfa_enabled: false,
    })
    .returning(['id', 'email']);

  const [drVerma] = await knex('users')
    .insert({
      email: 'dr.verma@amrutam.co.in',
      password_hash: passwordHash,
      role: 'doctor',
      phone_number: '+919833344455',
      status: 'active',
      is_mfa_enabled: false,
    })
    .returning(['id', 'email']);

  const [patientRohan] = await knex('users')
    .insert({
      email: 'rohan.verma@example.com',
      password_hash: passwordHash,
      role: 'patient',
      phone_number: '+919944455566',
      status: 'active',
      is_mfa_enabled: false,
    })
    .returning(['id', 'email']);

  const [patientAnanya] = await knex('users')
    .insert({
      email: 'ananya.sharma@example.com',
      password_hash: passwordHash,
      role: 'patient',
      phone_number: '+919955566677',
      status: 'active',
      is_mfa_enabled: false,
    })
    .returning(['id', 'email']);

  // 2. Profiles
  await knex('profiles').insert([
    {
      user_id: adminUser.id,
      first_name: 'Super',
      last_name: 'Admin',
      gender: 'other',
      address: 'Amrutam HQ, Gwalior, MP, India',
    },
    {
      user_id: drSharma.id,
      first_name: 'Anil',
      last_name: 'Sharma',
      gender: 'male',
      date_of_birth: '1978-04-12',
      address: 'Ayurveda Bhavan, New Delhi, India',
      avatar_url: 'https://images.unsplash.com/photo-1622253692010-333f2da6031d?w=400',
      metadata: JSON.stringify({
        degrees: ['BAMS', 'MD (Ayurveda - Kayachikitsa)'],
        languages: ['English', 'Hindi', 'Sanskrit'],
      }),
    },
    {
      user_id: drGupta.id,
      first_name: 'Pooja',
      last_name: 'Gupta',
      gender: 'female',
      date_of_birth: '1985-09-24',
      address: 'Panchakarma Center, Varanasi, UP, India',
      avatar_url: 'https://images.unsplash.com/photo-1594824813571-638f02633005?w=400',
      metadata: JSON.stringify({
        degrees: ['BAMS', 'Fellowship in Panchakarma'],
        languages: ['English', 'Hindi'],
      }),
    },
    {
      user_id: drVerma.id,
      first_name: 'Suresh',
      last_name: 'Verma',
      gender: 'male',
      date_of_birth: '1982-11-15',
      address: 'Kalyan Ayurveda Clinic, Mumbai, MH, India',
      avatar_url: 'https://images.unsplash.com/photo-1537368910025-700350fe46c7?w=400',
      metadata: JSON.stringify({
        degrees: ['BAMS', 'MS (Shalya Tantra)'],
        languages: ['English', 'Hindi', 'Marathi'],
      }),
    },
    {
      user_id: patientRohan.id,
      first_name: 'Rohan',
      last_name: 'Verma',
      gender: 'male',
      date_of_birth: '1995-06-18',
      address: 'Indore, MP, India',
      metadata: JSON.stringify({
        blood_group: 'O+',
        prakriti: 'Vata-Pitta',
        allergies: ['Peanuts'],
        chronic_conditions: ['Digestive Sensitivity'],
      }),
    },
    {
      user_id: patientAnanya.id,
      first_name: 'Ananya',
      last_name: 'Sharma',
      gender: 'female',
      date_of_birth: '1998-02-10',
      address: 'Bengaluru, KA, India',
      metadata: JSON.stringify({
        blood_group: 'A+',
        prakriti: 'Pitta-Kapha',
        allergies: [],
      }),
    },
  ]);

  // 3. Doctors
  const [doctorSharma] = await knex('doctors')
    .insert({
      user_id: drSharma.id,
      specialization: 'Kayachikitsa (Internal Medicine)',
      license_number: 'AYU-DEL-10492',
      experience_years: 18,
      consultation_fee: 800.00,
      bio: 'Senior Ayurvedic physician with 18+ years of clinical excellence in metabolic disorders, chronic gut diseases, and lifestyle rejuvenation.',
      rating: 4.95,
      total_reviews: 142,
      is_verified: true,
    })
    .returning(['id', 'specialization', 'consultation_fee']);

  const [doctorGupta] = await knex('doctors')
    .insert({
      user_id: drGupta.id,
      specialization: 'Panchakarma (Detoxification & Cleansing)',
      license_number: 'AYU-UP-28491',
      experience_years: 12,
      consultation_fee: 650.00,
      bio: 'Specialist in classical Ayurvedic purification therapies, stress reduction, and autoimmune symptom management.',
      rating: 4.88,
      total_reviews: 98,
      is_verified: true,
    })
    .returning(['id', 'specialization', 'consultation_fee']);

  const [doctorVerma] = await knex('doctors')
    .insert({
      user_id: drVerma.id,
      specialization: 'Shalya Tantra (Surgical & Wound Healing)',
      license_number: 'AYU-MH-33821',
      experience_years: 15,
      consultation_fee: 900.00,
      bio: 'Expert in non-invasive Ayurvedic wound care, Kshara Sutra therapy, and joint rehabilitation.',
      rating: 4.79,
      total_reviews: 64,
      is_verified: true,
    })
    .returning(['id', 'specialization', 'consultation_fee']);

  // 4. Availability Slots
  const now = new Date();
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const dayAfter = new Date(now.getTime() + 48 * 60 * 60 * 1000);

  const slot1Start = new Date(tomorrow.setHours(10, 0, 0, 0));
  const slot1End = new Date(tomorrow.setHours(10, 30, 0, 0));

  const slot2Start = new Date(tomorrow.setHours(11, 0, 0, 0));
  const slot2End = new Date(tomorrow.setHours(11, 30, 0, 0));

  const slot3Start = new Date(dayAfter.setHours(14, 0, 0, 0));
  const slot3End = new Date(dayAfter.setHours(14, 30, 0, 0));

  const [slot1] = await knex('availability_slots')
    .insert({
      doctor_id: doctorSharma.id,
      start_time: slot1Start,
      end_time: slot1End,
      status: 'booked',
      version: 2,
    })
    .returning(['id', 'status']);

  const [slot2] = await knex('availability_slots')
    .insert({
      doctor_id: doctorSharma.id,
      start_time: slot2Start,
      end_time: slot2End,
      status: 'available',
      version: 1,
    })
    .returning(['id', 'status']);

  await knex('availability_slots').insert([
    {
      doctor_id: doctorGupta.id,
      start_time: slot1Start,
      end_time: slot1End,
      status: 'available',
      version: 1,
    },
    {
      doctor_id: doctorVerma.id,
      start_time: slot3Start,
      end_time: slot3End,
      status: 'available',
      version: 1,
    },
  ]);

  // 5. Consultations
  const [consultation1] = await knex('consultations')
    .insert({
      patient_id: patientRohan.id,
      doctor_id: doctorSharma.id,
      slot_id: slot1.id,
      status: 'completed',
      type: 'video',
      notes: 'Patient presented with hyperacidity and poor sleep. Prescribed Pitta pacifying regimen and herbal formulations.',
      meeting_link: 'https://meet.amrutam.co.in/room/c-9821-4821',
    })
    .returning(['id', 'status']);

  // 6. Prescriptions
  await knex('prescriptions').insert({
    consultation_id: consultation1.id,
    doctor_id: doctorSharma.id,
    patient_id: patientRohan.id,
    diagnosis: 'Amlapitta (Hyperacidity) due to aggravated Pitta dosha',
    medications: JSON.stringify([
      {
        name: 'Avipattikar Churna',
        dosage: '1 teaspoon (3g)',
        frequency: 'Twice daily',
        timing: 'Before meals with lukewarm water',
        duration_days: 15,
        instructions: 'Do not skip breakfast.',
      },
      {
        name: 'Kamadudha Rasa',
        dosage: '1 tablet (250mg)',
        frequency: 'Twice daily',
        timing: 'After meals with milk',
        duration_days: 20,
      },
      {
        name: 'Amrutam Kuntal Care Herbal Tea',
        dosage: '1 cup',
        frequency: 'Morning & Evening',
        timing: '30 mins before tea/coffee',
        duration_days: 30,
      },
    ]),
    instructions: 'Follow Pathya: consume ghee, milk, pomegranate, and leafy greens. Avoid excessively spicy, fermented, and oily foods.',
  });

  // 7. Payments
  await knex('payments').insert({
    consultation_id: consultation1.id,
    patient_id: patientRohan.id,
    amount: doctorSharma.consultation_fee,
    currency: 'INR',
    status: 'completed',
    payment_method: 'upi',
    transaction_id: 'TXN-AMRUTAM-992817482',
  });

  // 8. Audit Logs
  await knex('audit_logs').insert([
    {
      user_id: patientRohan.id,
      action: 'CONSULTATION_BOOKED',
      entity_type: 'consultations',
      entity_id: consultation1.id,
      ip_address: '103.21.144.2',
      user_agent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
      details: JSON.stringify({
        slot_id: slot1.id,
        doctor_id: doctorSharma.id,
        amount: doctorSharma.consultation_fee,
      }),
    },
    {
      user_id: drSharma.id,
      action: 'PRESCRIPTION_ISSUED',
      entity_type: 'prescriptions',
      entity_id: consultation1.id,
      ip_address: '103.22.148.10',
      user_agent: 'Amrutam Doctor Portal / Chrome 128.0',
      details: JSON.stringify({
        diagnosis: 'Amlapitta',
        medication_count: 3,
      }),
    },
  ]);

  console.log('✅ Amrutam Telemedicine seed data populated successfully.');
}
