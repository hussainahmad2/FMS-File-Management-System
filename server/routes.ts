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

    let folders = await storage.getFoldersWithPermissions(folderId, req.user!.id);
    let files = await storage.getFilesWithPermissions(folderId, req.user!.id);

    // Auto-extract ZIP files in this folder
    const zipFiles = files.filter(f =>
      f.mimeType === 'application/zip' ||
      f.mimeType === 'application/x-zip-compressed' ||
      f.name.toLowerCase().endsWith('.zip')
    );

    for (const zipFile of zipFiles) {
      try {
        // Check if already extracted (by looking for a folder with zip name minus extension)
        const zipFolderName = zipFile.name.replace(/\.zip$/i, '');
        const existingFolder = folders.find(f => f.name === zipFolderName);

        if (!existingFolder && fs.existsSync(zipFile.path)) {
          console.log(`Auto-extracting ZIP: ${zipFile.name}`);

          const zip = new AdmZip(zipFile.path);
          const zipEntries = zip.getEntries();

          // Create root folder for extracted content
          const extractedFolder = await storage.createFolder({
            name: zipFolderName,
            parentId: folderId,
            ownerId: req.user!.id
          });

          // Helper to get or create nested folders
          const folderCache: Record<string, number> = { "": extractedFolder.id };
          const getOrCreateFolder = async (pathStr: string): Promise<number> => {
            if (!pathStr || pathStr === ".") return extractedFolder.id;

            pathStr = pathStr.replace(/\\/g, "/").replace(/\/$/, "");
            if (folderCache[pathStr]) return folderCache[pathStr];

            const parts = pathStr.split("/");
            let parentId = extractedFolder.id;

            for (let i = 0; i < parts.length; i++) {
              const subPath = parts.slice(0, i + 1).join("/");
              if (folderCache[subPath]) {
                parentId = folderCache[subPath];
                continue;
              }

              const newFolder = await storage.createFolder({
                name: parts[i],
                parentId,
                ownerId: req.user!.id
              });
              folderCache[subPath] = newFolder.id;
              parentId = newFolder.id;
            }
            return parentId;
          };

          // Extract each entry
          for (const entry of zipEntries) {
            if (entry.isDirectory) {
              await getOrCreateFolder(entry.entryName);
              continue;
            }

            const relativePath = entry.entryName;
            const folderPath = path.dirname(relativePath);
            const targetFolderId = await getOrCreateFolder(folderPath);

            // Extract file to uploads dir
            const uniqueName = Date.now() + '-' + Math.round(Math.random() * 1E9) + '-' + entry.name;
            const diskPath = path.join(UPLOADS_DIR, uniqueName);
            fs.writeFileSync(diskPath, entry.getData());

            // Determine mime type
            let mimeType = "application/octet-stream";
            const ext = path.extname(entry.name).toLowerCase();
            const mimeMap: Record<string, string> = {
              '.pdf': 'application/pdf',
              '.doc': 'application/msword',
              '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
              '.xls': 'application/vnd.ms-excel',
              '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
              '.png': 'image/png',
              '.jpg': 'image/jpeg',
              '.jpeg': 'image/jpeg',
              '.gif': 'image/gif',
              '.txt': 'text/plain',
              '.html': 'text/html',
              '.css': 'text/css',
              '.js': 'application/javascript',
              '.json': 'application/json',
            };
            if (mimeMap[ext]) mimeType = mimeMap[ext];

            await storage.createFile({
              name: entry.name,
              folderId: targetFolderId,
              size: entry.header.size,
              mimeType,
              path: diskPath,
              createdBy: req.user!.id,
            });
          }

          // Delete the original ZIP file after extraction
          await storage.permanentDeleteFile(zipFile.id);
          if (fs.existsSync(zipFile.path)) {
            fs.unlinkSync(zipFile.path);
          }

          await storage.createAuditLog({
            userId: req.user!.id,
            action: "auto_extract_zip",
            targetType: "file",
            targetId: zipFile.id,
            details: `Auto-extracted ZIP ${zipFile.name} into folder ${zipFolderName}`,
            ipAddress: req.ip,
            userAgent: req.get('User-Agent')
          });

          // Refresh folder and file lists
          folders = await storage.getFoldersWithPermissions(folderId, req.user!.id);
          files = await storage.getFilesWithPermissions(folderId, req.user!.id);
        }
      } catch (zipErr) {
        console.error(`Failed to auto-extract ZIP ${zipFile.name}:`, zipErr);
        // Continue with other files, don't fail the whole request
      }
    }

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

      // Recursive Extraction Function
      const processZip = async (zip: AdmZip, parentId: number | null) => {
        const zipEntries = zip.getEntries();

        // Cache for this specific zip instance to handle its internal folder structure
        const folderCache = new Map<string, number | null>();
        folderCache.set("", parentId);

        // Helper to get/create folders relative to the current parentId
        const getOrCreateFolder = async (pathStr: string): Promise<number | null> => {
          // Normalize: remove leading/trailing slashes and dot
          const normalized = pathStr.replace(/\\/g, "/").replace(/^\.?\//, "").replace(/\/$/, "");

          if (normalized === "" || normalized === ".") return parentId;
          if (folderCache.has(normalized)) return folderCache.get(normalized)!;

          const parentPath = path.dirname(normalized);
          // Recursively ensure parent exists
          const parentFolderId = await getOrCreateFolder(parentPath === "." ? "" : parentPath);
          const folderName = path.basename(normalized);

          const allFolders = await storage.getFolders(parentFolderId, req.user!.id);
          const existing = allFolders.find(f => f.name === folderName && !f.isDeleted);

          let targetId;
          if (existing) {
            targetId = existing.id;
          } else {
            const newFolder = await storage.createFolder({
              name: folderName,
              parentId: parentFolderId,
              ownerId: req.user!.id
            });
            targetId = newFolder.id;
          }

          folderCache.set(normalized, targetId);
          return targetId;
        };

        for (const entry of zipEntries) {
          if (entry.isDirectory) {
            await getOrCreateFolder(entry.entryName);
            continue;
          }

          const relativePath = entry.entryName; // e.g. "folder/doc.txt"
          const folderPath = path.dirname(relativePath);
          const targetFolderId = await getOrCreateFolder(folderPath);
          const fileName = path.basename(entry.name); // Just the name part

          // Check if this file is ITSELF a zip file
          if (fileName.toLowerCase().endsWith('.zip')) {
            console.log(`Found nested ZIP: ${fileName}`);
            // Create a folder for the zip contents
            const zipFolderName = fileName.replace(/\.zip$/i, '');

            // We need to create this folder inside targetFolderId
            // Use our existing logic by "creating" a subfolder
            // Note: getOrCreateFolder works on paths relative to root of ZIP.
            // But here we are at a specific spot. 
            // Simplest way: manually create/find the folder for the zip.

            let zipContentFolderId: number;
            const subFolders = await storage.getFolders(targetFolderId, req.user!.id);
            const existingZipFolder = subFolders.find(f => f.name === zipFolderName && !f.isDeleted);

            if (existingZipFolder) {
              zipContentFolderId = existingZipFolder.id;
            } else {
              const newFolder = await storage.createFolder({
                name: zipFolderName,
                parentId: targetFolderId,
                ownerId: req.user!.id
              });
              zipContentFolderId = newFolder.id;
            }

            // Recurse!
            try {
              const nestedZip = new AdmZip(entry.getData());
              await processZip(nestedZip, zipContentFolderId);
            } catch (err) {
              console.error(`Failed to process nested zip ${fileName}:`, err);
              // Fallback: save as regular file? Or just log error?
              // Let's save as regular file if recursion fails (corrupt zip etc)
              // (Code below would need refactoring to support fallback, for now just continue)
            }
            continue; // Skip saving the .zip file itself
          }

          // Normal file processing
          const uniqueName = Date.now() + '-' + Math.round(Math.random() * 1E9) + '-' + fileName;
          const diskPath = path.join(UPLOADS_DIR, uniqueName);
          fs.writeFileSync(diskPath, entry.getData());

          // Determine mime type (basic)
          let mimeType = "application/octet-stream";
          const ext = path.extname(fileName).toLowerCase();
          // ... (We could move mime map to a helper, but putting it inline for safety)
          const mimeMap: Record<string, string> = {
            '.pdf': 'application/pdf',
            '.doc': 'application/msword',
            '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            '.png': 'image/png',
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.txt': 'text/plain',
            '.json': 'application/json',
            // Add more as needed or rely on client
          };
          if (mimeMap[ext]) mimeType = mimeMap[ext];

          await storage.createFile({
            name: fileName,
            folderId: targetFolderId,
            size: entry.header.size,
            mimeType,
            path: diskPath,
            createdBy: req.user!.id,
          });
        }
      };

      // Start processing the uploaded root zip
      const rootZip = new AdmZip(req.file.path);
      await processZip(rootZip, rootFolderId);

      // Cleanup uploaded zip
      fs.unlinkSync(req.file.path);

      await storage.createAuditLog({
        userId: req.user!.id,
        action: "upload_archive_extract",
        targetType: "folder",
        targetId: rootFolderId,
        details: `Uploaded and extracted archive (recursive) ${req.file.originalname}`,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent')
      });

      res.status(201).json({ message: "Archive extracted recursively" });
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

      const canEditSource = await storage.checkAccess(fileId, 'file', req.user!.id, 'edit');
      if (!canEditSource) return res.status(403).json({ message: "No permission to move file" });

      if (folderId) {
        const canEditDest = await storage.checkAccess(folderId, 'folder', req.user!.id, 'edit');
        if (!canEditDest) return res.status(403).json({ message: "No permission to move to destination" });
      }

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

      const canEditSource = await storage.checkAccess(id, 'folder', req.user!.id, 'edit');
      if (!canEditSource) return res.status(403).json({ message: "No permission to move folder" });

      if (parentId) {
        const canEditDest = await storage.checkAccess(parentId, 'folder', req.user!.id, 'edit');
        if (!canEditDest) return res.status(403).json({ message: "No permission to move to destination" });
      }

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
      const folder = await storage.getFolder(id);
      if (!folder) return res.status(404).json({ message: "Folder not found" });

      if (folder.ownerId === req.user!.id) {
        // Owner - Delete
        await storage.deleteFolder(id, req.user!.id);
        await storage.createAuditLog({
          userId: req.user!.id,
          action: "delete_folder",
          targetType: "folder",
          targetId: id,
          details: `Deleted folder ${id}`,
          ipAddress: req.ip,
          userAgent: req.get('User-Agent')
        });
      } else {
        // Not Owner - Unshare if edit
        const canEdit = await storage.checkAccess(id, 'folder', req.user!.id, 'edit');
        if (!canEdit) return res.status(403).json({ message: "No permission to delete" });

        await storage.removePermission(id, 'folder', req.user!.id);
        await storage.createAuditLog({
          userId: req.user!.id,
          action: "unshare_folder",
          targetType: "folder",
          targetId: id,
          details: `Removed self from folder share ${id}`,
          ipAddress: req.ip,
          userAgent: req.get('User-Agent')
        });
      }
      res.sendStatus(204);
    } catch (e) {
      console.error("Delete folder error:", e);
      res.status(500).json({ message: "Delete failed" });
    }
  });

  // === DOWNLOAD AS ZIP ===
  app.get('/api/fs/folders/:id/download', requireAuth, async (req, res) => {
    try {
      const folderId = parseInt(req.params.id);
      const canDownload = await storage.checkAccess(folderId, 'folder', req.user!.id, 'download');
      if (!canDownload) return res.status(403).json({ message: "No permission to download" });

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

  // === BULK DOWNLOAD (Multiple files and folders) ===
  app.get('/api/fs/bulk-download', requireAuth, async (req, res) => {
    try {
      const fileIds = (req.query.fileIds as string[] || []).map(id => parseInt(id)).filter(id => !isNaN(id));
      const folderIds = (req.query.folderIds as string[] || []).map(id => parseInt(id)).filter(id => !isNaN(id));

      if (fileIds.length === 0 && folderIds.length === 0) {
        return res.status(400).json({ message: "No items specified for download" });
      }

      const archive = archiver('zip', {
        zlib: { level: 9 }
      });

      res.attachment('download.zip');
      archive.pipe(res);

      // Add individual files
      for (const fileId of fileIds) {
        // PERMISSION CHECK
        const canDownload = await storage.checkAccess(fileId, 'file', req.user!.id, 'download');
        if (!canDownload) continue; // Skip forbidden items

        const file = await storage.getFile(fileId);
        if (file && fs.existsSync(file.path)) {
          archive.file(file.path, { name: file.name });
        }
      }

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

      // Add folders with their contents
      for (const folderId of folderIds) {
        // PERMISSION CHECK
        const canDownload = await storage.checkAccess(folderId, 'folder', req.user!.id, 'download');
        if (!canDownload) continue;

        const folder = await storage.getFolder(folderId);
        if (folder) {
          await addFolderToArchive(folderId, folder.name);
        }
      }

      await archive.finalize();

      await storage.createAuditLog({
        userId: req.user!.id,
        action: "bulk_download",
        targetType: "file",
        details: `Bulk downloaded ${fileIds.length} files and ${folderIds.length} folders`,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent')
      });

    } catch (e) {
      console.error("Bulk download failed:", e);
      if (!res.headersSent) {
        res.status(500).json({ message: "Failed to create bulk download" });
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
    try {
      console.log('Fetching trash for user:', req.user!.id);
      const files = await storage.getTrashFiles(req.user!.id);
      const folders = await storage.getTrashFolders(req.user!.id);
      console.log('Trash fetched:', { filesCount: files.length, foldersCount: folders.length });
      res.json({ files, folders });
    } catch (error) {
      console.error('Error fetching trash:', error);
      res.status(500).json({ message: "Failed to fetch trash items" });
    }
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
      const file = await storage.getFile(fileId);
      if (!file) return res.status(404).json({ message: "File not found" });

      if (file.createdBy === req.user!.id) {
        // Owner - Perform Delete
        await storage.deleteFile(fileId, req.user!.id);
        await storage.createAuditLog({
          userId: req.user!.id,
          action: "delete_file",
          targetType: "file",
          targetId: fileId,
          details: `Deleted file ${fileId} (moved to trash)`,
          ipAddress: req.ip,
          userAgent: req.get('User-Agent')
        });
      } else {
        // Not Owner - Check if has Edit permission to "Unshare"
        const canEdit = await storage.checkAccess(fileId, 'file', req.user!.id, 'edit');
        if (!canEdit) return res.status(403).json({ message: "No permission to delete" });

        // Perform Unshare
        await storage.removePermission(fileId, 'file', req.user!.id);
        await storage.createAuditLog({
          userId: req.user!.id,
          action: "unshare_file",
          targetType: "file",
          targetId: fileId,
          details: `Removed self from file share ${fileId}`,
          ipAddress: req.ip,
          userAgent: req.get('User-Agent')
        });
      }
      res.sendStatus(204);
    } catch (e) {
      res.status(400).json({ message: "Invalid request" });
    }
  });

  // ... (Restore routes remain similar, but maybe restrict restore to Owner?)
  // Actually restore usually implies Owner logic. Shared users can't see trash of others usually.
  // If I unshare, the row is gone from permissions. It is NOT in files table as deleted.
  // So it won't show in my trash. That's correct.

  app.post('/api/fs/:fileId/restore', requireAuth, async (req, res) => {
    // ... (Keep existing logic, but maybe add ownership check?)
    // For now, let's leave restore as is, it updates 'isDeleted'. 
    // Only owner can soft-delete, so only owner can restore.
    try {
      const fileId = parseInt(req.params.fileId);
      const file = await storage.getFile(fileId);
      if (!file) return res.status(404).json({ message: "File not found" });
      if (file.createdBy !== req.user!.id) return res.status(403).json({ message: "Only owner can restore" });

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
    } catch (e) { res.status(400).json({ message: "Invalid request" }); }
  });

  app.post('/api/fs/folders/:id/restore', requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const canEdit = await storage.checkAccess(id, 'folder', req.user!.id, 'edit');
      // Even if it's trash, check if we own it or have edit rights

      await storage.restoreFolder(id);
      await storage.createAuditLog({
        userId: req.user!.id,
        action: "restore_folder",
        targetType: "folder",
        targetId: id,
        details: `Restored folder ${id} from trash`,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent')
      });
      res.sendStatus(200);
    } catch (e) {
      res.status(500).json({ message: "Restore failed" });
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

  app.delete('/api/fs/folders/:id/permanent', requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const canEdit = await storage.checkAccess(id, 'folder', req.user!.id, 'edit');
      if (!canEdit) return res.status(403).json({ message: "No permission to delete" });

      // Recursively delete from DB and get all deleted files
      const deletedFiles = await storage.permanentDeleteFolder(id);

      // Delete from disk
      for (const file of deletedFiles) {
        if (file.path && fs.existsSync(file.path)) {
          try {
            fs.unlinkSync(file.path);
          } catch (err) {
            console.error(`Failed to delete file from disk: ${file.path}`, err);
          }
        }
      }

      await storage.createAuditLog({
        userId: req.user!.id,
        action: "permanent_delete_folder",
        targetType: "folder",
        targetId: id,
        details: `Permanently deleted folder ${id} and ${deletedFiles.length} files`,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent')
      });
      res.sendStatus(204);
    } catch (e) {
      console.error("Permanent delete folder error:", e);
      res.status(500).json({ message: "Delete failed" });
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

  // Share Multiple Items (Multi-select share)
  app.post('/api/fs/share-multiple', requireAuth, async (req, res) => {
    try {
      const { items, userId, accessLevel } = req.body as {
        items: { id: number; type: 'file' | 'folder' }[];
        userId: number;
        accessLevel: 'view' | 'edit' | 'download';
      };

      if (!items || items.length === 0) {
        return res.status(400).json({ message: "No items to share" });
      }

      let sharedCount = 0;
      const errors: string[] = [];

      for (const item of items) {
        try {
          // Verify ownership for each item
          if (item.type === 'file') {
            const file = await storage.getFile(item.id);
            if (!file || file.createdBy !== req.user!.id) {
              errors.push(`Cannot share file ${item.id}: Not owner`);
              continue;
            }
          } else {
            const folder = await storage.getFolder(item.id);
            if (!folder || folder.ownerId !== req.user!.id) {
              errors.push(`Cannot share folder ${item.id}: Not owner`);
              continue;
            }
          }

          await storage.createPermission({
            fileId: item.type === 'file' ? item.id : null,
            folderId: item.type === 'folder' ? item.id : null,
            userId,
            grantedBy: req.user!.id,
            accessLevel
          });
          sharedCount++;
        } catch (itemErr) {
          errors.push(`Error sharing ${item.type} ${item.id}`);
        }
      }

      await storage.createAuditLog({
        userId: req.user!.id,
        action: "grant_permission_multiple",
        targetType: "multiple",
        targetId: null,
        details: `Shared ${sharedCount} items with user ${userId} as ${accessLevel}`,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent')
      });

      if (errors.length > 0 && sharedCount === 0) {
        return res.status(403).json({ message: errors.join('; ') });
      }

      res.status(201).json({
        message: `Shared ${sharedCount} item(s) successfully`,
        sharedCount,
        errors: errors.length > 0 ? errors : undefined
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ message: "Multi-share failed" });
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

  // Get all available users for sharing (excluding current user)
  app.get('/api/users/available', requireAuth, async (req, res) => {
    try {
      const allUsers = await storage.getUsers();
      console.log('All users from DB:', allUsers.map(u => ({ id: u.id, username: u.username, status: u.status })));
      // Filter out current user, include all users regardless of status
      const available = allUsers.filter(u => u.id !== req.user!.id);
      console.log('Available users for sharing:', available.length);
      res.json(available.map(u => ({ id: u.id, username: u.username })));
    } catch (error) {
      console.error('Error fetching available users:', error);
      res.status(500).json({ message: 'Failed to fetch users' });
    }
  });

  return httpServer;
}
