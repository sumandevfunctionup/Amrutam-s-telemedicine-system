import { Router } from 'express';
import { searchDoctors, getSpecializations } from '../controller/searchController.js';
import { validate } from '../helper/validator.js';
import { searchDoctorsQuerySchema } from '../helper/schemas.js';

const router = Router();

/**
 * @openapi
 * /api/v1/search/doctors:
 *   get:
 *     summary: Search and filter Ayurvedic doctors with sub-200ms latency SLA
 *     description: High-performance doctor search engine with composite filtering, next-available-slot calculation, and Redis caching.
 *     tags:
 *       - Search & Discovery
 *     parameters:
 *       - in: query
 *         name: q
 *         schema:
 *           type: string
 *         description: Keyword search matching doctor's name, specialization, or bio
 *       - in: query
 *         name: specialization
 *         schema:
 *           type: string
 *         description: Ayurvedic specialization (e.g. Kayachikitsa, Panchakarma, Shalya Tantra)
 *       - in: query
 *         name: minFee
 *         schema:
 *           type: number
 *         description: Minimum consultation fee in INR
 *       - in: query
 *         name: maxFee
 *         schema:
 *           type: number
 *         description: Maximum consultation fee in INR
 *       - in: query
 *         name: minExperience
 *         schema:
 *           type: integer
 *         description: Minimum years of clinical experience
 *       - in: query
 *         name: minRating
 *         schema:
 *           type: number
 *         description: Minimum star rating (e.g. 4.5)
 *       - in: query
 *         name: gender
 *         schema:
 *           type: string
 *           enum: [male, female, other]
 *         description: Doctor gender
 *       - in: query
 *         name: availableDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter doctors who have available slots on this date (YYYY-MM-DD)
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           enum: [rating, fee_asc, fee_desc, experience, name]
 *           default: rating
 *         description: Sorting order
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *     responses:
 *       200:
 *         description: Search results with pagination and next available slots
 *       400:
 *         description: Invalid query parameters
 */
router.get('/doctors', validate(searchDoctorsQuerySchema), searchDoctors);

/**
 * @openapi
 * /api/v1/search/specializations:
 *   get:
 *     summary: List all active Ayurvedic categories with doctor counts and fee stats
 *     description: Aggregated clinical specialties with average fees, fee ranges, and ratings cached in Redis.
 *     tags:
 *       - Search & Discovery
 *     responses:
 *       200:
 *         description: Specializations aggregated successfully
 */
router.get('/specializations', getSpecializations);

export default router;
