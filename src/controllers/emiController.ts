import { Request, Response } from 'express';
import EMIService from '../services/emiService';

/**
 * Convert partial payment to EMI
 */
export const convertToEMI = async (req: Request, res: Response) => {
  try {
    const { id: opportunityId } = req.params;
    const { installments } = req.body;
    const organisationId = (req as any).user?.organisationId;

    if (!organisationId) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized'
      });
    }

    if (!installments || !Array.isArray(installments) || installments.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Valid installments array is required'
      });
    }

    const emiSchedule = await EMIService.convertToEMI(
      opportunityId,
      installments,
      organisationId
    );

    res.status(201).json({
      success: true,
      emiSchedule,
      message: 'EMI schedule created successfully'
    });
  } catch (error: any) {
    console.error('Error converting to EMI:', error);
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to convert to EMI'
    });
  }
};

/**
 * Get EMI schedule for an opportunity
 */
export const getEMISchedule = async (req: Request, res: Response) => {
  try {
    const { id: opportunityId } = req.params;

    const emiSchedule = await EMIService.getEMISchedule(opportunityId);

    if (!emiSchedule) {
      return res.status(404).json({
        success: false,
        error: 'EMI schedule not found for this opportunity'
      });
    }

    res.status(200).json({
      success: true,
      emiSchedule
    });
  } catch (error: any) {
    console.error('Error fetching EMI schedule:', error);
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to fetch EMI schedule'
    });
  }
};

/**
 * Mark installment as paid
 */
export const markInstallmentPaid = async (req: Request, res: Response) => {
  try {
    const { installmentId } = req.params;
    const { paymentDate, notes } = req.body;
    const userId = (req as any).user?.id;
    const organisationId = (req as any).user?.organisationId;

    if (!userId || !organisationId) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized'
      });
    }

    const result = await EMIService.markInstallmentPaid(
      installmentId,
      userId,
      organisationId,
      paymentDate ? new Date(paymentDate) : undefined,
      notes
    );

    res.status(200).json(result);
  } catch (error: any) {
    console.error('Error marking installment as paid:', error);
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to mark installment as paid'
    });
  }
};

/**
 * Update installment
 */
export const updateInstallment = async (req: Request, res: Response) => {
  try {
    const { installmentId } = req.params;
    const { dueDate, amount } = req.body;

    if (!dueDate && amount === undefined) {
      return res.status(400).json({
        success: false,
        error: 'At least one field (dueDate or amount) must be provided'
      });
    }

    const updates: any = {};
    if (dueDate) updates.dueDate = new Date(dueDate);
    if (amount !== undefined) updates.amount = amount;

    const installment = await EMIService.updateInstallment(installmentId, updates);

    res.status(200).json({
      success: true,
      installment,
      message: 'Installment updated successfully'
    });
  } catch (error: any) {
    console.error('Error updating installment:', error);
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to update installment'
    });
  }
};

/**
 * Delete installment
 */
export const deleteInstallment = async (req: Request, res: Response) => {
  try {
    const { installmentId } = req.params;

    await EMIService.deleteInstallment(installmentId);

    res.status(200).json({
      success: true,
      message: 'Installment deleted successfully'
    });
  } catch (error: any) {
    console.error('Error deleting installment:', error);
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to delete installment'
    });
  }
};
