/**
 * Migration: Convert status and role columns to native PostgreSQL ENUMs
 * Benefits:
 * - 4-byte internal integer storage with optimal B-Tree index performance
 * - Strict database-level type safety and validation
 * - Native string representation in API responses, Swagger specs, and raw SQL queries
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export async function up(knex) {
  // 1. Create ENUM types
  await knex.raw(`
    DO $$ BEGIN
      CREATE TYPE user_role AS ENUM ('patient', 'doctor', 'admin');
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;

    DO $$ BEGIN
      CREATE TYPE user_status AS ENUM ('active', 'inactive', 'suspended');
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;

    DO $$ BEGIN
      CREATE TYPE slot_status AS ENUM ('available', 'locked', 'booked', 'cancelled');
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;

    DO $$ BEGIN
      CREATE TYPE consultation_status AS ENUM ('scheduled', 'in_progress', 'completed', 'cancelled', 'no_show');
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;

    DO $$ BEGIN
      CREATE TYPE consultation_type AS ENUM ('video', 'audio', 'chat');
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;

    DO $$ BEGIN
      CREATE TYPE payment_status AS ENUM ('pending', 'completed', 'failed', 'refunded');
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;
  `);

  // 2. Alter columns to use native ENUM types
  await knex.raw(`
    -- users table
    ALTER TABLE users ALTER COLUMN role DROP DEFAULT;
    ALTER TABLE users ALTER COLUMN role TYPE user_role USING role::user_role;
    ALTER TABLE users ALTER COLUMN role SET DEFAULT 'patient';

    ALTER TABLE users ALTER COLUMN status DROP DEFAULT;
    ALTER TABLE users ALTER COLUMN status TYPE user_status USING status::user_status;
    ALTER TABLE users ALTER COLUMN status SET DEFAULT 'active';

    -- availability_slots table
    ALTER TABLE availability_slots ALTER COLUMN status DROP DEFAULT;
    ALTER TABLE availability_slots ALTER COLUMN status TYPE slot_status USING status::slot_status;
    ALTER TABLE availability_slots ALTER COLUMN status SET DEFAULT 'available';

    -- consultations table
    ALTER TABLE consultations ALTER COLUMN status DROP DEFAULT;
    ALTER TABLE consultations ALTER COLUMN status TYPE consultation_status USING status::consultation_status;
    ALTER TABLE consultations ALTER COLUMN status SET DEFAULT 'scheduled';

    ALTER TABLE consultations ALTER COLUMN type DROP DEFAULT;
    ALTER TABLE consultations ALTER COLUMN type TYPE consultation_type USING type::consultation_type;
    ALTER TABLE consultations ALTER COLUMN type SET DEFAULT 'video';

    -- payments table
    ALTER TABLE payments ALTER COLUMN status DROP DEFAULT;
    ALTER TABLE payments ALTER COLUMN status TYPE payment_status USING status::payment_status;
    ALTER TABLE payments ALTER COLUMN status SET DEFAULT 'pending';
  `);
}

/**
 * Rollback Migration
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export async function down(knex) {
  await knex.raw(`
    -- Revert users
    ALTER TABLE users ALTER COLUMN role DROP DEFAULT;
    ALTER TABLE users ALTER COLUMN role TYPE VARCHAR(20) USING role::VARCHAR(20);
    ALTER TABLE users ALTER COLUMN role SET DEFAULT 'patient';

    ALTER TABLE users ALTER COLUMN status DROP DEFAULT;
    ALTER TABLE users ALTER COLUMN status TYPE VARCHAR(20) USING status::VARCHAR(20);
    ALTER TABLE users ALTER COLUMN status SET DEFAULT 'active';

    -- Revert availability_slots
    ALTER TABLE availability_slots ALTER COLUMN status DROP DEFAULT;
    ALTER TABLE availability_slots ALTER COLUMN status TYPE VARCHAR(20) USING status::VARCHAR(20);
    ALTER TABLE availability_slots ALTER COLUMN status SET DEFAULT 'available';

    -- Revert consultations
    ALTER TABLE consultations ALTER COLUMN status DROP DEFAULT;
    ALTER TABLE consultations ALTER COLUMN status TYPE VARCHAR(20) USING status::VARCHAR(20);
    ALTER TABLE consultations ALTER COLUMN status SET DEFAULT 'scheduled';

    ALTER TABLE consultations ALTER COLUMN type DROP DEFAULT;
    ALTER TABLE consultations ALTER COLUMN type TYPE VARCHAR(20) USING type::VARCHAR(20);
    ALTER TABLE consultations ALTER COLUMN type SET DEFAULT 'video';

    -- Revert payments
    ALTER TABLE payments ALTER COLUMN status DROP DEFAULT;
    ALTER TABLE payments ALTER COLUMN status TYPE VARCHAR(20) USING status::VARCHAR(20);
    ALTER TABLE payments ALTER COLUMN status SET DEFAULT 'pending';

    -- Drop types
    DROP TYPE IF EXISTS payment_status;
    DROP TYPE IF EXISTS consultation_type;
    DROP TYPE IF EXISTS consultation_status;
    DROP TYPE IF EXISTS slot_status;
    DROP TYPE IF EXISTS user_status;
    DROP TYPE IF EXISTS user_role;
  `);
}
