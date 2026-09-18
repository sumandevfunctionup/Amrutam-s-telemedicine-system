import { z } from 'zod';

// ==========================================
// Authentication & User Schemas
// ==========================================

export const registerSchema = z
  .object({
    body: z.object({
      email: z.string().email('Please provide a valid email address'),
      password: z
        .string()
        .min(6, 'Password must be at least 6 characters long')
        .max(100, 'Password cannot exceed 100 characters'),
      first_name: z.string().min(1, 'First name is required').max(100),
      last_name: z.string().min(1, 'Last name is required').max(100),
      role: z.enum(['patient', 'doctor']).default('patient'),
      phone_number: z.string().max(30).optional(),
      gender: z.enum(['male', 'female', 'other']).optional(),
      date_of_birth: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date of birth must be in YYYY-MM-DD format')
        .optional(),
      address: z.string().max(500).optional(),
      metadata: z.record(z.any()).optional(),

      // Doctor specific fields
      specialization: z.string().max(100).optional(),
      license_number: z.string().max(100).optional(),
      experience_years: z.number().int().min(0).optional(),
      consultation_fee: z.number().positive('Consultation fee must be positive').optional(),
      bio: z.string().max(2000).optional(),
    }),
  })
  .refine(
    (data) => {
      if (data.body.role === 'doctor') {
        return !!data.body.specialization && !!data.body.license_number;
      }
      return true;
    },
    {
      message: 'Doctors must provide specialization and license number',
      path: ['body', 'specialization'],
    }
  );

export const loginSchema = z.object({
  body: z.object({
    email: z.string().email('Please provide a valid email address'),
    password: z.string().min(1, 'Password is required'),
  }),
});

export const mfaLoginSchema = z.object({
  body: z.object({
    tempToken: z.string().min(1, 'Temporary token is required'),
    code: z
      .string()
      .regex(/^\d{6}$/, 'MFA code must be exactly 6 digits'),
  }),
});

export const mfaConfirmSchema = z.object({
  body: z.object({
    code: z
      .string()
      .regex(/^\d{6}$/, 'Verification code must be exactly 6 digits'),
  }),
});

export const refreshTokenSchema = z.object({
  body: z.object({
    refreshToken: z.string().min(1, 'Refresh token is required'),
  }),
});

export const updateProfileSchema = z.object({
  body: z.object({
    first_name: z.string().min(1).max(100).optional(),
    last_name: z.string().min(1).max(100).optional(),
    gender: z.enum(['male', 'female', 'other']).optional(),
    date_of_birth: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date of birth must be in YYYY-MM-DD format')
      .optional(),
    address: z.string().max(500).optional(),
    emergency_contact: z.string().max(50).optional(),
    metadata: z.record(z.any()).optional(),
  }),
});

// ==========================================
// Doctor Availability Schemas (For Step 3)
// ==========================================

export const createSlotsSchema = z.object({
  body: z.object({
    slots: z
      .array(
        z.object({
          start_time: z.string().datetime({ message: 'Start time must be a valid ISO 8601 string' }),
          end_time: z.string().datetime({ message: 'End time must be a valid ISO 8601 string' }),
        })
      )
      .min(1, 'At least one slot must be provided')
      .refine(
        (slots) =>
          slots.every((slot) => new Date(slot.end_time) > new Date(slot.start_time)),
        { message: 'End time must be after start time for all slots' }
      ),
  }),
});

export const getSlotsQuerySchema = z.object({
  params: z.object({
    doctorId: z.string().uuid('Doctor ID must be a valid UUID'),
  }),
  query: z.object({
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    status: z.enum(['available', 'booked', 'cancelled', 'locked']).optional(),
  }),
});

// ==========================================
// Booking & Consultation Schemas (For Step 3 & 4)
// ==========================================

export const lockSlotSchema = z.object({
  body: z.object({
    slot_id: z.string().uuid('Slot ID must be a valid UUID'),
  }),
});

export const confirmBookingSchema = z.object({
  body: z.object({
    slot_id: z.string().uuid('Slot ID must be a valid UUID'),
    type: z.enum(['video', 'audio', 'chat']).default('video'),
    notes: z.string().max(2000).optional(),
  }),
});
