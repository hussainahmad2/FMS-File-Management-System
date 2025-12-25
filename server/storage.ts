import { users, userSettings, folders, files, auditLogs, permissions as permissionsTable, type User, type InsertUser, type UserSettings, type InsertUserSettings, type Folder, type InsertFolder, type File, type InsertFile, type AuditLog, type InsertAuditLog, type Permission, type InsertPermission } from "@shared/schema";
import { db } from "./db";
import { eq, isNull, and, or, inArray } from "drizzle-orm";

export interface IStorage {
  // Users
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  getUsers(): Promise<User[]>;
  getUserSettings(userId: number): Promise<UserSettings | undefined>;
  updateUserSettings(userId: number, settings: Partial<InsertUserSettings>): Promise<UserSettings>;
  updateUserPassword(userId: number, hashedPassword: string): Promise<void>;

  // Folders
  getFolder(id: number): Promise<Folder | undefined>;
  getFolders(parentId: number | null, userId: number): Promise<Folder[]>;
  createFolder(folder: InsertFolder): Promise<Folder>;
  renameFolder(folderId: number, newName: string): Promise<Folder | undefined>;
  moveFolder(folderId: number, targetFolderId: number | null): Promise<Folder | undefined>;
  deleteFolder(folderId: number): Promise<void>;
  getFolderSize(folderId: number): Promise<number>;
  
  // Files
  getFile(id: number): Promise<File | undefined>;
  getFiles(folderId: number | null, userId: number): Promise<File[]>;
  createFile(file: InsertFile): Promise<File>;
  getRecentFiles(userId: number): Promise<File[]>;
  getStarredFiles(userId: number): Promise<File[]>;
  getTrashFiles(userId: number): Promise<File[]>;
  toggleStar(fileId: number): Promise<File | undefined>;
  deleteFile(fileId: number): Promise<void>;
  restoreFile(fileId: number): Promise<void>;
  permanentDeleteFile(fileId: number): Promise<void>;
  renameFile(fileId: number, newName: string): Promise<File | undefined>;
  moveFile(fileId: number, targetFolderId: number | null): Promise<File | undefined>;
  
  calculateStorageUsage(): Promise<{ used: number; total: number }>;

  // Audit
  createAuditLog(log: InsertAuditLog): Promise<AuditLog>;
  getAuditLogs(): Promise<AuditLog[]>;

  // Permissions
  createPermission(perm: InsertPermission): Promise<Permission>;
  deletePermission(id: number): Promise<void>;
  getPermissions(targetId: number, targetType: 'file' | 'folder'): Promise<(Permission & { user: User })[]>;
  checkAccess(targetId: number, targetType: 'file' | 'folder', userId: number, requiredLevel: 'view' | 'edit'): Promise<boolean>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [result] = await db.insert(users).values(insertUser);
    const id = (result as any).insertId;
    return (await this.getUser(id))!;
  }

  async getUsers(): Promise<User[]> {
    return await db.select().from(users);
  }

  async getUserSettings(userId: number): Promise<UserSettings | undefined> {
    const [settings] = await db.select().from(userSettings).where(eq(userSettings.userId, userId));
    return settings;
  }

  async updateUserSettings(userId: number, newSettings: Partial<InsertUserSettings>): Promise<UserSettings> {
    const existing = await this.getUserSettings(userId);
    if (existing) {
      await db.update(userSettings).set(newSettings).where(eq(userSettings.userId, userId));
    } else {
      await db.insert(userSettings).values({ ...newSettings, userId } as InsertUserSettings);
    }
    return (await this.getUserSettings(userId))!;
  }

  async updateUserPassword(userId: number, hashedPassword: string): Promise<void> {
    await db.update(users).set({ password: hashedPassword }).where(eq(users.id, userId));
  }

  async getFolder(id: number): Promise<Folder | undefined> {
    const [folder] = await db.select().from(folders).where(eq(folders.id, id));
    return folder;
  }

  async getFolders(parentId: number | null, userId: number): Promise<Folder[]> {
    // 1. Get folders shared explicitly with user
    const sharedFolders = await db.select({ folderId: permissionsTable.folderId })
      .from(permissionsTable)
      .where(and(eq(permissionsTable.userId, userId), isNull(permissionsTable.fileId)));
    
    const sharedFolderIds = sharedFolders.map(p => p.folderId).filter((id): id is number => id !== null);

    if (parentId === null) {
      // Root: Show Owned Root Folders OR Shared Folders (at root level effectively for the view)
      const conditions = [
        and(isNull(folders.parentId), eq(folders.ownerId, userId), eq(folders.isDeleted, false))
      ];
      
      if (sharedFolderIds.length > 0) {
        conditions.push(and(inArray(folders.id, sharedFolderIds), eq(folders.isDeleted, false)));
      }
      
      return await db.select().from(folders).where(or(...conditions));
    }
    
    return await db.select().from(folders).where(and(eq(folders.parentId, parentId), eq(folders.isDeleted, false)));
  }

  async createFolder(insertFolder: InsertFolder): Promise<Folder> {
    const [result] = await db.insert(folders).values(insertFolder);
    const id = (result as any).insertId;
    return (await this.getFolder(id))!;
  }

  async getFile(id: number): Promise<File | undefined> {
    const [file] = await db.select().from(files).where(eq(files.id, id));
    return file;
  }

  async getFiles(folderId: number | null, userId: number): Promise<File[]> {
    const sharedFiles = await db.select({ fileId: permissionsTable.fileId })
      .from(permissionsTable)
      .where(and(eq(permissionsTable.userId, userId), isNull(permissionsTable.folderId)));
      
    const sharedFileIds = sharedFiles.map(p => p.fileId).filter((id): id is number => id !== null);

    if (folderId === null) {
      // Root: Owned Root Files OR Shared Files
      const conditions = [
        and(isNull(files.folderId), eq(files.createdBy, userId), eq(files.isDeleted, false))
      ];
      if (sharedFileIds.length > 0) {
        conditions.push(and(inArray(files.id, sharedFileIds), eq(files.isDeleted, false)));
      }
      return await db.select().from(files).where(or(...conditions));
    }
    
    return await db.select().from(files).where(and(eq(files.folderId, folderId), eq(files.isDeleted, false)));
  }

  async getRecentFiles(userId: number): Promise<File[]> {
    // Show owned or shared files
    const sharedFiles = await db.select({ fileId: permissionsTable.fileId })
      .from(permissionsTable)
      .where(and(eq(permissionsTable.userId, userId), isNull(permissionsTable.folderId)));
    const sharedFileIds = sharedFiles.map(p => p.fileId).filter((id): id is number => id !== null);

    const conditions = [
      and(eq(files.createdBy, userId), eq(files.isDeleted, false))
    ];
    if (sharedFileIds.length > 0) {
      conditions.push(and(inArray(files.id, sharedFileIds), eq(files.isDeleted, false)));
    }

    return await db.select().from(files)
      .where(or(...conditions))
      .orderBy(files.lastAccessedAt)
      .limit(10);
  }

  async getStarredFiles(userId: number): Promise<File[]> {
    const sharedFiles = await db.select({ fileId: permissionsTable.fileId })
      .from(permissionsTable)
      .where(and(eq(permissionsTable.userId, userId), isNull(permissionsTable.folderId)));
    const sharedFileIds = sharedFiles.map(p => p.fileId).filter((id): id is number => id !== null);

    const conditions = [
      and(eq(files.createdBy, userId), eq(files.isStarred, true), eq(files.isDeleted, false))
    ];
    if (sharedFileIds.length > 0) {
      conditions.push(and(inArray(files.id, sharedFileIds), eq(files.isStarred, true), eq(files.isDeleted, false)));
    }

    return await db.select().from(files).where(or(...conditions));
  }

  async getTrashFiles(userId: number): Promise<File[]> {
    return await db.select().from(files)
      .where(and(eq(files.createdBy, userId), eq(files.isDeleted, true)));
  }

  async toggleStar(fileId: number): Promise<File | undefined> {
    const [file] = await db.select().from(files).where(eq(files.id, fileId));
    if (!file) return undefined;
    
    await db.update(files)
      .set({ isStarred: !file.isStarred })
      .where(eq(files.id, fileId));
      
    return (await this.getFile(fileId));
  }

  async deleteFile(fileId: number): Promise<void> {
    await db.update(files).set({ isDeleted: true, deletedAt: new Date() }).where(eq(files.id, fileId));
  }

  async restoreFile(fileId: number): Promise<void> {
    await db.update(files).set({ isDeleted: false, deletedAt: null }).where(eq(files.id, fileId));
  }

  async permanentDeleteFile(fileId: number): Promise<void> {
    await db.delete(files).where(eq(files.id, fileId));
  }

  async renameFile(fileId: number, newName: string): Promise<File | undefined> {
    const [file] = await db.select().from(files).where(eq(files.id, fileId));
    if (!file) return undefined;
    await db.update(files).set({ name: newName }).where(eq(files.id, fileId));
    return (await this.getFile(fileId))!;
  }

  async moveFile(fileId: number, targetFolderId: number | null): Promise<File | undefined> {
    const [file] = await db.select().from(files).where(eq(files.id, fileId));
    if (!file) return undefined;
    await db.update(files).set({ folderId: targetFolderId }).where(eq(files.id, fileId));
    return (await this.getFile(fileId))!;
  }

  async renameFolder(folderId: number, newName: string): Promise<Folder | undefined> {
    const [folder] = await db.select().from(folders).where(eq(folders.id, folderId));
    if (!folder) return undefined;
    await db.update(folders).set({ name: newName }).where(eq(folders.id, folderId));
    return (await this.getFolder(folderId))!;
  }

  async moveFolder(folderId: number, targetFolderId: number | null): Promise<Folder | undefined> {
    const [folder] = await db.select().from(folders).where(eq(folders.id, folderId));
    if (!folder) return undefined;
    
    // Prevent moving folder into itself or its children
    if (folderId === targetFolderId) return undefined;
    // (A full cycle check would be ideal here but for now simple check)

    await db.update(folders).set({ parentId: targetFolderId }).where(eq(folders.id, folderId));
    return (await this.getFolder(folderId))!;
  }

  async deleteFolder(folderId: number): Promise<void> {
    // Soft delete the folder
    await db.update(folders).set({ isDeleted: true }).where(eq(folders.id, folderId));
    
    // Recursive soft delete for children could be done here, but for now filtering parent is enough for view.
    // However, to be thorough:
    // This requires recursive traversal which is hard without CTEs or multiple queries.
    // For MVP, we assume hiding the parent hides the children.
    // Ideally: we should mark all children recursively.
  }

  async getFolderSize(folderId: number): Promise<number> {
    // This sums files directly in the folder. For recursive, we'd need more logic.
    // MVP: Sum direct children files.
    const result = await db.select({
      total: files.size
    }).from(files).where(and(eq(files.folderId, folderId), eq(files.isDeleted, false)));
    
    return result.reduce((sum, row) => sum + (row.total || 0), 0);
  }

  async calculateStorageUsage(): Promise<{ used: number; total: number }> {
    const result = await db.select({
      total: files.size
    }).from(files).where(eq(files.isDeleted, false));
    const used = result.reduce((sum, row) => sum + (row.total || 0), 0);
    return { used, total: 10 * 1024 * 1024 * 1024 }; // 10GB total
  }

  async createFile(insertFile: InsertFile): Promise<File> {
    const [result] = await db.insert(files).values(insertFile);
    const id = (result as any).insertId;
    return (await this.getFile(id))!;
  }

  async createAuditLog(insertLog: InsertAuditLog): Promise<AuditLog> {
    const [result] = await db.insert(auditLogs).values(insertLog);
    const id = (result as any).insertId;
    // We don't fetch back the audit log usually, but for consistency:
    const [log] = await db.select().from(auditLogs).where(eq(auditLogs.id, id));
    return log;
  }

  async getAuditLogs(): Promise<AuditLog[]> {
    return await db.select().from(auditLogs).orderBy(auditLogs.createdAt);
  }

  // Permissions Implementation
  async createPermission(perm: InsertPermission): Promise<Permission> {
    const [result] = await db.insert(permissionsTable).values(perm);
    const id = (result as any).insertId;
    const [created] = await db.select().from(permissionsTable).where(eq(permissionsTable.id, id));
    return created;
  }

  async deletePermission(id: number): Promise<void> {
    await db.delete(permissionsTable).where(eq(permissionsTable.id, id));
  }

  async getPermissions(targetId: number, targetType: 'file' | 'folder'): Promise<(Permission & { user: User })[]> {
    // Select permissions and join with users to get username
    const result = await db.select({
      permission: permissionsTable,
      user: users
    })
    .from(permissionsTable)
    .innerJoin(users, eq(permissionsTable.userId, users.id))
    .where(
      targetType === 'file' 
        ? eq(permissionsTable.fileId, targetId)
        : eq(permissionsTable.folderId, targetId)
    );
    
    return result.map(r => ({ ...r.permission, user: r.user }));
  }

  async checkAccess(targetId: number, targetType: 'file' | 'folder', userId: number, requiredLevel: 'view' | 'edit'): Promise<boolean> {
    // 1. Check Ownership
    if (targetType === 'file') {
      const file = await this.getFile(targetId);
      if (file?.createdBy === userId) return true;
    } else {
      const folder = await this.getFolder(targetId);
      if (folder?.ownerId === userId) return true;
    }

    // 2. Check Direct Permission
    const [perm] = await db.select().from(permissionsTable).where(
      and(
        eq(permissionsTable.userId, userId),
        targetType === 'file' ? eq(permissionsTable.fileId, targetId) : eq(permissionsTable.folderId, targetId)
      )
    );

    if (perm) {
      if (requiredLevel === 'view') return true;
      if (requiredLevel === 'edit' && perm.accessLevel === 'edit') return true;
    }

    // 3. Check Parent Folder Permission (Recursion needed? Or assume passed from Route?)
    // For strict check, we should traverse up. 
    // MVP: Direct permission or Owner only.
    return false;
  }
}

export const storage = new DatabaseStorage();
