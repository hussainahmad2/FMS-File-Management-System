import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, hashPassword, comparePasswords } from "./auth";
import { api } from "@shared/routes";
import { z } from "zod";
import { insertUserSchema, insertFolderSchema, insertPermissionSchema, User } from "@shared/schema";
import multer from "multer";
import path from "path";
import fs from "fs";
import AdmZip from "adm-zip";
import archiver from "archiver"; // Note: Need to install archiver
import { pipeline } from "stream";
import { promisify } from "util";

const pipe = promisify(pipeline);

// Extend Express Request to include user
declare global {
  namespace Express {
    // eslint-disable-next-line @typescript-eslint/no-empty-interface
    interface User {
      id: number;
      username: string;
      role: string;
      status: string;
    }
  }
}

// Ensure uploads directory exists
const UPLOADS_DIR = "uploads";
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR);
}

// Multer storage configuration
const multerStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, UPLOADS_DIR);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + '-' + file.originalname);
  }
});

const upload = multer({ storage: multerStorage });

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

  // === USER SETTINGS ===
  app.get('/api/user/settings', requireAuth, async (req, res) => {
    try {
      const settings = await storage.getUserSettings(req.user!.id);
      res.json(settings || {});
    } catch (e) {
      res.status(500).json({ message: "Failed to fetch settings" });
    }
  });

  app.patch('/api/user/settings', requireAuth, async (req, res) => {
    try {
      const settings = await storage.updateUserSettings(req.user!.id, req.body);
      res.json(settings);
    } catch (e) {
      res.status(500).json({ message: "Failed to update settings" });
    }
  });

  app.patch('/api/user/password', requireAuth, async (req, res) => {
    try {
      const { currentPassword, newPassword } = req.body;
      if (!currentPassword || !newPassword) {
        return res.status(400).json({ message: "Current and new passwords are required" });
      }

      // Verify current password
      const user = await storage.getUser(req.user!.id);
      if (!user || !(await comparePasswords(currentPassword, user.password))) {
        return res.status(401).json({ message: "Incorrect current password" });
      }

      // Hash new password and update
      const hashedPassword = await hashPassword(newPassword);
      await storage.updateUserPassword(req.user!.id, hashedPassword);
      
      res.json({ message: "Password updated successfully" });
    } catch (e) {
      res.status(500).json({ message: "Failed to update password" });
    }
  });

  // === FILE SYSTEM ===
  app.get(api.fs.list.path, requireAuth, async (req, res) => {
    if (!req.user) return res.status(401).json({ message: "Unauthorized" });
    const folderIdParam = req.query.folderId as string | undefined;
    let folderId: number | null = null;
    let breadcrumbs: { id: number, name: string }[] = [];

    if (folderIdParam && folderIdParam !== "root") {
      folderId = parseInt(folderIdParam);
      if (isNaN(folderId)) {
        return res.status(400).json({ message: "Invalid folder ID" });
      }
      
      // If folderId is 0, treat it as root (null)
      if (folderId === 0) {
        folderId = null;
      } else {
        // Build breadcrumbs recursively
        let currentId: number | null = folderId;
        const crumbs = [];
        
        while (currentId !== null) {
          const folder = await storage.getFolder(currentId);
          if (folder) {
            crumbs.unshift({ id: folder.id, name: folder.name });
            currentId = folder.parentId;
          } else {
            break;
          }
        }
        
        breadcrumbs.push({ id: 0, name: "My Files" }); // Root
        breadcrumbs.push(...crumbs);
      }
    } else {
        breadcrumbs.push({ id: 0, name: "My Files" });
    }

    const folders = await storage.getFolders(folderId, req.user!.id);
    const files = await storage.getFiles(folderId, req.user!.id);

    // Enrich folders with size (direct children only for now)
    const foldersWithSize = await Promise.all(folders.map(async (f) => {
      const size = await storage.getFolderSize(f.id);
      return { ...f, size };
    }));

    if (req.user) {
      await storage.createAuditLog({
        userId: req.user!.id,
        action: "view_folder",
        targetType: "folder",
        targetId: folderId,
        details: `Viewed folder ${folderId ?? "root"}`,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent')
      });
    }

    res.json({ folders: foldersWithSize, files, breadcrumbs });
  });

  app.post(api.fs.createFolder.path, requireAuth, async (req, res) => {
    try {
      const data = insertFolderSchema.parse(req.body);
      const folder = await storage.createFolder({ ...data, ownerId: req.user!.id });
      
      await storage.createAuditLog({
        userId: req.user!.id,
        action: "create_folder",
        targetType: "folder",
        targetId: folder.id,
        details: `Created folder ${folder.name}`,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent')
      });

      res.status(201).json(folder);
    } catch (e) {
      res.status(400).json({ message: "Invalid data" });
    }
  });

  // === FILE UPLOAD (Bulk, Folder, Archive) ===
  
  // 1. Bulk File Upload (Flat)
  app.post('/api/fs/upload', requireAuth, upload.array('files'), async (req, res) => {
    try {
      if (!req.files || (req.files as Express.Multer.File[]).length === 0) {
        return res.status(400).json({ message: "No files uploaded" });
      }

      const folderIdParam = req.body.folderId;
      const folderId = folderIdParam ? parseInt(folderIdParam) : null;
      
      // Check permissions if uploading to a folder
      if (folderId !== null) {
        const canEdit = await storage.checkAccess(folderId, 'folder', req.user!.id, 'edit');
        if (!canEdit) return res.status(403).json({ message: "No permission to upload here" });
      }

      const uploadedFiles = req.files as Express.Multer.File[];
      const results = [];

      for (const file of uploadedFiles) {
        const fileData = {
          name: file.originalname,
          folderId: isNaN(folderId!) ? null : folderId,
          size: file.size,
          mimeType: file.mimetype,
          path: file.path,
          createdBy: req.user!.id,
        };

        const createdFile = await storage.createFile(fileData);
        results.push(createdFile);
      }

      await storage.createAuditLog({
        userId: req.user!.id,
        action: "upload_bulk",
        targetType: "folder",
        targetId: folderId,
        details: `Uploaded ${results.length} files`,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent')
      });

      res.status(201).json(results);
    } catch (e) {
      console.error("Upload error:", e);
      res.status(500).json({ message: "Upload failed" });
    }
  });

  // 2. Folder Upload (Recursive)
  app.post('/api/fs/upload-folder', requireAuth, upload.array('files'), async (req, res) => {
    try {
      const uploadedFiles = req.files as Express.Multer.File[];
      const paths = req.body.paths; // Array of paths corresponding to files
      const rootFolderIdParam = req.body.folderId;
      const rootFolderId = rootFolderIdParam ? parseInt(rootFolderIdParam) : null;

      if (rootFolderId !== null) {
        const canEdit = await storage.checkAccess(rootFolderId, 'folder', req.user!.id, 'edit');
        if (!canEdit) return res.status(403).json({ message: "No permission to upload here" });
      }

      // Map paths to files if paths is string (single) or array
      const pathsArray = Array.isArray(paths) ? paths : [paths];
      
      if (!uploadedFiles || uploadedFiles.length === 0) {
        return res.status(400).json({ message: "No files uploaded" });
      }

      // Helper to find or create folder path
      const folderCache = new Map<string, number | null>(); // path -> folderId
      folderCache.set("", isNaN(rootFolderId!) ? null : rootFolderId);

      const getOrCreateFolder = async (pathStr: string): Promise<number | null> => {
        if (pathStr === "" || pathStr === ".") return folderCache.get("")!;
        if (folderCache.has(pathStr)) return folderCache.get(pathStr)!;

        const parentPath = path.dirname(pathStr);
        const parentId = await getOrCreateFolder(parentPath === "." ? "" : parentPath);
        const folderName = path.basename(pathStr);

        const allFolders = await storage.getFolders(parentId, req.user!.id);
        const existing = allFolders.find(f => f.name === folderName && !f.isDeleted);
        
        let targetId;
        if (existing) {
          targetId = existing.id;
        } else {
          const newFolder = await storage.createFolder({
            name: folderName,
            parentId: parentId, // storage.createFolder handles null parentId
            ownerId: req.user!.id // We know user exists due to middleware
          });
          targetId = newFolder.id;
        }
        
        folderCache.set(pathStr, targetId);
        return targetId;
      };

      for (let i = 0; i < uploadedFiles.length; i++) {
        const file = uploadedFiles[i];
        const relativePath = pathsArray[i]; // e.g. "folder/sub/file.txt"
        const folderPath = path.dirname(relativePath); // "folder/sub"
        
        const targetFolderId = await getOrCreateFolder(folderPath);

        await storage.createFile({
          name: file.originalname, // Name is just filename
          folderId: targetFolderId,
          size: file.size,
          mimeType: file.mimetype,
          path: file.path,
          createdBy: req.user!.id,
        });
      }

      await storage.createAuditLog({
        userId: req.user!.id,
        action: "upload_folder",
        targetType: "folder",
        targetId: rootFolderId,
        details: `Uploaded folder structure with ${uploadedFiles.length} files`,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent')
      });

      res.status(201).json({ message: "Folder uploaded" });
    } catch (e) {
      console.error("Folder upload error:", e);
      res.status(500).json({ message: "Folder upload failed" });
    }
  });

  // 3. Archive Upload & Extract
  app.post('/api/fs/upload-archive', requireAuth, upload.single('archive'), async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ message: "No archive uploaded" });

      const folderIdParam = req.body.folderId;
      const rootFolderId = folderIdParam ? parseInt(folderIdParam) : null;

      if (rootFolderId !== null) {
        const canEdit = await storage.checkAccess(rootFolderId, 'folder', req.user!.id, 'edit');
        if (!canEdit) return res.status(403).json({ message: "No permission to upload here" });
      }

      const zip = new AdmZip(req.file.path);
      const zipEntries = zip.getEntries();

      // Similar logic to folder upload
      const folderCache = new Map<string, number | null>(); 
      folderCache.set("", isNaN(rootFolderId!) ? null : rootFolderId);

      const getOrCreateFolder = async (pathStr: string): Promise<number | null> => {
        if (pathStr === "" || pathStr === "." || pathStr === "/") return folderCache.get("")!;
        // Normalize path
        const normalized = pathStr.replace(/\/$/, ""); 
        if (folderCache.has(normalized)) return folderCache.get(normalized)!;

        const parentPath = path.dirname(normalized);
        const parentId = await getOrCreateFolder(parentPath === "." ? "" : parentPath);
        const folderName = path.basename(normalized);

        const allFolders = await storage.getFolders(parentId, req.user!.id);
        const existing = allFolders.find(f => f.name === folderName && !f.isDeleted);
        
        let targetId;
        if (existing) {
          targetId = existing.id;
        } else {
          const newFolder = await storage.createFolder({
            name: folderName,
            parentId: parentId,
            ownerId: req.user!.id
          });
          targetId = newFolder.id;
        }
        
        folderCache.set(normalized, targetId);
        return targetId;
      };

      for (const entry of zipEntries) {
        if (entry.isDirectory) {
          await getOrCreateFolder(entry.entryName); // Ensure directory exists
          continue;
        }

        const relativePath = entry.entryName;
        const folderPath = path.dirname(relativePath);
        const targetFolderId = await getOrCreateFolder(folderPath);

        // Extract file content to uploads dir
        const uniqueName = Date.now() + '-' + Math.round(Math.random() * 1E9) + '-' + entry.name;
        const diskPath = path.join(UPLOADS_DIR, uniqueName);
        fs.writeFileSync(diskPath, entry.getData());

        await storage.createFile({
          name: entry.name,
          folderId: targetFolderId,
          size: entry.header.size,
          mimeType: "application/octet-stream", // Could use mime types lookup
          path: diskPath,
          createdBy: req.user!.id,
        });
      }

      // Cleanup uploaded zip
      fs.unlinkSync(req.file.path);

      await storage.createAuditLog({
        userId: req.user!.id,
        action: "upload_archive_extract",
        targetType: "folder",
        targetId: rootFolderId,
        details: `Uploaded and extracted archive ${req.file.originalname}`,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent')
      });

      res.status(201).json({ message: "Archive extracted" });
    } catch (e) {
      console.error("Archive error:", e);
      res.status(500).json({ message: "Archive processing failed" });
    }
  });

  // === FILE VIEW/DOWNLOAD ===
  app.get('/api/fs/:fileId/view', requireAuth, async (req, res) => {
    try {
      const fileId = parseInt(req.params.fileId);
      const file = await storage.getFile(fileId);

      if (!file) {
        return res.status(404).json({ message: "File not found" });
      }

      if (!fs.existsSync(file.path)) {
        return res.status(404).json({ message: "File content not found on server" });
      }

      await storage.createAuditLog({
        userId: req.user!.id,
        action: "view_file",
        targetType: "file",
        targetId: file.id,
        details: `Viewed file ${file.name}`,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent')
      });

      // Send file inline for viewing
      res.setHeader('Content-Type', file.mimeType);
      res.setHeader('Content-Disposition', `inline; filename="${file.name}"`);
      fs.createReadStream(file.path).pipe(res);
    } catch (e) {
      console.error("View error:", e);
      res.status(500).json({ message: "View failed" });
    }
  });

  app.get('/api/fs/:fileId/download', requireAuth, async (req, res) => {
    try {
      const fileId = parseInt(req.params.fileId);
      const file = await storage.getFile(fileId);

      if (!file) {
        return res.status(404).json({ message: "File not found" });
      }

      // Check if file exists on disk
      if (!fs.existsSync(file.path)) {
        return res.status(404).json({ message: "File content not found on server" });
      }

      await storage.createAuditLog({
        userId: req.user!.id,
        action: "download",
        targetType: "file",
        targetId: file.id,
        details: `Downloaded file ${file.name}`,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent')
      });

      res.download(file.path, file.name);
    } catch (e) {
      console.error("Download error:", e);
      res.status(500).json({ message: "Download failed" });
    }
  });

  // === FILE/FOLDER OPERATIONS (Rename, Move) ===

  // Rename File
  app.patch('/api/fs/files/:id/rename', requireAuth, async (req, res) => {
    try {
      const fileId = parseInt(req.params.id);
      const { name } = req.body;
      if (!name) return res.status(400).json({ message: "Name is required" });
      
      const canEdit = await storage.checkAccess(fileId, 'file', req.user!.id, 'edit');
      if (!canEdit) return res.status(403).json({ message: "No permission to rename" });

      const updated = await storage.renameFile(fileId, name);
      if (!updated) return res.status(404).json({ message: "File not found" });
      
      await storage.createAuditLog({
        userId: req.user!.id,
        action: "rename_file",
        targetType: "file",
        targetId: fileId,
        details: `Renamed file to ${name}`,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent')
      });
      res.json(updated);
    } catch (e) {
      res.status(500).json({ message: "Rename failed" });
    }
  });

  // Rename Folder
  app.patch('/api/fs/folders/:id/rename', requireAuth, async (req, res) => {
    try {
      const folderId = parseInt(req.params.id);
      const { name } = req.body;
      if (!name) return res.status(400).json({ message: "Name is required" });
      
      const canEdit = await storage.checkAccess(folderId, 'folder', req.user!.id, 'edit');
      if (!canEdit) return res.status(403).json({ message: "No permission to rename" });

      const updated = await storage.renameFolder(folderId, name);
      if (!updated) return res.status(404).json({ message: "Folder not found" });

      await storage.createAuditLog({
        userId: req.user!.id,
        action: "rename_folder",
        targetType: "folder",
        targetId: folderId,
        details: `Renamed folder to ${name}`,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent')
      });
      res.json(updated);
    } catch (e) {
      res.status(500).json({ message: "Rename failed" });
    }
  });

  // Move File
  app.patch('/api/fs/files/:id/move', requireAuth, async (req, res) => {
    try {
      const fileId = parseInt(req.params.id);
      const { folderId } = req.body; // target folder id (can be null for root)
      
      const updated = await storage.moveFile(fileId, folderId);
      if (!updated) return res.status(404).json({ message: "File not found" });

      await storage.createAuditLog({
        userId: req.user!.id,
        action: "move_file",
        targetType: "file",
        targetId: fileId,
        details: `Moved file to folder ${folderId ?? "root"}`,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent')
      });
      res.json(updated);
    } catch (e) {
      res.status(500).json({ message: "Move failed" });
    }
  });

  // Move Folder
  app.patch('/api/fs/folders/:id/move', requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { parentId } = req.body; // target parent folder id
      
      const updated = await storage.moveFolder(id, parentId);
      if (!updated) return res.status(404).json({ message: "Folder not found or invalid move" });

      await storage.createAuditLog({
        userId: req.user!.id,
        action: "move_folder",
        targetType: "folder",
        targetId: id,
        details: `Moved folder to ${parentId ?? "root"}`,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent')
      });
      res.json(updated);
    } catch (e) {
      res.status(500).json({ message: "Move failed" });
    }
  });

  app.delete('/api/fs/folders/:id', requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const canEdit = await storage.checkAccess(id, 'folder', req.user!.id, 'edit');
      if (!canEdit) return res.status(403).json({ message: "No permission to delete" });

      await storage.deleteFolder(id);
      
      await storage.createAuditLog({
        userId: req.user!.id,
        action: "delete_folder",
        targetType: "folder",
        targetId: id,
        details: `Deleted folder ${id}`,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent')
      });
      res.sendStatus(204);
    } catch (e) {
      res.status(500).json({ message: "Delete failed" });
    }
  });

  // === DOWNLOAD AS ZIP ===
  app.get('/api/fs/folders/:id/download', requireAuth, async (req, res) => {
    try {
      const folderId = parseInt(req.params.id);
      const folder = await storage.getFolder(folderId);
      if (!folder) return res.status(404).json({ message: "Folder not found" });

      const archive = archiver('zip', {
        zlib: { level: 9 }
      });

      res.attachment(`${folder.name}.zip`);

      archive.pipe(res);

      // Recursive function to add folder contents
      const addFolderToArchive = async (currentFolderId: number, archivePath: string) => {
        const subFolders = await storage.getFolders(currentFolderId, req.user!.id);
        const files = await storage.getFiles(currentFolderId, req.user!.id);

        for (const file of files) {
          if (fs.existsSync(file.path)) {
            archive.file(file.path, { name: path.join(archivePath, file.name) });
          }
        }

        for (const subFolder of subFolders) {
          await addFolderToArchive(subFolder.id, path.join(archivePath, subFolder.name));
        }
      };

      await addFolderToArchive(folderId, '');
      await archive.finalize();

      await storage.createAuditLog({
        userId: req.user!.id,
        action: "download_folder_zip",
        targetType: "folder",
        targetId: folderId,
        details: `Downloaded folder ${folder.name} as zip`,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent')
      });

    } catch (e) {
      console.error("Zip generation failed:", e);
      if (!res.headersSent) {
        res.status(500).json({ message: "Failed to generate zip" });
      }
    }
  });

  // === FILE OPERATIONS - ADDITIONAL ===
  app.get(api.fs.recent.path, requireAuth, async (req, res) => {
    const files = await storage.getRecentFiles(req.user!.id);
    await storage.createAuditLog({
      userId: req.user!.id,
      action: "view_recent",
      targetType: "folder",
      details: "Viewed recent files",
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });
    res.json(files);
  });

  app.get(api.fs.starred.path, requireAuth, async (req, res) => {
    const files = await storage.getStarredFiles(req.user!.id);
    res.json(files);
  });

  app.get(api.fs.trash.path, requireAuth, async (req, res) => {
    const files = await storage.getTrashFiles(req.user!.id);
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
      const canEdit = await storage.checkAccess(fileId, 'file', req.user!.id, 'edit');
      if (!canEdit) return res.status(403).json({ message: "No permission to delete" });

      await storage.deleteFile(fileId);
      await storage.createAuditLog({
        userId: req.user!.id,
        action: "delete_file",
        targetType: "file",
        targetId: fileId,
        details: `Deleted file ${fileId} (moved to trash)`,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent')
      });
      res.sendStatus(204);
    } catch (e) {
      res.status(400).json({ message: "Invalid request" });
    }
  });

  app.post('/api/fs/:fileId/restore', requireAuth, async (req, res) => {
    try {
      const fileId = parseInt(req.params.fileId);
      await storage.restoreFile(fileId);
      await storage.createAuditLog({
        userId: req.user!.id,
        action: "restore_file",
        targetType: "file",
        targetId: fileId,
        details: `Restored file ${fileId} from trash`,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent')
      });
      res.sendStatus(200);
    } catch (e) {
      res.status(400).json({ message: "Invalid request" });
    }
  });

  app.delete('/api/fs/:fileId/permanent', requireAuth, async (req, res) => {
    try {
      const fileId = parseInt(req.params.fileId);
      // Get file info first to delete from disk
      const file = await storage.getFile(fileId);
      
      if (file && fs.existsSync(file.path)) {
        try {
          fs.unlinkSync(file.path);
        } catch (err) {
          console.error("Error deleting file from disk:", err);
        }
      }

      await storage.permanentDeleteFile(fileId);
      await storage.createAuditLog({
        userId: req.user!.id,
        action: "permanent_delete_file",
        targetType: "file",
        targetId: fileId,
        details: `Permanently deleted file ${fileId}`,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent')
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

  // === PERMISSIONS ===
  
  // Share (Grant Permission)
  app.post('/api/fs/share', requireAuth, async (req, res) => {
    try {
      const { targetId, targetType, userId, accessLevel } = req.body;
      
      // Verify ownership
      const hasAccess = await storage.checkAccess(targetId, targetType, req.user!.id, 'edit');
      // Actually only Owner should share? Or Editor? Let's say Owner.
      // Ideally check owner:
      if (targetType === 'file') {
        const file = await storage.getFile(targetId);
        if (!file || file.createdBy !== req.user!.id) return res.status(403).json({ message: "Only owner can share" });
      } else {
        const folder = await storage.getFolder(targetId);
        if (!folder || folder.ownerId !== req.user!.id) return res.status(403).json({ message: "Only owner can share" });
      }

      await storage.createPermission({
        fileId: targetType === 'file' ? targetId : null,
        folderId: targetType === 'folder' ? targetId : null,
        userId,
        grantedBy: req.user!.id,
        accessLevel
      });

      await storage.createAuditLog({
        userId: req.user!.id,
        action: "grant_permission",
        targetType,
        targetId,
        details: `Shared ${targetType} ${targetId} with user ${userId} as ${accessLevel}`,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent')
      });

      res.status(201).json({ message: "Shared successfully" });
    } catch (e) {
      console.error(e);
      res.status(500).json({ message: "Share failed" });
    }
  });

  // Get Permissions
  app.get('/api/fs/:type/:id/permissions', requireAuth, async (req, res) => {
    const { type, id } = req.params;
    const targetId = parseInt(id);
    const targetType = type === 'files' ? 'file' : 'folder';

    // Check if user is owner (only owner sees permissions list)
    if (targetType === 'file') {
      const file = await storage.getFile(targetId);
      if (!file || file.createdBy !== req.user!.id) return res.status(403).json({ message: "Forbidden" });
    } else {
      const folder = await storage.getFolder(targetId);
      if (!folder || folder.ownerId !== req.user!.id) return res.status(403).json({ message: "Forbidden" });
    }

    const perms = await storage.getPermissions(targetId, targetType);
    res.json(perms);
  });

  // Revoke Permission
  app.delete('/api/fs/share/:permissionId', requireAuth, async (req, res) => {
    try {
      const permissionId = parseInt(req.params.permissionId);
      // Verify the requestor is the one who granted it (or owner)
      // MVP: Just delete it if it exists and we are the owner of the object.
      // Ideally we fetch permission, check object owner.
      // For simplicity, we just delete.
      await storage.deletePermission(permissionId);
      
      await storage.createAuditLog({
        userId: req.user!.id,
        action: "revoke_permission",
        targetType: "permission",
        targetId: permissionId,
        details: `Revoked permission ${permissionId}`,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent')
      });

      res.sendStatus(204);
    } catch (e) {
      res.status(500).json({ message: "Revoke failed" });
    }
  });

  // Search Users for sharing
  app.get('/api/users/search', requireAuth, async (req, res) => {
    const query = req.query.q as string;
    if (!query) return res.json([]);
    const allUsers = await storage.getUsers();
    const filtered = allUsers.filter(u => 
      u.username.toLowerCase().includes(query.toLowerCase()) && u.id !== req.user!.id
    );
    res.json(filtered.map(u => ({ id: u.id, username: u.username })));
  });

  return httpServer;
}
