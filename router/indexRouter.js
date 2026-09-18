import { Router } from 'express';
import healthRouter from './healthRouter.js';
import authRouter from './authRouter.js';
import { authenticate, authorize } from '../auth/middleware.js';
import { successResponse } from '../helper/apiResponse.js';

const router = Router();

// Mount system health & db test endpoints
router.use('/', healthRouter);

// Mount authentication & profile endpoints
router.use('/auth', authRouter);

// RBAC protected test route for admin validation
router.get('/admin/test-rbac', authenticate, authorize('admin'), (req, res) => {
  return successResponse(
    res,
    { user: req.user.email, role: req.user.role },
    'Admin RBAC check passed.'
  );
});

export default router;
