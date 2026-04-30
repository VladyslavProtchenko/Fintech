import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TopupDto } from './dto/topup.dto';
import { TransferDto } from './dto/transfer.dto';
import { WithdrawDto } from './dto/withdraw.dto';
import { ListTransactionsDto } from './dto/list-transactions.dto';

@Injectable()
export class TransactionsService {
  constructor(private readonly prisma: PrismaService) {}

  async topup(dto: TopupDto) {
    const wallet = await this.getWalletByClientId(dto.clientId);
    const amount = new Prisma.Decimal(dto.amount);
    this.assertPositive(amount);

    return this.prisma.$transaction(async (tx) => {
      const transaction = await tx.transaction
        .create({
          data: {
            toWalletId: wallet.id,
            amount,
            type: 'TOPUP',
            status: 'COMPLETED',
            idempotencyKey: dto.idempotencyKey,
          },
        })
        .catch(this.handleIdempotencyConflict(dto.idempotencyKey));

      await tx.wallet.update({
        where: { id: wallet.id },
        data: { balance: { increment: amount } },
      });

      return transaction;
    });
  }

  async transfer(dto: TransferDto) {
    if (dto.fromClientId === dto.toClientId) {
      throw new UnprocessableEntityException('Cannot transfer to the same client');
    }

    const [fromWallet, toWallet] = await Promise.all([
      this.getWalletByClientId(dto.fromClientId),
      this.getWalletByClientId(dto.toClientId),
    ]);

    const amount = new Prisma.Decimal(dto.amount);
    this.assertPositive(amount);

    return this.prisma.$transaction(
      async (tx) => {
        // Atomic debit: only succeeds if balance >= amount — no race condition
        const updated = await tx.$executeRaw`
          UPDATE "Wallet"
          SET balance = balance - ${amount}
          WHERE id = ${fromWallet.id}
            AND balance >= ${amount}
        `;

        if (updated === 0) {
          throw new UnprocessableEntityException('Insufficient funds');
        }

        await tx.wallet.update({
          where: { id: toWallet.id },
          data: { balance: { increment: amount } },
        });

        return tx.transaction
          .create({
            data: {
              fromWalletId: fromWallet.id,
              toWalletId: toWallet.id,
              amount,
              type: 'TRANSFER',
              status: 'COMPLETED',
              idempotencyKey: dto.idempotencyKey,
            },
          })
          .catch(this.handleIdempotencyConflict(dto.idempotencyKey));
      },
      { isolationLevel: 'Serializable' },
    );
  }

  async withdraw(dto: WithdrawDto) {
    const wallet = await this.getWalletByClientId(dto.clientId);
    const amount = new Prisma.Decimal(dto.amount);
    this.assertPositive(amount);

    return this.prisma.$transaction(
      async (tx) => {
        // Atomic debit: only succeeds if balance >= amount — no race condition
        const updated = await tx.$executeRaw`
          UPDATE "Wallet"
          SET balance = balance - ${amount}
          WHERE id = ${wallet.id}
            AND balance >= ${amount}
        `;

        if (updated === 0) {
          throw new UnprocessableEntityException('Insufficient funds');
        }

        return tx.transaction
          .create({
            data: {
              fromWalletId: wallet.id,
              amount,
              type: 'WITHDRAWAL',
              status: 'COMPLETED',
              idempotencyKey: dto.idempotencyKey,
            },
          })
          .catch(this.handleIdempotencyConflict(dto.idempotencyKey));
      },
      { isolationLevel: 'Serializable' },
    );
  }

  async findMany(dto: ListTransactionsDto) {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;
    const skip = (page - 1) * limit;

    const wallet = await this.prisma.wallet.findUnique({
      where: { clientId: dto.clientId },
    });
    if (!wallet) throw new NotFoundException('Client not found');

    const where: Prisma.TransactionWhereInput = {
      OR: [{ fromWalletId: wallet.id }, { toWalletId: wallet.id }],
      ...(dto.type ? { type: dto.type } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.transaction.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.transaction.count({ where }),
    ]);

    return { items, total, page, limit };
  }

  async findOne(id: string) {
    const transaction = await this.prisma.transaction.findUnique({ where: { id } });
    if (!transaction) throw new NotFoundException('Transaction not found');
    return transaction;
  }

  private assertPositive(amount: Prisma.Decimal): void {
    if (!amount.greaterThan(0)) {
      throw new UnprocessableEntityException('Amount must be greater than 0');
    }
  }

  private async getWalletByClientId(clientId: string) {
    const wallet = await this.prisma.wallet.findUnique({ where: { clientId } });
    if (!wallet) throw new NotFoundException(`Client not found: ${clientId}`);
    return wallet;
  }

  // Returns existing transaction on duplicate idempotency key instead of throwing
  private handleIdempotencyConflict(key: string) {
    return async (err: unknown) => {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        const existing = await this.prisma.transaction.findUnique({
          where: { idempotencyKey: key },
        });
        if (existing) throw new ConflictException({ duplicate: true, transaction: existing });
      }
      throw err;
    };
  }
}
