type BlockLike = {
  id: string;
  code?: string;
  name?: string;
  location?: string | null;
} | null;

type DormLike = {
  id: string;
  code: string;
  name: string;
  floorNumber: number;
  capacity: number;
  status: "ACTIVE" | "INACTIVE" | "MAINTENANCE";
  isActive: boolean;
  block?: BlockLike;
};

function withLegacyBuilding<T extends { block?: BlockLike }>(dorm: T) {
  return {
    ...dorm,
    building: dorm.block
      ? {
          ...dorm.block,
          location: dorm.block.location ?? null,
        }
      : null,
  };
}

export function buildCompatibilityRoom<T extends DormLike>(dorm: T) {
  return {
    id: dorm.id,
    dormId: dorm.id,
    floorNumber: dorm.floorNumber,
    roomNumber: dorm.code,
    capacity: dorm.capacity,
    status: dorm.status,
    isActive: dorm.isActive,
    dorm: withLegacyBuilding(dorm),
  };
}

export function attachCompatibilityRoomToBed<T extends { dorm: DormLike }>(bed: T) {
  return {
    ...bed,
    room: buildCompatibilityRoom(bed.dorm),
  };
}

export function attachCompatibilityRoomToAllocation<T extends { bed: { dorm: DormLike } }>(
  allocation: T
) {
  return {
    ...allocation,
    bed: attachCompatibilityRoomToBed(allocation.bed),
  };
}

export function attachCompatibilityRoomToMaintenanceRequest<T extends { dorm: DormLike }>(
  request: T
) {
  return {
    ...request,
    room: buildCompatibilityRoom(request.dorm),
  };
}
