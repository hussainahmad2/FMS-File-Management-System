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
      // Assuming files must be in a folder, or we allow root files?
      // If root files allowed, folderId would be null.
      // Schema allows null folderId? "folderId: integer..." - nullable isn't explicitly set in schema.ts, default is not null?
      // Let's check schema.ts.
      // "folderId: integer("folder_id").references..."
      // By default columns are nullable unless .notNull() is called.
      // My schema.ts: folderId: integer("folder_id").references(...)
      // It is nullable.
      return await db.select().from(files).where(isNull(files.folderId));
    }
    return await db.select().from(files).where(eq(files.folderId, folderId));
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
