import express from 'express';
import {
  convertToEMI,
  getEMISchedule,
  markInstallmentPaid,
  updateInstallment,
  deleteInstallment
} from '../controllers/emiController';

const router = express.Router();

// EMI operations
router.post('/opportunities/:id/emi/convert', convertToEMI);
router.get('/opportunities/:id/emi', getEMISchedule);
router.post('/emi/installments/:installmentId/pay', markInstallmentPaid);
router.put('/emi/installments/:installmentId', updateInstallment);
router.delete('/emi/installments/:installmentId', deleteInstallment);

export default router;
