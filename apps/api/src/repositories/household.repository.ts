import {
  HouseholdInviteStatus,
  HouseholdMemberRole,
  HouseholdMemberStatus,
  Prisma
} from "@prisma/client";
import { prisma } from "../clients/prisma.client";

type DbClient = Prisma.TransactionClient | typeof prisma;

const memberInclude = {
  user: {
    select: {
      id: true,
      email: true,
      name: true
    }
  }
} satisfies Prisma.HouseholdMemberInclude;

const householdInclude = {
  createdByUser: {
    select: {
      id: true,
      email: true,
      name: true
    }
  },
  members: {
    where: {
      status: HouseholdMemberStatus.ACTIVE
    },
    include: memberInclude
  }
} satisfies Prisma.HouseholdInclude;

export type HouseholdWithRelations = Prisma.HouseholdGetPayload<{
  include: typeof householdInclude;
}>;

export class HouseholdRepository {
  async runInTransaction<T>(handler: (tx: Prisma.TransactionClient) => Promise<T>) {
    return prisma.$transaction((tx) => handler(tx));
  }

  async listForUser(userId: string) {
    return prisma.household.findMany({
      where: {
        members: {
          some: {
            userId,
            status: HouseholdMemberStatus.ACTIVE
          }
        }
      },
      include: householdInclude,
      orderBy: [{ updatedAt: "desc" }]
    });
  }

  async findByIdForUser(householdId: string, userId: string) {
    return prisma.household.findFirst({
      where: {
        id: householdId,
        members: {
          some: {
            userId,
            status: HouseholdMemberStatus.ACTIVE
          }
        }
      },
      include: householdInclude
    });
  }

  async findById(householdId: string) {
    return prisma.household.findUnique({
      where: { id: householdId },
      include: householdInclude
    });
  }

  async createHousehold(
    input: {
      name: string;
      slug?: string;
      createdByUserId: string;
    },
    tx?: Prisma.TransactionClient
  ) {
    const db = getDb(tx);
    return db.household.create({
      data: {
        name: input.name,
        slug: input.slug,
        createdByUserId: input.createdByUserId
      },
      include: householdInclude
    });
  }

  async addMembership(
    input: {
      householdId: string;
      userId: string;
      role: HouseholdMemberRole;
      status?: HouseholdMemberStatus;
    },
    tx?: Prisma.TransactionClient
  ) {
    const db = getDb(tx);
    return db.householdMember.upsert({
      where: {
        householdId_userId: {
          householdId: input.householdId,
          userId: input.userId
        }
      },
      create: {
        householdId: input.householdId,
        userId: input.userId,
        role: input.role,
        status: input.status ?? HouseholdMemberStatus.ACTIVE
      },
      update: {
        role: input.role,
        status: input.status ?? HouseholdMemberStatus.ACTIVE
      },
      include: memberInclude
    });
  }

  async listMembers(householdId: string) {
    return prisma.householdMember.findMany({
      where: {
        householdId,
        status: HouseholdMemberStatus.ACTIVE
      },
      include: memberInclude,
      orderBy: [{ createdAt: "asc" }]
    });
  }

  async findMember(householdId: string, userId: string) {
    return prisma.householdMember.findUnique({
      where: {
        householdId_userId: {
          householdId,
          userId
        }
      },
      include: memberInclude
    });
  }

  async findMemberById(memberId: string) {
    return prisma.householdMember.findUnique({
      where: { id: memberId },
      include: memberInclude
    });
  }

  async updateMember(
    memberId: string,
    data: Prisma.HouseholdMemberUncheckedUpdateInput,
    tx?: Prisma.TransactionClient
  ) {
    const db = getDb(tx);
    return db.householdMember.update({
      where: { id: memberId },
      data,
      include: memberInclude
    });
  }

  async countActiveOwners(householdId: string) {
    return prisma.householdMember.count({
      where: {
        householdId,
        status: HouseholdMemberStatus.ACTIVE,
        role: HouseholdMemberRole.OWNER
      }
    });
  }

  async createInvite(
    input: {
      householdId: string;
      invitedEmail: string;
      invitedByUserId: string;
      role: HouseholdMemberRole;
      token: string;
      expiresAt?: Date | null;
    },
    tx?: Prisma.TransactionClient
  ) {
    const db = getDb(tx);
    return db.householdInvite.create({
      data: {
        householdId: input.householdId,
        invitedEmail: input.invitedEmail,
        invitedByUserId: input.invitedByUserId,
        role: input.role,
        token: input.token,
        status: HouseholdInviteStatus.PENDING,
        expiresAt: input.expiresAt ?? null
      }
    });
  }

  async findInviteByToken(token: string) {
    return prisma.householdInvite.findUnique({
      where: { token },
      include: {
        household: true
      }
    });
  }

  async findInviteById(inviteId: string) {
    return prisma.householdInvite.findUnique({
      where: { id: inviteId }
    });
  }

  async findOpenInviteByEmail(householdId: string, invitedEmail: string) {
    return prisma.householdInvite.findFirst({
      where: {
        householdId,
        invitedEmail: {
          equals: invitedEmail,
          mode: "insensitive"
        },
        status: HouseholdInviteStatus.PENDING
      },
      orderBy: [{ createdAt: "desc" }]
    });
  }

  async updateInvite(
    inviteId: string,
    data: Prisma.HouseholdInviteUncheckedUpdateInput,
    tx?: Prisma.TransactionClient
  ) {
    const db = getDb(tx);
    return db.householdInvite.update({
      where: {
        id: inviteId
      },
      data
    });
  }

  async createAuditEvent(
    input: {
      userId: string;
      householdId: string;
      eventType: string;
      metadata?: Prisma.InputJsonValue;
    },
    tx?: Prisma.TransactionClient
  ) {
    const db = getDb(tx);
    return db.auditEvent.create({
      data: {
        userId: input.userId,
        householdId: input.householdId,
        eventType: input.eventType,
        metadata: input.metadata
      }
    });
  }
}

function getDb(tx?: Prisma.TransactionClient): DbClient {
  return tx ?? prisma;
}
