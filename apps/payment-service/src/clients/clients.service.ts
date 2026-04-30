import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateClientDto } from './dto/create-client.dto';

@Injectable()
export class ClientsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateClientDto) {
    return this.prisma.client
      .create({
        data: {
          email: dto.email,
          name: dto.name,
          wallet: { create: { balance: 0 } },
        },
        include: { wallet: true },
      })
      .catch((err: unknown) => {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
          throw new ConflictException('Client with this email already exists');
        }
        throw err;
      });
  }

  async findOne(id: string) {
    const client = await this.prisma.client.findUnique({
      where: { id },
      include: { wallet: true },
    });
    if (!client) throw new NotFoundException('Client not found');
    return client;
  }
}
