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
// Doctor & Availability Schemas (Module 2)
// ==========================================

export const listDoctorsSchema = z.object({
  query: z.object({
    specialization: z.string().optional(),
    minExperience: z.coerce.number().int().min(0).optional(),
    maxFee: z.coerce.number().positive().optional(),
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(20),
  }),
});

export const getDoctorByIdSchema = z.object({
  params: z.object({
    id: z.string().uuid('Doctor ID must be a valid UUID'),
  }),
});

export const updateDoctorProfileSchema = z.object({
  body: z.object({
    specialization: z.string().min(1).max(100).optional(),
    experience_years: z.number().int().min(0).optional(),
    consultation_fee: z.number().positive('Consultation fee must be positive').optional(),
    bio: z.string().max(2000).optional(),
  }),
});

export const createSlotsSchema = z.object({
  body: z.object({
    slots: z
      .array(
        z.object({
          start_time: z.string().refine((val) => !isNaN(Date.parse(val)), {
            message: 'Start time must be a valid date/time string',
          }),
          end_time: z.string().refine((val) => !isNaN(Date.parse(val)), {
            message: 'End time must be a valid date/time string',
          }),
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

export const deleteSlotSchema = z.object({
  params: z.object({
    slotId: z.string().uuid('Slot ID must be a valid UUID'),
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

export const cancelBookingSchema = z
  .object({
    body: z.object({
      slot_id: z.string().uuid('Slot ID must be a valid UUID').optional(),
      consultation_id: z.string().uuid('Consultation ID must be a valid UUID').optional(),
      reason: z.string().max(500).optional(),
    }),
  })
  .refine(
    (data) => !!data.body.slot_id || !!data.body.consultation_id,
    {
      message: 'Either slot_id or consultation_id must be provided',
      path: ['body', 'slot_id'],
    }
  );

export const listBookingsQuerySchema = z.object({
  query: z.object({
    status: z.enum(['scheduled', 'in_progress', 'completed', 'cancelled', 'no_show']).optional(),
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(20),
  }),
});

// ==========================================
// Consultation Lifecycle Schemas (Module 4)
// ==========================================

export const listConsultationsSchema = z.object({
  query: z.object({
    status: z.enum(['scheduled', 'in_progress', 'completed', 'cancelled', 'no_show']).optional(),
    type: z.enum(['video', 'audio', 'chat']).optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(20),
  }),
});

export const consultationIdParamSchema = z.object({
  params: z.object({
    id: z.string().uuid('Consultation ID must be a valid UUID'),
  }),
});

export const completeConsultationSchema = z.object({
  params: z.object({
    id: z.string().uuid('Consultation ID must be a valid UUID'),
  }),
  body: z.object({
    notes: z.string().max(5000).optional(),
    soap: z
      .object({
        subjective: z.string().optional(),
        objective: z.string().optional(),
        assessment: z.string().optional(),
        plan: z.string().optional(),
      })
      .optional(),
  }),
});

export const updateSoapNotesSchema = z.object({
  params: z.object({
    id: z.string().uuid('Consultation ID must be a valid UUID'),
  }),
  body: z.object({
    notes: z.string().max(5000).optional(),
    subjective: z.string().optional(),
    objective: z.string().optional(),
    assessment: z.string().optional(),
    plan: z.string().optional(),
  }),
});

export const cancelConsultationSchema = z.object({
  params: z.object({
    id: z.string().uuid('Consultation ID must be a valid UUID'),
  }),
  body: z.object({
    reason: z.string().max(500).optional(),
  }),
});

// ==========================================
// Digital Prescription & EHR Schemas (Module 5)
// ==========================================

export const createPrescriptionSchema = z.object({
  params: z.object({
    id: z.string().uuid('Consultation ID must be a valid UUID'),
  }),
  body: z.object({
    diagnosis: z.string().min(3, 'Diagnosis must be at least 3 characters long').max(1000),
    medications: z
      .array(
        z.object({
          name: z.string().min(1, 'Medication name is required'),
          dosage: z.string().min(1, 'Dosage is required (e.g. 1 tsp, 2 tabs)'),
          frequency: z.string().min(1, 'Frequency is required (e.g. twice daily)'),
          timing: z.string().min(1, 'Timing is required (e.g. after meals with warm water)'),
          duration_days: z.number().int().positive('Duration in days must be a positive integer'),
        })
      )
      .min(1, 'At least one medication must be prescribed'),
    instructions: z.string().max(2000).optional(),
    follow_up_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Follow-up date must be in YYYY-MM-DD format')
      .optional(),
  }),
});

export const prescriptionIdParamSchema = z.object({
  params: z.object({
    id: z.string().uuid('Prescription ID must be a valid UUID'),
  }),
});

export const patientIdParamSchema = z.object({
  params: z.object({
    patientId: z.string().uuid('Patient ID must be a valid UUID'),
  }),
});

// ==========================================
// Payment Processing & Saga Schemas (Module 6)
// ==========================================

export const initiatePaymentSchema = z.object({
  body: z.object({
    consultation_id: z.string().uuid('Consultation ID must be a valid UUID'),
    payment_method: z.enum(['upi', 'card', 'netbanking', 'wallet']).default('upi'),
  }),
});

export const paymentWebhookSchema = z.object({
  body: z.object({
    event: z.enum(['payment.success', 'payment.failed']),
    transaction_id: z.string().min(1, 'Transaction ID is required'),
    gateway_signature: z.string().optional(),
  }),
});

export const refundPaymentSchema = z.object({
  params: z.object({
    id: z.string().uuid('Payment ID must be a valid UUID'),
  }),
  body: z.object({
    reason: z.string().max(500).optional(),
  }),
});

export const paymentIdParamSchema = z.object({
  params: z.object({
    id: z.string().uuid('Payment ID must be a valid UUID'),
  }),
});

export const listPaymentsQuerySchema = z.object({
  query: z.object({
    status: z.enum(['pending', 'completed', 'failed', 'refunded']).optional(),
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(20),
  }),
});

// ==========================================
// Search & Discovery Schemas (Module 7)
// ==========================================

export const searchDoctorsQuerySchema = z.object({
  query: z.object({
    q: z.string().max(100).optional(),
    specialization: z.string().max(100).optional(),
    minFee: z.coerce.number().min(0).optional(),
    maxFee: z.coerce.number().min(0).optional(),
    minExperience: z.coerce.number().int().min(0).optional(),
    minRating: z.coerce.number().min(0).max(5).optional(),
    gender: z.enum(['male', 'female', 'other']).optional(),
    availableDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'availableDate must be in YYYY-MM-DD format')
      .optional(),
    sortBy: z
      .enum(['rating', 'fee_asc', 'fee_desc', 'experience', 'name'])
      .default('rating'),
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(50).default(10),
  }),
});

// ==========================================
// Compliance & Audit Trail Schemas (Module 8)
// ==========================================

export const listAuditLogsQuerySchema = z.object({
  query: z.object({
    action: z.string().max(100).optional(),
    entity_type: z.string().max(50).optional(),
    entity_id: z.string().max(100).optional(),
    user_id: z.string().uuid('user_id must be a valid UUID').optional(),
    startDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'startDate must be in YYYY-MM-DD format')
      .optional(),
    endDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'endDate must be in YYYY-MM-DD format')
      .optional(),
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(20),
  }),
});

export const auditLogIdParamSchema = z.object({
  params: z.object({
    id: z.string().uuid('Audit log ID must be a valid UUID'),
  }),
});

// ==========================================
// Admin Analytics Schemas (Module 9)
// ==========================================

export const analyticsDateRangeSchema = z.object({
  query: z.object({
    startDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'startDate must be in YYYY-MM-DD format')
      .optional(),
    endDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'endDate must be in YYYY-MM-DD format')
      .optional(),
    groupBy: z.enum(['day', 'week', 'month']).default('day'),
  }),
});



