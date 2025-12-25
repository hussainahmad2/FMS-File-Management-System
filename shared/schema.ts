import { mysqlTable, serial, int, text, boolean, timestamp, varchar } from "drizzle-orm/mysql-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { relations } from "drizzle-orm";

// === TABLE DEFINITIONS ===

export const users = mysqlTable("users", {
  id: serial("id").primaryKey(),
  username: varchar("username", { length: 255 }).notNull().unique(),
  password: text("password").notNull(),
  role: varchar("role", { length: 50 }).notNull().default("employee"), // 'superadmin', 'admin', 'staff', 'employee'
  status: varchar("status", { length: 50 }).notNull().default("active"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const userSettings = mysqlTable("user_settings", {
  userId: int("user_id").primaryKey().references(() => users.id),
  theme: varchar("theme", { length: 20 }).default("light"),
  notificationsEnabled: boolean("notifications_enabled").default(true),
  language: varchar("language", { length: 10 }).default("en"),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

export const folders = mysqlTable("folders", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  parentId: int("parent_id"), // Can be null for root folders
  ownerId: int("owner_id").references(() => users.id),
  isDeleted: boolean("is_deleted").default(false), // Soft delete
  createdAt: timestamp("created_at").defaultNow(),
  path: text("path"), // Materialized path for easier querying
});

export const files = mysqlTable("files", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  folderId: int("folder_id").references(() => folders.id),
  size: int("size").notNull(), // in bytes
  mimeType: varchar("mime_type", { length: 255 }).notNull(),
  path: text("path").notNull(), // Storage path
  createdBy: int("created_by").references(() => users.id),
  isStarred: boolean("is_starred").default(false),
  isDeleted: boolean("is_deleted").default(false), // Soft delete
  deletedAt: timestamp("deleted_at"),
  lastAccessedAt: timestamp("last_accessed_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const auditLogs = mysqlTable("audit_logs", {
  id: serial("id").primaryKey(),
  userId: int("user_id").references(() => users.id),
  action: varchar("action", { length: 50 }).notNull(), // 'upload', 'delete', 'login', etc.
  targetType: varchar("target_type", { length: 50 }).notNull(), // 'file', 'folder', 'user'
  targetId: int("target_id"),
  details: text("details"),
  ipAddress: varchar("ip_address", { length: 45 }),
  userAgent: varchar("user_agent", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow(),
});

export const permissions = mysqlTable("permissions", {
  id: serial("id").primaryKey(),
  fileId: int("file_id").references(() => files.id),
  folderId: int("folder_id").references(() => folders.id),
  userId: int("user_id").notNull().references(() => users.id),
  grantedBy: int("granted_by").notNull().references(() => users.id),
  accessLevel: varchar("access_level", { length: 20 }).notNull().default("view"),
  createdAt: timestamp("created_at").defaultNow(),
});

// === RELATIONS ===

export const usersRelations = relations(users, ({ one, many }) => ({
  files: many(files),
  folders: many(folders),
  auditLogs: many(auditLogs),
  settings: one(userSettings),
  permissionsReceived: many(permissions, { relationName: "permissions_received" }),
  permissionsGranted: many(permissions, { relationName: "permissions_granted" }),
}));

export const userSettingsRelations = relations(userSettings, ({ one }) => ({
  user: one(users, {
    fields: [userSettings.userId],
    references: [users.id],
  }),
}));

export const foldersRelations = relations(folders, ({ one, many }) => ({
  parent: one(folders, {
    fields: [folders.parentId],
    references: [folders.id],
    relationName: "parent_child",
  }),
  children: many(folders, { relationName: "parent_child" }),
  files: many(files),
  owner: one(users, {
    fields: [folders.ownerId],
    references: [users.id],
  }),
  permissions: many(permissions),
}));

export const filesRelations = relations(files, ({ one, many }) => ({
  folder: one(folders, {
    fields: [files.folderId],
    references: [folders.id],
  }),
  creator: one(users, {
    fields: [files.createdBy],
    references: [users.id],
  }),
  permissions: many(permissions),
}));

export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
  user: one(users, {
    fields: [auditLogs.userId],
    references: [users.id],
  }),
}));

export const permissionsRelations = relations(permissions, ({ one }) => ({
  file: one(files, {
    fields: [permissions.fileId],
    references: [files.id],
  }),
  folder: one(folders, {
    fields: [permissions.folderId],
    references: [folders.id],
  }),
  user: one(users, {
    fields: [permissions.userId],
    references: [users.id],
    relationName: "permissions_received",
  }),
  grantedBy: one(users, {
    fields: [permissions.grantedBy],
    references: [users.id],
    relationName: "permissions_granted",
  }),
}));

// === SCHEMAS ===

export const insertUserSchema = createInsertSchema(users).omit({ id: true, createdAt: true });
export const insertFolderSchema = createInsertSchema(folders).omit({ id: true, createdAt: true, path: true });
export const insertFileSchema = createInsertSchema(files).omit({ id: true, createdAt: true });
export const insertAuditLogSchema = createInsertSchema(auditLogs).omit({ id: true, createdAt: true });
export const insertPermissionSchema = createInsertSchema(permissions).omit({ id: true, createdAt: true });

// === TYPES ===

export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;

export type UserSettings = typeof userSettings.$inferSelect;
export const insertUserSettingsSchema = createInsertSchema(userSettings);
export type InsertUserSettings = z.infer<typeof insertUserSettingsSchema>;

export type Folder = typeof folders.$inferSelect;
export type InsertFolder = z.infer<typeof insertFolderSchema>;

export type File = typeof files.$inferSelect;
export type InsertFile = z.infer<typeof insertFileSchema>;

export type AuditLog = typeof auditLogs.$inferSelect;
export type InsertAuditLog = z.infer<typeof insertAuditLogSchema>;

export type Permission = typeof permissions.$inferSelect;
export type InsertPermission = z.infer<typeof insertPermissionSchema>;

// Request Types
export type LoginRequest = { username: string; password: string };
export type CreateFolderRequest = InsertFolder;
export type CreateFileRequest = InsertFile;
export type ShareRequest = {
  targetId: number;
  targetType: 'file' | 'folder';
  userId: number; // Who to share with
  accessLevel: 'view' | 'edit';
};
