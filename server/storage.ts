import { users, folders, files, auditLogs, type User, type InsertUser, type Folder, type InsertFolder, type File, type InsertFile, type AuditLog, type InsertAuditLog } from "@shared/schema";
import { db } from "./db";
import { eq, isNull } from "drizzle-orm";

export interface IStorage {
  // Users
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  getUsers(): Promise<User[]>;

  // Folders
  getFolder(id: number): Promise<Folder | undefined>;
  getFolders(parentId: number | null): Promise<Folder[]>;
  createFolder(folder: InsertFolder): Promise<Folder>;

  // Files
  getFile(id: number): Promise<File | undefined>;
  getFiles(folderId: number | null): Promise<File[]>;
  createFile(file: InsertFile): Promise<File>;
  getRecentFiles(): Promise<File[]>;
  getStarredFiles(): Promise<File[]>;
  getTrashFiles(): Promise<File[]>;
  toggleStar(fileId: number): Promise<File | undefined>;
  deleteFile(fileId: number): Promise<void>;
  calculateStorageUsage(): Promise<{ used: number; total: number }>;

  // Audit
  createAuditLog(log: InsertAuditLog): Promise<AuditLog>;
  getAuditLogs(): Promise<AuditLog[]>;
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
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  async getUsers(): Promise<User[]> {
    return await db.select().from(users);
  }

  async getFolder(id: number): Promise<Folder | undefined> {
    const [folder] = await db.select().from(folders).where(eq(folders.id, id));
    return folder;
  }

  async getFolders(parentId: number | null): Promise<Folder[]> {
    if (parentId === null) {
      return await db.select().from(folders).where(isNull(folders.parentId));
    }
    return await db.select().from(folders).where(eq(folders.parentId, parentId));
  }

  async createFolder(insertFolder: InsertFolder): Promise<Folder> {
    const [folder] = await db.insert(folders).values(insertFolder).returning();
    return folder;
  }

  async getFile(id: number): Promise<File | undefined> {
    const [file] = await db.select().from(files).where(eq(files.id, id));
    return file;
  }

  async getFiles(folderId: number | null): Promise<File[]> {
    if (folderId === null) {
      return await db.select().from(files).where(isNull(files.folderId));
    }
    return await db.select().from(files).where(eq(files.folderId, folderId));
  }

  async getRecentFiles(): Promise<File[]> {
    return await db.select().from(files)
      .where((f) => f.isDeleted === false)
      .orderBy(files.lastAccessedAt)
      .limit(10);
  }

  async getStarredFiles(): Promise<File[]> {
    return await db.select().from(files)
      .where((f) => f.isStarred === true && f.isDeleted === false);
  }

  async getTrashFiles(): Promise<File[]> {
    return await db.select().from(files)
      .where((f) => f.isDeleted === true);
  }

  async toggleStar(fileId: number): Promise<File | undefined> {
    const [file] = await db.select().from(files).where(eq(files.id, fileId));
    if (!file) return undefined;
    const [updated] = await db.update(files)
      .set({ isStarred: !file.isStarred })
      .where(eq(files.id, fileId))
      .returning();
    return updated;
  }

  async deleteFile(fileId: number): Promise<void> {
    await db.update(files).set({ isDeleted: true }).where(eq(files.id, fileId));
  }

  async calculateStorageUsage(): Promise<{ used: number; total: number }> {
    const result = await db.select({
      total: files.size
    }).from(files).where((f) => f.isDeleted === false);
    const used = result.reduce((sum, row) => sum + (row.total || 0), 0);
    return { used, total: 10 * 1024 * 1024 * 1024 }; // 10GB total
  }

  async createFile(insertFile: InsertFile): Promise<File> {
    const [file] = await db.insert(files).values(insertFile).returning();
    return file;
  }

  async createAuditLog(insertLog: InsertAuditLog): Promise<AuditLog> {
    const [log] = await db.insert(auditLogs).values(insertLog).returning();
    return log;
  }

  async getAuditLogs(): Promise<AuditLog[]> {
    return await db.select().from(auditLogs).orderBy(auditLogs.createdAt);
  }
}

export const storage = new DatabaseStorage();
