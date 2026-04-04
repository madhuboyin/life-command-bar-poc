import { HouseholdMemberRole, HouseholdMemberStatus } from "@prisma/client";
import { prisma } from "../clients/prisma.client";
import { AppError } from "./app-error";

export async function listActiveHouseholdIdsForUser(userId: string) {
  const memberships = await prisma.householdMember.findMany({
    where: {
      userId,
      status: HouseholdMemberStatus.ACTIVE
    },
    select: {
      householdId: true
    }
  });

  return memberships.map((item) => item.householdId);
}

export async function getActiveMembership(
  householdId: string,
  userId: string
) {
  return prisma.householdMember.findFirst({
    where: {
      householdId,
      userId,
      status: HouseholdMemberStatus.ACTIVE
    }
  });
}

export async function requireHouseholdMember(
  householdId: string,
  userId: string
) {
  const membership = await getActiveMembership(householdId, userId);
  if (!membership) {
    throw new AppError("FORBIDDEN", "You are not a member of this household", 403);
  }

  return membership;
}

export async function requireHouseholdOwner(
  householdId: string,
  userId: string
) {
  const membership = await requireHouseholdMember(householdId, userId);
  if (membership.role !== HouseholdMemberRole.OWNER) {
    throw new AppError("FORBIDDEN", "Only household owners can do this", 403);
  }

  return membership;
}

export async function ensureAssigneeIsActiveMember(
  householdId: string,
  assigneeUserId: string
) {
  const membership = await prisma.householdMember.findFirst({
    where: {
      householdId,
      userId: assigneeUserId,
      status: HouseholdMemberStatus.ACTIVE
    },
    select: {
      id: true
    }
  });

  if (!membership) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Assignee must be an active member of this household",
      400
    );
  }
}
