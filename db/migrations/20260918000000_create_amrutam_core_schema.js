/**
 * Amrutam Telemedicine System — Core Schema Migration
 * Covers 9 Core Tables:
 * 1. users
 * 2. profiles
 * 3. doctors
 * 4. availability_slots
 * 5. consultations
 * 6. prescriptions
 * 7. payments
 * 8. audit_logs
 * 9. idempotency_keys
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export async function up(knex) {
  // Ensure pgcrypto is enabled for UUID generation
  await knex.raw('CREATE EXTENSION IF NOT EXISTS "pgcrypto";');

  // 1. users
  await knex.schema.createTable('users', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('email', 255).notNullable().unique();
    table.string('password_hash', 255).notNullable();
    table.string('role', 20).notNullable().defaultTo('patient');
    table.string('phone_number', 30).nullable();
    table.boolean('is_mfa_enabled').notNullable().defaultTo(false);
    table.string('mfa_secret', 255).nullable();
    table.string('status', 20).notNullable().defaultTo('active');
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.index(['role', 'status'], 'idx_users_role_status');
    table.index(['email'], 'idx_users_email');
  });

  // 2. profiles
  await knex.schema.createTable('profiles', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table
      .uuid('user_id')
      .notNullable()
      .unique()
      .references('id')
      .inTable('users')
      .onDelete('CASCADE');
    table.string('first_name', 100).notNullable();
    table.string('last_name', 100).notNullable();
    table.date('date_of_birth').nullable();
    table.string('gender', 20).nullable();
    table.string('avatar_url', 500).nullable();
    table.text('address').nullable();
    table.string('emergency_contact', 50).nullable();
    table.jsonb('metadata').nullable().defaultTo('{}');
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.index(['first_name', 'last_name'], 'idx_profiles_name');
  });

  // 3. doctors
  await knex.schema.createTable('doctors', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table
      .uuid('user_id')
      .notNullable()
      .unique()
      .references('id')
      .inTable('users')
      .onDelete('CASCADE');
    table.string('specialization', 100).notNullable();
    table.string('license_number', 100).notNullable().unique();
    table.integer('experience_years').notNullable().defaultTo(0);
    table.decimal('consultation_fee', 10, 2).notNullable().defaultTo(500.00);
    table.text('bio').nullable();
    table.decimal('rating', 3, 2).notNullable().defaultTo(0.00);
    table.integer('total_reviews').notNullable().defaultTo(0);
    table.boolean('is_verified').notNullable().defaultTo(false);
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.index(
      ['specialization', 'is_verified', 'rating', 'consultation_fee'],
      'idx_doctors_search'
    );
  });

  // 4. availability_slots (Optimistic locking via version)
  await knex.schema.createTable('availability_slots', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table
      .uuid('doctor_id')
      .notNullable()
      .references('id')
      .inTable('doctors')
      .onDelete('CASCADE');
    table.timestamp('start_time', { useTz: true }).notNullable();
    table.timestamp('end_time', { useTz: true }).notNullable();
    table.string('status', 20).notNullable().defaultTo('available');
    table.integer('version').notNullable().defaultTo(1);
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.index(['doctor_id', 'start_time', 'status'], 'idx_slots_doctor_time_status');
    table.index(['start_time', 'status'], 'idx_slots_time_status');
  });

  // 5. consultations
  await knex.schema.createTable('consultations', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table
      .uuid('patient_id')
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('RESTRICT');
    table
      .uuid('doctor_id')
      .notNullable()
      .references('id')
      .inTable('doctors')
      .onDelete('RESTRICT');
    table
      .uuid('slot_id')
      .notNullable()
      .unique()
      .references('id')
      .inTable('availability_slots')
      .onDelete('RESTRICT');
    table.string('status', 20).notNullable().defaultTo('scheduled');
    table.string('type', 20).notNullable().defaultTo('video');
    table.text('notes').nullable();
    table.string('meeting_link', 500).nullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.index(['patient_id', 'status', 'created_at'], 'idx_consultations_patient');
    table.index(['doctor_id', 'status', 'created_at'], 'idx_consultations_doctor');
  });

  // 6. prescriptions
  await knex.schema.createTable('prescriptions', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table
      .uuid('consultation_id')
      .notNullable()
      .unique()
      .references('id')
      .inTable('consultations')
      .onDelete('CASCADE');
    table
      .uuid('doctor_id')
      .notNullable()
      .references('id')
      .inTable('doctors')
      .onDelete('RESTRICT');
    table
      .uuid('patient_id')
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('RESTRICT');
    table.text('diagnosis').notNullable();
    table.jsonb('medications').notNullable().defaultTo('[]');
    table.text('instructions').nullable();
    table.timestamp('issued_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.index(['patient_id', 'issued_at'], 'idx_prescriptions_patient');
    table.index(['doctor_id', 'issued_at'], 'idx_prescriptions_doctor');
  });

  // 7. payments
  await knex.schema.createTable('payments', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table
      .uuid('consultation_id')
      .notNullable()
      .references('id')
      .inTable('consultations')
      .onDelete('RESTRICT');
    table
      .uuid('patient_id')
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('RESTRICT');
    table.decimal('amount', 10, 2).notNullable();
    table.string('currency', 3).notNullable().defaultTo('INR');
    table.string('status', 20).notNullable().defaultTo('pending');
    table.string('payment_method', 50).notNullable().defaultTo('upi');
    table.string('transaction_id', 150).nullable().unique();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.index(['consultation_id', 'status'], 'idx_payments_consultation');
    table.index(['patient_id', 'created_at'], 'idx_payments_patient');
  });

  // 8. audit_logs
  await knex.schema.createTable('audit_logs', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table
      .uuid('user_id')
      .nullable()
      .references('id')
      .inTable('users')
      .onDelete('SET NULL');
    table.string('action', 100).notNullable();
    table.string('entity_type', 50).notNullable();
    table.string('entity_id', 100).nullable();
    table.string('ip_address', 45).nullable();
    table.string('user_agent', 300).nullable();
    table.jsonb('details').nullable().defaultTo('{}');
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.index(['entity_type', 'entity_id', 'created_at'], 'idx_audit_logs_entity');
    table.index(['user_id', 'created_at'], 'idx_audit_logs_user');
  });

  // 9. idempotency_keys
  await knex.schema.createTable('idempotency_keys', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('key', 100).notNullable().unique();
    table
      .uuid('user_id')
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('CASCADE');
    table.string('request_path', 255).notNullable();
    table.jsonb('request_params').nullable();
    table.integer('response_status').nullable();
    table.jsonb('response_body').nullable();
    table.timestamp('expires_at', { useTz: true }).notNullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.index(['key', 'expires_at'], 'idx_idempotency_key_lookup');
  });
}

/**
 * Rollback Migration
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export async function down(knex) {
  await knex.schema.dropTableIfExists('idempotency_keys');
  await knex.schema.dropTableIfExists('audit_logs');
  await knex.schema.dropTableIfExists('payments');
  await knex.schema.dropTableIfExists('prescriptions');
  await knex.schema.dropTableIfExists('consultations');
  await knex.schema.dropTableIfExists('availability_slots');
  await knex.schema.dropTableIfExists('doctors');
  await knex.schema.dropTableIfExists('profiles');
  await knex.schema.dropTableIfExists('users');
}
