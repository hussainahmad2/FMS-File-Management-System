import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, hashPassword } from "./auth";
import { api } from "@shared/routes";
import { z } from "zod";
import { insertUserSchema, insertFolderSchema } from "@shared/schema";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Setup Auth (Session + Passport)
  setupAuth(app);

  // === SEEDING SUPERADMIN ===
  const superAdminUsername = "hussain";
  const existingAdmin = await storage.getUserByUsername(superAdminUsername);
  if (!existingAdmin) {
    console.log("Seeding superadmin user...");
    const hashedPassword = await hashPassword("hussain12");
    await storage.createUser({
      username: superAdminUsername,
      password: hashedPassword,
      role: "superadmin",
      status: "active",
    });
    console.log("Superadmin seeded.");
  }

  // Middleware to check auth
  const requireAuth = (req: any, res: any, next: any) => {
    if (req.isAuthenticated()) return next();
    res.status(401).json({ message: "Unauthorized" });
  };

  const requireAdmin = (req: any, res: any, next: any) => {
    if (req.isAuthenticated() && (req.user.role === 'admin' || req.user.role === 'superadmin')) return next();
    res.status(403).json({ message: "Forbidden" });
  };

  // === USERS ===
  app.get(api.users.list.path, requireAdmin, async (req, res) => {
    const users = await storage.getUsers();
    res.json(users);
  });

  app.post(api.users.create.path, requireAdmin, async (req, res) => {
    try {
      const data = insertUserSchema.parse(req.body);
      // Hash password
      const hashedPassword = await hashPassword(data.password);
      const user = await storage.createUser({ ...data, password: hashedPassword });
      res.status(201).json(user);
    } catch (e) {
      if (e instanceof z.ZodError) {
        res.status(400).json(e.errors);
      } else {
        res.status(500).json({ message: "Server Error" });
      }
    }
  });

  // === FILE SYSTEM ===
  app.get(api.fs.list.path, requireAuth, async (req, res) => {
    const folderIdParam = req.query.folderId as string | undefined;
    let folderId: number | null = null;
    let breadcrumbs: { id: number, name: string }[] = [];

    if (folderIdParam && folderIdParam !== "root") {
      folderId = parseInt(folderIdParam);
      if (isNaN(folderId)) {
        return res.status(400).json({ message: "Invalid folder ID" });
      }
      
      // Build breadcrumbs (simple recursive or iterative approach could be expensive, for MVP just show current)
      // For MVP, let's just fetch the current folder to get its name
      const currentFolder = await storage.getFolder(folderId);
      if (currentFolder) {
         breadcrumbs.push({ id: currentFolder.id, name: currentFolder.name });
         // In a real app we'd traverse up.
      }
    } else {
        breadcrumbs.push({ id: 0, name: "My Files" });
    }

    const folders = await storage.getFolders(folderId);
    const files = await storage.getFiles(folderId);

    // Log view action
    await storage.createAuditLog({
        userId: req.user.id,
        action: "view_folder",
        targetType: "folder",
        targetId: folderId,
        details: `Viewed folder ${folderId ?? "root"}`,
        ipAddress: req.ip
    });

    res.json({ folders, files, breadcrumbs });
  });

  app.post(api.fs.createFolder.path, requireAuth, async (req, res) => {
    try {
      const data = insertFolderSchema.parse(req.body);
      const folder = await storage.createFolder({ ...data, ownerId: req.user.id });
      
      await storage.createAuditLog({
        userId: req.user.id,
        action: "create_folder",
        targetType: "folder",
        targetId: folder.id,
        details: `Created folder ${folder.name}`,
        ipAddress: req.ip
      });

      res.status(201).json(folder);
    } catch (e) {
      res.status(400).json({ message: "Invalid data" });
    }
  });

  // === FILE OPERATIONS - ADDITIONAL ===
  app.get(api.fs.recent.path, requireAuth, async (req, res) => {
    const files = await storage.getRecentFiles();
    await storage.createAuditLog({
      userId: req.user.id,
      action: "view_recent",
      targetType: "folder",
      details: "Viewed recent files",
      ipAddress: req.ip
    });
    res.json(files);
  });

  app.get(api.fs.starred.path, requireAuth, async (req, res) => {
    const files = await storage.getStarredFiles();
    res.json(files);
  });

  app.get(api.fs.trash.path, requireAuth, async (req, res) => {
    const files = await storage.getTrashFiles();
    res.json(files);
  });

  app.patch(api.fs.toggleStar.path, requireAuth, async (req, res) => {
    try {
      const fileId = parseInt(req.params.fileId);
      const file = await storage.toggleStar(fileId);
      if (!file) {
        return res.status(404).json({ message: "File not found" });
      }
      res.json(file);
    } catch (e) {
      res.status(400).json({ message: "Invalid request" });
    }
  });

  app.delete(api.fs.delete.path, requireAuth, async (req, res) => {
    try {
      const fileId = parseInt(req.params.fileId);
      await storage.deleteFile(fileId);
      await storage.createAuditLog({
        userId: req.user.id,
        action: "delete_file",
        targetType: "file",
        targetId: fileId,
        details: `Deleted file ${fileId}`,
        ipAddress: req.ip
      });
      res.sendStatus(204);
    } catch (e) {
      res.status(400).json({ message: "Invalid request" });
    }
  });

  app.get(api.fs.storageUsage.path, requireAuth, async (req, res) => {
    const { used, total } = await storage.calculateStorageUsage();
    res.json({
      used,
      total,
      percentage: Math.round((used / total) * 100)
    });
  });

  // === AUDIT LOGS ===
  app.get(api.audit.list.path, requireAdmin, async (req, res) => {
    const logs = await storage.getAuditLogs();
    res.json(logs);
  });

  return httpServer;
}
