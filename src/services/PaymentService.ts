import { PrismaClient } from '../generated/client';

const prisma = new PrismaClient();

export interface PaymentResult {
  success: boolean;
  opportunity: any;
  paymentRecord: any;
  message: string;
}

export interface PaymentSummary {
  totalAmount: number;
  paidAmount: number;
  remainingAmount: number;
  paymentStatus: string;
  paymentRecords: any[];
  emiSchedule?: any;
}

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

class PaymentService {
  /**
   * Validate payment amount
   */
  async validatePaymentAmount(
    opportunityId: string,
    amount: number
  ): Promise<ValidationResult> {
    if (amount <= 0) {
      return { valid: false, error: 'Payment amount must be greater than zero' };
    }

    const opportunity = await prisma.opportunity.findUnique({
      where: { id: opportunityId },
      include: { paymentRecords: true }
    });

    if (!opportunity) {
      return { valid: false, error: 'Opportunity not found' };
    }

    const remaining = await this.calculateRemainingAmount(opportunityId);
    
    if (amount > remaining) {
      return { 
        valid: false, 
        error: `Payment amount ($${amount}) exceeds remaining balance ($${remaining})` 
      };
    }

    return { valid: true };
  }

  /**
   * Calculate remaining amount for an opportunity
   */
  async calculateRemainingAmount(opportunityId: string): Promise<number> {
    const opportunity = await prisma.opportunity.findUnique({
      where: { id: opportunityId },
      include: { paymentRecords: true }
    });

    if (!opportunity) {
      throw new Error('Opportunity not found');
    }

    const totalPaid = opportunity.paymentRecords.reduce(
      (sum, record) => sum + record.amount,
      0
    );

    return opportunity.amount - totalPaid;
  }

  /**
   * Record full payment
   */
  async recordFullPayment(
    opportunityId: string,
    userId: string,
    organisationId: string,
    paymentDate?: Date,
    notes?: string
  ): Promise<PaymentResult> {
    const opportunity = await prisma.opportunity.findUnique({
      where: { id: opportunityId }
    });

    if (!opportunity) {
      throw new Error('Opportunity not found');
    }

    if (opportunity.paymentStatus === 'paid') {
      throw new Error('Opportunity is already fully paid');
    }

    if (opportunity.amount <= 0) {
      throw new Error('Opportunity total amount must be greater than zero');
    }

    const remaining = await this.calculateRemainingAmount(opportunityId);

    // Use transaction to ensure atomicity
    const result = await prisma.$transaction(async (tx) => {
      // Create payment record
      const paymentRecord = await tx.paymentRecord.create({
        data: {
          opportunityId,
          amount: remaining,
          paymentDate: paymentDate || new Date(),
          paymentType: 'full',
          notes,
          createdById: userId,
          organisationId
        }
      });

      // Update opportunity status
      const updatedOpportunity = await tx.opportunity.update({
        where: { id: opportunityId },
        data: {
          paymentStatus: 'paid',
          paymentDate: paymentDate || new Date()
        },
        include: {
          paymentRecords: true,
          emiSchedule: {
            include: { installments: true }
          }
        }
      });

      return { paymentRecord, updatedOpportunity };
    });

    return {
      success: true,
      opportunity: result.updatedOpportunity,
      paymentRecord: result.paymentRecord,
      message: 'Payment recorded successfully'
    };
  }

  /**
   * Record partial payment
   */
  async recordPartialPayment(
    opportunityId: string,
    amount: number,
    userId: string,
    organisationId: string,
    paymentDate?: Date,
    notes?: string
  ): Promise<PaymentResult> {
    // Validate amount
    const validation = await this.validatePaymentAmount(opportunityId, amount);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    const opportunity = await prisma.opportunity.findUnique({
      where: { id: opportunityId }
    });

    if (!opportunity) {
      throw new Error('Opportunity not found');
    }

    if (opportunity.paymentStatus === 'paid') {
      throw new Error('Opportunity is already fully paid');
    }

    const remaining = await this.calculateRemainingAmount(opportunityId);

    // Use transaction to ensure atomicity
    const result = await prisma.$transaction(async (tx) => {
      // Create payment record
      const paymentRecord = await tx.paymentRecord.create({
        data: {
          opportunityId,
          amount,
          paymentDate: paymentDate || new Date(),
          paymentType: 'partial',
          notes,
          createdById: userId,
          organisationId
        }
      });

      // Check if this payment completes the opportunity
      const newRemaining = remaining - amount;
      const newStatus = newRemaining === 0 ? 'paid' : 'partial';

      // Update opportunity status
      const updatedOpportunity = await tx.opportunity.update({
        where: { id: opportunityId },
        data: {
          paymentStatus: newStatus,
          ...(newStatus === 'paid' && { paymentDate: paymentDate || new Date() })
        },
        include: {
          paymentRecords: true,
          emiSchedule: {
            include: { installments: true }
          }
        }
      });

      return { paymentRecord, updatedOpportunity };
    });

    return {
      success: true,
      opportunity: result.updatedOpportunity,
      paymentRecord: result.paymentRecord,
      message: 'Partial payment recorded successfully'
    };
  }

  /**
   * Get payment summary for an opportunity
   */
  async getPaymentSummary(opportunityId: string): Promise<PaymentSummary> {
    const opportunity = await prisma.opportunity.findUnique({
      where: { id: opportunityId },
      include: {
        paymentRecords: {
          orderBy: { paymentDate: 'desc' }
        },
        emiSchedule: {
          include: {
            installments: {
              orderBy: { dueDate: 'asc' }
            }
          }
        }
      }
    });

    if (!opportunity) {
      throw new Error('Opportunity not found');
    }

    const totalAmount = opportunity.amount;
    const paidAmount = opportunity.paymentRecords.reduce(
      (sum, record) => sum + record.amount,
      0
    );
    const remainingAmount = totalAmount - paidAmount;

    return {
      totalAmount,
      paidAmount,
      remainingAmount,
      paymentStatus: opportunity.paymentStatus,
      paymentRecords: opportunity.paymentRecords,
      emiSchedule: opportunity.emiSchedule
    };
  }
}

export default new PaymentService();
