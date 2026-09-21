import { Router } from 'express';
import healthRouter from './healthRouter.js';
import authRouter from './authRouter.js';
import doctorRouter from './doctorRouter.js';
import bookingRouter from './bookingRouter.js';
import consultationRouter from './consultationRouter.js';
import prescriptionRouter from './prescriptionRouter.js';
import paymentRouter from './paymentRouter.js';
import searchRouter from './searchRouter.js';
import auditRouter from './auditRouter.js';
import analyticsRouter from './analyticsRouter.js';
import { authenticate, authorize } from '../auth/middleware.js';
import { successResponse } from '../helper/apiResponse.js';

const router = Router();

// Mount system health & db test endpoints
router.use('/', healthRouter);

// Mount authentication & profile endpoints
router.use('/auth', authRouter);

// Mount doctor profiles & availability endpoints (Module 2)
router.use('/doctors', doctorRouter);

// Mount booking & concurrency handling endpoints (Module 3)
router.use('/bookings', bookingRouter);

// Mount consultation lifecycle & notes endpoints (Module 4)
router.use('/consultations', consultationRouter);

// Mount digital prescriptions & EHR endpoints (Module 5)
router.use('/prescriptions', prescriptionRouter);

// Mount payments & saga ledger endpoints (Module 6)
router.use('/payments', paymentRouter);

// Mount search & discovery engine (Module 7)
router.use('/search', searchRouter);

// Mount compliance, security & audit trails (Module 8)
router.use('/admin/audit-logs', auditRouter);

// Mount admin analytics & intelligence (Module 9)
router.use('/admin/analytics', analyticsRouter);

// RBAC protected test route for admin validation
router.get('/admin/test-rbac', authenticate, authorize('admin'), (req, res) => {
  return successResponse(
    res,
    { user: req.user.email, role: req.user.role },
    'Admin RBAC check passed.'
  );
});

export default router;
