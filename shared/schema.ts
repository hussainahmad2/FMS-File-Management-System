import { pgTable, text, serial, integer, boolean, timestamp, jsonb, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { relations } from "drizzle-orm";

// === TABLE DEFINITIONS ===

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  role: text("role").notNull().default("employee"), // 'superadmin', 'admin', 'staff', 'employee'
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const folders = pgTable("folders", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  parentId: integer("parent_id"), // Can be null for root folders
  ownerId: integer("owner_id").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  path: text("path").notNull().default("/"), // Materialized path for easier querying
});

export const files = pgTable("files", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  folderId: integer("folder_id").references(() => folders.id),
  size: integer("size").notNull(), // in bytes
  mimeType: text("mime_type").notNull(),
  path: text("path").notNull(), // Storage path
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
});

export const auditLogs = pgTable("audit_logs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id),
  action: text("action").notNull(), // 'upload', 'delete', 'login', etc.
  targetType: text("target_type").notNull(), // 'file', 'folder', 'user'
  targetId: integer("target_id"),
  details: text("details"),
  ipAddress: text("ip_address"),
  createdAt: timestamp("created_at").defaultNow(),
});

// === RELATIONS ===

export const usersRelations = relations(users, ({ many }) => ({
  files: many(files),
  folders: many(folders),
  auditLogs: many(auditLogs),
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
}));

export const filesRelations = relations(files, ({ one }) => ({
  folder: one(folders, {
    fields: [files.folderId],
    references: [folders.id],
  }),
  creator: one(users, {
    fields: [files.createdBy],
    references: [users.id],
  }),
}));

export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
  user: one(users, {
    fields: [auditLogs.userId],
    references: [users.id],
  }),
}));

// === SCHEMAS ===

export const insertUserSchema = createInsertSchema(users).omit({ id: true, createdAt: true });
export const insertFolderSchema = createInsertSchema(folders).omit({ id: true, createdAt: true, path: true });
export const insertFileSchema = createInsertSchema(files).omit({ id: true, createdAt: true });
export const insertAuditLogSchema = createInsertSchema(auditLogs).omit({ id: true, createdAt: true });

// === TYPES ===

export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;

export type Folder = typeof folders.$inferSelect;
export type InsertFolder = z.infer<typeof insertFolderSchema>;

export type File = typeof files.$inferSelect;
export type InsertFile = z.infer<typeof insertFileSchema>;

export type AuditLog = typeof auditLogs.$inferSelect;
export type InsertAuditLog = z.infer<typeof insertAuditLogSchema>;

// Request Types
export type LoginRequest = { username: string; password: string };
export type CreateFolderRequest = InsertFolder;
export type CreateFileRequest = InsertFile;
