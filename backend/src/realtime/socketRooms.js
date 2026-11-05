const { roles } = require("../../../shared/constants.json");

function userRoom(userId) {
  return `user:${userId}`;
}

function departmentRoom(departmentId) {
  return `department:${departmentId}`;
}

function roleRoom(role) {
  return `role:${role}`;
}

function getAuthorizedRooms(user) {
  if (!user || !user.id || !user.role) {
    return [];
  }

  const roomSet = new Set();

  // 1. Personal private user room (for direct notifications)
  roomSet.add(userRoom(user.id));

  // 2. Role-specific room
  roomSet.add(roleRoom(user.role));

  // 3. Department boundary enforcement
  if (
    user.departmentId &&
    [roles.DEPT_HEAD, roles.FACULTY].includes(user.role)
  ) {
    roomSet.add(departmentRoom(user.departmentId));
  }

  // 4. SUPER_ADMIN and SECURITY have global role rooms and system alerts
  if (user.role === roles.SUPER_ADMIN || user.role === roles.SECURITY) {
    roomSet.add("system:global");
  }

  return Array.from(roomSet);
}

function isRoomAuthorized(user, targetRoom) {
  if (!targetRoom || typeof targetRoom !== "string") {
    return false;
  }

  const authorized = getAuthorizedRooms(user);
  return authorized.includes(targetRoom);
}

async function joinAuthorizedRooms(socket) {
  const user = socket.user;

  if (!user?.id || !user?.role) {
    throw new Error("Authenticated user information is missing.");
  }

  const roomsToJoin = getAuthorizedRooms(user);

  for (const room of roomsToJoin) {
    await socket.join(room);
  }

  return roomsToJoin;
}

module.exports = {
  userRoom,
  departmentRoom,
  roleRoom,
  getAuthorizedRooms,
  isRoomAuthorized,
  joinAuthorizedRooms,
};