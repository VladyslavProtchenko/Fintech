import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PaymentClient, PaymentServiceError } from '@fintech/payment-sdk';
import type { Transaction } from '@fintech/payment-sdk';
import { PrismaService } from '../prisma/prisma.service';
import type { MappedTransaction, PaginatedMappedTransactions } from './types/mapped-transaction';

@Injectable()
export class AccountService {
  private readonly client: PaymentClient;
  private readonly platformId: string;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.client = new PaymentClient({
      baseUrl: config.getOrThrow('PAYMENT_API_URL'),
      apiKey: config.getOrThrow('PAYMENT_API_KEY'),
    });
    this.platformId = config.getOrThrow('PLATFORM_ID');
  }

  async getBalance(userId: string): Promise<string> {
    const user = await this.ensurePaymentClient(userId);
    const paymentClient = await this.client.getClient(user.paymentClientId!);
    return paymentClient.wallet?.balance ?? '0';
  }

  async recharge(userId: string, amount: string): Promise<MappedTransaction> {
    const user = await this.ensurePaymentClient(userId);
    try {
      const tx = await this.client.topup({
        clientId: user.paymentClientId!,
        amount,
        idempotencyKey: crypto.randomUUID(),
      });
      return this.mapTransaction(tx, user.walletId!);
    } catch (err) {
      if (err instanceof PaymentServiceError) throw new BadRequestException(err.message);
      throw err;
    }
  }

  async wire(
    userId: string,
    recipient: string,
    amount: string,
  ): Promise<MappedTransaction> {
    const [sender, recipientUser] = await Promise.all([
      this.ensurePaymentClient(userId),
      this.prisma.user.findUnique({ where: { email: recipient } }),
    ]);

    if (!recipientUser) throw new NotFoundException('Recipient not found');
    if (sender.id === recipientUser.id) throw new BadRequestException('Cannot send to yourself');

    const recipientAccount = await this.ensurePaymentClient(recipientUser.id);

    try {
      const tx = await this.client.transfer({
        fromClientId: sender.paymentClientId!,
        toClientId: recipientAccount.paymentClientId!,
        amount,
        idempotencyKey: crypto.randomUUID(),
      });
      return this.mapTransaction(
        tx,
        sender.walletId!,
        new Map([[recipientAccount.walletId!, recipientAccount.name]]),
      );
    } catch (err) {
      if (err instanceof PaymentServiceError) {
        if (err.isInsufficientFunds) throw new BadRequestException('Insufficient credits');
        throw new BadRequestException(err.message);
      }
      throw err;
    }
  }

  async getLedger(
    userId: string,
    page?: number,
    limit?: number,
    type?: string,
  ): Promise<PaginatedMappedTransactions> {
    const user = await this.ensurePaymentClient(userId);

    let sdkType: 'TOPUP' | 'TRANSFER' | undefined;
    if (type === 'deposit') sdkType = 'TOPUP';
    if (type === 'sent' || type === 'received') sdkType = 'TRANSFER';

    const result = await this.client.listTransactions({
      clientId: user.paymentClientId!,
      page,
      limit,
      type: sdkType,
    });

    const walletIds = new Set<string>();
    for (const tx of result.items) {
      if (tx.fromWalletId && tx.fromWalletId !== user.walletId) walletIds.add(tx.fromWalletId);
      if (tx.toWalletId && tx.toWalletId !== user.walletId) walletIds.add(tx.toWalletId);
    }

    const counterparties = await this.prisma.user.findMany({
      where: { walletId: { in: [...walletIds] } },
      select: { walletId: true, name: true },
    });
    const nameMap = new Map(counterparties.map(u => [u.walletId, u.name]));

    let items = result.items.map(tx => this.mapTransaction(tx, user.walletId!, nameMap));
    if (type === 'sent' || type === 'received') {
      items = items.filter(tx => tx.type === type);
    }

    return { items, total: result.total, page: result.page, limit: result.limit };
  }

  private async ensurePaymentClient(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.paymentClientId && user.walletId) return user;

    const paymentClient = await this.client.createClient({
      email: user.email,
      name: user.name,
      platformId: this.platformId,
    });

    const walletId = paymentClient.wallet?.id;
    if (!walletId) throw new BadRequestException('Payment wallet was not provisioned');

    return this.prisma.user.update({
      where: { id: userId },
      data: { paymentClientId: paymentClient.id, walletId },
    });
  }

  private mapTransaction(
    tx: Transaction,
    myWalletId: string,
    nameMap?: Map<string | null, string>,
  ): MappedTransaction {
    let type: 'deposit' | 'sent' | 'received';
    let counterpartyWalletId: string | null = null;

    if (tx.type === 'TOPUP') {
      type = 'deposit';
    } else if (tx.fromWalletId === myWalletId) {
      type = 'sent';
      counterpartyWalletId = tx.toWalletId ?? null;
    } else {
      type = 'received';
      counterpartyWalletId = tx.fromWalletId ?? null;
    }

    return {
      id: tx.id,
      type,
      amount: tx.amount,
      status: tx.status.toLowerCase(),
      counterparty: counterpartyWalletId && nameMap ? (nameMap.get(counterpartyWalletId) ?? null) : null,
      createdAt: tx.createdAt,
    };
  }
}
