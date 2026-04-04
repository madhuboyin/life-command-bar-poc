import crypto from "crypto";
import {
  HouseholdInviteStatus,
  HouseholdMemberRole,
  HouseholdMemberStatus
} from "@prisma/client";
import { z } from "zod";
import { prisma } from "../clients/prisma.client";
import {
  HouseholdRepository,
  type HouseholdWithRelations
} from "../repositories/household.repository";
import { AppError } from "../utils/app-error";
import { requireHouseholdMember, requireHouseholdOwner } from "../utils/household-access";

const createHouseholdSchema = z.object({
  name: z.string().min(1).max(120),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9-]{3,80}$/)
    .optional()
});

const patchHouseholdSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9-]{3,80}$/)
    .nullable()
    .optional()
});

const inviteSchema = z.object({
  invitedEmail: z.string().trim().toLowerCase().email(),
  role: z.nativeEnum(HouseholdMemberRole).optional(),
  expiresInDays: z.number().int().min(1).max(60).optional()
});

export class HouseholdService {
  private readonly repository = new HouseholdRepository();

  async list(userId: string) {
    const households = await this.repository.listForUser(userId);
    return {
      households: households.map((household) => mapHousehold(household, userId))
    };
  }

  async create(userId: string, payload: unknown) {
    const input = createHouseholdSchema.parse(payload ?? {});

    const household = await this.repository.runInTransaction(async (tx) => {
      const created = await this.repository.createHousehold(
        {
          name: input.name.trim(),
          slug: input.slug,
          createdByUserId: userId
        },
        tx
      );

      await this.repository.addMembership(
        {
          householdId: created.id,
          userId,
          role: HouseholdMemberRole.OWNER,
          status: HouseholdMemberStatus.ACTIVE
        },
        tx
      );

      await this.repository.createAuditEvent(
        {
          userId,
          householdId: created.id,
          eventType: "household_created",
          metadata: {
            name: created.name,
            slug: created.slug
          }
        },
        tx
      );

      return created;
    });

    const refreshed = await this.repository.findByIdForUser(household.id, userId);
    if (!refreshed) {
      throw new AppError("INTERNAL_ERROR", "Could not load created household", 500);
    }

    return {
      household: mapHousehold(refreshed, userId)
    };
  }

  async getById(userId: string, householdId: string) {
    const household = await this.repository.findByIdForUser(householdId, userId);
    if (!household) return null;

    return {
      household: mapHousehold(household, userId)
    };
  }

  async update(userId: string, householdId: string, payload: unknown) {
    await requireHouseholdOwner(householdId, userId);
    const input = patchHouseholdSchema.parse(payload ?? {});
    if (Object.keys(input).length === 0) {
      throw new AppError("VALIDATION_ERROR", "No household fields provided", 400);
    }

    const updated = await prisma.household.update({
      where: { id: householdId },
      data: {
        name: input.name?.trim(),
        slug: input.slug === undefined ? undefined : input.slug
      }
    });

    await this.repository.createAuditEvent({
      userId,
      householdId,
      eventType: "household_updated",
      metadata: {
        updatedFields: Object.keys(input)
      }
    });

    const household = await this.repository.findByIdForUser(updated.id, userId);
    if (!household) {
      throw new AppError("INTERNAL_ERROR", "Could not load updated household", 500);
    }

    return {
      household: mapHousehold(household, userId)
    };
  }

  async listMembers(userId: string, householdId: string) {
    await requireHouseholdMember(householdId, userId);
    const members = await this.repository.listMembers(householdId);
    return {
      members: members.map((member) => ({
        id: member.id,
        householdId: member.householdId,
        userId: member.userId,
        role: member.role,
        status: member.status,
        user: {
          id: member.user.id,
          email: member.user.email,
          name: member.user.name
        },
        createdAt: member.createdAt.toISOString(),
        updatedAt: member.updatedAt.toISOString()
      }))
    };
  }

  async inviteMember(userId: string, householdId: string, payload: unknown) {
    await requireHouseholdOwner(householdId, userId);
    const input = inviteSchema.parse(payload ?? {});
    const role = input.role ?? HouseholdMemberRole.MEMBER;
    const invitedEmail = input.invitedEmail.trim().toLowerCase();

    const existingUser = await prisma.user.findFirst({
      where: {
        email: {
          equals: invitedEmail,
          mode: "insensitive"
        }
      },
      select: {
        id: true
      }
    });

    if (existingUser) {
      const existingMembership = await this.repository.findMember(householdId, existingUser.id);
      if (existingMembership?.status === HouseholdMemberStatus.ACTIVE) {
        throw new AppError("CONFLICT", "That user is already a household member", 409);
      }
    }

    const openInvite = await this.repository.findOpenInviteByEmail(householdId, invitedEmail);
    if (openInvite) {
      throw new AppError("CONFLICT", "An active invite for this email already exists", 409);
    }

    const expiresInDays = input.expiresInDays ?? 14;
    const invite = await this.repository.createInvite({
      householdId,
      invitedEmail,
      invitedByUserId: userId,
      role,
      token: crypto.randomBytes(20).toString("hex"),
      expiresAt: new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
    });

    await this.repository.createAuditEvent({
      userId,
      householdId,
      eventType: "household_invite_sent",
      metadata: {
        inviteId: invite.id,
        invitedEmail: invite.invitedEmail,
        role: invite.role
      }
    });

    return {
      invite: mapInvite(invite)
    };
  }

  async acceptInvite(userId: string, userEmail: string, token: string) {
    const invite = await this.repository.findInviteByToken(token);
    if (!invite) {
      throw new AppError("NOT_FOUND", "Invite not found", 404);
    }

    if (invite.status !== HouseholdInviteStatus.PENDING) {
      throw new AppError("VALIDATION_ERROR", "Invite is no longer active", 400);
    }

    if (invite.expiresAt && invite.expiresAt.getTime() < Date.now()) {
      await this.repository.updateInvite(invite.id, {
        status: HouseholdInviteStatus.EXPIRED
      });
      throw new AppError("VALIDATION_ERROR", "Invite has expired", 400);
    }

    const normalizedEmail = userEmail.trim().toLowerCase();
    const inviteEmail = invite.invitedEmail.trim().toLowerCase();
    const isFallbackLocalIdentity = normalizedEmail.endsWith("@local.lcb");
    if (!isFallbackLocalIdentity && normalizedEmail !== inviteEmail) {
      throw new AppError(
        "FORBIDDEN",
        "Invite email does not match the authenticated user",
        403
      );
    }

    await this.repository.runInTransaction(async (tx) => {
      await this.repository.updateInvite(
        invite.id,
        {
          status: HouseholdInviteStatus.ACCEPTED,
          acceptedAt: new Date()
        },
        tx
      );

      await this.repository.addMembership(
        {
          householdId: invite.householdId,
          userId,
          role: invite.role,
          status: HouseholdMemberStatus.ACTIVE
        },
        tx
      );

      await this.repository.createAuditEvent(
        {
          userId,
          householdId: invite.householdId,
          eventType: "household_invite_accepted",
          metadata: {
            inviteId: invite.id,
            invitedEmail: invite.invitedEmail
          }
        },
        tx
      );
    });

    const household = await this.repository.findByIdForUser(invite.householdId, userId);
    if (!household) {
      throw new AppError("INTERNAL_ERROR", "Could not load accepted household", 500);
    }

    return {
      household: mapHousehold(household, userId)
    };
  }

  async revokeInvite(userId: string, inviteId: string) {
    const invite = await this.repository.findInviteById(inviteId);
    if (!invite) return null;

    await requireHouseholdOwner(invite.householdId, userId);
    if (invite.status !== HouseholdInviteStatus.PENDING) {
      throw new AppError("VALIDATION_ERROR", "Only pending invites can be revoked", 400);
    }

    const updated = await this.repository.updateInvite(invite.id, {
      status: HouseholdInviteStatus.REVOKED
    });

    await this.repository.createAuditEvent({
      userId,
      householdId: invite.householdId,
      eventType: "household_invite_revoked",
      metadata: {
        inviteId: invite.id
      }
    });

    return {
      invite: mapInvite(updated)
    };
  }

  async removeMember(userId: string, householdId: string, memberId: string) {
    await requireHouseholdOwner(householdId, userId);
    const member = await this.repository.findMemberById(memberId);
    if (!member || member.householdId !== householdId) {
      return null;
    }

    if (member.role === HouseholdMemberRole.OWNER && member.status === HouseholdMemberStatus.ACTIVE) {
      const ownerCount = await this.repository.countActiveOwners(householdId);
      if (ownerCount <= 1) {
        throw new AppError("VALIDATION_ERROR", "Household must keep at least one owner", 400);
      }
    }

    const removed = await this.repository.updateMember(member.id, {
      status: HouseholdMemberStatus.REMOVED
    });

    const reassigned = await prisma.obligation.updateMany({
      where: {
        householdId,
        assignedToUserId: member.userId,
        scopeType: "HOUSEHOLD"
      },
      data: {
        assignedToUserId: null
      }
    });

    await this.repository.createAuditEvent({
      userId,
      householdId,
      eventType: "household_member_removed",
      metadata: {
        removedMemberId: member.id,
        removedUserId: member.userId,
        unassignedObligationCount: reassigned.count
      }
    });

    return {
      member: {
        id: removed.id,
        householdId: removed.householdId,
        userId: removed.userId,
        role: removed.role,
        status: removed.status,
        user: {
          id: removed.user.id,
          email: removed.user.email,
          name: removed.user.name
        },
        createdAt: removed.createdAt.toISOString(),
        updatedAt: removed.updatedAt.toISOString()
      },
      unassignedObligationCount: reassigned.count
    };
  }
}

function mapHousehold(
  household: HouseholdWithRelations,
  userId: string
) {
  const me = household.members.find((member) => member.userId === userId);

  return {
    id: household.id,
    name: household.name,
    slug: household.slug,
    createdByUserId: household.createdByUserId,
    createdBy: {
      id: household.createdByUser.id,
      email: household.createdByUser.email,
      name: household.createdByUser.name
    },
    memberCount: household.members.length,
    myRole: me?.role ?? null,
    createdAt: household.createdAt.toISOString(),
    updatedAt: household.updatedAt.toISOString()
  };
}

function mapInvite(invite: {
  id: string;
  householdId: string;
  invitedEmail: string;
  invitedByUserId: string;
  role: HouseholdMemberRole;
  token: string;
  status: HouseholdInviteStatus;
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date | null;
  acceptedAt: Date | null;
}) {
  return {
    id: invite.id,
    householdId: invite.householdId,
    invitedEmail: invite.invitedEmail,
    invitedByUserId: invite.invitedByUserId,
    role: invite.role,
    token: invite.token,
    status: invite.status,
    createdAt: invite.createdAt.toISOString(),
    updatedAt: invite.updatedAt.toISOString(),
    expiresAt: invite.expiresAt?.toISOString() ?? null,
    acceptedAt: invite.acceptedAt?.toISOString() ?? null
  };
}
